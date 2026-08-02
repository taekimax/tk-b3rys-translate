#!/bin/zsh
set -euo pipefail
if [[ $# -lt 1 || $# -gt 2 ]]; then
  print -u2 'usage: install-host.sh <chrome-extension-id> [hy-mt2-7b-bundle.tar.zst]'
  exit 64
fi
extension_id=$1
model_bundle=${2:-${WEB_TRANSLATE_MODEL_BUNDLE:-}}
if [[ ! "$extension_id" =~ '^[a-p]{32}$' ]]; then
  print -u2 'chrome extension ID must contain exactly 32 characters from a-p'
  exit 64
fi
script_dir=${0:A:h}
build_jobs=${WEB_TRANSLATE_NATIVE_HOST_BUILD_JOBS:-4}
[[ "$build_jobs" == <-> && "$build_jobs" -gt 0 ]] || { print -u2 'WEB_TRANSLATE_NATIVE_HOST_BUILD_JOBS must be a positive integer'; exit 64; }
for required_command in swift cmake; do
  command -v "$required_command" >/dev/null 2>&1 || {
    print -u2 "Required command not found: $required_command"
    exit 69
  }
done
if [[ -n "${DEVELOPER_DIR:-}" ]]; then
  developer_dir=$DEVELOPER_DIR
elif [[ -d /Applications/Xcode.app/Contents/Developer ]]; then
  developer_dir=/Applications/Xcode.app/Contents/Developer
else
  developer_dir=$(/usr/bin/xcode-select -p 2>/dev/null || true)
fi
[[ -n "$developer_dir" && -d "$developer_dir" ]] || {
  print -u2 'Xcode developer directory not found. Install Xcode or set DEVELOPER_DIR.'
  exit 69
}
export DEVELOPER_DIR="$developer_dir"

if ! metal_tool=$(/usr/bin/xcrun -sdk macosx --find metal 2>/dev/null) \
  || ! metallib_tool=$(/usr/bin/xcrun -sdk macosx --find metallib 2>/dev/null); then
  print -u2 'Xcode Metal Toolchain is required to install the local MLX host.'
  print -u2 'Install it in Xcode Settings > Components, then rerun this command.'
  exit 69
fi
[[ -x "$metal_tool" && -x "$metallib_tool" ]] || {
  print -u2 'xcrun found an incomplete Metal Toolchain.'
  exit 69
}

# MLX statically links its Metal backend, but its kernels live in a separate
# mlx.metallib file. SwiftPM does not copy that file beside executables, while
# MLX deliberately searches beside the running native host first.
swift build -c release -j "$build_jobs"
host_path="$script_dir/.build/release/web-translate-local-mlx-host"
[[ -x "$host_path" ]] || { print -u2 'Native-host build did not produce an executable'; exit 65; }

cmlx_dir="$script_dir/.build/checkouts/mlx-swift/Source/Cmlx"
metallib_build_dir="$script_dir/.build/mlx-metallib"
metallib="$metallib_build_dir/mlx/backend/metal/kernels/mlx.metallib"
[[ -d "$cmlx_dir" ]] || { print -u2 'Pinned mlx-swift source is missing after the host build'; exit 65; }
if [[ ! -s "$metallib" ]]; then
  cmake -S "$cmlx_dir/mlx" -B "$metallib_build_dir" \
    -DMLX_BUILD_TESTS=OFF \
    -DMLX_BUILD_EXAMPLES=OFF \
    -DMLX_BUILD_BENCHMARKS=OFF \
    -DMLX_BUILD_PYTHON_BINDINGS=OFF \
    -DMLX_BUILD_GGUF=OFF \
    -DMLX_BUILD_SAFETENSORS=OFF \
    -DFETCHCONTENT_SOURCE_DIR_METAL_CPP="$cmlx_dir/metal-cpp"
  cmake --build "$metallib_build_dir" --target mlx-metallib --parallel "$build_jobs"
fi
[[ -s "$metallib" ]] || { print -u2 'Could not build mlx.metallib for the local MLX host'; exit 65; }

install_dir="$HOME/Library/Application Support/web-translate/native-host"
install_host_path="$install_dir/web-translate-local-mlx-host"
install_metallib_path="$install_dir/mlx.metallib"
mkdir -p "$install_dir"
tmp_host=''
tmp_metallib=''
tmp_model_bundle=''

target_dir="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
manifest_path="$target_dir/com.webtranslate.translate.local_mlx.json"
mkdir -p "$target_dir"
tmp_manifest=''
cleanup() {
  [[ -n "$tmp_host" && -e "$tmp_host" ]] && rm -f "$tmp_host"
  [[ -n "$tmp_metallib" && -e "$tmp_metallib" ]] && rm -f "$tmp_metallib"
  [[ -n "$tmp_manifest" && -e "$tmp_manifest" ]] && rm -f "$tmp_manifest"
  [[ -n "$tmp_model_bundle" && -d "$tmp_model_bundle" ]] && rm -rf "$tmp_model_bundle"
}
trap cleanup EXIT

# Replace each running artifact by rename, not by copying over its existing
# inode. Chrome may still have the previous native host open; an in-place copy
# can leave macOS code-signing state attached to a partially replaced file.
tmp_host=$(mktemp "$install_dir/.web-translate-local-mlx-host.XXXXXX")
cp "$host_path" "$tmp_host"
chmod 755 "$tmp_host"
mv -f "$tmp_host" "$install_host_path"
tmp_host=''

tmp_metallib=$(mktemp "$install_dir/.mlx.metallib.XXXXXX")
cp "$metallib" "$tmp_metallib"
chmod 644 "$tmp_metallib"
mv -f "$tmp_metallib" "$install_metallib_path"
tmp_metallib=''

tmp_manifest=$(mktemp "$target_dir/.com.webtranslate.translate.local_mlx.json.XXXXXX")
sed -e "s|__HOST_PATH__|$install_host_path|" \
  -e "s|__EXTENSION_ID__|$extension_id|" \
  "$script_dir/com.webtranslate.translate.local_mlx.json.template" > "$tmp_manifest"
chmod 644 "$tmp_manifest"
mv -f "$tmp_manifest" "$manifest_path"
tmp_manifest=''

if [[ -n "$model_bundle" ]]; then
  [[ -f "$model_bundle" ]] || { print -u2 "Model bundle not found: $model_bundle"; exit 66; }
  command -v zstd >/dev/null 2>&1 || { print -u2 'zstd is required to install a model bundle'; exit 69; }
  command -v tar >/dev/null 2>&1 || { print -u2 'tar is required to install a model bundle'; exit 69; }
  model_root="$HOME/Library/Application Support/web-translate/models"
  mkdir -p "$model_root"
  tmp_model_bundle=$(mktemp -d "$model_root/.hy-mt2-7b-bundle.XXXXXX")
  listing=$(mktemp "$tmp_model_bundle/.listing.XXXXXX")
  zstd -dc "$model_bundle" | tar -tf - > "$listing"
  while IFS= read -r entry; do
    case "$entry" in
      'hy-mt2-7b-q4/'|'hy-mt2-7b-q4/9b7204bdb161490a8ce49ce607c1310cc3fd03ad'|'hy-mt2-7b-q4/9b7204bdb161490a8ce49ce607c1310cc3fd03ad/'*|'LICENSE'|'NOTICE'|'MODEL_LICENSES.md') ;;
      *) print -u2 "Unexpected path in model bundle: $entry"; exit 65 ;;
    esac
  done < "$listing"
  rm -f "$listing"
  zstd -dc "$model_bundle" | tar -xf - -C "$tmp_model_bundle"
  source_model="$tmp_model_bundle/hy-mt2-7b-q4/9b7204bdb161490a8ce49ce607c1310cc3fd03ad"
  [[ -d "$source_model" ]] || { print -u2 'Hy-MT2 7B revision is missing from the model bundle'; exit 65; }
  if find "$tmp_model_bundle" -type l -print -quit | grep -q .; then
    print -u2 'Model bundle contains an unsafe symbolic link'
    exit 65
  fi
  target_parent="$model_root/hy-mt2-7b-q4"
  target_model="$target_parent/9b7204bdb161490a8ce49ce607c1310cc3fd03ad"
  if [[ -e "$target_model" ]]; then
    print "Hy-MT2 7B pinned revision already exists: $target_model"
  else
    mkdir -p "$target_parent"
    mv "$source_model" "$target_model"
    print "Installed Hy-MT2 7B model bundle: $target_model"
  fi
fi
print "Installed native host manifest for $extension_id"
print "Host bundle: $install_dir"

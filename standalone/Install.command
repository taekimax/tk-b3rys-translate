#!/bin/zsh
set -euo pipefail

readonly version="__VERSION__"
readonly extension_id="__EXTENSION_ID__"
readonly host_name="__HOST_NAME__"
readonly model_id="__MODEL_ID__"
readonly model_revision="__MODEL_REVISION__"
readonly host_executable="web-translate-local-mlx-host"

script_dir=${0:A:h}
app_root="$HOME/Library/Application Support/web-translate"
extension_source="$script_dir/payload/extension"
host_source="$script_dir/payload/native-host/$version"
model_source="$script_dir/payload/models/$model_id/$model_revision"
licenses_source="$script_dir/LICENSES"

extension_target="$app_root/extension"
host_target="$app_root/native-host/$version"
model_target="$app_root/models/$model_id/$model_revision"
licenses_target="$app_root/licenses/$version"
manifest_dir="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
manifest_target="$manifest_dir/$host_name.json"

fail() {
  print -u2 "Installation stopped: $*"
  exit 1
}

assert_directory() {
  local path=$1
  [[ -d "$path" ]] || fail "Required directory is missing: $path"
  [[ ! -L "$path" ]] || fail "Refusing to use a symbolic link: $path"
}

assert_no_symlinks() {
  local root=$1
  local link
  link=$(find "$root" -type l -print -quit)
  [[ -z "$link" ]] || fail "The package contains an unsafe symbolic link: $link"
}

tree_file_list() {
  find "$1" -type f -print | sed "s#^$1/##" | LC_ALL=C sort
}

same_tree() {
  local source=$1
  local target=$2
  [[ -d "$target" && ! -L "$target" ]] || return 1
  assert_no_symlinks "$target"
  [[ "$(tree_file_list "$source")" == "$(tree_file_list "$target")" ]] || return 1
  local relative source_hash target_hash
  while IFS= read -r relative; do
    [[ -n "$relative" ]] || continue
    source_hash=$(/usr/bin/shasum -a 256 "$source/$relative" | /usr/bin/awk '{print $1}')
    target_hash=$(/usr/bin/shasum -a 256 "$target/$relative" | /usr/bin/awk '{print $1}')
    [[ "$source_hash" == "$target_hash" ]] || return 1
  done <<< "$(tree_file_list "$source")"
  return 0
}

timestamp=$(date +%Y%m%d%H%M%S)
stage_root="$app_root/.standalone-install-$version-$$"
manifest_tmp=''
cleanup() {
  [[ -d "$stage_root" ]] && rm -rf "$stage_root"
  [[ -n "$manifest_tmp" && -e "$manifest_tmp" ]] && rm -f "$manifest_tmp"
}
trap cleanup EXIT

[[ "$(uname -m)" == "arm64" ]] || fail 'This private preview requires an Apple Silicon Mac.'
os_version=$(sw_vers -productVersion)
os_major=${os_version%%.*}
[[ "$os_major" == <-> && "$os_major" -ge 14 ]] || fail "macOS 14 or newer is required (found $os_version)."
assert_directory "$extension_source"
assert_directory "$host_source"
assert_directory "$model_source"
assert_directory "$licenses_source"
assert_no_symlinks "$script_dir/payload"
assert_no_symlinks "$licenses_source"

free_kb=$(df -Pk "$HOME" | tail -1 | /usr/bin/awk '{print $4}')
if [[ "$free_kb" == <-> && "$free_kb" -lt 7500000 ]]; then
  fail "At least 7.5 GB of free space is recommended; only ${free_kb} KB is available."
fi

print 'Verifying the standalone package checksums. This may take a few minutes for the 7B model.'
(cd "$script_dir" && /usr/bin/shasum -a 256 -c SHA256SUMS) || fail 'Package checksum verification failed.'

if [[ "${WEB_TRANSLATE_INSTALL_DRY_RUN:-0}" == "1" ]]; then
  print 'Dry run passed. No files were installed.'
  exit 0
fi

[[ ! -L "$app_root" ]] || fail "Refusing to use a symbolic-link application directory: $app_root"
[[ ! -L "$manifest_dir" ]] || fail "Refusing to use a symbolic-link native-host directory: $manifest_dir"
[[ ! -L "$app_root/native-host" ]] || fail "Refusing to use a symbolic-link native-host directory: $app_root/native-host"
[[ ! -L "$app_root/models" ]] || fail "Refusing to use a symbolic-link model directory: $app_root/models"
[[ ! -L "$app_root/licenses" ]] || fail "Refusing to use a symbolic-link licenses directory: $app_root/licenses"
mkdir -p "$app_root" "$manifest_dir"
mkdir -p "$stage_root/native-host" "$stage_root/models/$model_id" "$stage_root/licenses"

print 'Preparing the extension, native host, Metal library, and Hy-MT2 7B model.'
ditto "$extension_source" "$stage_root/extension"
ditto "$host_source" "$stage_root/native-host/$version"
ditto "$model_source" "$stage_root/models/$model_id/$model_revision"
ditto "$licenses_source" "$stage_root/licenses/$version"
assert_no_symlinks "$stage_root"

if [[ -e "$host_target" ]]; then
  same_tree "$stage_root/native-host/$version" "$host_target" || \
    fail "A different host payload already exists at $host_target; refusing to overwrite it."
fi

if [[ -e "$model_target" ]]; then
  same_tree "$stage_root/models/$model_id/$model_revision" "$model_target" || \
    fail "A different model revision already exists at $model_target; refusing to overwrite it."
fi

if [[ -e "$host_target" ]]; then
  rm -rf "$stage_root/native-host/$version"
else
  mkdir -p "$app_root/native-host"
  mv "$stage_root/native-host/$version" "$host_target"
fi

if [[ -e "$model_target" ]]; then
  rm -rf "$stage_root/models/$model_id/$model_revision"
else
  mkdir -p "$app_root/models/$model_id"
  mv "$stage_root/models/$model_id/$model_revision" "$model_target"
fi

if [[ -e "$extension_target" ]]; then
  [[ ! -L "$extension_target" ]] || fail "Refusing to replace a symbolic-link extension directory."
  if same_tree "$stage_root/extension" "$extension_target"; then
    rm -rf "$stage_root/extension"
  else
    mv "$extension_target" "$app_root/extension.previous-$timestamp"
    mv "$stage_root/extension" "$extension_target"
  fi
else
  mv "$stage_root/extension" "$extension_target"
fi

if [[ -e "$licenses_target" ]]; then
  [[ ! -L "$licenses_target" ]] || fail "Refusing to replace a symbolic-link licenses directory."
  rm -rf "$licenses_target"
fi
mkdir -p "$app_root/licenses"
mv "$stage_root/licenses/$version" "$licenses_target"

host_path="$host_target/$host_executable"
[[ -x "$host_path" ]] || fail "Installed native host is missing or not executable: $host_path"
[[ -s "$host_target/mlx.metallib" ]] || fail "Installed MLX Metal library is missing."

manifest_tmp=$(mktemp "$manifest_dir/.$host_name.XXXXXX")
manifest_json="{\"name\":\"$host_name\",\"description\":\"web-translate local MLX host\",\"path\":\"$host_path\",\"type\":\"stdio\",\"allowed_origins\":[\"chrome-extension://$extension_id/\"]}"
print -r -- "$manifest_json" > "$manifest_tmp"
chmod 644 "$manifest_tmp"
mv -f "$manifest_tmp" "$manifest_target"
manifest_tmp=''

print
print 'web-translate was installed for this Mac.'
print "Extension directory: $extension_target"
print "Native host: $host_target"
print "Hy-MT2 7B: $model_target"
print
print 'Next steps in Chrome:'
print '  1. Open chrome://extensions'
print '  2. Turn on Developer mode.'
print '  3. Choose Load unpacked.'
print "  4. Select: $extension_target"
print "  5. Confirm the extension ID is $extension_id"
print '  6. Reload web-translate and refresh the page you want to translate.'
print
print 'This is an unsigned private preview. If macOS blocks the installer or host, use the file-specific approval shown in System Settings > Privacy & Security.'
print 'Do not disable Gatekeeper globally.'

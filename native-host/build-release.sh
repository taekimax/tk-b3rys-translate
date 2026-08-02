#!/bin/zsh
set -euo pipefail

if [[ $# -gt 1 ]]; then
  print -u2 'usage: build-release.sh [output-directory]'
  exit 64
fi

script_dir=${0:A:h}
repo_root=${script_dir:h}
output_dir=${1:-$repo_root/dist/standalone-native-host}
build_jobs=${WEB_TRANSLATE_NATIVE_HOST_BUILD_JOBS:-4}
[[ "$build_jobs" == <-> && "$build_jobs" -gt 0 ]] || {
  print -u2 'WEB_TRANSLATE_NATIVE_HOST_BUILD_JOBS must be a positive integer'
  exit 64
}

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
  print -u2 'Xcode Metal Toolchain is required to build the standalone MLX host.'
  print -u2 'Install it in Xcode Settings > Components, then rerun this command.'
  exit 69
fi
[[ -x "$metal_tool" && -x "$metallib_tool" ]] || {
  print -u2 'xcrun found an incomplete Metal Toolchain.'
  exit 69
}

scratch_dir=$(mktemp -d "${TMPDIR:-/tmp}/web-translate-native-build.XXXXXX")
trap 'rm -rf "$scratch_dir"' EXIT

# Build in a neutral scratch directory so the distributed executable does not
# retain the author checkout path in Swift/C++ debug metadata or resource
# lookup paths. The recipient never needs this build directory.
swift_flags=(
  -Xswiftc -debug-prefix-map
  -Xswiftc "$repo_root=/usr/src/web-translate"
  -Xcc "-ffile-prefix-map=$repo_root=/usr/src/web-translate"
)
swift build \
  --package-path "$script_dir" \
  --scratch-path "$scratch_dir" \
  -c release \
  -j "$build_jobs" \
  "${swift_flags[@]}"

host_path=$(find "$scratch_dir" -type f -path '*/release/web-translate-local-mlx-host' -perm -111 -print -quit)
[[ -n "$host_path" ]] || {
  print -u2 'Native-host build did not produce web-translate-local-mlx-host'
  exit 65
}

cmlx_dir="$scratch_dir/checkouts/mlx-swift/Source/Cmlx"
metallib_build_dir="$scratch_dir/mlx-metallib"
metallib="$metallib_build_dir/mlx/backend/metal/kernels/mlx.metallib"
[[ -d "$cmlx_dir" ]] || {
  print -u2 'Pinned mlx-swift source is missing after the host build'
  exit 65
}

cmake -S "$cmlx_dir/mlx" -B "$metallib_build_dir" \
  -DMLX_BUILD_TESTS=OFF \
  -DMLX_BUILD_EXAMPLES=OFF \
  -DMLX_BUILD_BENCHMARKS=OFF \
  -DMLX_BUILD_PYTHON_BINDINGS=OFF \
  -DMLX_BUILD_GGUF=OFF \
  -DMLX_BUILD_SAFETENSORS=OFF \
  -DFETCHCONTENT_SOURCE_DIR_METAL_CPP="$cmlx_dir/metal-cpp"
cmake --build "$metallib_build_dir" --target mlx-metallib --parallel "$build_jobs"
[[ -s "$metallib" ]] || {
  print -u2 'Could not build mlx.metallib for the standalone MLX host'
  exit 65
}

if [[ -e "$output_dir" ]]; then
  [[ "$output_dir" == "$repo_root/dist/"* ]] || {
    print -u2 "Refusing to replace an output outside dist: $output_dir"
    exit 64
  }
  rm -rf "$output_dir"
fi
mkdir -p "$output_dir"

cp "$host_path" "$output_dir/web-translate-local-mlx-host"
cp "$metallib" "$output_dir/mlx.metallib"
chmod 755 "$output_dir/web-translate-local-mlx-host"
chmod 644 "$output_dir/mlx.metallib"

if strings -a "$output_dir/web-translate-local-mlx-host" | grep -F "$repo_root" >/dev/null 2>&1; then
  print -u2 'Native host contains the private checkout path after prefix mapping'
  exit 65
fi
if /usr/bin/file "$output_dir/web-translate-local-mlx-host" | grep -E 'Mach-O 64-bit executable arm64' >/dev/null 2>&1; then
  :
else
  print -u2 'Standalone native host is not an arm64 Mach-O executable'
  exit 65
fi
if otool -L "$output_dir/web-translate-local-mlx-host" | tail -n +2 | \
  grep -Ev '^\s+(/System/Library/|/usr/lib/|@rpath/|@loader_path/|$)' >/dev/null 2>&1; then
  print -u2 'Native host links to a non-system dynamic library'
  exit 65
fi

release_dir=${host_path:h}
bundle_count=0
for bundle in "$release_dir"/*.bundle(N); do
  cp -R "$bundle" "$output_dir/"
  bundle_count=$((bundle_count + 1))
done

provenance_dir="$output_dir/provenance"
license_dir="$provenance_dir/licenses"
mkdir -p "$license_dir"
cp "$script_dir/Package.resolved" "$provenance_dir/Package.resolved"
checkout_count=0
for checkout in "$scratch_dir/checkouts"/*(N); do
  [[ -d "$checkout" ]] || continue
  checkout_count=$((checkout_count + 1))
  identity=${checkout:t}
  found_license=0
  while IFS= read -r license_file; do
    found_license=1
    relative=${license_file#$checkout/}
    destination="$license_dir/$identity/$relative"
    mkdir -p "${destination:h}"
    cp "$license_file" "$destination"
  done < <(find "$checkout" -type f \( \
    -iname 'license' -o -iname 'license.*' -o -iname 'copying' -o -iname 'copying.*' \
    -o -iname 'notice' -o -iname 'notice.*' \
  \) -print | LC_ALL=C sort)
  [[ "$found_license" == 1 ]] || {
    print -u2 "No license or notice file found for Swift package checkout: $identity"
    exit 65
  }
done
[[ "$checkout_count" -gt 0 ]] || { print -u2 'No Swift package checkouts were produced'; exit 65; }

print "Swift package checkouts inventoried: $checkout_count"

print "Built standalone native host payload: $output_dir"
print "Host architecture: $(file "$output_dir/web-translate-local-mlx-host")"
print "Swift resource bundles copied: $bundle_count"

#!/bin/zsh
set -euo pipefail
if [[ $# -ne 1 ]]; then print -u2 'usage: install-host.sh <chrome-extension-id>'; exit 64; fi
script_dir=${0:A:h}
build_jobs=${B3RYS_NATIVE_HOST_BUILD_JOBS:-4}
[[ "$build_jobs" == <-> && "$build_jobs" -gt 0 ]] || { print -u2 'B3RYS_NATIVE_HOST_BUILD_JOBS must be a positive integer'; exit 64; }
developer_dir=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
export DEVELOPER_DIR="$developer_dir"

# MLX statically links its Metal backend, but its kernels live in a separate
# mlx.metallib file. SwiftPM does not copy that file beside executables, while
# MLX deliberately searches beside the running native host first.
swift build -c release -j "$build_jobs"
host_path="$script_dir/.build/release/b3rys-local-mlx-host"
[[ -x "$host_path" ]] || { print -u2 'Native-host build did not produce an executable'; exit 65; }

cmlx_dir="$script_dir/.build/checkouts/mlx-swift/Source/Cmlx"
metallib_build_dir="$script_dir/.build/mlx-metallib"
metallib="$metallib_build_dir/mlx/backend/metal/kernels/mlx.metallib"
[[ -d "$cmlx_dir" ]] || { print -u2 'Pinned mlx-swift source is missing after the host build'; exit 65; }
if ! DEVELOPER_DIR="$developer_dir" /usr/bin/xcrun -sdk macosx --find metal >/dev/null 2>&1 \
  || ! DEVELOPER_DIR="$developer_dir" /usr/bin/xcrun -sdk macosx --find metallib >/dev/null 2>&1; then
  print -u2 'Xcode Metal Toolchain is required to install the local MLX host.'
  print -u2 'Install it in Xcode Settings > Components, then rerun this command.'
  exit 69
fi
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
cp "$metallib" "$script_dir/.build/release/mlx.metallib"
target_dir="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
mkdir -p "$target_dir"
sed -e "s|__HOST_PATH__|$host_path|" -e "s|__EXTENSION_ID__|$1|" "$script_dir/com.b3rys.translate.local_mlx.json.template" > "$target_dir/com.b3rys.translate.local_mlx.json"
print "Installed native host manifest for $1"

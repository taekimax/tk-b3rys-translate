#!/bin/zsh
set -euo pipefail
if [[ $# -ne 1 ]]; then print -u2 'usage: install-host.sh <chrome-extension-id>'; exit 64; fi
script_dir=${0:A:h}
host_path="$script_dir/.build/release/b3rys-local-mlx-host"
[[ -x "$host_path" ]] || { print -u2 'Build first: swift build -c release'; exit 65; }
target_dir="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
mkdir -p "$target_dir"
sed -e "s|__HOST_PATH__|$host_path|" -e "s|__EXTENSION_ID__|$1|" "$script_dir/com.b3rys.translate.local_mlx.json.template" > "$target_dir/com.b3rys.translate.local_mlx.json"
print "Installed native host manifest for $1"

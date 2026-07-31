#!/bin/zsh
set -euo pipefail

if [[ $# -ne 1 ]]; then
  print -u2 'usage: verify-host.sh <chrome-extension-id>'
  exit 64
fi
extension_id=$1
if [[ ! "$extension_id" =~ '^[a-p]{32}$' ]]; then
  print -u2 'chrome extension ID must contain exactly 32 characters from a-p'
  exit 64
fi

install_dir="$HOME/Library/Application Support/b3rys-translate/native-host"
host_path="$install_dir/b3rys-local-mlx-host"
metallib_path="$install_dir/mlx.metallib"
manifest_path="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.b3rys.translate.local_mlx.json"

[[ -x "$host_path" ]] || { print -u2 "Native host is missing or not executable: $host_path"; exit 65; }
[[ -s "$metallib_path" ]] || { print -u2 "MLX Metal library is missing: $metallib_path"; exit 65; }
[[ -f "$manifest_path" ]] || { print -u2 "Chrome native-host manifest is missing: $manifest_path"; exit 65; }

node - "$manifest_path" "$host_path" "$extension_id" <<'NODE'
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const [manifestPath, expectedHostPath, extensionId] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const expectedOrigin = `chrome-extension://${extensionId}/`;
if (manifest.name !== 'com.b3rys.translate.local_mlx' || manifest.type !== 'stdio') {
  throw new Error('Chrome native-host manifest has the wrong name or type');
}
if (manifest.path !== expectedHostPath) {
  throw new Error(`Manifest path mismatch: ${manifest.path}`);
}
if (!manifest.allowed_origins?.includes(expectedOrigin)) {
  throw new Error(`Manifest does not allow ${expectedOrigin}`);
}

const request = Buffer.from(JSON.stringify({ type: 'shutdown', requestId: 'host-smoke-test' }));
const frame = Buffer.alloc(4 + request.length);
frame.writeUInt32LE(request.length, 0);
request.copy(frame, 4);
const result = spawnSync(expectedHostPath, { input: frame, timeout: 15000 });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Host exited with status ${result.status}`);
if (result.stdout.length < 4) throw new Error('Host returned no native-messaging response');
const responseLength = result.stdout.readUInt32LE(0);
const response = JSON.parse(result.stdout.subarray(4, 4 + responseLength).toString('utf8'));
if (response.requestId !== 'host-smoke-test' || response.error != null) {
  throw new Error(`Unexpected host response: ${JSON.stringify(response)}`);
}
console.log(`Native host verified for ${extensionId}`);
NODE

import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root = resolve(process.argv[2] ?? '');
if (!root || !existsSync(root)) throw new Error(`Standalone staging directory is missing: ${root}`);

const expected = {
  version: JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).version,
  extensionId: 'pocbdkddmkkipegbinejlhjopmgimbdl',
  hostName: 'com.webtranslate.translate.local_mlx',
  modelId: 'hy-mt2-7b-q4',
  modelRevision: '9b7204bdb161490a8ce49ce607c1310cc3fd03ad',
};

function fail(message) {
  throw new Error(message);
}

function requireFile(path, label) {
  if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) {
    fail(`${label} is missing or unsafe: ${path}`);
  }
}

function requireDirectory(path, label) {
  if (!existsSync(path) || !lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) {
    fail(`${label} is missing or unsafe: ${path}`);
  }
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) fail(`Standalone distribution contains a symbolic link: ${path}`);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) return '';
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

const manifestPath = join(root, 'distribution-manifest.json');
requireFile(manifestPath, 'Distribution manifest');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (
  manifest.product !== 'web-translate' ||
  manifest.version !== expected.version ||
  manifest.distribution !== 'private-standalone-preview' ||
  manifest.platform !== 'macos-arm64' ||
  manifest.minimumMacOS !== '14.0' ||
  manifest.signed !== false ||
  manifest.notarized !== false
) {
  fail('Standalone distribution manifest has the wrong product, platform, version, or signing state.');
}
if (manifest.extension?.id !== expected.extensionId) fail('Standalone extension ID is not stable.');
if (manifest.nativeHost?.name !== expected.hostName) fail('Standalone native-host name is wrong.');
if (
  manifest.model?.id !== expected.modelId ||
  manifest.model?.revision !== expected.modelRevision ||
  manifest.model?.offlineReady !== true
) {
  fail('Standalone model identity or offline state is wrong.');
}

const extension = join(root, 'payload', 'extension');
const host = join(root, 'payload', 'native-host', expected.version);
const model = join(root, 'payload', 'models', expected.modelId, expected.modelRevision);
const licenses = join(root, 'LICENSES');
requireDirectory(extension, 'Expanded extension');
requireDirectory(host, 'Native host payload');
requireDirectory(model, 'Expanded Hy-MT2 7B model');
requireDirectory(licenses, 'License directory');

const extensionManifestPath = join(extension, 'manifest.json');
requireFile(extensionManifestPath, 'Expanded extension manifest');
const extensionManifest = JSON.parse(readFileSync(extensionManifestPath, 'utf8'));
if (
  extensionManifest.name !== 'web-translate' ||
  extensionManifest.version !== expected.version ||
  extensionManifest.key == null ||
  !extensionManifest.permissions?.includes('nativeMessaging')
) {
  fail('Expanded extension manifest is not the expected stable native-messaging build.');
}

const hostPath = join(host, 'web-translate-local-mlx-host');
const metallibPath = join(host, 'mlx.metallib');
requireFile(hostPath, 'Native host executable');
requireFile(metallibPath, 'MLX Metal library');
if ((statSync(hostPath).mode & 0o111) === 0) fail('Native host executable is not executable.');
if (!commandOutput('/usr/bin/file', [hostPath]).includes('Mach-O 64-bit executable arm64')) {
  fail('Native host is not an arm64 Mach-O executable.');
}
const dylibs = commandOutput('/usr/bin/otool', ['-L', hostPath])
  .split('\n')
  .slice(1)
  .map((line) => line.trim().split(' ')[0])
  .filter(Boolean);
const badDylib = dylibs.find(
  (path) =>
    !path.startsWith('/System/Library/') &&
    !path.startsWith('/usr/lib/') &&
    !path.startsWith('@rpath/') &&
    !path.startsWith('@loader_path/'),
);
if (badDylib) fail(`Native host links to a non-system library: ${badDylib}`);
const strings = commandOutput('/usr/bin/strings', ['-a', hostPath]);
if (strings.includes('/Users/') || strings.includes('/private/var/folders/')) {
  fail('Native host contains a personal or temporary build path.');
}

for (const required of [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'model.safetensors',
  'model.safetensors.index.json',
  'LICENSE.txt',
]) {
  requireFile(join(model, required), `Model file ${required}`);
}

for (const required of [
  'LICENSE',
  'NOTICE',
  'THIRD_PARTY_NOTICES.md',
  'MODEL_LICENSES.md',
  'NATIVE_HOST_LICENSE_INVENTORY.md',
  'native-host/Package.resolved',
  'Hy-MT2-7B-LICENSE.txt',
]) {
  requireFile(join(licenses, required), `License artifact ${required}`);
}
if (walk(join(licenses, 'native-host')).filter((path) => /license|notice|copying/i.test(path)).length === 0) {
  fail('Native-host dependency license inventory is empty.');
}

const installPath = join(root, 'Install.command');
requireFile(installPath, 'Standalone installer');
if ((statSync(installPath).mode & 0o111) === 0) fail('Install.command is not executable.');
const installText = readFileSync(installPath, 'utf8');
for (const forbidden of ['swift build', 'cmake', 'npm ', 'node ', 'python', 'zstd', 'sudo ']) {
  if (installText.includes(forbidden)) fail(`Recipient installer contains a forbidden dependency: ${forbidden}`);
}
for (const requiredText of ['chrome://extensions', expected.extensionId, 'Gatekeeper', 'Do not disable']) {
  if (!installText.includes(requiredText)) fail(`Installer guidance is missing: ${requiredText}`);
}

const sumsPath = join(root, 'SHA256SUMS');
requireFile(sumsPath, 'SHA256SUMS');
const sumLines = readFileSync(sumsPath, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);
if (sumLines.length < 10) fail('SHA256SUMS is unexpectedly short.');
const listed = new Set();
for (const line of sumLines) {
  const match = /^([0-9a-f]{64})[ ]{2}(.+)$/.exec(line);
  if (!match) fail(`Malformed checksum line: ${line}`);
  const relativePath = match[2];
  if (relativePath.startsWith('/') || relativePath.split('/').includes('..')) {
    fail(`Unsafe checksum path: ${relativePath}`);
  }
  const path = resolve(root, relativePath);
  if (!path.startsWith(`${root}/`)) fail(`Checksum escapes distribution root: ${relativePath}`);
  requireFile(path, `Checksum target ${relativePath}`);
  listed.add(relativePath);
}
for (const file of walk(root)) {
  const relativePath = relative(root, file);
  if (relativePath === 'SHA256SUMS') continue;
  if (!listed.has(relativePath)) fail(`Distribution file is missing from SHA256SUMS: ${relativePath}`);
}

process.stdout.write(`Standalone distribution verified: ${root}\n`);
process.stdout.write(`Model: ${expected.modelId} @ ${expected.modelRevision}\n`);
process.stdout.write(`Extension ID: ${expected.extensionId}\n`);

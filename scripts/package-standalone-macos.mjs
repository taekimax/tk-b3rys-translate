import {
  copyFileSync,
  createReadStream,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = packageJson.version;
const extensionId = 'pocbdkddmkkipegbinejlhjopmgimbdl';
const hostName = 'com.webtranslate.translate.local_mlx';
const modelId = 'hy-mt2-7b-q4';
const modelRevision = '9b7204bdb161490a8ce49ce607c1310cc3fd03ad';
const modelSource = resolve(root, '.local-models', modelId, modelRevision);
const dist = resolve(root, 'dist');
const extensionSource = resolve(dist, 'chrome-mv3');
const output = resolve(dist, `web-translate-${version}-macos-arm64.dmg`);
const nativePayload = resolve(dist, '.standalone-native-host');

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`${command} ${args.join(' ')} failed with status ${result.status}`);
}

function ensureDirectory(path, label) {
  if (!existsSync(path) || !lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) {
    fail(`${label} is missing or unsafe: ${path}`);
  }
}

function assertNoSymlinks(path) {
  const entries = readdirSync(path, { withFileTypes: true });
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isSymbolicLink()) fail(`Standalone payload contains a symbolic link: ${child}`);
    if (entry.isDirectory()) assertNoSymlinks(child);
  }
}

function copyTree(source, destination, { skip } = {}) {
  const sourceStat = lstatSync(source);
  if (sourceStat.isSymbolicLink()) fail(`Refusing to copy a symbolic link: ${source}`);
  if (sourceStat.isDirectory()) {
    mkdirSync(destination, { recursive: true });
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      const child = join(source, entry.name);
      if (skip?.(child, entry.name)) continue;
      copyTree(child, join(destination, entry.name), { skip });
    }
    return;
  }
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

function walkFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) fail(`Standalone payload contains a symbolic link: ${path}`);
    if (entry.isDirectory()) files.push(...walkFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

function sha256(path) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolvePromise(hash.digest('hex')));
  });
}

async function writeChecksums(staging) {
  const files = walkFiles(staging);
  const lines = [];
  for (const file of files) {
    const relativePath = relative(staging, file);
    if (relativePath === 'SHA256SUMS') continue;
    const digest = await sha256(file);
    lines.push(`${digest}  ${relativePath}`);
  }
  writeFileSync(join(staging, 'SHA256SUMS'), `${lines.join('\n')}\n`);
  return { files, lines };
}

function template(source, replacements) {
  let result = readFileSync(source, 'utf8');
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(key, value);
  }
  if (result.includes('__VERSION__') || result.includes('__EXTENSION_ID__')) {
    fail(`Unresolved standalone template placeholder in ${source}`);
  }
  return result;
}

function nativeLicenseInventory(provenanceRoot) {
  const licenseRoot = join(provenanceRoot, 'licenses');
  const files = walkFiles(licenseRoot).map((path) => relative(licenseRoot, path));
  const checkouts = [...new Set(files.map((path) => path.split('/')[0]))].sort();
  return [
    '# Native host license inventory',
    '',
    `Generated from the exact SwiftPM checkout graph used for web-translate ${version}.`,
    'The accompanying Package.resolved records the pinned revisions.',
    '',
    ...checkouts.map((checkout) => `- ${checkout}`),
    '',
    'Every license/notice file discovered under each pinned checkout is copied',
    'under LICENSES/native-host/<package>/. The inventory is part of the',
    'standalone private-preview payload and must remain with redistribution.',
    '',
  ].join('\n');
}

async function main() {
  mkdirSync(dist, { recursive: true });
  run('npm', ['run', 'build']);
  ensureDirectory(extensionSource, 'Built extension');
  ensureDirectory(modelSource, 'Pinned Hy-MT2 7B model');

  const extensionManifest = JSON.parse(readFileSync(join(extensionSource, 'manifest.json'), 'utf8'));
  if (extensionManifest.name !== 'web-translate' || extensionManifest.version !== version) {
    fail('Built extension manifest does not match the standalone release.');
  }
  if (extensionManifest.key == null) fail('Built extension manifest has no stable public key.');

  const reusableNativePayload = resolve(dist, 'standalone-native-host');
  if (process.env.WEB_TRANSLATE_REUSE_NATIVE_PAYLOAD === '1' && existsSync(reusableNativePayload)) {
    copyTree(reusableNativePayload, nativePayload);
    process.stdout.write(`Reusing prebuilt native host payload: ${reusableNativePayload}\n`);
  } else {
    run(join(root, 'native-host', 'build-release.sh'), [nativePayload]);
  }
  ensureDirectory(nativePayload, 'Prebuilt native host payload');
  ensureDirectory(join(nativePayload, 'provenance'), 'Native host provenance');
  assertNoSymlinks(nativePayload);

  const staging = mkdtempSync(join(dist, `.standalone-macos-${version}-`));
  try {
    mkdirSync(join(staging, 'payload', 'extension'), { recursive: true });
    mkdirSync(join(staging, 'payload', 'native-host', version), { recursive: true });
    mkdirSync(join(staging, 'payload', 'models', modelId, modelRevision), { recursive: true });
    mkdirSync(join(staging, 'LICENSES'), { recursive: true });

    copyTree(extensionSource, join(staging, 'payload', 'extension'));
    copyTree(nativePayload, join(staging, 'payload', 'native-host', version), {
      skip: (path, name) => name === 'provenance' || path === nativePayload,
    });
    copyTree(modelSource, join(staging, 'payload', 'models', modelId, modelRevision), {
      skip: (path, name) => name === '.verified.json.kindle-helper-origin' || path.endsWith('.verified.json.kindle-helper-origin'),
    });

    const rootLicenses = [
      ['LICENSE', 'LICENSE'],
      ['NOTICE', 'NOTICE'],
      ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
      ['PRIVACY.md', 'PRIVACY.md'],
      ['MODEL_LICENSES.md', 'docs/model-licenses.md'],
    ];
    for (const [destination, source] of rootLicenses) {
      copyFileSync(resolve(root, source), join(staging, 'LICENSES', destination));
    }
    copyFileSync(join(modelSource, 'LICENSE.txt'), join(staging, 'LICENSES', 'Hy-MT2-7B-LICENSE.txt'));
    copyFileSync(join(modelSource, 'README.md'), join(staging, 'LICENSES', 'Hy-MT2-7B-MODEL-CARD.md'));
    copyTree(join(nativePayload, 'provenance', 'licenses'), join(staging, 'LICENSES', 'native-host'));
    copyFileSync(
      join(nativePayload, 'provenance', 'Package.resolved'),
      join(staging, 'LICENSES', 'native-host', 'Package.resolved'),
    );
    writeFileSync(
      join(staging, 'LICENSES', 'NATIVE_HOST_LICENSE_INVENTORY.md'),
      nativeLicenseInventory(join(nativePayload, 'provenance')),
    );

    const replacements = {
      __VERSION__: version,
      __EXTENSION_ID__: extensionId,
      __HOST_NAME__: hostName,
      __MODEL_ID__: modelId,
      __MODEL_REVISION__: modelRevision,
    };
    writeFileSync(
      join(staging, 'START-HERE.html'),
      template(join(root, 'standalone', 'START-HERE.html'), replacements),
    );
    writeFileSync(
      join(staging, 'README.txt'),
      template(join(root, 'standalone', 'README.txt'), replacements),
    );
    writeFileSync(
      join(staging, 'UNINSTALL.md'),
      template(join(root, 'standalone', 'UNINSTALL.md'), replacements),
    );
    copyFileSync(join(root, 'standalone', 'Install.command'), join(staging, 'Install.command'));
    const installPath = join(staging, 'Install.command');
    writeFileSync(installPath, template(installPath, replacements), { mode: 0o755 });
    chmodSync(installPath, 0o755);

    const manifest = {
      schemaVersion: 1,
      product: 'web-translate',
      version,
      distribution: 'private-standalone-preview',
      platform: 'macos-arm64',
      minimumMacOS: '14.0',
      signed: false,
      notarized: false,
      extension: {
        id: extensionId,
        path: 'payload/extension',
        stablePublicKey: true,
      },
      nativeHost: {
        name: hostName,
        path: `payload/native-host/${version}/web-translate-local-mlx-host`,
        protocol: 'chrome-native-messaging-stdio',
      },
      model: {
        id: modelId,
        revision: modelRevision,
        path: `payload/models/${modelId}/${modelRevision}`,
        offlineReady: true,
        license: 'Apache-2.0',
      },
      checksums: 'SHA256SUMS',
      recipientDependencies: [],
      builderDependencies: ['Swift/Xcode Metal toolchain', 'CMake', 'Node.js'],
    };
    writeFileSync(join(staging, 'distribution-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    await writeChecksums(staging);
    run('node', [join(root, 'scripts', 'verify-standalone-distribution.mjs'), staging]);

    if (existsSync(output)) rmSync(output, { force: true });
    run('hdiutil', [
      'create',
      '-ov',
      '-srcfolder',
      staging,
      '-volname',
      `web-translate-${version}`,
      '-format',
      'UDZO',
      '-imagekey',
      'zlib-level=9',
      output,
    ]);
    printSummary(output, staging);
  } finally {
    rmSync(staging, { recursive: true, force: true });
    rmSync(nativePayload, { recursive: true, force: true });
  }
}

function printSummary(path, staging) {
  const size = statSync(path).size;
  const manifest = JSON.parse(readFileSync(join(staging, 'distribution-manifest.json'), 'utf8'));
  process.stdout.write(`Created ${path}\n`);
  process.stdout.write(`Bytes: ${size}\n`);
  process.stdout.write(`Platform: ${manifest.platform}; extension ID: ${manifest.extension.id}\n`);
  process.stdout.write(`Model: ${manifest.model.id} @ ${manifest.model.revision}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

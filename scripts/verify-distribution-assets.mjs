import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist/chrome-mv3');
if (!existsSync(dist)) throw new Error('Build dist/chrome-mv3 before verifying the distribution.');

const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
const extensionKey = JSON.parse(readFileSync(join(root, 'extension-public-key.json'), 'utf8'));
if (manifest.name !== 'web-translate' || manifest.version !== '0.6.0') {
  throw new Error('The distribution manifest has the wrong product name or version.');
}
if (manifest.key !== extensionKey.publicKey) {
  throw new Error('The distribution manifest does not contain the web-translate public key.');
}

for (const name of [
  'LICENSE',
  'NOTICE',
  'THIRD_PARTY_NOTICES.md',
  'PRIVACY.md',
  'MODEL_LICENSES.md',
]) {
  if (!existsSync(join(dist, name)))
    throw new Error(`Missing distribution compliance file: ${name}`);
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const modelWeight = walk(dist).find((path) => /\.(safetensors|bin|gguf)$/i.test(path));
if (modelWeight) throw new Error(`Model weights must not be bundled: ${modelWeight}`);

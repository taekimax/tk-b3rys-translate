import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const modelId = 'hy-mt2-7b-q4';
const revision = '9b7204bdb161490a8ce49ce607c1310cc3fd03ad';
const localModels = resolve(root, '.local-models');
const source = resolve(localModels, modelId);
const revisionRoot = resolve(source, revision);
const outputDirectory = resolve(root, 'dist');
const output = resolve(outputDirectory, `web-translate-${packageJson.version}-${modelId}.tar.zst`);
const requiredFiles = [
  'LICENSE.txt',
  'README.md',
  'config.json',
  'model.safetensors',
  'model.safetensors.index.json',
  'tokenizer.json',
  'tokenizer_config.json',
];

if (!existsSync(revisionRoot) || !lstatSync(revisionRoot).isDirectory()) {
  throw new Error(
    `Missing ${modelId} at ${revisionRoot}. Download the pinned model into .local-models first.`,
  );
}
for (const name of requiredFiles) {
  const path = join(revisionRoot, name);
  if (!existsSync(path) || !lstatSync(path).isFile()) {
    throw new Error(`Missing required model file: ${path}`);
  }
}

mkdirSync(outputDirectory, { recursive: true });
const metadata = resolve(outputDirectory, `.model-bundle-meta-${process.pid}`);
rmSync(metadata, { recursive: true, force: true });
mkdirSync(metadata, { recursive: true });

const metadataFiles = [
  ['LICENSE', 'LICENSE'],
  ['NOTICE', 'NOTICE'],
  ['MODEL_LICENSES.md', 'docs/model-licenses.md'],
];
for (const [destination, sourcePath] of metadataFiles) {
  copyFileSync(resolve(root, sourcePath), resolve(metadata, destination));
}

const tar = spawn(
  'tar',
  [
    '-cf',
    '-',
    '--exclude=.verified.json.kindle-helper-origin',
    '-C',
    localModels,
    modelId,
    '-C',
    metadata,
    'LICENSE',
    'NOTICE',
    'MODEL_LICENSES.md',
  ],
  { stdio: ['ignore', 'pipe', 'inherit'] },
);
const zstd = spawn('zstd', ['-T4', '-3', '-q', '-f', '-o', output], {
  stdio: ['pipe', 'inherit', 'inherit'],
});
tar.stdout.pipe(zstd.stdin);

const exitCode = await new Promise((resolvePromise, reject) => {
  let tarCode;
  let zstdCode;
  let settled = false;
  const finish = () => {
    if (settled || tarCode === undefined || zstdCode === undefined) return;
    settled = true;
    resolvePromise(tarCode === 0 && zstdCode === 0 ? 0 : 1);
  };
  tar.once('error', reject);
  zstd.once('error', reject);
  tar.once('close', (code) => {
    tarCode = code;
    finish();
  });
  zstd.once('close', (code) => {
    zstdCode = code;
    finish();
  });
});

rmSync(metadata, { recursive: true, force: true });
if (exitCode !== 0) throw new Error('Could not create the Hy-MT2 7B model bundle.');
process.stdout.write(`Created ${output}\n`);

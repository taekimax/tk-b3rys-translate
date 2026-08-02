import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(root, 'public');
mkdirSync(publicDir, { recursive: true });

for (const name of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'PRIVACY.md']) {
  copyFileSync(resolve(root, name), resolve(publicDir, name));
}
copyFileSync(resolve(root, 'docs/model-licenses.md'), resolve(publicDir, 'MODEL_LICENSES.md'));

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const e2eFile = path.join(rootDir, 'tests', 'e2e', 'carescript.e2e.mjs');

if (!fs.existsSync(e2eFile)) {
  console.error('[test:e2e] E2E suite file not found:', e2eFile);
  process.exit(1);
}

const res = spawnSync(process.execPath, ['--test', e2eFile], {
  cwd: rootDir,
  stdio: 'inherit',
});

process.exit(res.status ?? 1);

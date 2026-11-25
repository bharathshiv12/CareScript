import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectLocalBackendCapabilities } from './dev-backend.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const caps = detectLocalBackendCapabilities();
const canStartAnyLocalBackend = caps.canStartLocalSupabase;

if (!canStartAnyLocalBackend) {
  console.warn(
    '\n[CareScript dev] Notice: Local backend containers/emulators cannot start on this machine ' +
      '(missing Docker / Supabase CLI).\n' +
      '[CareScript dev] Starting Vite frontend (`dev:frontend`) only — Supabase ' +
      'calls will use the configured remote endpoints in .env.local, NOT local containers.\n'
  );
  const res = spawnSync('npm', ['--prefix', 'frontend', 'run', 'dev'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  process.exit(res.status ?? 1);
}

const args = [
  'concurrently',
  '--names',
  'frontend,backend',
  '--prefix-colors',
  'cyan,magenta',
  'npm --prefix frontend run dev',
  'node scripts/dev-backend.mjs',
];

const res = spawnSync('npx', args, {
  cwd: rootDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(res.status ?? 1);

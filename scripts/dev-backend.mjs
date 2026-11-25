import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function commandWorks(cmd, args) {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const hasDocker = commandWorks('docker', ['info']);
const hasSupabaseCli = commandWorks('supabase', ['--version']);
const canStartLocalSupabase = hasDocker && hasSupabaseCli;

console.log('\n=== CareScript Supabase Backend ===');
console.log(`Local Supabase: ${canStartLocalSupabase ? 'READY' : `UNAVAILABLE (${!hasDocker ? 'Docker required' : 'Supabase CLI required'})`}`);
console.log('Deployed cloud project: vcceikmnjiksvixednlk (remote, not emulated locally)');
console.log('===================================\n');

if (process.argv.includes('--status')) process.exit(0);
if (!canStartLocalSupabase) {
  console.error('[dev:backend] Install/start Docker Desktop and install the Supabase CLI, then run `supabase start`.');
  process.exit(1);
}

const result = spawnSync('supabase', ['start'], { cwd: rootDir, stdio: 'inherit', shell: process.platform === 'win32' });
if (result.status !== 0) process.exit(result.status ?? 1);
const serve = spawnSync('supabase', ['functions', 'serve'], { cwd: rootDir, stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(serve.status ?? 1);

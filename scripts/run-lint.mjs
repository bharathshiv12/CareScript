import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function walkFiles(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, exts, out);
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

// 1. Secret & security hygiene checks across frontend source
const frontendFiles = walkFiles(path.join(rootDir, 'frontend'), ['.ts', '.tsx', '.js', '.html']);
const forbiddenPatterns = [
  { label: 'VITE_GEMINI_API_KEY', re: /VITE_GEMINI_API_KEY/ },
  { label: 'SUPABASE_SERVICE_ROLE_KEY in frontend', re: /SUPABASE_SERVICE_ROLE_KEY/ },
  { label: 'GEMINI_API_KEY literal in frontend', re: /\bGEMINI_API_KEY\b/ },
  { label: 'Google API AIza literal outside env/docs', re: /AIza[0-9A-Za-z_-]{35}/ },
];

for (const file of frontendFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const rule of forbiddenPatterns) {
    if (rule.re.test(content)) {
      console.error(`[lint][security] Forbidden pattern "${rule.label}" found in ${path.relative(rootDir, file)}`);
      process.exit(1);
    }
  }
}

// 2. Syntax validation on backend Node scripts
for (const file of [
  ...walkFiles(path.join(rootDir, 'backend'), ['.js', '.mjs']),
  ...walkFiles(path.join(rootDir, 'scripts'), ['.mjs']),
  ...walkFiles(path.join(rootDir, 'tests'), ['.mjs']),
]) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    console.error(`[lint][syntax] Failed syntax check for ${path.relative(rootDir, file)}`);
    console.error(err.stderr?.toString() || err.message);
    process.exit(1);
  }
}

// 3. ESLint across frontend, tests, scripts
const eslintBin = path.join(rootDir, 'node_modules', 'eslint', 'bin', 'eslint.js');
const eslintRes = spawnSync(process.execPath, [eslintBin, '.'], {
  cwd: rootDir,
  stdio: 'inherit',
});

if (eslintRes.status !== 0) {
  process.exit(eslintRes.status ?? 1);
}

console.log('[lint] ESLint, Node syntax checks, and frontend secret-hygiene checks passed.');

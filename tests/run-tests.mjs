import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const entry = resolve('tests/carescript.unit.test.ts');
const outfile = resolve('tests/.tmp-carescript.unit.test.mjs');

try {
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    alias: {
      '@': resolve('frontend/src'),
    },
    define: {
      'import.meta.env': '{}',
    },
    logLevel: 'silent',
  });

  const res = spawnSync(process.execPath, ['--test', outfile], {
    stdio: 'inherit',
  });
  process.exitCode = res.status ?? 1;
} finally {
  rmSync(outfile, { force: true });
}

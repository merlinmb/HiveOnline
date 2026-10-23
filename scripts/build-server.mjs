import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

await rm('dist/server', { recursive: true, force: true });

const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: false,
  logLevel: 'info',
};

await build({
  ...common,
  entryPoints: ['server/src/index.ts'],
  outfile: 'dist/server/index.js',
});

await build({
  ...common,
  entryPoints: ['server/tools/verify-user.ts'],
  outfile: 'dist/server/verify-user.js',
});

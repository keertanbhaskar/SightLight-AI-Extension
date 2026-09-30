// Builds the extension into dist/: HTML pages (multi-page), content script (IIFE), service worker (ES module).
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');
const mode = watch ? 'development' : 'production';
const alias = { '@': path.join(root, 'src') };

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const common = {
  root,
  configFile: false,
  mode,
  logLevel: 'warn',
  resolve: { alias },
  define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
};
const buildOpts = (extra) => ({
  outDir: dist, emptyOutDir: false, sourcemap: watch ? 'inline' : false, minify: !watch,
  watch: watch ? {} : null, target: 'chrome116', ...extra,
});

const jobs = [
  // UI pages
  {
    ...common, base: './', plugins: [react()], publicDir: path.join(root, 'public'),
    build: buildOpts({ rollupOptions: { input: { sidepanel: path.join(root, 'sidepanel.html'), permission: path.join(root, 'permission.html') } } }),
  },
  // Content script: must be a single self-contained classic script (no imports)
  {
    ...common, publicDir: false,
    build: buildOpts({ lib: { entry: path.join(root, 'src/content/content-script.ts'), formats: ['iife'], name: 'SightLiteContent', fileName: () => 'content.js' } }),
  },
  // Service worker
  {
    ...common, publicDir: false,
    build: buildOpts({
      lib: { entry: path.join(root, 'src/background/service-worker.ts'), formats: ['es'], fileName: () => 'background.js' },
      rollupOptions: { output: { inlineDynamicImports: true } },
    }),
  },
];

for (const job of jobs) await build(job);

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifest = readFileSync(path.join(root, 'manifest.json'), 'utf8').replace('__VERSION__', pkg.version);
writeFileSync(path.join(dist, 'manifest.json'), manifest);
console.log(`\n✓ SightLite ${pkg.version} built → ${path.relative(process.cwd(), dist) || 'dist'}${watch ? ' (watching)' : ''}`);

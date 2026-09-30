// Zips dist/ into release/sightlite-<version>.zip for the Chrome Web Store.
import { zipSync } from 'fflate';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

const files = {};
(function walk(dir, prefix = '') {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) walk(full, rel);
    else files[rel] = readFileSync(full);
  }
})(dist);

mkdirSync(path.join(root, 'release'), { recursive: true });
const out = path.join(root, 'release', `sightlite-${pkg.version}.zip`);
writeFileSync(out, zipSync(files, { level: 9 }));
console.log(`✓ ${path.relative(process.cwd(), out)} (${Object.keys(files).length} files)`);

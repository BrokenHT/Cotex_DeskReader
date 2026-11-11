'use strict';
// Exit 0 means dist/index.html is missing or older than src, so a rebuild is needed.
const fs = require('node:fs');
const path = require('node:path');
const OUT = path.join(__dirname, '..', 'dist', 'index.html');
const SRC = path.join(__dirname, '..', 'src');
const WATCHED = /\.(jsx?|mjs|css)$/;
function walk(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (WATCHED.test(entry.name)) files.push(full);
  }
  return files;
}
if (!fs.existsSync(OUT)) process.exit(0);
const built = fs.statSync(OUT).mtimeMs;
process.exit(walk(SRC).some((file) => fs.statSync(file).mtimeMs > built) ? 0 : 1);

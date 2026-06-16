const fs = require('fs');
const path = require('path');

const pkg = require('../package.json');
const out = path.join(__dirname, '../src/version.ts');
fs.writeFileSync(out, `export const VERSION = '${pkg.version}';\n`);
console.log(`Wrote version ${pkg.version} to ${out}`);

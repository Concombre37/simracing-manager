const fs = require('fs');
const path = require('path');

function findKoffiDir() {
  try {
    const resolved = require.resolve('koffi');
    return path.dirname(resolved);
  } catch {
    return null;
  }
}

const koffiDir = findKoffiDir();
if (!koffiDir) {
  console.log('koffi not found, skipping patch');
  process.exit(0);
}

const koffiIndex = path.join(koffiDir, 'index.js');
let content = fs.readFileSync(koffiIndex, 'utf8');

const marker = 'let roots = [path.join(__dirname, "..")];';
if (!content.includes(marker)) {
  console.log('koffi patch marker not found, skipping patch');
  process.exit(0);
}

const replacement = `let roots = [path.join(__dirname, "..")];
        if (typeof process !== "undefined" && process.pkg) {
          try { roots.push(path.dirname(process.execPath)); } catch (e) {}
        }`;

if (content.includes(replacement.split('\n')[1])) {
  console.log('koffi patch already applied');
  process.exit(0);
}

content = content.replace(marker, replacement);
fs.writeFileSync(koffiIndex, content);
console.log('Patched koffi index.js to search native module next to packaged executable');

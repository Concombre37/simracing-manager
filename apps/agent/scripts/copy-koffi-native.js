const fs = require('fs');
const path = require('path');

function findKoffiNativeDir() {
  try {
    const resolved = require.resolve('koffi');
    return path.join(path.dirname(resolved), 'build', 'koffi', 'win32_x64');
  } catch {
    return null;
  }
}

const srcDir = findKoffiNativeDir();
const destDir = path.join(__dirname, '..', 'exe', 'build', 'koffi', 'win32_x64');

if (!srcDir || !fs.existsSync(srcDir)) {
  console.error(`koffi native source directory not found`);
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });

const files = ['koffi.node', 'koffi.lib', 'koffi.exp'];
for (const file of files) {
  const src = path.join(srcDir, file);
  const dest = path.join(destDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file} to ${destDir}`);
  } else {
    console.warn(`Skipped missing file: ${file}`);
  }
}

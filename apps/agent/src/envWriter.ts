import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

const baseDir = path.dirname(process.execPath);

export function updateEnvValue(key: string, value: string): void {
  const envPath = path.join(baseDir, '.env');
  const content = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
  const lines = content.split('\n');
  let found = false;

  const newLines = lines.map((line) => {
    const match = line.match(new RegExp(`^${key}=`));
    if (match) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) {
    newLines.push(`${key}=${value}`);
  }

  writeFileSync(envPath, newLines.join('\n'), 'utf-8');
}

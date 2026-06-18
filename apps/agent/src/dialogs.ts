import { execSync } from 'child_process';
import { existsSync } from 'fs';

export function isInteractiveWindowsSession(): boolean {
  return process.platform === 'win32' && process.env.SESSIONNAME !== undefined;
}

export function promptForContentManagerPath(defaultPath?: string): string | undefined {
  if (process.platform !== 'win32') return undefined;

  const message =
    "Content Manager n'a pas été trouvé automatiquement.\n\nIndique le chemin complet de Content Manager.exe (ou du dossier qui le contient) :";
  const title = 'SimRacing Manager - Configuration Content Manager';
  const defaultValue = defaultPath ?? '';

  const psScript = [
    'Add-Type -AssemblyName Microsoft.VisualBasic',
    `$result = [Microsoft.VisualBasic.Interaction]::InputBox('${escapePsString(message)}', '${escapePsString(title)}', '${escapePsString(defaultValue)}')`,
    'Write-Output $result',
  ].join('\n');

  try {
    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    const output = execSync(
      `powershell.exe -NoProfile -WindowStyle Hidden -EncodedCommand ${encoded}`,
      {
        encoding: 'utf-8',
        timeout: 120000,
        windowsHide: true,
      },
    )
      .toString()
      .trim();

    if (!output) return undefined;
    return output;
  } catch (err) {
    // User cancelled or dialog failed.
    return undefined;
  }
}

function escapePsString(input: string): string {
  return input.replace(/'/g, "''").replace(/\n/g, '`n');
}

export function validateFilePath(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  const normalized = trimmed.replace(/^["']|["']$/g, '');
  return existsSync(normalized);
}

import fs from "fs-extra";
import path from "path";
import { config } from "./config";
import { log } from "./console";

const STARTER_KEYS: Record<string, string> = {
  JOY: "-1",
  BUTTON: "-1",
  KEY: "-1",
  XBOXBUTTON: "A",
};

function getControlsIniPath(): string {
  return path.join(config.documentsPath, "Assetto Corsa", "cfg", "controls.ini");
}

function detectEol(content: string): string {
  if (content.includes("\r\n")) return "\r\n";
  return "\n";
}

/**
 * Modifie controls.ini d'Assetto Corsa pour mapper l'action STARTER
 * (démarrage / redémarrage moteur, équivalent "Start / Restart") sur le
 * bouton A de la manette Xbox virtuelle créée par ViGEmBus.
 *
 * AC détecte la manette virtuelle comme un contrôleur XInput, il suffit donc
 * de renseigner XBOXBUTTON=A. Cela évite à l'utilisateur d'avoir une
 * manette physique pour faire ce mapping.
 */
export async function ensureStarterBoundToA(): Promise<boolean> {
  if (process.platform !== "win32") {
    log("info", "[acControls] Mapping AC ignoré sur plateforme non-Windows");
    return false;
  }

  const controlsPath = getControlsIniPath();
  if (!fs.existsSync(controlsPath)) {
    log("warn", `[acControls] controls.ini introuvable : ${controlsPath}`);
    return false;
  }

  const content = fs.readFileSync(controlsPath, "utf-8");
  const eol = detectEol(content);
  const lines = content.split(eol);

  // Rechercher la dernière occurrence de la section [STARTER]
  let sectionStart = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().toUpperCase() === "[STARTER]") {
      sectionStart = i;
      break;
    }
  }

  if (sectionStart !== -1) {
    // Trouver la fin de la section (prochaine section ou fin du fichier)
    let sectionEnd = lines.length;
    for (let j = sectionStart + 1; j < lines.length; j++) {
      if (/^\s*\[.*\]\s*$/.test(lines[j])) {
        sectionEnd = j;
        break;
      }
    }

    const seen = new Set<string>();
    for (let j = sectionStart + 1; j < sectionEnd; j++) {
      const trimmed = lines[j].trim();
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim().toUpperCase();
      if (key in STARTER_KEYS) {
        seen.add(key);
        lines[j] = `${key}=${STARTER_KEYS[key]}`;
      }
    }

    const missing = Object.entries(STARTER_KEYS)
      .filter(([key]) => !seen.has(key))
      .map(([key, value]) => `${key}=${value}`);

    if (missing.length > 0) {
      lines.splice(sectionStart + 1, 0, ...missing);
    }
  } else {
    // Aucune section STARTER, l'ajouter à la fin
    lines.push("", "[STARTER]");
    for (const [key, value] of Object.entries(STARTER_KEYS)) {
      lines.push(`${key}=${value}`);
    }
  }

  const newContent = lines.join(eol);
  if (newContent === content) {
    log("info", "[acControls] Mapping STARTER déjà configuré sur bouton A");
    return true;
  }

  const backupPath = `${controlsPath}.bak.${Date.now()}`;
  try {
    fs.copyFileSync(controlsPath, backupPath);
  } catch (err: any) {
    log("warn", `[acControls] Impossible de créer le backup : ${err.message}`);
  }

  fs.writeFileSync(controlsPath, newContent, "utf-8");
  log(
    "success",
    `[acControls] Action STARTER mappée sur le bouton A (backup : ${path.basename(
      backupPath,
    )})`,
  );
  return true;
}

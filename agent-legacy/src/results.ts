import fs from 'fs-extra';
import path from 'path';
import { config, getAcOutPath } from './config';

export interface LapResult {
  lap: number;
  timeMs: number;
  sector1Ms?: number;
  sector2Ms?: number;
  sector3Ms?: number;
}

export interface SessionResults {
  driverName?: string;
  carId?: string;
  trackId?: string;
  layout?: string;
  lapCount: number;
  bestLapTimeMs?: number;
  totalTimeMs?: number;
  position?: number;
  laps: LapResult[];
}

function parseTimeToMs(timeStr: string): number | undefined {
  if (!timeStr || timeStr === '0' || timeStr === '-1') return undefined;
  const parts = timeStr.split(':');
  if (parts.length === 3) {
    const [min, sec, ms] = parts;
    return parseInt(min) * 60000 + parseInt(sec) * 1000 + parseInt(ms.padEnd(3, '0').slice(0, 3));
  }
  if (parts.length === 2) {
    const [sec, ms] = parts;
    return parseInt(sec) * 1000 + parseInt(ms.padEnd(3, '0').slice(0, 3));
  }
  const ms = parseInt(timeStr);
  return isNaN(ms) ? undefined : ms;
}

export async function findLatestResultFile(): Promise<string | undefined> {
  const outDir = getAcOutPath();
  if (!(await fs.pathExists(outDir))) {
    console.log(`Dossier de résultats non trouvé: ${outDir}`);
    return undefined;
  }

  const files = await fs.readdir(outDir);
  const resultFiles = files
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ name: f, path: path.join(outDir, f), stat: fs.statSync(path.join(outDir, f)) }))
    .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());

  return resultFiles[0]?.path;
}

export async function parseResultFile(filePath: string): Promise<SessionResults | undefined> {
  if (!(await fs.pathExists(filePath))) return undefined;

  try {
    const content = await fs.readJson(filePath);

    // Format courant des résultats AC (struct.json ou result.json)
    const laps: LapResult[] = [];
    let bestLapTimeMs: number | undefined;
    let totalTimeMs = 0;

    if (content.Laps && Array.isArray(content.Laps)) {
      for (const lap of content.Laps) {
        const timeMs = parseTimeToMs(lap.Time) || 0;
        if (timeMs > 0) {
          laps.push({
            lap: lap.Lap,
            timeMs,
            sector1Ms: parseTimeToMs(lap.Sector1),
            sector2Ms: parseTimeToMs(lap.Sector2),
            sector3Ms: parseTimeToMs(lap.Sector3),
          });
          totalTimeMs += timeMs;
          if (!bestLapTimeMs || timeMs < bestLapTimeMs) {
            bestLapTimeMs = timeMs;
          }
        }
      }
    }

    return {
      driverName: content.DriverName,
      carId: content.CarModel || content.CarId,
      trackId: content.TrackName || content.TrackId,
      layout: content.TrackConfig,
      lapCount: laps.length,
      bestLapTimeMs,
      totalTimeMs: totalTimeMs > 0 ? totalTimeMs : undefined,
      position: content.Position,
      laps,
    };
  } catch (err) {
    console.error('Erreur parsing résultat:', err);
    return undefined;
  }
}

export async function getLatestResults(): Promise<SessionResults | undefined> {
  const filePath = await findLatestResultFile();
  if (!filePath) return undefined;
  console.log(`Fichier de résultat trouvé: ${filePath}`);
  return parseResultFile(filePath);
}

import fs from 'fs-extra';
import path from 'path';
import { config } from './config';

export interface AcContent {
  cars: { acId: string; name: string; brand?: string; category?: string }[];
  tracks: { acId: string; name: string; layouts: string[] }[];
}

function readJsonSafe<T>(filePath: string): T | undefined {
  try {
    if (!fs.pathExistsSync(filePath)) return undefined;
    return fs.readJsonSync(filePath) as T;
  } catch {
    return undefined;
  }
}

export async function scanAssettoContent(): Promise<AcContent> {
  const content: AcContent = { cars: [], tracks: [] };

  const carsDir = path.join(config.acPath, 'content', 'cars');
  if (await fs.pathExists(carsDir)) {
    const entries = await fs.readdir(carsDir);
    for (const entry of entries) {
      const carDir = path.join(carsDir, entry);
      const stat = await fs.stat(carDir).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      const uiJson = readJsonSafe<{ name?: string; brand?: string; class?: string }>(
        path.join(carDir, 'ui_car.json')
      );

      content.cars.push({
        acId: entry,
        name: uiJson?.name || entry,
        brand: uiJson?.brand,
        category: uiJson?.class,
      });
    }
  }

  const tracksDir = path.join(config.acPath, 'content', 'tracks');
  if (await fs.pathExists(tracksDir)) {
    const entries = await fs.readdir(tracksDir);
    for (const entry of entries) {
      const trackDir = path.join(tracksDir, entry);
      const stat = await fs.stat(trackDir).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      const uiJson = readJsonSafe<{ name?: string }>(path.join(trackDir, 'ui_track.json'));

      // Layouts = sous-dossiers contenant un ui_track.json
      const layouts: string[] = [];
      const subEntries = await fs.readdir(trackDir).catch(() => []);
      for (const sub of subEntries) {
        const subDir = path.join(trackDir, sub);
        const subStat = await fs.stat(subDir).catch(() => null);
        if (subStat && subStat.isDirectory() && (await fs.pathExists(path.join(subDir, 'ui_track.json')))) {
          layouts.push(sub);
        }
      }

      content.tracks.push({
        acId: entry,
        name: uiJson?.name || entry,
        layouts,
      });
    }
  }

  console.log(`[contentScanner] Voitures trouvées: ${content.cars.length}, Circuits: ${content.tracks.length}`);
  return content;
}

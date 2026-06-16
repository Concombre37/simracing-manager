import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from 'pino';
import axios from 'axios';
import { config } from './config';

interface CatalogPackage {
  id: string;
  type: 'car' | 'track' | 'app';
  name: string;
  version: string;
  archiveUrl: string;
  checksum: string | null;
  isRequired: boolean;
}

interface Catalog {
  version: string;
  packages: CatalogPackage[];
}

export class ContentSync {
  constructor(private readonly logger: Logger) {}

  async sync(): Promise<void> {
    this.logger.info('Starting content sync');
    const { data: catalog } = await axios.get<Catalog>(`${config.SERVER_URL}/api/content/catalog`, {
      headers: { Authorization: `Bearer ${config.API_KEY}` },
    });

    for (const pkg of catalog.packages) {
      const installed = await this.isInstalled(pkg);
      if (!installed) {
        await this.downloadAndInstall(pkg);
      }
    }

    this.logger.info('Content sync complete');
  }

  private async isInstalled(pkg: CatalogPackage): Promise<boolean> {
    const basePath = this.getBasePath(pkg.type);
    if (!basePath) return false;
    const pkgPath = path.join(basePath, pkg.name);
    try {
      await fs.access(pkgPath);
      return true;
    } catch {
      return false;
    }
  }

  private async downloadAndInstall(pkg: CatalogPackage): Promise<void> {
    this.logger.info({ package: pkg.name }, 'Downloading package');
    const basePath = this.getBasePath(pkg.type);
    if (!basePath) return;

    const tempFile = path.join(basePath, `${pkg.name}.zip`);
    const response = await axios.get(pkg.archiveUrl, { responseType: 'arraybuffer' });
    await fs.writeFile(tempFile, response.data);

    if (process.platform === 'win32') {
      const ps = `Expand-Archive -Path '${tempFile}' -DestinationPath '${basePath}' -Force`;
      const { exec } = await import('child_process');
      exec(`powershell.exe -Command "${ps}"`, (err) => {
        if (err) this.logger.error({ err }, 'Failed to extract package');
        else this.logger.info({ package: pkg.name }, 'Package installed');
      });
    }
  }

  private getBasePath(type: string): string | null {
    const documentsPath =
      config.DOCUMENTS_PATH ??
      path.join(process.env.USERPROFILE ?? '', 'Documents', 'Assetto Corsa');
    switch (type) {
      case 'car':
        return path.join(documentsPath, 'content', 'cars');
      case 'track':
        return path.join(documentsPath, 'content', 'tracks');
      case 'app':
        return path.join(documentsPath, 'apps', 'lua');
      default:
        return null;
    }
  }
}

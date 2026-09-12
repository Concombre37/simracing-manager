import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Logger } from 'pino';
import axios from 'axios';
import { config } from './config';

const execFileAsync = promisify(execFile);

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
  private syncing = false;

  constructor(private readonly logger: Logger) {}

  async sync(): Promise<void> {
    if (this.syncing) {
      this.logger.debug('Content sync already running; skipping duplicate request');
      return;
    }
    this.syncing = true;
    try {
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
    } finally {
      this.syncing = false;
    }
  }

  /** Archive one installed car/track and send it to the backend so it can be
   * installed on the other fleet stations. The path is always resolved from
   * the configured Assetto Corsa content directory; callers only provide the
   * scanner's acId, never an arbitrary filesystem path. */
  async share(type: 'car' | 'track', acId: string, targets: string[]): Promise<void> {
    const safeId = acId.trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(safeId)) throw new Error('Invalid content id');
    const basePath = this.getBasePath(type);
    if (!basePath) throw new Error(`Unsupported content type: ${type}`);
    const sourcePath = path.join(basePath, safeId);
    const stat = await fs.stat(sourcePath).catch(() => undefined);
    if (!stat?.isDirectory()) throw new Error(`Installed ${type} not found: ${safeId}`);

    const archivePath = path.join(os.tmpdir(), `simracing-share-${type}-${safeId}-${Date.now()}.zip`);
    try {
      const escapedSource = sourcePath.replace(/'/g, "''");
      const escapedArchive = archivePath.replace(/'/g, "''");
      await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Compress-Archive -Path '${escapedSource}' -DestinationPath '${escapedArchive}' -Force`,
      ], { timeout: 10 * 60 * 1000 });
      const archive = await fs.readFile(archivePath);
      const body = this.buildMultipart(archive, `${safeId}.zip`, {
        type,
        acId: safeId,
        targets: JSON.stringify([...new Set(targets.filter(Boolean))]),
      });
      await axios.post(`${config.SERVER_URL}/api/content/source-upload`, body.data, {
        headers: {
          Authorization: `Bearer ${config.API_KEY}`,
          'Content-Type': `multipart/form-data; boundary=${body.boundary}`,
          'Content-Length': body.data.length,
        },
        maxBodyLength: 1024 * 1024 * 1024,
        maxContentLength: 1024 * 1024 * 1024,
        timeout: 15 * 60 * 1000,
      });
      this.logger.info({ type, acId: safeId, targets }, 'Content package shared');
    } finally {
      await fs.unlink(archivePath).catch(() => undefined);
    }
  }

  private buildMultipart(
    file: Buffer,
    filename: string,
    fields: Record<string, string>,
  ): { boundary: string; data: Buffer } {
    const boundary = `----SimRacing${Date.now().toString(16)}`;
    const chunks: Buffer[] = [];
    for (const [name, value] of Object.entries(fields)) {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    }
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/zip\r\n\r\n`));
    chunks.push(file);
    chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    return { boundary, data: Buffer.concat(chunks) };
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
    const archiveUrl = new URL(pkg.archiveUrl, `${config.SERVER_URL}/`).toString();
    const response = await axios.get(archiveUrl, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${config.API_KEY}` },
      maxContentLength: 1024 * 1024 * 1024,
      maxBodyLength: 1024 * 1024 * 1024,
    });
    await fs.writeFile(tempFile, response.data);

    if (process.platform === 'win32') {
      const ps = `Expand-Archive -Path '${tempFile}' -DestinationPath '${basePath}' -Force`;
      try {
        await execFileAsync('powershell.exe', [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          ps,
        ], { timeout: 15 * 60 * 1000 });
        this.logger.info({ package: pkg.name }, 'Package installed');
      } catch (err) {
        this.logger.error({ err, package: pkg.name }, 'Failed to extract package');
      } finally {
        await fs.unlink(tempFile).catch(() => undefined);
      }
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

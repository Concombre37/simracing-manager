import axios from 'axios';
import { ChildProcess, spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { Logger } from 'pino';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const MAX_RECORDING_BYTES = 500 * 1024 * 1024;

/**
 * Captures the Windows desktop while Assetto Corsa is running.
 *
 * This deliberately captures the desktop rather than trying to attach to a
 * particular AC window: Content Manager can hand off between several
 * processes and window titles vary with mods. The agent already owns the POD
 * desktop and puts AC in the foreground, so gdigrab gives the spectator a
 * reliable view without a browser permission prompt.
 */
export class LiveCaptureManager {
  private frameProcess: ChildProcess | null = null;
  private recordingProcess: ChildProcess | null = null;
  private recordPath: string | null = null;
  private startedAt = 0;
  private running = false;
  private frameBuffer = Buffer.alloc(0);
  private uploadInFlight = false;

  constructor(
    private readonly logger: Logger,
    private readonly serverUrl: string,
    private readonly stationId: string,
    private readonly getApiKey: () => string | undefined,
  ) {}

  async start(): Promise<void> {
    if (this.running || process.platform !== 'win32') return;
    const ffmpeg = await this.findFfmpeg();
    if (!ffmpeg) {
      this.logger.warn('ffmpeg.exe not found; automatic spectator capture is disabled');
      return;
    }

    const tempDir = path.join(os.tmpdir(), 'simracing-manager');
    await fs.mkdir(tempDir, { recursive: true });
    const safeStationId = this.stationId.replace(/[^a-zA-Z0-9._-]/g, '_');
    this.recordPath = path.join(tempDir, `spectator-${safeStationId}-${Date.now()}.mp4`);
    this.startedAt = Date.now();
    this.running = true;
    this.frameBuffer = Buffer.alloc(0);

    this.frameProcess = spawn(
      ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'gdigrab',
        '-framerate',
        '10',
        '-draw_mouse',
        '0',
        '-i',
        'desktop',
        '-vf',
        'scale=1280:-2',
        '-q:v',
        '7',
        '-f',
        'image2pipe',
        '-vcodec',
        'mjpeg',
        'pipe:1',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    this.frameProcess.stdout?.on('data', (chunk: Buffer) => this.consumeFrames(chunk));
    this.frameProcess.stderr?.on('data', (chunk: Buffer) => {
      const message = chunk.toString().trim();
      if (message) this.logger.debug({ message }, 'Spectator frame capture');
    });
    this.frameProcess.once('error', (err) => {
      this.logger.warn({ err }, 'Live spectator frame capture stopped');
      this.frameProcess = null;
    });

    this.recordingProcess = spawn(
      ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'gdigrab',
        '-framerate',
        '30',
        '-draw_mouse',
        '0',
        '-i',
        'desktop',
        '-vf',
        'scale=1280:-2',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '28',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        this.recordPath,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true },
    );
    this.recordingProcess.stderr?.on('data', (chunk: Buffer) => {
      const message = chunk.toString().trim();
      if (message) this.logger.debug({ message }, 'Spectator video capture');
    });
    this.recordingProcess.once('error', (err) => {
      this.logger.warn({ err }, 'Live spectator video capture stopped');
      this.recordingProcess = null;
    });
    this.logger.info({ stationId: this.stationId, recordPath: this.recordPath }, 'Automatic spectator capture started');
  }

  async stop(): Promise<void> {
    if (!this.running && !this.recordingProcess && !this.frameProcess) return;
    this.running = false;
    const frameProcess = this.frameProcess;
    this.frameProcess = null;
    if (frameProcess && !frameProcess.killed) frameProcess.kill();

    const recordingProcess = this.recordingProcess;
    this.recordingProcess = null;
    if (recordingProcess && !recordingProcess.killed) {
      try {
        recordingProcess.stdin?.write('q');
      } catch {
        recordingProcess.kill();
      }
      await this.waitForExit(recordingProcess, 10_000);
    }

    const recordPath = this.recordPath;
    this.recordPath = null;
    if (!recordPath) return;
    try {
      const stat = await fs.stat(recordPath);
      if (stat.size > 0 && stat.size <= MAX_RECORDING_BYTES) {
        const data = await fs.readFile(recordPath);
        await this.uploadRecording(data, Math.max(0, Math.round((Date.now() - this.startedAt) / 1000)));
      } else if (stat.size > MAX_RECORDING_BYTES) {
        this.logger.warn({ sizeBytes: stat.size }, 'Spectator recording exceeds server limit');
      }
    } catch (err) {
      this.logger.debug({ err }, 'No spectator recording to upload');
    } finally {
      await fs.rm(recordPath, { force: true }).catch(() => undefined);
    }
    this.logger.info({ stationId: this.stationId }, 'Automatic spectator capture stopped');
  }

  private consumeFrames(chunk: Buffer): void {
    if (!this.running) return;
    this.frameBuffer = Buffer.concat([this.frameBuffer, chunk]);
    while (true) {
      const start = this.frameBuffer.indexOf(Buffer.from([0xff, 0xd8]));
      if (start < 0) {
        this.frameBuffer = this.frameBuffer.slice(Math.max(0, this.frameBuffer.length - 1));
        return;
      }
      const end = this.frameBuffer.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
      if (end < 0) {
        this.frameBuffer = this.frameBuffer.slice(start);
        return;
      }
      const frame = this.frameBuffer.subarray(start, end + 2);
      this.frameBuffer = this.frameBuffer.slice(end + 2);
      void this.uploadFrame(frame);
    }
  }

  private async uploadFrame(frame: Buffer): Promise<void> {
    const apiKey = this.getApiKey();
    if (!apiKey || this.uploadInFlight || !this.running) return;
    this.uploadInFlight = true;
    try {
      await axios.post(`${this.serverUrl}/api/spectator/frame`, frame, {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'image/jpeg' },
        maxBodyLength: 2 * 1024 * 1024,
        maxContentLength: 2 * 1024 * 1024,
        timeout: 5_000,
      });
    } catch (err) {
      this.logger.debug({ err }, 'Failed to upload live spectator frame');
    } finally {
      this.uploadInFlight = false;
    }
  }

  private async uploadRecording(data: Buffer, durationSeconds: number): Promise<void> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn('Cannot upload spectator recording without an API key');
      return;
    }
    try {
      await axios.post(`${this.serverUrl}/api/spectator/recordings/raw`, data, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'video/mp4',
          'X-Recording-Title': `Assetto Corsa · ${this.stationId} · ${new Date().toLocaleString('fr-FR')}`,
          'X-Recording-Duration': String(durationSeconds),
        },
        maxBodyLength: MAX_RECORDING_BYTES,
        maxContentLength: MAX_RECORDING_BYTES,
        timeout: 10 * 60_000,
      });
    } catch (err) {
      this.logger.warn({ err }, 'Failed to upload spectator recording');
    }
  }

  private async findFfmpeg(): Promise<string | null> {
    const candidates = [
      process.env.FFMPEG_PATH,
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe',
    ].filter((candidate): candidate is string => Boolean(candidate));
    for (const candidate of candidates) {
      if (candidate === 'ffmpeg.exe') return candidate;
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Try the next known installation path.
      }
    }
    try {
      const result = await execFileAsync('where.exe', ['ffmpeg.exe']);
      const first = result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
      return first ?? null;
    } catch {
      return null;
    }
  }

  private waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        if (!child.killed) child.kill();
        finish();
      }, timeoutMs);
      child.once('close', finish);
      child.once('error', finish);
    });
  }
}

import { Writable } from 'stream';
import fs from 'fs';
import path from 'path';
import { agentLogRingBuffer } from './logRingBuffer';

const MAX_LOG_FILE_BYTES = 5 * 1024 * 1024;

/** Duplicates pino's NDJSON output to stdout (unchanged behavior), a
 * rotated file on disk, and the in-memory ring buffer the local console
 * window reads from. Best-effort: file logging must never block startup or
 * crash the agent if the disk isn't writable. */
export class LogFileStream extends Writable {
  private fileStream: fs.WriteStream | null = null;

  constructor() {
    super();
    try {
      const logDir = path.join(process.env.TEMP || '/tmp', 'simracing-manager', 'logs');
      fs.mkdirSync(logDir, { recursive: true });
      const logPath = path.join(logDir, 'agent.log');
      try {
        if (fs.statSync(logPath).size > MAX_LOG_FILE_BYTES) {
          fs.renameSync(logPath, path.join(logDir, 'agent.log.old'));
        }
      } catch {
        // no existing file to rotate, nothing to do
      }
      this.fileStream = fs.createWriteStream(logPath, { flags: 'a' });
    } catch {
      // disk unavailable/read-only: file logging is best-effort only
    }
  }

  override _write(
    chunk: Buffer,
    _encoding: string,
    callback: (error?: Error | null) => void,
  ): void {
    this.fileStream?.write(chunk);
    process.stdout.write(chunk);
    this.pushToRingBuffer(chunk);
    callback();
  }

  private pushToRingBuffer(chunk: Buffer): void {
    const line = chunk.toString('utf-8').trim();
    if (!line) return;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown> & {
        time?: string;
        level?: string;
        msg?: string;
      };
      const time = typeof parsed.time === 'string' ? parsed.time.slice(11, 19) : '';
      const level = typeof parsed.level === 'string' ? parsed.level : '';
      const msg = typeof parsed.msg === 'string' ? parsed.msg : '';
      const extras = this.formatExtras(parsed);
      agentLogRingBuffer.push(`[${time}] ${level} ${msg}${extras}`.trim());
    } catch {
      // not a JSON line (shouldn't happen without pino-pretty) — skip it
    }
  }

  /** Pino keeps structured fields (code, serverId, err...) separate from
   * `msg` — the ring buffer used to drop them entirely, which meant a line
   * like "Server process exited" gave no way to tell a clean stop from a
   * crash without ssh-ing in to read the raw NDJSON file. Surface the
   * handful of fields that matter for remote debugging inline instead. */
  private formatExtras(parsed: Record<string, unknown>): string {
    const skip = new Set(['time', 'level', 'msg', 'pid', 'hostname']);
    const parts: string[] = [];
    for (const [key, value] of Object.entries(parsed)) {
      if (skip.has(key) || value === undefined) continue;
      if (key === 'err' && value && typeof value === 'object') {
        const err = value as { message?: string };
        if (err.message) parts.push(`err=${err.message}`);
        continue;
      }
      if (typeof value === 'object') continue;
      parts.push(`${key}=${String(value)}`);
    }
    return parts.length > 0 ? ` (${parts.join(', ')})` : '';
  }
}

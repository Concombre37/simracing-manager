/** Keeps the last N formatted log lines in memory so the local console
 * window can display recent activity without reading back its own log
 * file. Not a replacement for the file: this is just for the live view. */
export class LogRingBuffer {
  private lines: string[] = [];

  constructor(private readonly maxLines = 100) {}

  push(line: string): void {
    this.lines.push(line);
    if (this.lines.length > this.maxLines) {
      this.lines.splice(0, this.lines.length - this.maxLines);
    }
  }

  getLines(): string[] {
    return [...this.lines];
  }
}

/** Shared instance: fed by the pino stream set up in index.ts, read by
 * TrayManager when it writes the console's status snapshot. */
export const agentLogRingBuffer = new LogRingBuffer();

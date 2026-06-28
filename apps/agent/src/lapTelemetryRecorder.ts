import { TelemetrySnapshot } from '@simracing/shared';
import { Logger } from 'pino';
import path from 'path';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';

interface LapStats {
  maxSpeed: number;
  maxRpm: number;
  throttleSum: number;
  brakeSum: number;
  samples: number;
}

export class LapTelemetryRecorder {
  private sessionId: string | null = null;
  private filePath: string | null = null;
  private stream: ReturnType<typeof createWriteStream> | null = null;
  private previousLap = 0;
  private lapStats: LapStats = {
    maxSpeed: 0,
    maxRpm: 0,
    throttleSum: 0,
    brakeSum: 0,
    samples: 0,
  };

  constructor(private readonly logger: Logger) {}

  start(sessionId: string): void {
    this.stop();
    this.sessionId = sessionId;
    const tmpDir = process.env.TEMP || '/tmp';
    this.filePath = path.join(tmpDir, 'simracing-manager', 'sessions', sessionId, 'laps.csv');
    this.previousLap = 0;
    this.lapStats = {
      maxSpeed: 0,
      maxRpm: 0,
      throttleSum: 0,
      brakeSum: 0,
      samples: 0,
    };

    void this.ensureDirectory().then(() => {
      if (!this.filePath) return;
      try {
        this.stream = createWriteStream(this.filePath, { flags: 'w' });
        this.stream.write('lap,lapTimeMs,maxSpeedKmh,maxRpm,avgThrottle,avgBrake,bestLapMs\n');
        this.logger.info({ filePath: this.filePath }, 'Lap telemetry recording started');
      } catch (err) {
        this.logger.error({ err }, 'Failed to start lap telemetry recorder');
      }
    });
  }

  record(snapshot: TelemetrySnapshot): void {
    if (!this.sessionId || !this.stream) return;

    const lap = snapshot.lapCount ?? 0;
    if (lap > this.previousLap && this.previousLap > 0) {
      this.writeRow(this.previousLap, snapshot.lastLapMs ?? 0, snapshot.bestLapMs ?? 0);
      this.lapStats = {
        maxSpeed: 0,
        maxRpm: 0,
        throttleSum: 0,
        brakeSum: 0,
        samples: 0,
      };
    }
    this.previousLap = lap;

    this.lapStats.maxSpeed = Math.max(this.lapStats.maxSpeed, snapshot.speedKmh);
    this.lapStats.maxRpm = Math.max(this.lapStats.maxRpm, snapshot.rpm);
    this.lapStats.throttleSum += snapshot.throttle;
    this.lapStats.brakeSum += snapshot.brake;
    this.lapStats.samples++;
  }

  async finish(): Promise<string | null> {
    const filePath = this.filePath;
    this.stop();
    return filePath;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  stop(): void {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
    this.sessionId = null;
    this.filePath = null;
    this.previousLap = 0;
    this.lapStats = {
      maxSpeed: 0,
      maxRpm: 0,
      throttleSum: 0,
      brakeSum: 0,
      samples: 0,
    };
  }

  private async ensureDirectory(): Promise<void> {
    if (!this.filePath) return;
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
  }

  private writeRow(lap: number, lapTimeMs: number, bestLapMs: number): void {
    if (!this.stream) return;
    const { maxSpeed, maxRpm, throttleSum, brakeSum, samples } = this.lapStats;
    const avgThrottle = samples > 0 ? throttleSum / samples : 0;
    const avgBrake = samples > 0 ? brakeSum / samples : 0;
    const row = [
      lap,
      Math.round(lapTimeMs),
      Math.round(maxSpeed),
      Math.round(maxRpm),
      avgThrottle.toFixed(3),
      avgBrake.toFixed(3),
      Math.round(bestLapMs),
    ].join(',');
    this.stream.write(`${row}\n`);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { TelemetrySnapshot } from '@simracing/shared';

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);
  private readonly snapshots = new Map<string, TelemetrySnapshot>();
  private readonly maxAgeMs = 60_000;

  update(snapshot: TelemetrySnapshot): void {
    this.snapshots.set(snapshot.stationId, snapshot);
    this.cleanup();
  }

  getCurrent(stationId: string): TelemetrySnapshot | null {
    const snapshot = this.snapshots.get(stationId);
    if (!snapshot) return null;
    if (Date.now() - snapshot.timestamp > this.maxAgeMs) {
      this.snapshots.delete(stationId);
      return null;
    }
    return snapshot;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [stationId, snapshot] of this.snapshots) {
      if (now - snapshot.timestamp > this.maxAgeMs) {
        this.snapshots.delete(stationId);
      }
    }
  }
}

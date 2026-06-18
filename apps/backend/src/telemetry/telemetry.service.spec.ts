import { TelemetryService } from './telemetry.service';

describe('TelemetryService', () => {
  let service: TelemetryService;

  beforeEach(() => {
    service = new TelemetryService();
  });

  it('returns null when no snapshot exists', () => {
    expect(service.getCurrent('unknown')).toBeNull();
  });

  it('stores and retrieves a snapshot', () => {
    const snapshot = {
      stationId: 'pod-01',
      timestamp: Date.now(),
      speedKmh: 120,
      rpm: 6500,
      gear: 4,
      throttle: 0.8,
      brake: 0,
      steering: 0.1,
    };
    service.update(snapshot);
    expect(service.getCurrent('pod-01')).toEqual(snapshot);
  });

  it('drops stale snapshots older than 60s', () => {
    const snapshot = {
      stationId: 'pod-02',
      timestamp: Date.now() - 61_000,
      speedKmh: 0,
      rpm: 0,
      gear: 0,
      throttle: 0,
      brake: 0,
      steering: 0,
    };
    service.update(snapshot);
    expect(service.getCurrent('pod-02')).toBeNull();
  });
});

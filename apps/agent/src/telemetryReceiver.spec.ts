import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { TelemetryReceiver } from './telemetryReceiver';
import type { TelemetrySnapshot } from '@simracing/shared';

describe('TelemetryReceiver', () => {
  let receiver: TelemetryReceiver;
  const emit = vi.fn();
  const onSnapshot = vi.fn();
  const mockSocket = {
    connected: true,
    emit,
  } as unknown as import('socket.io-client').Socket;
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => mockLogger),
  } as unknown as import('pino').Logger;

  const udpPort = 29900;
  const httpPort = 29901;

  beforeEach(() => {
    emit.mockClear();
    receiver = new TelemetryReceiver(mockLogger, mockSocket, onSnapshot, udpPort, httpPort);
  });

  afterEach(() => {
    receiver.stop();
  });

  it('forwards a valid HTTP telemetry payload to the socket', async () => {
    receiver.start();

    const payload: TelemetrySnapshot = {
      stationId: 'pod-01',
      timestamp: Date.now(),
      speedKmh: 150,
      rpm: 7000,
      gear: 5,
      throttle: 1,
      brake: 0,
      steering: 0,
    };

    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: httpPort,
          path: '/telemetry',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        (res) => {
          if (res.statusCode === 204) resolve();
          else reject(new Error(`Unexpected status ${res.statusCode}`));
        },
      );
      req.on('error', reject);
      req.write(JSON.stringify(payload));
      req.end();
    });

    expect(onSnapshot).toHaveBeenCalledWith(payload);
  });
});

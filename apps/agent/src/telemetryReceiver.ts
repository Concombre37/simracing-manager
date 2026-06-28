import dgram from 'dgram';
import http from 'http';
import { Logger } from 'pino';
import { Socket } from 'socket.io-client';
import { AgentToServerEvents, ServerToAgentEvents, TelemetrySnapshot } from '@simracing/shared';

export class TelemetryReceiver {
  private udpSocket: dgram.Socket | null = null;
  private httpServer: http.Server | null = null;
  private running = false;
  private packetCount = 0;
  private lastLogAt = 0;

  constructor(
    private readonly logger: Logger,
    private readonly socket: Socket<ServerToAgentEvents, AgentToServerEvents> | null,
    private readonly onSnapshot?: (snapshot: TelemetrySnapshot) => void,
    private readonly udpPort = 19900,
    private readonly httpPort = 19901,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;

    this.udpSocket = dgram.createSocket('udp4');
    this.udpSocket.on('message', (msg, rinfo) => {
      try {
        const payload: TelemetrySnapshot = JSON.parse(msg.toString('utf-8'));
        this.packetCount++;
        this.logProgress();
        this.forward(payload);
      } catch (err) {
        this.logger.warn({ err, from: rinfo.address }, 'Invalid telemetry UDP packet');
      }
    });
    this.udpSocket.on('error', (err) => {
      this.logger.error({ err }, 'Telemetry UDP socket error');
    });
    this.udpSocket.bind(this.udpPort, '127.0.0.1');
    this.logger.info({ port: this.udpPort }, 'Telemetry UDP receiver started');

    this.httpServer = http.createServer((req, res) => {
      if (req.method !== 'POST' || req.url !== '/telemetry') {
        res.writeHead(404).end();
        return;
      }
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const payload: TelemetrySnapshot = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
          this.packetCount++;
          this.logProgress();
          this.forward(payload);
          res.writeHead(204).end();
        } catch (err) {
          this.logger.warn({ err }, 'Invalid telemetry HTTP body');
          res.writeHead(400).end();
        }
      });
    });
    this.httpServer.on('error', (err) => {
      this.logger.error({ err }, 'Telemetry HTTP server error');
    });
    this.httpServer.listen(this.httpPort, '127.0.0.1');
    this.logger.info({ port: this.httpPort }, 'Telemetry HTTP receiver started');
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.udpSocket?.close();
    this.udpSocket = null;
    this.httpServer?.close();
    this.httpServer = null;
    this.logger.info('Telemetry receivers stopped');
  }

  private forward(payload: TelemetrySnapshot): void {
    this.onSnapshot?.(payload);
  }

  private logProgress(): void {
    const now = Date.now();
    if (this.packetCount === 1 || now - this.lastLogAt > 5000) {
      this.logger.info({ packets: this.packetCount }, 'Telemetry packets received');
      this.lastLogAt = now;
    }
  }
}

import { Server as SocketIOServer, Socket } from 'socket.io';
import { query } from '../config/db';
import { Station } from '../types';

interface AgentInfo {
  stationId: string;
  pcIdentifier: string;
}

export function setupAgentSocket(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    console.log('Socket connecté:', socket.id);

    socket.on('agent:register', async (info: AgentInfo) => {
      socket.data.stationId = info.stationId;
      socket.data.pcIdentifier = info.pcIdentifier;
      socket.join(`station:${info.stationId}`);
      console.log(`Agent enregistré: ${info.pcIdentifier} (${info.stationId})`);

      await query(
        'UPDATE stations SET status = "online", last_heartbeat = NOW() WHERE id = ?',
        [info.stationId]
      );

      io.emit('station:updated', { id: info.stationId, status: 'online' });
    });

    socket.on('station:heartbeat', async (data: { stationId: string; status: string; currentSessionId?: string; acRunning?: boolean }) => {
      await query(
        'UPDATE stations SET status = ?, current_session_id = ?, last_heartbeat = NOW() WHERE id = ?',
        [data.status, data.currentSessionId || null, data.stationId]
      );
      io.emit('station:updated', {
        id: data.stationId,
        status: data.status,
        currentSessionId: data.currentSessionId,
        acRunning: data.acRunning,
      });
    });

    socket.on('session:started', async (data: { sessionId: string; stationId: string }) => {
      await query(
        'UPDATE sim_sessions SET status = "running" WHERE id = ?',
        [data.sessionId]
      );
      await query(
        'UPDATE stations SET status = "in_use", current_session_id = ? WHERE id = ?',
        [data.sessionId, data.stationId]
      );
      io.emit('session:updated', { id: data.sessionId, status: 'running' });
      io.emit('station:updated', { id: data.stationId, status: 'in_use', currentSessionId: data.sessionId });
    });

    socket.on('session:finished', async (data: { sessionId: string; stationId: string; results?: any; error?: string }) => {
      await query(
        'UPDATE sim_sessions SET status = "finished", ended_at = NOW() WHERE id = ?',
        [data.sessionId]
      );
      await query(
        'UPDATE stations SET status = "online", current_session_id = NULL WHERE id = ?',
        [data.stationId]
      );

      if (data.results) {
        await query(
          `INSERT INTO session_results (id, session_id, lap_count, best_lap_time_ms, total_time_ms, position)
           VALUES (UUID(), ?, ?, ?, ?, ?)`,
          [
            data.results.sessionId,
            data.results.lapCount || null,
            data.results.bestLapTimeMs || null,
            data.results.totalTimeMs || null,
            data.results.position || null,
          ]
        );
      }

      io.emit('session:updated', { id: data.sessionId, status: 'finished', error: data.error });
      io.emit('station:updated', { id: data.stationId, status: 'online', currentSessionId: null });
    });

    socket.on('disconnect', async () => {
      const stationId = socket.data?.stationId;
      if (stationId) {
        await query(
          'UPDATE stations SET status = "offline", current_session_id = NULL WHERE id = ?',
          [stationId]
        );
        io.emit('station:updated', { id: stationId, status: 'offline', currentSessionId: null });
      }
      console.log('Socket déconnecté:', socket.id);
    });
  });
}

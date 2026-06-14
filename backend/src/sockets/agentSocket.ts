import { Server as SocketIOServer, Socket } from 'socket.io';
import { queryOne, run } from '../config/db';
import { Station } from '../types';
import { updateServerStatus } from '../controllers/serverController';

interface AgentInfo {
  stationId: string;
  pcIdentifier: string;
}

async function resolveStationId(identifier: string): Promise<string | undefined> {
  const station = await queryOne<{ id: string }>(
    'SELECT id FROM stations WHERE pc_identifier = ? OR id = ?',
    [identifier, identifier]
  );
  return station?.id;
}

export function setupAgentSocket(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    console.log('Socket connecté:', socket.id);

    socket.on('agent:register', async (info: AgentInfo) => {
      const stationId = await resolveStationId(info.stationId);
      if (!stationId) {
        console.warn(`Agent register: aucun poste trouvé pour ${info.stationId}`);
        return;
      }
      socket.data.stationId = stationId;
      socket.data.pcIdentifier = info.pcIdentifier;
      socket.join(`station:${stationId}`);
      console.log(`Agent enregistré: ${info.pcIdentifier} (${stationId})`);

      await run(
        'UPDATE stations SET status = "online", last_heartbeat = CURRENT_TIMESTAMP WHERE id = ?',
        [stationId]
      );

      io.emit('station:updated', { id: stationId, status: 'online' });
    });

    socket.on('station:heartbeat', async (data: { stationId: string; status: string; currentSessionId?: string; acRunning?: boolean; cmRunning?: boolean }) => {
      const stationId = await resolveStationId(data.stationId);
      if (!stationId) {
        console.warn(`Heartbeat: aucun poste trouvé pour ${data.stationId}`);
        return;
      }
      console.log(`Heartbeat reçu: ${stationId} -> ${data.status}`);
      try {
        await run(
          'UPDATE stations SET status = ?, current_session_id = ?, last_heartbeat = CURRENT_TIMESTAMP WHERE id = ?',
          [data.status, data.currentSessionId || null, stationId]
        );
        io.emit('station:updated', {
          id: stationId,
          status: data.status,
          currentSessionId: data.currentSessionId,
          acRunning: data.acRunning,
          cmRunning: data.cmRunning,
        });
      } catch (err) {
        console.error('Erreur heartbeat:', err);
      }
    });

    socket.on('server:status', async (data: { stationId: string; servers: any[] }) => {
      const stationId = await resolveStationId(data.stationId);
      if (!stationId) {
        console.warn(`server:status: aucun poste trouvé pour ${data.stationId}`);
        return;
      }
      try {
        await run(
          'UPDATE stations SET active_servers = ? WHERE id = ?',
          [JSON.stringify(data.servers || []), stationId]
        );
        io.emit('station:updated', { id: stationId, active_servers: data.servers || [] });
      } catch (err) {
        console.error('Erreur server:status:', err);
      }
    });

    socket.on('server:started', async (data: { serverId: string; serverDir?: string }) => {
      console.log(`Serveur dédié démarré: ${data.serverId}`);
      await updateServerStatus(data.serverId, 'running', { serverDir: data.serverDir });
      io.emit('server:updated', { id: data.serverId, status: 'running' });
    });

    socket.on('server:stopped', async (data: { serverId: string; error?: string }) => {
      console.log(`Serveur dédié arrêté: ${data.serverId}${data.error ? ` (erreur: ${data.error})` : ''}`);
      await updateServerStatus(data.serverId, data.error ? 'error' : 'stopped', { error: data.error });
      io.emit('server:updated', { id: data.serverId, status: data.error ? 'error' : 'stopped', error: data.error });
    });

    socket.on('session:started', async (data: { sessionId: string; stationId: string }) => {
      const stationId = await resolveStationId(data.stationId);
      if (!stationId) return;
      await run(
        'UPDATE sim_sessions SET status = "running" WHERE id = ?',
        [data.sessionId]
      );
      await run(
        'UPDATE stations SET status = "in_use", current_session_id = ? WHERE id = ?',
        [data.sessionId, stationId]
      );
      io.emit('session:updated', { id: data.sessionId, status: 'running' });
      io.emit('station:updated', { id: stationId, status: 'in_use', currentSessionId: data.sessionId });
    });

    socket.on('session:finished', async (data: { sessionId: string; stationId: string; results?: any; error?: string }) => {
      const stationId = await resolveStationId(data.stationId);
      if (!stationId) return;
      await run(
        'UPDATE sim_sessions SET status = "finished", ended_at = CURRENT_TIMESTAMP WHERE id = ?',
        [data.sessionId]
      );
      await run(
        'UPDATE stations SET status = "online", current_session_id = NULL WHERE id = ?',
        [stationId]
      );

      if (data.results) {
        await run(
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
      io.emit('station:updated', { id: stationId, status: 'online', currentSessionId: null });
    });

    socket.on('disconnect', async () => {
      const stationId = socket.data?.stationId;
      if (stationId) {
        await run(
          'UPDATE stations SET status = "offline", current_session_id = NULL, active_servers = NULL WHERE id = ?',
          [stationId]
        );
        io.emit('station:updated', { id: stationId, status: 'offline', currentSessionId: null, active_servers: [] });
      }
      console.log('Socket déconnecté:', socket.id);
    });
  });
}

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query, queryOne, run } from '../config/db';
import { DedicatedServer } from '../types';
import { getIO } from '../services/socketService';
import { v4 as uuidv4 } from 'uuid';

export async function getAllServers(req: AuthRequest, res: Response) {
  try {
    const rows = await query<DedicatedServer>(`
      SELECT ds.*, s.name as station_name
      FROM dedicated_servers ds
      JOIN stations s ON s.id = ds.station_id
      ORDER BY ds.created_at DESC
    `);
    const servers = rows.map((s) => ({
      ...s,
      cars: s.cars ? JSON.parse(s.cars as any) : undefined,
      config_json: s.config_json ? JSON.parse(s.config_json as any) : undefined,
    }));
    return res.json(servers);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function createServer(req: AuthRequest, res: Response) {
  try {
    const { stationId, name, track, trackLayout, cars, maxClients, password, registerToLobby } = req.body;
    if (!stationId || !name || !track) {
      return res.status(400).json({ error: 'stationId, name et track sont requis' });
    }

    const station = await queryOne('SELECT id, pc_identifier FROM stations WHERE id = ?', [stationId]);
    if (!station) {
      return res.status(404).json({ error: 'Poste non trouvé' });
    }

    const id = uuidv4();
    const carsJson = cars && Array.isArray(cars) ? JSON.stringify(cars) : JSON.stringify([cars].filter(Boolean));
    const configJson = JSON.stringify({ track, trackLayout, cars, maxClients, password, registerToLobby });

    await run(
      `INSERT INTO dedicated_servers (id, station_id, name, track, track_layout, cars, max_clients, password, status, config_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'creating', ?)`,
      [id, stationId, name, track, trackLayout || null, carsJson, maxClients || 10, password || null, configJson]
    );

    const io = getIO();
    const roomName = `station:${stationId}`;
    const roomSize = io.sockets.adapter.rooms.get(roomName)?.size || 0;
    console.log(`[server] Envoi server:launch vers ${roomName} (connectes: ${roomSize})`);

    if (roomSize === 0) {
      await run('UPDATE dedicated_servers SET status = "error" WHERE id = ?', [id]);
      return res.status(503).json({ error: 'Agent du poste non connecté' });
    }

    io.to(roomName).emit('server:launch', {
      serverId: id,
      name,
      track,
      trackLayout,
      cars: JSON.parse(carsJson),
      maxClients: maxClients || 10,
      password,
      registerToLobby: !!registerToLobby,
    });

    const created = await queryOne<DedicatedServer>('SELECT * FROM dedicated_servers WHERE id = ?', [id]);
    return res.status(201).json({
      ...created,
      cars: created?.cars ? JSON.parse(created.cars as any) : undefined,
      config_json: created?.config_json ? JSON.parse(created.config_json as any) : undefined,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function joinServer(req: AuthRequest, res: Response) {
  try {
    const server = await queryOne<DedicatedServer>('SELECT * FROM dedicated_servers WHERE id = ?', [req.params.id]);
    if (!server) {
      return res.status(404).json({ error: 'Serveur non trouvé' });
    }
    const { stationId, carId } = req.body;
    if (!stationId || !carId) {
      return res.status(400).json({ error: 'stationId et carId sont requis' });
    }
    const station = await queryOne<{ local_ip: string | null; name: string }>('SELECT local_ip, name FROM stations WHERE id = ?', [stationId]);
    if (!station) {
      return res.status(404).json({ error: 'Poste non trouvé' });
    }
    const car = await queryOne<{ ac_id: string; name: string }>('SELECT ac_id, name FROM cars WHERE id = ?', [carId]);
    if (!car) {
      return res.status(404).json({ error: 'Voiture non trouvée' });
    }
    const io = getIO();
    const roomName = `station:${stationId}`;
    const roomSize = io.sockets.adapter.rooms.get(roomName)?.size || 0;
    if (roomSize === 0) {
      return res.status(503).json({ error: 'Agent du poste cible non connecté' });
    }
    if (!station.local_ip) {
      return res.status(503).json({ error: 'IP locale du poste cible inconnue' });
    }
    let serverPort = 9600;
    let serverHttpPort = 8081;
    try {
      const cfg = JSON.parse(server.config_json as any || '{}');
      serverPort = cfg.udpPort || serverPort;
      serverHttpPort = cfg.httpPort || serverHttpPort;
    } catch {}
    io.to(roomName).emit('pod:joinServer', {
      serverIp: station.local_ip,
      serverPort,
      serverHttpPort,
      serverName: server.name,
      carAcId: car.ac_id,
      password: server.password || '',
    });
    console.log(`[server:join] Envoi à ${roomName} pour rejoindre ${station.local_ip}:${serverPort} en ${car.ac_id}`);
    return res.json({ message: 'Commande envoyée au poste' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function stopServer(req: AuthRequest, res: Response) {
  try {
    const server = await queryOne<DedicatedServer>('SELECT * FROM dedicated_servers WHERE id = ?', [req.params.id]);
    if (!server) {
      return res.status(404).json({ error: 'Serveur non trouvé' });
    }

    const io = getIO();
    io.to(`station:${server.station_id}`).emit('server:stop', { serverId: server.id });

    return res.json({ message: 'Commande d\'arrêt envoyée' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function deleteServer(req: AuthRequest, res: Response) {
  try {
    await run('DELETE FROM dedicated_servers WHERE id = ?', [req.params.id]);
    return res.json({ message: 'Serveur supprimé' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function updateServerStatus(
  serverId: string,
  status: DedicatedServer['status'],
  extra?: { serverDir?: string; error?: string }
) {
  try {
    if (status === 'running') {
      await run(
        'UPDATE dedicated_servers SET status = ?, started_at = CURRENT_TIMESTAMP, server_dir = ? WHERE id = ?',
        [status, extra?.serverDir || null, serverId]
      );
    } else if (status === 'stopped' || status === 'error') {
      await run(
        'UPDATE dedicated_servers SET status = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, serverId]
      );
    } else {
      await run('UPDATE dedicated_servers SET status = ? WHERE id = ?', [status, serverId]);
    }
  } catch (err) {
    console.error('Erreur mise à jour statut serveur:', err);
  }
}

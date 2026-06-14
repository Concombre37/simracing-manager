import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query, queryOne } from '../config/db';
import { v4 as uuidv4 } from 'uuid';
import { getIO } from '../services/socketService';
import { SimSession } from '../types';

export async function getSessions(req: AuthRequest, res: Response) {
  try {
    const sessions = await query<SimSession & { station_name: string; config_name: string; first_name: string; last_name: string }>(
      `SELECT ss.*, s.name as station_name, sc.name as config_name, u.first_name, u.last_name
       FROM sim_sessions ss
       JOIN stations s ON ss.station_id = s.id
       JOIN session_configs sc ON ss.config_id = sc.id
       JOIN users u ON ss.launched_by = u.id
       ORDER BY ss.started_at DESC`
    );
    return res.json(sessions);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function startSession(req: AuthRequest, res: Response) {
  try {
    const { stationId, configId } = req.body;

    if (!stationId || !configId) {
      return res.status(400).json({ error: 'Poste et configuration requis' });
    }

    const config = await queryOne(
      `SELECT sc.*, c.ac_id as car_ac_id, t.ac_id as track_ac_id, tl.name as layout_name
       FROM session_configs sc
       JOIN cars c ON sc.car_id = c.id
       JOIN track_layouts tl ON sc.track_layout_id = tl.id
       JOIN tracks t ON tl.track_id = t.id
       WHERE sc.id = ?`,
      [configId]
    );
    if (!config) {
      return res.status(404).json({ error: 'Configuration non trouvée' });
    }

    const station = await queryOne('SELECT * FROM stations WHERE id = ?', [stationId]);
    if (!station) {
      return res.status(404).json({ error: 'Poste non trouvé' });
    }

    const id = uuidv4();
    await query(
      `INSERT INTO sim_sessions (id, station_id, config_id, launched_by, status)
       VALUES (?, ?, ?, ?, 'starting')`,
      [id, stationId, configId, req.user!.userId]
    );

    const session = await queryOne<SimSession>('SELECT * FROM sim_sessions WHERE id = ?', [id]);

    const io = getIO();
    io.to(`station:${stationId}`).emit('session:launch', {
      sessionId: id,
      stationId,
      userId: req.user!.userId,
      userName: `${req.user!.email}`,
      carAcId: (config as any).car_ac_id,
      trackAcId: (config as any).track_ac_id,
      layoutName: (config as any).layout_name,
      weatherPreset: (config as any).weather_preset,
      sessionType: (config as any).session_type,
    });

    return res.status(201).json(session);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function stopSession(req: AuthRequest, res: Response) {
  try {
    const session = await queryOne<SimSession>('SELECT * FROM sim_sessions WHERE id = ?', [req.params.id]);
    if (!session) {
      return res.status(404).json({ error: 'Session non trouvée' });
    }

    const io = getIO();
    io.to(`station:${session.station_id}`).emit('session:stop', {
      sessionId: session.id,
      stationId: session.station_id,
    });

    return res.json({ message: 'Commande d\'arrêt envoyée' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function getSessionResults(req: AuthRequest, res: Response) {
  try {
    const results = await query(
      'SELECT * FROM session_results WHERE session_id = ?',
      [req.params.id]
    );
    return res.json(results);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query, queryOne, run } from '../config/db';
import { Station } from '../types';

export async function getAllStations(req: AuthRequest, res: Response) {
  try {
    const rows = await query<Station & { current_session_id?: string }>(
      'SELECT * FROM stations ORDER BY name'
    );
    const stations = rows.map((s) => ({
      ...s,
      config: s.config ? JSON.parse(s.config as any) : undefined,
      active_servers: s.active_servers ? JSON.parse(s.active_servers as any) : undefined,
    }));
    return res.json(stations);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function getStationById(req: AuthRequest, res: Response) {
  try {
    const station = await queryOne<Station>(
      'SELECT * FROM stations WHERE id = ?',
      [req.params.id]
    );
    if (!station) {
      return res.status(404).json({ error: 'Poste non trouvé' });
    }
    return res.json({
      ...station,
      config: station.config ? JSON.parse(station.config as any) : undefined,
      active_servers: station.active_servers ? JSON.parse(station.active_servers as any) : undefined,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function updateStation(req: AuthRequest, res: Response) {
  try {
    const { name, status, config: stationConfig } = req.body;
    await run(
      'UPDATE stations SET name = ?, status = ?, config = ? WHERE id = ?',
      [name, status, stationConfig ? JSON.stringify(stationConfig) : null, req.params.id]
    );
    const station = await queryOne<Station>('SELECT * FROM stations WHERE id = ?', [req.params.id]);
    return res.json({
      ...station,
      config: station?.config ? JSON.parse(station.config as any) : undefined,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

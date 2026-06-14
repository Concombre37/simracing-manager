import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query, queryOne, run } from '../config/db';
import { v4 as uuidv4 } from 'uuid';
import { SessionConfig } from '../types';

export async function getAllConfigs(req: AuthRequest, res: Response) {
  try {
    const configs = await query<SessionConfig>(
      `SELECT sc.*, c.name as car_name, c.ac_id as car_ac_id, t.name as track_name, t.ac_id as track_ac_id, tl.name as layout_name
       FROM session_configs sc
       JOIN cars c ON sc.car_id = c.id
       JOIN track_layouts tl ON sc.track_layout_id = tl.id
       JOIN tracks t ON tl.track_id = t.id
       ORDER BY sc.name`
    );
    return res.json(configs.map((c) => ({ ...c, is_default: Boolean(c.is_default) })));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function getConfigById(req: AuthRequest, res: Response) {
  try {
    const config = await queryOne<SessionConfig & { car_name: string; track_name: string; layout_name: string }>(
      `SELECT sc.*, c.name as car_name, t.name as track_name, tl.name as layout_name
       FROM session_configs sc
       JOIN cars c ON sc.car_id = c.id
       JOIN track_layouts tl ON sc.track_layout_id = tl.id
       JOIN tracks t ON tl.track_id = t.id
       WHERE sc.id = ?`,
      [req.params.id]
    );
    if (!config) {
      return res.status(404).json({ error: 'Configuration non trouvée' });
    }
    return res.json({ ...config, is_default: Boolean(config.is_default) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function createConfig(req: AuthRequest, res: Response) {
  try {
    const { name, carId, trackLayoutId, weatherPreset, sessionType, isDefault } = req.body;
    const id = uuidv4();
    await run(
      `INSERT INTO session_configs (id, name, car_id, track_layout_id, weather_preset, session_type, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, carId, trackLayoutId, weatherPreset || null, sessionType || 'practice', isDefault ? 1 : 0]
    );
    const config = await queryOne<SessionConfig>('SELECT * FROM session_configs WHERE id = ?', [id]);
    return res.status(201).json({ ...config, is_default: Boolean(config?.is_default) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function updateConfig(req: AuthRequest, res: Response) {
  try {
    const { name, carId, trackLayoutId, weatherPreset, sessionType, isDefault } = req.body;
    await run(
      `UPDATE session_configs
       SET name = ?, car_id = ?, track_layout_id = ?, weather_preset = ?, session_type = ?, is_default = ?
       WHERE id = ?`,
      [name, carId, trackLayoutId, weatherPreset || null, sessionType || 'practice', isDefault ? 1 : 0, req.params.id]
    );
    const config = await queryOne<SessionConfig>('SELECT * FROM session_configs WHERE id = ?', [req.params.id]);
    return res.json({ ...config, is_default: Boolean(config?.is_default) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function deleteConfig(req: AuthRequest, res: Response) {
  try {
    await run('DELETE FROM session_configs WHERE id = ?', [req.params.id]);
    return res.status(204).send();
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function getDefaultConfig(req: AuthRequest, res: Response) {
  try {
    const config = await queryOne<SessionConfig>(
      'SELECT * FROM session_configs WHERE is_default = 1 LIMIT 1'
    );
    return res.json(config);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

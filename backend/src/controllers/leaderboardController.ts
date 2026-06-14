import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query } from '../config/db';

export async function getLeaderboard(req: AuthRequest, res: Response) {
  try {
    const trackId = req.query.trackId as string | undefined;
    const carId = req.query.carId as string | undefined;

    let sql = `SELECT sr.*, sc.name as config_name, c.name as car_name, c.brand as car_brand,
                      t.name as track_name, tl.name as layout_name, s.name as station_name
               FROM session_results sr
               JOIN sim_sessions ss ON sr.session_id = ss.id
               JOIN session_configs sc ON ss.config_id = sc.id
               JOIN cars c ON sc.car_id = c.id
               JOIN track_layouts tl ON sc.track_layout_id = tl.id
               JOIN tracks t ON tl.track_id = t.id
               JOIN stations s ON ss.station_id = s.id
               WHERE 1=1`;
    const params: any[] = [];

    if (trackId) {
      sql += ' AND t.id = ?';
      params.push(trackId);
    }
    if (carId) {
      sql += ' AND c.id = ?';
      params.push(carId);
    }

    sql += ' ORDER BY sr.best_lap_time_ms ASC';

    const results = await query(sql, params);
    return res.json(results);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

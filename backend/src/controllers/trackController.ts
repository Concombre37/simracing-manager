import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query, queryOne } from '../config/db';
import { v4 as uuidv4 } from 'uuid';
import { Track, TrackLayout } from '../types';

export async function getAllTracks(req: AuthRequest, res: Response) {
  try {
    const tracks = await query<Track>('SELECT * FROM tracks ORDER BY name');
    const layouts = await query<TrackLayout>('SELECT * FROM track_layouts');
    return res.json(
      tracks.map((track) => ({
        ...track,
        layouts: layouts.filter((l) => l.track_id === track.id),
      }))
    );
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function createTrack(req: AuthRequest, res: Response) {
  try {
    const { acId, name, country, lengthKm, imageUrl, layouts } = req.body;
    const id = uuidv4();
    await query(
      'INSERT INTO tracks (id, ac_id, name, country, length_km, image_url) VALUES (?, ?, ?, ?, ?, ?)',
      [id, acId, name, country || null, lengthKm || null, imageUrl || null]
    );

    if (Array.isArray(layouts)) {
      for (const layoutName of layouts) {
        await query(
          'INSERT INTO track_layouts (id, track_id, name) VALUES (UUID(), ?, ?)',
          [id, layoutName]
        );
      }
    }

    const track = await queryOne<Track>('SELECT * FROM tracks WHERE id = ?', [id]);
    const trackLayouts = await query<TrackLayout>('SELECT * FROM track_layouts WHERE track_id = ?', [id]);
    return res.status(201).json({ ...track, layouts: trackLayouts });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query, queryOne, run } from '../config/db';
import { v4 as uuidv4 } from 'uuid';
import { Car } from '../types';

export async function getAllCars(req: AuthRequest, res: Response) {
  try {
    const cars = await query<Car>('SELECT * FROM cars ORDER BY brand, name');
    return res.json(cars.map((c) => ({ ...c, is_premium: Boolean(c.is_premium) })));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function createCar(req: AuthRequest, res: Response) {
  try {
    const { acId, name, brand, category, isPremium, imageUrl } = req.body;
    const id = uuidv4();
    await run(
      'INSERT INTO cars (id, ac_id, name, brand, category, is_premium, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, acId, name, brand || null, category || null, isPremium || false, imageUrl || null]
    );
    const car = await queryOne<Car>('SELECT * FROM cars WHERE id = ?', [id]);
    return res.status(201).json(car);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

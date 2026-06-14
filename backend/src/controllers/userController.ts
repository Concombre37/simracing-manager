import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query, queryOne, run } from '../config/db';
import { User } from '../types';

export async function getAllUsers(req: AuthRequest, res: Response) {
  try {
    const users = await query<User>(
      'SELECT id, email, first_name, last_name, role, created_at FROM users ORDER BY created_at DESC'
    );
    return res.json(users);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function getUserById(req: AuthRequest, res: Response) {
  try {
    const user = await queryOne<User>(
      'SELECT id, email, first_name, last_name, role, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    return res.json(user);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function updateUserRole(req: AuthRequest, res: Response) {
  try {
    const { role } = req.body;
    if (!['admin', 'technician'].includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide' });
    }

    await run('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    const user = await queryOne<User>(
      'SELECT id, email, first_name, last_name, role FROM users WHERE id = ?',
      [req.params.id]
    );
    return res.json(user);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

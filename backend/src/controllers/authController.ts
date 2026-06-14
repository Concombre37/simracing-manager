import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { loginUser, registerUser } from '../services/authService';
import { queryOne } from '../config/db';
import { User } from '../types';

export async function register(req: AuthRequest, res: Response) {
  try {
    const { email, password, firstName, lastName, role } = req.body;
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }

    const user = await registerUser({ email, password, firstName, lastName, role });
    return res.status(201).json(user);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function login(req: AuthRequest, res: Response) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const result = await loginUser(email, password);
    return res.json(result);
  } catch (err: any) {
    return res.status(401).json({ error: err.message });
  }
}

export async function me(req: AuthRequest, res: Response) {
  try {
    const user = await queryOne<User>(
      'SELECT id, email, first_name, last_name, role, created_at, updated_at FROM users WHERE id = ?',
      [req.user!.userId]
    );
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    return res.json(user);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

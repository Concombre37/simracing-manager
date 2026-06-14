import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { queryOne } from '../config/db';
import { env } from '../config/env';
import { JwtPayload, User } from '../types';

interface UserRow extends User {
  password_hash: string;
}

export async function registerUser(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: 'admin' | 'technician';
}) {
  const existing = await queryOne<UserRow>('SELECT * FROM users WHERE email = ?', [data.email]);
  if (existing) {
    throw new Error('Cet email est déjà utilisé');
  }

  const id = uuidv4();
  const hash = await bcrypt.hash(data.password, 10);
  const role = data.role === 'admin' ? 'admin' : 'technician';

  await queryOne(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, role)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, data.email, hash, data.firstName, data.lastName, role]
  );

  return { id, email: data.email, firstName: data.firstName, lastName: data.lastName, role };
}

export async function loginUser(email: string, password: string) {
  const user = await queryOne<UserRow>('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) {
    throw new Error('Identifiants invalides');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new Error('Identifiants invalides');
  }

  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };

  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as any });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
    },
  };
}

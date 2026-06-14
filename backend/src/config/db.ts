import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { env } from './env';

let db: Database<sqlite3.Database, sqlite3.Statement> | null = null;

export async function getDb() {
  if (!db) {
    db = await open({
      filename: env.DB_NAME,
      driver: sqlite3.Database,
    });
    await db.run('PRAGMA foreign_keys = ON');
  }
  return db;
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const database = await getDb();
  return database.all<T[]>(sql, params);
}

export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | undefined> {
  const database = await getDb();
  return database.get<T>(sql, params);
}

export async function run(sql: string, params?: any[]): Promise<{ lastID?: number; changes?: number }> {
  const database = await getDb();
  return database.run(sql, params);
}

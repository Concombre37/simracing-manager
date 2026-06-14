import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDb, query, queryOne, run } from '../config/db';

async function initSchema() {
  const db = await getDb();
  const table = await queryOne("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
  if (!table) {
    const schemaPath = path.resolve('/root/sim-center-manager/database/init.sqlite.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    await db.exec(schema);
    console.log('Schéma SQLite initialisé');
  }

  // Migration légère : ajout de colonnes manquantes
  const stationColumns = await query<{ name: string }>("PRAGMA table_info(stations)");
  const columnNames = stationColumns.map((c) => c.name);
  if (!columnNames.includes('active_servers')) {
    await db.exec('ALTER TABLE stations ADD COLUMN active_servers TEXT');
    console.log('Migration : colonne active_servers ajoutée à stations');
  }
  if (!columnNames.includes('content_data')) {
    await db.exec('ALTER TABLE stations ADD COLUMN content_data TEXT');
    console.log('Migration : colonne content_data ajoutée à stations');
  }

  const serverTable = await queryOne("SELECT name FROM sqlite_master WHERE type='table' AND name='dedicated_servers'");
  if (!serverTable) {
    await db.exec(`
      CREATE TABLE dedicated_servers (
        id TEXT PRIMARY KEY,
        station_id TEXT NOT NULL,
        name TEXT NOT NULL,
        track TEXT,
        track_layout TEXT,
        cars TEXT,
        max_clients INTEGER DEFAULT 10,
        password TEXT,
        status TEXT DEFAULT 'creating' CHECK(status IN ('creating', 'running', 'stopped', 'error')),
        server_dir TEXT,
        config_json TEXT,
        started_at DATETIME,
        ended_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
      )
    `);
    console.log('Migration : table dedicated_servers créée');
  }
}

async function seed() {
  console.log('Seeding database...');

  await initSchema();

  const adminExists = await queryOne('SELECT id FROM users WHERE email = ?', ['admin@simracing.local']);
  if (!adminExists) {
    const hash = await bcrypt.hash('admin123', 10);
    await run(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role)
       VALUES (?, ?, ?, ?, ?, 'admin')`,
      [uuidv4(), 'admin@simracing.local', hash, 'Admin', 'SimRacing']
    );
    console.log('Admin créé: admin@simracing.local / admin123');
  }

  const techExists = await queryOne('SELECT id FROM users WHERE email = ?', ['tech@simracing.local']);
  if (!techExists) {
    const hash = await bcrypt.hash('tech123', 10);
    await run(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role)
       VALUES (?, ?, ?, ?, ?, 'technician')`,
      [uuidv4(), 'tech@simracing.local', hash, 'Technicien', 'SimRacing']
    );
    console.log('Technicien créé: tech@simracing.local / tech123');
  }

  const stationsCount = await queryOne('SELECT COUNT(*) as count FROM stations');
  if ((stationsCount as any).count === 0) {
    const stations = [
      { id: uuidv4(), name: 'Poste 1', pc: 'poste-1' },
      { id: uuidv4(), name: 'Poste 2', pc: 'poste-2' },
      { id: uuidv4(), name: 'Poste 3', pc: 'poste-3' },
    ];
    for (const s of stations) {
      await run(
        'INSERT INTO stations (id, name, pc_identifier, status, config) VALUES (?, ?, ?, "offline", ?)',
        [s.id, s.name, s.pc, JSON.stringify({ gpu: 'RTX 4070', wheel: 'Fanatec', screens: 3 })]
      );
    }
    console.log(`${stations.length} postes créés`);
  }

  const carsCount = await queryOne('SELECT COUNT(*) as count FROM cars');
  if ((carsCount as any).count === 0) {
    const cars = [
      { id: uuidv4(), acId: 'ks_porsche_911_gt3_rs', name: 'Porsche 911 GT3 RS', brand: 'Porsche', category: 'GT3', premium: 1 },
      { id: uuidv4(), acId: 'ks_ferrari_488_gt3', name: 'Ferrari 488 GT3', brand: 'Ferrari', category: 'GT3', premium: 1 },
      { id: uuidv4(), acId: 'ks_bmw_m4', name: 'BMW M4', brand: 'BMW', category: 'Street', premium: 0 },
      { id: uuidv4(), acId: 'ks_mazda_mx5_cup', name: 'Mazda MX-5 Cup', brand: 'Mazda', category: 'Cup', premium: 0 },
    ];
    for (const c of cars) {
      await run(
        'INSERT INTO cars (id, ac_id, name, brand, category, is_premium) VALUES (?, ?, ?, ?, ?, ?)',
        [c.id, c.acId, c.name, c.brand, c.category, c.premium]
      );
    }
    console.log(`${cars.length} voitures créées`);
  }

  const tracksCount = await queryOne('SELECT COUNT(*) as count FROM tracks');
  if ((tracksCount as any).count === 0) {
    const trackData = [
      { id: uuidv4(), acId: 'spa', name: 'Circuit de Spa-Francorchamps', country: 'Belgique', length: 7.0, layouts: ['GP'] },
      { id: uuidv4(), acId: 'monza', name: 'Autodromo Nazionale Monza', country: 'Italie', length: 5.79, layouts: ['GP'] },
      { id: uuidv4(), acId: 'nordschleife', name: 'Nürburgring Nordschleife', country: 'Allemagne', length: 20.83, layouts: ['Tourist'] },
      { id: uuidv4(), acId: 'brands_hatch', name: 'Brands Hatch', country: 'Royaume-Uni', length: 3.91, layouts: ['GP'] },
    ];
    for (const t of trackData) {
      await run(
        'INSERT INTO tracks (id, ac_id, name, country, length_km) VALUES (?, ?, ?, ?, ?)',
        [t.id, t.acId, t.name, t.country, t.length]
      );
      for (const layout of t.layouts) {
        await run(
          'INSERT INTO track_layouts (id, track_id, name) VALUES (?, ?, ?)',
          [uuidv4(), t.id, layout]
        );
      }
    }
    console.log(`${trackData.length} circuits créés`);
  }

  console.log('Seeding terminé');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});

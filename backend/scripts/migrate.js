#!/usr/bin/env node

/**
 * Database migration runner for Deskive.
 * Tracks applied migrations in a _migrations table.
 * Usage: node scripts/migrate.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  database: process.env.DATABASE_NAME || 'teamatonce_dev',
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
});

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations() {
  const { rows } = await pool.query(
    'SELECT name FROM _migrations ORDER BY id',
  );
  return rows.map((r) => r.name);
}

async function runMigrations() {
  console.log('Running database migrations...');

  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  // Get all .sql files sorted
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.includes(file)) {
      continue;
    }

    console.log(`Applying: ${file}`);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      count++;
      console.log(`  Applied: ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`  FAILED: ${file}`);
      console.error(`  Error: ${error.message}`);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  if (count === 0) {
    console.log('No new migrations to apply.');
  } else {
    console.log(`Applied ${count} migration(s).`);
  }

  await pool.end();
}

runMigrations().catch((err) => {
  console.error('Migration error:', err.message || err);
  if (err.code === '28P01' || err.code === '28000') {
    console.error(
      '\n' +
      'Database authentication failed. To fix this:\n' +
      '  1. Run "docker compose up -d" from the project root to start PostgreSQL\n' +
      '  2. Or update DATABASE_PASSWORD in backend/.env to match your local PostgreSQL password\n' +
      '\n' +
      'See README.md for full setup instructions.'
    );
  } else if (err.code === 'ECONNREFUSED') {
    console.error(
      '\n' +
      'Could not connect to PostgreSQL. Make sure it is running:\n' +
      '  docker compose up -d'
    );
  }
  process.exit(1);
});

#!/usr/bin/env node

/**
 * Converts database schema.ts format to raw PostgreSQL SQL migration.
 * Run: node scripts/convert-schema-to-sql.js
 * Output: migrations/001_initial.sql
 */

const fs = require('fs');
const path = require('path');

// Import the compiled schema
let schema;
try {
  const schemaModule = require('../dist/src/database/schema.js');
  schema = schemaModule.schema;
} catch (e) {
  console.error('Build first: npm run build');
  console.error('Then run: node scripts/convert-schema-to-sql.js');
  process.exit(1);
}

// Type mapping: Fluxez types -> PostgreSQL types
const typeMap = {
  'uuid': 'UUID',
  'string': 'VARCHAR(255)',
  'text': 'TEXT',
  'integer': 'INTEGER',
  'bigint': 'BIGINT',
  'float': 'REAL',
  'double': 'DOUBLE PRECISION',
  'decimal': 'DECIMAL',
  'boolean': 'BOOLEAN',
  'date': 'DATE',
  'timestamp': 'TIMESTAMP',
  'timestamptz': 'TIMESTAMPTZ',
  'json': 'JSON',
  'jsonb': 'JSONB',
  'bytea': 'BYTEA',
  'smallint': 'SMALLINT',
  'serial': 'SERIAL',
  'bigserial': 'BIGSERIAL',
};

function mapType(fluxezType) {
  return typeMap[fluxezType] || 'TEXT';
}

function generateCreateTable(tableName, tableDef) {
  const lines = [];
  lines.push(`CREATE TABLE IF NOT EXISTS "${tableName}" (`);

  const columnDefs = [];
  for (const col of tableDef.columns) {
    let def = `  "${col.name}" ${mapType(col.type)}`;

    if (col.primaryKey) {
      def += ' PRIMARY KEY';
    }

    if (col.nullable === false && !col.primaryKey) {
      def += ' NOT NULL';
    }

    if (col.unique) {
      def += ' UNIQUE';
    }

    if (col.default !== undefined) {
      const defVal = col.default;
      if (defVal === 'gen_random_uuid()' || defVal === 'now()' || defVal === 'uuid_generate_v4()') {
        def += ` DEFAULT ${defVal}`;
      } else if (typeof defVal === 'string') {
        def += ` DEFAULT '${defVal}'`;
      } else if (typeof defVal === 'boolean') {
        def += ` DEFAULT ${defVal}`;
      } else if (typeof defVal === 'number') {
        def += ` DEFAULT ${defVal}`;
      }
    }

    if (col.references) {
      def += ` REFERENCES "${col.references.table}"(${col.references.column || 'id'}) ON DELETE ${col.references.onDelete || 'CASCADE'}`;
    }

    columnDefs.push(def);
  }

  lines.push(columnDefs.join(',\n'));
  lines.push(');');

  // Generate indexes
  if (tableDef.indexes && tableDef.indexes.length > 0) {
    lines.push('');
    for (const idx of tableDef.indexes) {
      const cols = idx.columns.map(c => `"${c}"`).join(', ');
      const idxName = `idx_${tableName}_${idx.columns.join('_')}`;
      const uniqueStr = idx.unique ? 'UNIQUE ' : '';
      lines.push(`CREATE ${uniqueStr}INDEX IF NOT EXISTS "${idxName}" ON "${tableName}" (${cols});`);
    }
  }

  return lines.join('\n');
}

// Generate the full migration
const outputLines = [];
outputLines.push('-- =====================================================');
outputLines.push('-- Deskive Database Schema - Initial Migration');
outputLines.push('-- Auto-generated from database schema.ts');
outputLines.push(`-- Generated: ${new Date().toISOString()}`);
outputLines.push(`-- Tables: ${Object.keys(schema).length}`);
outputLines.push('-- =====================================================');
outputLines.push('');
outputLines.push('-- Enable UUID extension');
outputLines.push('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
outputLines.push('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
outputLines.push('');

// Generate tables in order
const tableNames = Object.keys(schema);
console.log(`Converting ${tableNames.length} tables...`);

for (const tableName of tableNames) {
  outputLines.push(`-- ==================== ${tableName.toUpperCase()} ====================`);
  outputLines.push(generateCreateTable(tableName, schema[tableName]));
  outputLines.push('');
}

// Write output
const migrationsDir = path.join(__dirname, '..', 'migrations');
if (!fs.existsSync(migrationsDir)) {
  fs.mkdirSync(migrationsDir, { recursive: true });
}

const outputPath = path.join(migrationsDir, '001_initial.sql');
fs.writeFileSync(outputPath, outputLines.join('\n'));

console.log(`Migration written to: ${outputPath}`);
console.log(`Total tables: ${tableNames.length}`);

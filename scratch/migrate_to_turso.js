require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { createClient } = require('@libsql/client');

const localDb = new sqlite3.Database('./database.sqlite');
const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function migrate() {
  const tables = [
    'settings', 'works', 'skills', 'services', 'brands', 'faqs', 
    'marquee_images', 'testimonials', 'api_keys', 'client_leads', 
    'ai_memory', 'site_analytics', 'users'
  ];

  const renameMap = {
    'users': 'portfolio_users'
  };

  for (let table of tables) {
    const targetTable = renameMap[table] || table;
    console.log(`Migrating table: ${table} to ${targetTable}...`);
    
    // Get local data
    const rows = await new Promise((resolve, reject) => {
      localDb.all(`SELECT * FROM ${table}`, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (rows.length === 0) {
      console.log(`Table ${table} is empty, skipping data migration.`);
      continue;
    }

    // Get schema to create table in Turso if not exists
    const schema = await new Promise((resolve, reject) => {
      localDb.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${table}'`, [], (err, row) => {
        if (err) reject(err);
        else resolve(row.sql);
      });
    });

    // Create table in Turso (adjusting IF NOT EXISTS and target name)
    let createSql = schema.replace(/CREATE TABLE (\w+)/, `CREATE TABLE IF NOT EXISTS ${targetTable}`);
    await turso.execute(createSql);

    // Insert data
    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const insertSql = `INSERT OR REPLACE INTO ${targetTable} (${columns.join(', ')}) VALUES (${placeholders})`;

    for (const row of rows) {
      const values = Object.values(row);
      await turso.execute({
        sql: insertSql,
        args: values
      });
    }
    console.log(`Successfully migrated ${rows.length} rows for ${table}.`);
  }

  console.log('Migration complete!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

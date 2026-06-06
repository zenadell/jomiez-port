const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const supabaseAdapter = require(path.join(__dirname, '../lib/supabaseAdapter'));
const fs = require('fs');

async function migrate() {
    console.log('🚀 Starting HIGH-SPEED migration to Supabase...');
    
    const backupFile = path.join(__dirname, '../database_backup.json');
    if (!fs.existsSync(backupFile)) {
        console.error('❌ Backup file not found!');
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(backupFile, 'utf8'));

    for (const [table, rows] of Object.entries(data)) {
        console.log(`🔨 Processing table: ${table}...`);
        
        // Drop existing to start clean
        await supabaseAdapter.pool.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
        
        if (!rows || rows.length === 0) {
            console.log(`⚠️ Table ${table} is empty, skipping creation.`);
            continue;
        }

        // Clean duplicates from data if 'id' exists
        const uniqueRows = [];
        const seenIds = new Set();
        for (const row of rows) {
            if (row.id) {
                if (seenIds.has(row.id)) continue;
                seenIds.add(row.id);
            }
            uniqueRows.push(row);
        }

        const keys = Object.keys(uniqueRows[0]);
        
        // Build dynamic CREATE TABLE
        let columnDefs = keys.map(key => {
            if (key === 'id') return 'id SERIAL PRIMARY KEY';
            if (key === 'key' && table === 'settings') return 'key TEXT PRIMARY KEY';
            if (key === 'slug' && (table === 'blog_posts' || table === 'works' || table === 'services')) return 'slug TEXT UNIQUE';
            return `"${key}" TEXT`;
        });

        if (!keys.includes('id') && !keys.includes('key') && !keys.includes('slug')) {
            if (keys.includes('firebase_uid')) {
                columnDefs = columnDefs.map(d => d.includes('firebase_uid') ? '"firebase_uid" TEXT PRIMARY KEY' : d);
            } else {
                columnDefs.unshift('id SERIAL PRIMARY KEY');
            }
        }

        const createSql = `CREATE TABLE ${table} (${columnDefs.join(', ')})`;
        await supabaseAdapter.pool.query(createSql);
        console.log(`✅ Table ${table} created.`);

        // BULK INSERT (Chunked)
        console.log(`📥 Importing ${uniqueRows.length} rows into ${table}...`);
        const chunkSize = 100; // Small chunk size for better reliability
        for (let i = 0; i < uniqueRows.length; i += chunkSize) {
            const chunk = uniqueRows.slice(i, i + chunkSize);
            const values = [];
            const valueStrings = chunk.map((row, rowIdx) => {
                const rowValues = keys.map(k => {
                    const v = row[k];
                    return typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
                });
                const offset = rowIdx * keys.length;
                const placeholders = keys.map((_, colIdx) => `$${offset + colIdx + 1}`).join(', ');
                values.push(...rowValues);
                return `(${placeholders})`;
            }).join(', ');

            const columns = keys.map(k => `"${k}"`).join(', ');
            const insertSql = `INSERT INTO ${table} (${columns}) VALUES ${valueStrings} ON CONFLICT DO NOTHING`;
            
            try {
                await supabaseAdapter.pool.query(insertSql, values);
            } catch (err) {
                console.warn(`⚠️ Bulk insert failed for a chunk in ${table}:`, err.message);
            }
        }
        
        // Reset Sequence for SERIAL columns
        if (keys.includes('id')) {
            try {
                await supabaseAdapter.pool.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT MAX(id) FROM ${table}))`);
            } catch (e) {}
        }
        
        console.log(`✨ ${table} complete.`);
    }

    console.log('\n🎊 HIGH-SPEED MIGRATION COMPLETE!');
    process.exit(0);
}

migrate().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});

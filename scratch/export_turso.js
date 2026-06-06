const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const tursoAdapter = require(path.join(__dirname, '../lib/tursoAdapter'));
const fs = require('fs');

async function backup() {
    console.log('🚀 Starting full database backup...');
    const tables = [
        'users', 'settings', 'site_analytics', 'client_leads', 'ai_memory',
        'blog_posts', 'works', 'skills', 'services', 'brands', 'faqs',
        'marquee_images', 'testimonials', 'api_keys', 'portfolio_users', 'counters'
    ];
    
    const backupData = {};

    for (const table of tables) {
        console.log(`📦 Backing up table: ${table}...`);
        try {
            const rows = await new Promise((resolve, reject) => {
                tursoAdapter.all(`SELECT * FROM ${table}`, [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
            backupData[table] = rows;
            console.log(`✅ ${table} backed up (${rows.length} rows)`);
        } catch (err) {
            console.error(`❌ Failed to backup table ${table}:`, err.message);
        }
    }

    const backupFile = path.join(__dirname, '../database_backup.json');
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
    console.log(`\n✨ BACKUP COMPLETE! File saved to: ${backupFile}`);
    process.exit(0);
}

backup();

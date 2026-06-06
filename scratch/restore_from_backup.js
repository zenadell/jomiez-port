const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = './database.sqlite';
const BACKUP_PATH = './database_backup.json';

if (fs.existsSync(DB_PATH)) {
    fs.renameSync(DB_PATH, DB_PATH + '.bak');
    console.log('Renamed old database to database.sqlite.bak');
}

const db = new sqlite3.Database(DB_PATH);
const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));

db.serialize(() => {
    Object.keys(backup).forEach(tableName => {
        const rows = backup[tableName];
        if (!rows || rows.length === 0) return;

        // Get columns from the first row
        const firstRow = rows[0];
        const columns = Object.keys(firstRow);
        
        // Define primary key if id exists, otherwise just TEXT columns
        const colDefs = columns.map(col => {
            if (col === 'id') return 'id INTEGER PRIMARY KEY';
            return `"${col}" TEXT`;
        });

        // Create table
        db.run(`CREATE TABLE IF NOT EXISTS "${tableName}" (${colDefs.join(', ')})`);

        // Insert rows
        const placeholders = columns.map(() => '?').join(', ');
        const stmt = db.prepare(`INSERT INTO "${tableName}" ("${columns.join('", "')}") VALUES (${placeholders})`);
        
        let count = 0;
        rows.forEach(row => {
            const values = columns.map(col => {
                let val = row[col];
                if (val !== null && typeof val === 'object') return JSON.stringify(val);
                return val;
            });
            stmt.run(values);
            count++;
        });
        stmt.finalize();
        
        console.log(`✅ Restored ${count} rows into ${tableName}`);
    });
});

db.close(() => {
    console.log('\n🎉 Full restoration complete! All new data is now local.');
});

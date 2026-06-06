require('dotenv').config();
const tursoAdapter = require('../lib/tursoAdapter');
const db = tursoAdapter;

const counters = [
    { label: 'Years Experience', value: '2', suffix: '+', sort_order: 1 },
    { label: 'Successful Projects', value: '230', suffix: '+', sort_order: 2 },
    { label: 'Percentage of satisfied clients', value: '93', suffix: '%', sort_order: 3 }
];

db.serialize(() => {
    db.run('DELETE FROM counters', [], (err) => {
        if (err) console.error(err);
        
        counters.forEach(c => {
            db.run('INSERT INTO counters (label, value, suffix, sort_order) VALUES (?, ?, ?, ?)', 
                [c.label, c.value, c.suffix, c.sort_order], (err) => {
                    if (err) console.error(err);
                    else console.log(`Inserted ${c.label}`);
                });
        });
    });
});

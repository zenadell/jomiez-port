const { Pool } = require('pg');

class NeonAdapter {
  constructor() {
    // Strip channel_binding parameter which can cause TLS issues
    let connStr = process.env.DATABASE_URL || '';
    connStr = connStr.replace(/&?channel_binding=[^&]*/g, '');

    this.pool = new Pool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      max: 5,                       // max connections in pool
      idleTimeoutMillis: 10000,     // close idle connections after 10s
      connectionTimeoutMillis: 10000 // timeout after 10s trying to connect
    });

    // Log pool errors instead of crashing
    this.pool.on('error', (err) => {
      console.error('[NEON POOL ERROR]', err.message);
    });
  }

  // Convert SQLite syntax to Postgres syntax
  convertSql(sql) {
    let newSql = sql;
    // INSERT OR IGNORE -> ON CONFLICT DO NOTHING
    if (newSql.toUpperCase().includes('INSERT OR IGNORE INTO')) {
      newSql = newSql.replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO');
      newSql += ' ON CONFLICT DO NOTHING';
    }
    // INSERT OR REPLACE -> ON CONFLICT DO UPDATE (for settings)
    if (newSql.toUpperCase().includes('INSERT OR REPLACE INTO')) {
      newSql = newSql.replace(/INSERT OR REPLACE INTO/gi, 'INSERT INTO');
      newSql += ' ON CONFLICT DO UPDATE SET value = EXCLUDED.value';
    }
    // Replace ? with $1, $2, etc.
    let index = 1;
    return newSql.replace(/\?/g, () => `$${index++}`);
  }

  // Execute a query with automatic retry on connection failure
  async _queryWithRetry(sql, params, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await this.pool.query(sql, params);
        return result;
      } catch (err) {
        const isConnectionError = 
          err.message.includes('Client network socket disconnected') ||
          err.message.includes('Connection terminated') ||
          err.message.includes('ECONNRESET') ||
          err.message.includes('ENOTFOUND') ||
          err.code === 'ECONNREFUSED';

        if (isConnectionError && attempt < retries) {
          console.warn(`[NEON RETRY] Attempt ${attempt + 1} failed, retrying in 500ms...`);
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        throw err;
      }
    }
  }

  all(sql, params, callback) {
    const pgSql = this.convertSql(sql);
    const safeParams = (params || []).map(p => (typeof p === 'number' ? String(p) : p));
    this._queryWithRetry(pgSql, safeParams)
      .then(result => {
        if (callback) callback(null, result.rows);
      })
      .catch(err => {
        console.error('[DATABASE ERROR] SQL:', pgSql, 'Error:', err.message);
        if (callback) callback(err);
      });
  }

  get(sql, params, callback) {
    const pgSql = this.convertSql(sql);
    const safeParams = (params || []).map(p => (typeof p === 'number' ? String(p) : p));
    this._queryWithRetry(pgSql, safeParams)
      .then(result => {
        if (callback) callback(null, result.rows[0]);
      })
      .catch(err => {
        console.error('[DATABASE ERROR] SQL:', pgSql, 'Error:', err.message);
        if (callback) callback(err);
      });
  }

  run(sql, params, callback) {
    const pgSql = this.convertSql(sql);
    const safeParams = (params || []).map(p => (typeof p === 'number' ? String(p) : p));
    this._queryWithRetry(pgSql, safeParams)
      .then(result => {
        const context = {
          lastID: result.rows[0] && result.rows[0].id ? result.rows[0].id : undefined,
          changes: result.rowCount
        };
        if (callback) callback.call(context, null);
      })
      .catch(err => {
        console.error('[DATABASE ERROR] SQL:', pgSql, 'Error:', err.message);
        if (callback) callback(err);
      });
  }

  serialize(callback) {
    if (callback) callback();
  }
}

module.exports = new NeonAdapter();

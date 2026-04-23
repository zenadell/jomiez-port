const { createClient } = require('@libsql/client');

class TursoAdapter {
  constructor() {
    this.client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }

  // Convert callback-based all to promise-based and then to callback if needed
  all(sql, params, callback) {
    this.client.execute({ sql, args: params })
      .then(result => {
        if (callback) callback(null, result.rows);
      })
      .catch(err => {
        if (callback) callback(err);
      });
  }

  get(sql, params, callback) {
    this.client.execute({ sql, args: params })
      .then(result => {
        if (callback) callback(null, result.rows[0]);
      })
      .catch(err => {
        if (callback) callback(err);
      });
  }

  run(sql, params, callback) {
    this.client.execute({ sql, args: params })
      .then(result => {
        // Mocking sqlite3's this.lastID and this.changes if possible
        // Note: result.lastInsertRowid and result.rowsAffected are available in libsql
        const context = {
          lastID: result.lastInsertRowid ? Number(result.lastInsertRowid) : undefined,
          changes: result.rowsAffected
        };
        if (callback) callback.call(context, null);
      })
      .catch(err => {
        if (callback) callback(err);
      });
  }

  serialize(callback) {
    // sqlite3's serialize just runs commands sequentially. 
    // In Turso, we can just run the callback since we're using async under the hood.
    if (callback) callback();
  }
}

module.exports = new TursoAdapter();

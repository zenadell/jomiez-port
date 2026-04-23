class ApiKeyManager {
  constructor(db) {
    this.db = db;
    // Simple memory cache so we don't query DB on every single socket event
    this.keysCache = { gemini: [], groq: [] };
    this.lastRefreshed = 0;
    this.currentIndex = { gemini: 0, groq: 0 };
  }

  async refreshCache() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT provider, api_key FROM api_keys WHERE is_active = 1', [], (err, rows) => {
        if (err) return reject(err);
        this.keysCache = { gemini: [], groq: [] };
        rows.forEach(row => {
          if (this.keysCache[row.provider]) {
            this.keysCache[row.provider].push(row.api_key);
          }
        });
        this.lastRefreshed = Date.now();
        resolve();
      });
    });
  }

  async getNextKey(provider = 'gemini') {
    // Refresh if cache is older than 60 seconds
    if (Date.now() - this.lastRefreshed > 60000) {
      await this.refreshCache();
    }

    const availableKeys = this.keysCache[provider] || [];
    if (availableKeys.length === 0) {
      throw new Error(`No active API keys found for provider: ${provider}`);
    }

    // Round-robin selection
    this.currentIndex[provider] = (this.currentIndex[provider] + 1) % availableKeys.length;
    return availableKeys[this.currentIndex[provider]];
  }

  async reportFailure(provider, failedKey) {
    console.warn(`[ApiKeyManager] Automatically reporting failure for ${provider} key ending in ...${failedKey.slice(-4)}`);
    // Optionally: Update database to increment fail count, but for rapid auto-rotation, 
    // simply taking it out of local active routing or tracking limits is good.
    return new Promise((resolve) => {
      this.db.run(`UPDATE api_keys SET fail_count = fail_count + 1 WHERE api_key = ?`, [failedKey], async (err) => {
        // We can forcefully refresh the cache to pull it out if we had a logic to deactivate after N fails
        await this.refreshCache(); 
        resolve();
      });
    });
  }
}

module.exports = ApiKeyManager;

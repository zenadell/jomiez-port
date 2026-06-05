const { LocalIndex } = require('vectra');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const vectorIndex = new LocalIndex(path.join(__dirname, '..', 'chaka_vector_index'));

let cachedGeminiKey = null;

async function getGeminiKey(db) {
  if (cachedGeminiKey) return cachedGeminiKey;
  return new Promise((resolve) => {
    db.get("SELECT api_key FROM api_keys WHERE provider = 'gemini' AND (is_active = '1' OR is_active = 1 OR is_active IS NULL)", [], (err, row) => {
      if (row) cachedGeminiKey = row.api_key;
      resolve(row ? row.api_key : null);
    });
  });
}

async function generateEmbedding(text, db) {
  if (!text || !text.trim()) return null;
  const key = await getGeminiKey(db);
  if (!key) return null;
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  try {
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (e) {
    console.error("[VectorDB] Embedding error:", e.message);
    return null;
  }
}

async function initVectorDB(db) {
  if (!await vectorIndex.isIndexCreated()) {
    await vectorIndex.createIndex();
  }
  console.log("[VectorDB] Initialized local index.");
}

async function upsertDocument(id, type, title, content, db) {
  const fullText = `${title}\n\n${content}`.trim();
  const vector = await generateEmbedding(fullText, db);
  if (!vector) return;

  const docId = `${type}_${id}`;
  await vectorIndex.upsertItem({
    id: docId,
    vector,
    metadata: {
      type,
      originalId: id,
      title,
      content: fullText.substring(0, 1000) // Store up to 1000 chars for context to avoid huge files
    }
  });
  console.log(`[VectorDB] Upserted ${docId}`);
}

async function deleteDocument(id, type) {
  const docId = `${type}_${id}`;
  try {
    await vectorIndex.deleteItem(docId);
    console.log(`[VectorDB] Deleted ${docId}`);
  } catch (e) {
    // Ignore if not found
  }
}

async function searchVectorDB(query, db, topK = 3) {
  if (!await vectorIndex.isIndexCreated()) return [];
  const vector = await generateEmbedding(query, db);
  if (!vector) return [];

  // queryItems(vector: number[], query: string, topK: number, filter?: MetadataFilter, isBm25?: boolean)
  const results = await vectorIndex.queryItems(vector, "", topK);
  return results;
}

// Perform a full sync from SQLite
async function syncDatabaseToVectorDB(db) {
  await initVectorDB(db);
  
  db.all("SELECT id, title, description, content FROM works", [], async (err, works) => {
    if (works) {
      for (const w of works) {
        await upsertDocument(w.id, 'work', w.title, `${w.description}\n${w.content}`, db);
      }
    }
  });

  db.all("SELECT id, title, description, content FROM services", [], async (err, services) => {
    if (services) {
      for (const s of services) {
        await upsertDocument(s.id, 'service', s.title, `${s.description}\n${s.content}`, db);
      }
    }
  });
}

module.exports = {
  initVectorDB,
  upsertDocument,
  deleteDocument,
  searchVectorDB,
  syncDatabaseToVectorDB
};

const { rawPayloads } = require('./memoryStore');

async function saveRaw(id, raw, userId) {
  rawPayloads.set(id, { id, userId, raw, createdAt: new Date().toISOString() });
  return rawPayloads.get(id);
}

module.exports = { saveRaw };
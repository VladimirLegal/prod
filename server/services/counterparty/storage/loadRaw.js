const { rawPayloads } = require('./memoryStore');

async function loadRaw(id, userId) {
  const entry = rawPayloads.get(id);
  if (!entry) return null;
  if (userId && entry.userId && entry.userId !== userId) return null;
  return entry;
}

module.exports = { loadRaw };
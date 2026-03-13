// server/services/counterparty/storage/saveResult.js

const { query } = require('../../../db');
const crypto = require('crypto');

function generatePublicToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function saveResult(userId, data, raw) {
  const id = crypto.randomUUID();
  const publicToken = generatePublicToken();

  await query(
    `INSERT INTO counterparty_results(id, user_id, public_token, data, raw)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
    [id, userId, publicToken, JSON.stringify(data), JSON.stringify(raw || null)]
  );

  return { id, publicToken, createdAt: new Date() };
}

module.exports = { saveResult };
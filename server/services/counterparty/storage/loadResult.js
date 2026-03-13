// server/services/counterparty/storage/loadResult.js
const { query } = require('../../../db');

async function loadResult(id, userId) {
  const { rows } = await query(
    `SELECT id, result AS data, created_at
     FROM counterparty_checks
     WHERE id=$1 AND user_id=$2
     LIMIT 1`,
    [id, userId]
  );

  if (!rows[0]) return null;

  return {
    id: rows[0].id,
    data: rows[0].data,
    createdAt: rows[0].created_at,
  };
}

async function listUserResults(userId) {
  const { rows } = await query(
    `SELECT id, subject, status, result AS data, created_at
     FROM counterparty_checks
     WHERE user_id=$1
     ORDER BY created_at DESC`,
    [userId]
  );

  return rows.map((row) => ({
    id: row.id,
    data: row.data,
    subject: row.subject,
    status: row.status,
    createdAt: row.created_at,
  }));
}

module.exports = { loadResult, listUserResults };
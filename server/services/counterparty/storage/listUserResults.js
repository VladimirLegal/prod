const { query } = require('../../../db');
async function listUserResults(userId) {
  const { rows } = await query(
    `SELECT
        id,
        subject,
        payload,
        status,
        result AS data,
        created_at,
        started_at,
        finished_at,
        deadline_at,
        poll_state,
        error
     FROM counterparty_checks
     WHERE user_id=$1
     ORDER BY created_at DESC`,
    [userId]
  );

  return rows.map((row) => ({
    id: row.id,
    data: row.data,
    subject: row.subject,
    payload: row.payload,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    deadlineAt: row.deadline_at,
    pollState: row.poll_state,
    error: row.error || null,
  }));
}

module.exports = { listUserResults };
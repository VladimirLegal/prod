async function listUserResults(userId) {
  const { rows } = await query(
    `SELECT id, data, created_at
     FROM counterparty_results
     WHERE user_id=$1
     ORDER BY created_at DESC`,
    [userId]
  );

  return rows.map(r => ({
    id: r.id,
    data: r.data,
    createdAt: r.created_at
  }));
}
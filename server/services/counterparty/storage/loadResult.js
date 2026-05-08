// server/services/counterparty/storage/loadResult.js
const { query } = require('../../../db');

function getProviderLabel(provider, payload = {}) {
  const providerMode =
    typeof payload?.providerMode === 'string'
      ? payload.providerMode.trim()
      : '';

  if (
    providerMode === 'custom' ||
    Array.isArray(payload?.selectedSources) ||
    Array.isArray(payload?.sources)
  ) {
    return 'Выборочная проверка';
  }

  if (provider === 'mixed' || providerMode === 'both') {
    return 'Обе проверки';
  }

  if (provider === 'kontur' || providerMode === 'kontur') {
    return 'Контур';
  }

  return 'Api-cloud';
}

async function loadResult(id, userId) {
  const { rows } = await query(
    `SELECT
        c.id,
        c.status,
        c.result AS data,
        c.created_at,
        c.started_at,
        c.finished_at,
        c.deadline_at,
        c.poll_state,
        c.error,
        (
          SELECT j.run_after
          FROM counterparty_jobs j
          WHERE j.check_id = c.id
            AND j.user_id = c.user_id
            AND j.status = 'queued'
          ORDER BY j.run_after ASC
          LIMIT 1
        ) AS next_poll_at
     FROM counterparty_checks c
     WHERE c.id = $1 AND c.user_id = $2
     LIMIT 1`,
    [id, userId]
  );

  if (!rows[0]) return null;

  return {
    id: rows[0].id,
    status: rows[0].status,
    data: rows[0].data,
    createdAt: rows[0].created_at,
    startedAt: rows[0].started_at,
    finishedAt: rows[0].finished_at,
    deadlineAt: rows[0].deadline_at,
    nextPollAt: rows[0].next_poll_at,
    pollState: rows[0].poll_state,
    error: rows[0].error || null,
  };
}

async function listUserResults(userId, options = {}) {
  const rawPage = Number(options.page || 1);
  const rawPageSize = Number(options.pageSize || 25);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const pageSize =
    Number.isFinite(rawPageSize) && rawPageSize > 0
      ? Math.min(Math.floor(rawPageSize), 100)
      : 25;

  const offset = (page - 1) * pageSize;
  const search = String(options.search || '').trim();

  const params = [userId];
  let whereSql = `WHERE c.user_id = $1`;

  if (search) {
    params.push(`%${search}%`);
    const searchParam = `$${params.length}`;

    whereSql += `
      AND (
        COALESCE(c.subject->>'fullName', '') ILIKE ${searchParam}
        OR COALESCE(c.subject->>'inn', '') ILIKE ${searchParam}
        OR COALESCE(c.subject->>'readableAddress', '') ILIKE ${searchParam}
        OR COALESCE(c.subject->>'cadastralNumber', '') ILIKE ${searchParam}
        OR COALESCE(c.subject->>'objectType', '') ILIKE ${searchParam}
        OR COALESCE(c.status, '') ILIKE ${searchParam}

        OR COALESCE(c.result->'subject'->>'fullName', '') ILIKE ${searchParam}
        OR COALESCE(c.result->'subject'->>'inn', '') ILIKE ${searchParam}
        OR COALESCE(c.result->'subject'->>'readableAddress', '') ILIKE ${searchParam}
        OR COALESCE(c.result->'subject'->>'cadastralNumber', '') ILIKE ${searchParam}
        OR COALESCE(c.result->'item'->>'readableAddress', '') ILIKE ${searchParam}
        OR COALESCE(c.result->'item'->>'cadastralNumber', '') ILIKE ${searchParam}

        OR COALESCE(to_char(c.created_at, 'DD.MM.YYYY HH24:MI'), '') ILIKE ${searchParam}
      )
    `;
  }

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM counterparty_checks c
    ${whereSql}
  `;

  const { rows: countRows } = await query(countSql, params);
  const total = Number(countRows[0]?.total || 0);
  const pages = total > 0 ? Math.ceil(total / pageSize) : 1;

  const listParams = [...params, pageSize, offset];

  const listSql = `
    SELECT
      c.id,
      c.provider,
      c.subject,
      c.payload,
      c.status,
      c.result AS data,
      c.created_at,
      c.started_at,
      c.finished_at,
      c.deadline_at,
      c.poll_state,
      c.error,
      (
        SELECT j.run_after
        FROM counterparty_jobs j
        WHERE j.check_id = c.id
          AND j.user_id = c.user_id
          AND j.status = 'queued'
        ORDER BY j.run_after ASC
        LIMIT 1
      ) AS next_poll_at
    FROM counterparty_checks c
    ${whereSql}
    ORDER BY c.created_at DESC
    LIMIT $${listParams.length - 1}
    OFFSET $${listParams.length}
  `;

  const { rows } = await query(listSql, listParams);

  return {
    items: rows.map((row) => ({
      id: row.id,
      provider: row.provider || null,
      providerLabel: getProviderLabel(row.provider, row.payload || {}),
      data: row.data,
      subject: row.subject,
      payload: row.payload,
      status: row.status,
      createdAt: row.created_at,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      deadlineAt: row.deadline_at,
      nextPollAt: row.next_poll_at,
      pollState: row.poll_state,
      error: row.error || null,
    })),
    total,
    page,
    pageSize,
    pages,
    search,
  };
}

module.exports = { loadResult, listUserResults };
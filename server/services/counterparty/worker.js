const { query } = require('../../db');
const checkPerson = require('./checkPerson');
const { sendCounterpartyReadyEmail } = require('../../utils/mailer');

async function pickJob() {
  // берём одну задачу атомарно
  const { rows } = await query(`
    UPDATE counterparty_jobs
    SET status='processing', started_at=now(), attempt=attempt+1
    WHERE id = (
      SELECT id
      FROM counterparty_jobs
      WHERE status='queued' AND run_after <= now()
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);

  return rows[0] || null;
}

async function runOnce() {
  const job = await pickJob();
  if (!job) return;

  // подтягиваем check
  const { rows: checks } = await query(
    `SELECT * FROM counterparty_checks WHERE id=$1 AND user_id=$2 LIMIT 1`,
    [job.check_id, job.user_id]
  );
  const check = checks[0];

  if (!check) {
    await query(
      `UPDATE counterparty_jobs SET status='error', last_error=$2, finished_at=now() WHERE id=$1`,
      [job.id, 'check_not_found']
    );
    return;
  }

  try {
    await query(
      `UPDATE counterparty_checks SET status='processing', started_at=now() WHERE id=$1`,
      [check.id]
    );

    const payload = check.payload;
    const provider = check.provider || payload?.provider || 'apicloud';

    const result = await checkPerson(payload, { userId: check.user_id, provider });

    // сохраним результат
    await query(
      `UPDATE counterparty_checks
       SET status='done', result=$2::jsonb, finished_at=now()
       WHERE id=$1`,
      [check.id, JSON.stringify(result)]
    );

    await query(
      `UPDATE counterparty_jobs SET status='done', finished_at=now() WHERE id=$1`,
      [job.id]
    );

    // email пользователю со ссылками
    // достанем email пользователя
    const { rows: users } = await query(`SELECT email FROM users WHERE id=$1 LIMIT 1`, [check.user_id]);
    const email = users[0]?.email;

    if (email) {
      const appUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3000';
      const linkHtml = `${appUrl}/api/counterparty/report/${check.id}/html`;
      const linkPdf  = `${appUrl}/api/counterparty/report/${check.id}/pdf`;
      await sendCounterpartyReadyEmail({ to: email, linkHtml, linkPdf });
    }

  } catch (e) {
    const msg = String(e?.message || e);

    await query(
      `UPDATE counterparty_checks SET status='error', error=$2, finished_at=now() WHERE id=$1`,
      [check.id, msg]
    );

    // ретраи
    const shouldRetry = job.attempt < job.max_attempts;
    if (shouldRetry) {
      await query(
        `UPDATE counterparty_jobs
         SET status='queued', last_error=$2, run_after=now() + interval '30 seconds'
         WHERE id=$1`,
        [job.id, msg]
      );
    } else {
      await query(
        `UPDATE counterparty_jobs SET status='error', last_error=$2, finished_at=now() WHERE id=$1`,
        [job.id, msg]
      );
    }
  }
}

function startCounterpartyWorker() {
  const intervalMs = Number(process.env.COUNTERPARTY_WORKER_INTERVAL_MS || 2000);
  setInterval(() => {
    runOnce().catch((e) => console.error('[counterparty-worker] runOnce error', e));
  }, intervalMs);
  console.log('[counterparty-worker] started, interval', intervalMs, 'ms');
}

module.exports = { startCounterpartyWorker };
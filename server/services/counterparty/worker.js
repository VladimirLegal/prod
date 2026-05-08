const { query } = require('../../db');
const checkPerson = require('./checkPerson');
const { sendCounterpartyReadyEmail } = require('../../utils/mailer');

const KONTUR_DEADLINE_HOURS = Number(
  process.env.KONTUR_DEADLINE_HOURS || 24
);

const KONTUR_REQUEUE_MIN_SECONDS = Number(
  process.env.KONTUR_REQUEUE_MIN_SECONDS || 60
);

const KONTUR_REQUEUE_MAX_SECONDS = Number(
  process.env.KONTUR_REQUEUE_MAX_SECONDS || 900
);

const KONTUR_REQUEUE_JITTER_SECONDS = Number(
  process.env.KONTUR_REQUEUE_JITTER_SECONDS || 15
);

const DB_ERROR_BACKOFF_MIN_MS = Number(
  process.env.COUNTERPARTY_DB_ERROR_BACKOFF_MIN_MS || 10000
);

const DB_ERROR_BACKOFF_MAX_MS = Number(
  process.env.COUNTERPARTY_DB_ERROR_BACKOFF_MAX_MS || 60000
);

let dbErrorBackoffMs = 0;
let pauseUntilTs = 0;

let isRunning = false;

function isDbTransientError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();

  return (
    code === 'ECONNRESET' ||
    code === '57P01' ||
    code === '57P02' ||
    code === '57P03' ||
    message.includes('connection terminated') ||
    message.includes('read econnreset') ||
    message.includes('timeout') ||
    message.includes('terminating connection')
  );
}

function increaseDbBackoff() {
  if (!dbErrorBackoffMs) {
    dbErrorBackoffMs = DB_ERROR_BACKOFF_MIN_MS;
  } else {
    dbErrorBackoffMs = Math.min(dbErrorBackoffMs * 2, DB_ERROR_BACKOFF_MAX_MS);
  }

  pauseUntilTs = Date.now() + dbErrorBackoffMs;
  return dbErrorBackoffMs;
}

function getKonturRequeueSeconds(attempt = 1) {
  const safeAttempt = Math.max(1, Number(attempt) || 1);

  const exponential = Math.min(
    KONTUR_REQUEUE_MIN_SECONDS * Math.pow(2, safeAttempt - 1),
    KONTUR_REQUEUE_MAX_SECONDS
  );

  const jitter = Math.floor(Math.random() * (KONTUR_REQUEUE_JITTER_SECONDS + 1));

  return Math.min(exponential + jitter, KONTUR_REQUEUE_MAX_SECONDS);
}

async function cleanupDuplicateActiveJobs() {
  await query(`
    WITH ranked AS (
      SELECT
        id,
        check_id,
        status,
        ROW_NUMBER() OVER (
          PARTITION BY check_id
          ORDER BY
            CASE
              WHEN status = 'processing' THEN 0
              WHEN status = 'queued' THEN 1
              ELSE 2
            END,
            created_at ASC,
            id ASC
        ) AS rn
      FROM counterparty_jobs
      WHERE status IN ('queued', 'processing')
    )
    UPDATE counterparty_jobs j
    SET status = 'error',
        last_error = 'duplicate_active_job_cleaned',
        finished_at = now()
    FROM ranked r
    WHERE j.id = r.id
      AND r.rn > 1
  `);
}

async function ensureSingleActiveJobConstraint() {
  await cleanupDuplicateActiveJobs();

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS counterparty_jobs_one_active_per_check_idx
    ON counterparty_jobs(check_id)
    WHERE status IN ('queued', 'processing')
  `);
}

async function pickJob() {
  const { rows } = await query(`
    UPDATE counterparty_jobs
    SET status='processing',
        started_at=COALESCE(started_at, now()),
        attempt=attempt+1
    WHERE id = (
      SELECT j.id
      FROM counterparty_jobs j
      WHERE j.status = 'queued'
        AND j.run_after <= now()
        AND NOT EXISTS (
          SELECT 1
          FROM counterparty_jobs active
          WHERE active.check_id = j.check_id
            AND active.status = 'processing'
            AND active.id <> j.id
        )
      ORDER BY j.created_at ASC
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
    `UPDATE counterparty_checks
    SET status='processing',
        started_at=COALESCE(started_at, now()),
        deadline_at=COALESCE(deadline_at, now() + ($2)::interval),
        poll_state='polling'
    WHERE id=$1`,
    [check.id, `${KONTUR_DEADLINE_HOURS} hours`]
  );

    const payload = check.payload;

    const providerMode =
      payload?.providerMode ||
      (check.provider === 'mixed' ? 'both' : check.provider) ||
      payload?.provider ||
      'apicloud';

    const previousResult =
      check.result && typeof check.result === 'object'
        ? check.result
        : null;

    const result = await checkPerson(payload, {
      userId: check.user_id,
      providerMode,
      previousResult,
    });

    const mergedPayload = {
      ...(payload || {}),
      ...(result?.meta || {}),
      _kontur: {
        ...(payload?._kontur || {}),
        ...(result?.meta?._kontur || {}),
        checks: {
          ...(payload?._kontur?.checks || {}),
          ...(result?.meta?._kontur?.checks || {}),
        },
      },
    };

    if (!Object.keys(mergedPayload._kontur || {}).length) {
      delete mergedPayload._kontur;
    }

    const sourceStatuses = Object.values(result?.sources || {})
      .map((source) => source?.status)
      .filter(Boolean);

    const hasProcessing = sourceStatuses.includes('processing');
    const hasFinished = sourceStatuses.some(
      (status) => status === 'ok' || status === 'empty' || status === 'error'
    );

    const deadlineAt =
      check.deadline_at ||
      job.deadline_at ||
      null;

    const deadlineMs = deadlineAt ? new Date(deadlineAt).getTime() : 0;
    const isExpired = deadlineMs > 0 && Date.now() >= deadlineMs;

    if (hasProcessing) {
      if (!isExpired) {
        const nextRequeueSeconds = getKonturRequeueSeconds(job.attempt);

        await query(
          `UPDATE counterparty_checks
          SET status='processing',
              payload=$2::jsonb,
              result=$3::jsonb,
              poll_state='polling',
              error=NULL
          WHERE id=$1`,
          [check.id, JSON.stringify(mergedPayload), JSON.stringify(result)]
        );

        await query(
          `UPDATE counterparty_jobs
          SET status='queued',
              last_error=NULL,
              run_after=now() + ($2)::interval,
              poll_state='waiting',
              deadline_at=COALESCE(deadline_at, now() + ($3)::interval)
          WHERE id=$1`,
          [job.id, `${nextRequeueSeconds} seconds`, `${KONTUR_DEADLINE_HOURS} hours`]
        );

        return;
      }

      const timeoutMessage = `Контур не вернул итоговый результат за ${KONTUR_DEADLINE_HOURS} часов`;

      await query(
        `UPDATE counterparty_checks
        SET status='stalled',
            error=$2,
            payload=$3::jsonb,
            result=$4::jsonb,
            finished_at=now(),
            poll_state='stalled'
        WHERE id=$1`,
        [
          check.id,
          timeoutMessage,
          JSON.stringify(mergedPayload),
          JSON.stringify({
            ...(result || {}),
            timeout: true,
            timeoutMessage,
            stalled: true,
          }),
        ]
      );

      await query(
        `UPDATE counterparty_jobs
        SET status='error',
            last_error=$2,
            finished_at=now(),
            poll_state='stalled'
        WHERE id=$1`,
        [job.id, timeoutMessage]
      );

      return;
    }

    await query(
      `UPDATE counterparty_checks
      SET status='done',
          payload=$2::jsonb,
          result=$3::jsonb,
          finished_at=now(),
          poll_state='completed',
          error=NULL
      WHERE id=$1`,
      [check.id, JSON.stringify(mergedPayload), JSON.stringify(result)]
    );

    await query(
      `UPDATE counterparty_jobs
      SET status='done',
          finished_at=now(),
          poll_state='completed'
      WHERE id=$1`,
      [job.id]
    );

    try {
      const { rows: users } = await query(
        `SELECT email FROM users WHERE id=$1 LIMIT 1`,
        [check.user_id]
      );
      const email = users[0]?.email;

      if (email) {
        const appUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3000';
        const linkHtml = `${appUrl}/api/counterparty/report/${check.id}/html`;
        const linkPdf = `${appUrl}/api/counterparty/report/${check.id}/pdf`;

        await sendCounterpartyReadyEmail({ to: email, linkHtml, linkPdf });
      }
    } catch (mailErr) {
      console.error('[counterparty-worker] ready email failed', {
        checkId: check.id,
        error: String(mailErr?.message || mailErr),
      });
    }

  } catch (e) {
    const msg = String(e?.message || e);

    try {
      await query(
        `UPDATE counterparty_checks SET status='error', error=$2, finished_at=now() WHERE id=$1`,
        [check.id, msg]
      );

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
          `UPDATE counterparty_jobs
          SET status='error', last_error=$2, finished_at=now()
          WHERE id=$1`,
          [job.id, msg]
        );
      }
    } catch (dbErr) {
      console.error('[counterparty-worker] failed to persist worker error', {
        originalError: msg,
        dbError: String(dbErr?.message || dbErr),
        checkId: check?.id || null,
        jobId: job?.id || null,
      });
    }
  }
}

function startCounterpartyWorker() {
  const intervalMs = Number(process.env.COUNTERPARTY_WORKER_INTERVAL_MS || 2000);
  ensureSingleActiveJobConstraint().catch((err) => {
    console.error('[counterparty-worker] ensureSingleActiveJobConstraint failed', err);
  });

  setInterval(async () => {
    if (isRunning) return;

    if (pauseUntilTs && Date.now() < pauseUntilTs) {
      return;
    }

    isRunning = true;
    try {
      await runOnce();

      // Если проход доработал без падения в DB transport error —
      // считаем, что соединение ожило, и сбрасываем backoff.
      dbErrorBackoffMs = 0;
      pauseUntilTs = 0;
    } catch (e) {
      if (isDbTransientError(e)) {
        const waitMs = increaseDbBackoff();
        console.error(
          '[counterparty-worker] runOnce DB error, pause worker for',
          waitMs,
          'ms',
          e
        );
      } else {
        console.error('[counterparty-worker] runOnce error', e);
      }
    } finally {
      isRunning = false;
    }
  }, intervalMs);

  console.log('[counterparty-worker] started, interval', intervalMs, 'ms');
}

module.exports = { startCounterpartyWorker };
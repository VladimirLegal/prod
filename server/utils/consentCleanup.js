const { query } = require('../db');

let cleanupScheduled = false;
let dailyInterval = null;
let initialTimeout = null;

async function cleanupOrphanConsents() {
  try {
    const res = await query(`
      DELETE FROM consents
       WHERE user_id IS NULL
         AND signed_at < (now() - interval '30 days')
    `);
    console.log(`[cleanup] orphan consents deleted: ${res.rowCount}`);
  } catch (e) {
    console.warn('[cleanup] failed:', e.message);
  }
}

function startConsentCleanup() {
  if (cleanupScheduled) {
    return;
  }
  cleanupScheduled = true;

  // делаем первый запуск через минуту после старта, чтобы БД успела прогреться
  initialTimeout = setTimeout(() => {
    cleanupOrphanConsents().catch((err) => {
      console.warn('[cleanup] initial run failed:', err.message);
    });
  }, 60 * 1000);
  initialTimeout.unref?.();

  dailyInterval = setInterval(() => {
    cleanupOrphanConsents().catch((err) => {
      console.warn('[cleanup] scheduled run failed:', err.message);
    });
  }, 24 * 60 * 60 * 1000);
  dailyInterval.unref?.();
}

function stopConsentCleanup() {
  if (initialTimeout) {
    clearTimeout(initialTimeout);
    initialTimeout = null;
  }
  if (dailyInterval) {
    clearInterval(dailyInterval);
    dailyInterval = null;
  }
  cleanupScheduled = false;
}

module.exports = { startConsentCleanup, stopConsentCleanup };
// server/db.js
const { Pool } = require('pg');
require('dotenv').config();

const ssl =
  process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : undefined;

const DB_POOL_MAX = Number(process.env.DB_POOL_MAX || 10);
const DB_IDLE_TIMEOUT_MS = Number(process.env.DB_IDLE_TIMEOUT_MS || 15000);
const DB_CONNECTION_TIMEOUT_MS = Number(process.env.DB_CONNECTION_TIMEOUT_MS || 15000);
const DB_START_RETRY_COUNT = Number(process.env.DB_START_RETRY_COUNT || 5);
const DB_START_RETRY_DELAY_MS = Number(process.env.DB_START_RETRY_DELAY_MS || 3000);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || undefined,
  database: process.env.DB_NAME,
  ssl,

  max: DB_POOL_MAX,
  idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
  allowExitOnIdle: false,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Ошибки idle-клиентов из пула.
// Это важно, потому что именно здесь часто всплывают "протухшие" соединения.
pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', {
    message: err?.message || null,
    code: err?.code || null,
    errno: err?.errno || null,
    syscall: err?.syscall || null,
  });
});

function shortenSql(text = '') {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.error('[db] query error:', {
      message: err?.message || null,
      code: err?.code || null,
      errno: err?.errno || null,
      syscall: err?.syscall || null,
      sql: shortenSql(text),
      paramsCount: Array.isArray(params) ? params.length : 0,
    });
    throw err;
  }
}

async function testConnectionOnce() {
  const res = await pool.query('SELECT NOW() AS now');
  return res.rows?.[0]?.now || null;
}

async function testConnectionWithRetry() {
  for (let attempt = 1; attempt <= DB_START_RETRY_COUNT; attempt += 1) {
    try {
      const serverTime = await testConnectionOnce();
      console.log(
        `✅ Успешное подключение к PostgreSQL. Серверное время: ${serverTime}`
      );
      return;
    } catch (err) {
      const isLastAttempt = attempt === DB_START_RETRY_COUNT;

      console.warn('[db] startup connection check failed:', {
        attempt,
        maxAttempts: DB_START_RETRY_COUNT,
        message: err?.message || null,
        code: err?.code || null,
        errno: err?.errno || null,
        syscall: err?.syscall || null,
      });

      if (isLastAttempt) {
        console.error(
          '❌ PostgreSQL не ответил в рамках стартовой проверки. Сервер продолжит запуск, но БД пока недоступна.'
        );
        return;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, DB_START_RETRY_DELAY_MS)
      );
    }
  }
}

// Стартовая проверка подключения.
// Не блокирует запуск сервера навсегда, но даёт несколько попыток.
testConnectionWithRetry().catch((err) => {
  console.error('[db] unexpected startup check error:', {
    message: err?.message || null,
    code: err?.code || null,
    errno: err?.errno || null,
    syscall: err?.syscall || null,
  });
});

module.exports = {
  pool,
  query,
};
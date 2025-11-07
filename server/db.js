// server/db.js
const { Pool } = require('pg');
require('dotenv').config();
const ssl =
  process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false } // Yandex PG/облака с self-signed
    : undefined;


const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || undefined,
  database: process.env.DB_NAME,
  ssl,
  max: 10,
});

// Проверка подключения
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Ошибка подключения к PostgreSQL:', err.message);
  } else {
    console.log('✅ Успешное подключение к PostgreSQL. Серверное время:', res.rows[0].now);
  }
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};

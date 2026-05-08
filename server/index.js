const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();
const app = express();
const { pool } = require('./db');
const { startConsentCleanup } = require('./utils/consentCleanup');

app.set('trust proxy', 1);



// ---------- базовые парсеры ----------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ---------- CORS (для работы куки) ----------
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
app.use(cors({
  origin: CLIENT_ORIGIN,
  credentials: true,
}));

// ---------- логгер запросов ----------
app.use((req, res, next) => {
  const safeUrl = (req.originalUrl || req.url || '').split('?')[0];
  console.log(`[${new Date().toISOString()}] ${req.method} ${safeUrl}`);
  next();
});



// ---------- сессии (ДОЛЖНЫ стоять ДО роутов) ----------
const session = require('express-session');
class PostgresSessionStore extends session.Store {
  constructor(pgPool) {
    super();
    this.pool = pgPool;
    this.tableReady = null;

    this.cleanupInterval = setInterval(() => {
      this.#ensureReady()
        .then(() => this.#cleanupExpired())
        .catch((err) => {
          console.warn('[session] cleanup failed:', err.message);
        });
    }, 60 * 60 * 1000);

    this.cleanupInterval.unref?.();
  }

  async #init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        sid TEXT PRIMARY KEY,
        sess JSONB NOT NULL,
        expire TIMESTAMPTZ NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS user_sessions_expire_idx
        ON user_sessions(expire);
    `);
    await this.#cleanupExpired();
  }

  async #ensureReady() {
    if (!this.tableReady) {
      this.tableReady = this.#init().catch((err) => {
        this.tableReady = null;
        throw err;
      });
    }

    return this.tableReady;
  }

  async #cleanupExpired() {
    await this.pool.query('DELETE FROM user_sessions WHERE expire < now()');
  }

  async get(sid, callback) {
    try {
      await this.#ensureReady();
      const res = await this.pool.query(
        'SELECT sess, expire FROM user_sessions WHERE sid = $1',
        [sid]
      );
      if (!res.rowCount) return callback(null, null);
      const row = res.rows[0];
      if (row.expire && new Date(row.expire).getTime() < Date.now()) {
        await this.destroy(sid);
        return callback(null, null);
      }
      const sessionData = typeof row.sess === 'string' ? JSON.parse(row.sess) : row.sess;
      return callback(null, sessionData);
    } catch (err) {
      return callback(err);
    }
  }

  async set(sid, sessionData, callback) {
    try {
      await this.#ensureReady();
      const expires = sessionData?.cookie?.expires
        ? new Date(sessionData.cookie.expires)
        : new Date(Date.now() + 24 * 60 * 60 * 1000);
      const payload = JSON.stringify(sessionData);
      await this.pool.query(
        `INSERT INTO user_sessions(sid, sess, expire)
         VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (sid)
         DO UPDATE SET sess = $2::jsonb, expire = $3`,
        [sid, payload, expires]
      );
      callback?.(null);
    } catch (err) {
      callback?.(err);
    }
  }

  async destroy(sid, callback) {
    try {
      await this.#ensureReady();
      await this.pool.query('DELETE FROM user_sessions WHERE sid = $1', [sid]);
      callback?.(null);
    } catch (err) {
      callback?.(err);
    }
  }

  async touch(sid, sessionData, callback) {
    return this.set(sid, sessionData, callback);
  }
}

const SESSION_SECRET = process.env.SESS_SECRET;
if (!SESSION_SECRET) {
  const message = 'SESS_SECRET environment variable is not set. Sessions are not secure.';
  if (process.env.NODE_ENV === 'production') {
    throw new Error(message);
  }
  console.warn(`${message} Generating an ephemeral secret for development.`);
}

const sessionStore = new PostgresSessionStore(pool);

app.use(session({
  name: 'sid',
  secret: SESSION_SECRET || crypto.randomBytes(48).toString('hex'),
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    secure: process.env.NODE_ENV === 'production',
  },

}));

// прокидываем userId из сессии
app.use((req, _res, next) => {
  if (!req.userId && req.session?.userId) req.userId = req.session.userId;
  next();
});

const enableTechUser = process.env.ENABLE_TECH_USER === 'true';
const techUserId = process.env.TECH_USER_ID;
const allowTechUser = enableTechUser && process.env.NODE_ENV === 'development';

if (enableTechUser && process.env.NODE_ENV !== 'development') {
  console.warn('Tech user middleware is disabled outside of development environments.');
}

if (allowTechUser) {
  if (!techUserId) {
    console.warn('ENABLE_TECH_USER is true, but TECH_USER_ID is not set. Tech user middleware disabled.');
  } else {
    console.warn('Tech user middleware enabled. Do not use in shared environments.');
    app.use((req, _res, next) => {
      if (!req.userId) req.userId = techUserId;
      next();
    });
  }
} else if (techUserId && !enableTechUser && process.env.NODE_ENV === 'production') {

  console.warn('TECH_USER_ID is set in production but ENABLE_TECH_USER is false; ignoring fallback user.');
}

// ---------- роуты ----------
const documentsApiRouter = require('./routes/documentsApiRoutes'); // /api/documents
app.use('/api/documents', documentsApiRouter);

const documentRoutes = require('./routes/documentRoutes'); // /api (PDF/DOCX и т.п.)
app.use('/api', documentRoutes);

const {
  documentReviewRoutes,
  ownerReviewRoutes
} = require('./routes/documentReviewRoutes');
app.use('/api/docs', documentReviewRoutes);
app.use('/api/reviews', ownerReviewRoutes);

const reviewRoutes = require('./routes/reviewRoutes');
app.use('/api/review', reviewRoutes);


const consentsRouter = require('./routes/consentsRoutes'); // /api/consents
app.use('/api/consents', consentsRouter);

const authRoutes = require('./routes/authRoutes'); // /api/auth/*, /api/me
app.use('/api', authRoutes);

const agreementsRoutes = require('./routes/agreementsRoutes');
app.use('/api/agreements', agreementsRoutes);

const adminRoutes = require('./routes/adminRoutes');
app.use('/api/admin', adminRoutes);

const counterpartyRoutes = require('./routes/counterpartyRoutes');
app.use('/api/counterparty', counterpartyRoutes);

// ---------- статические файлы (только для авторизованных) ----------
const tempDir = path.join(__dirname, 'temp');
const tempRouter = express.Router();
tempRouter.use((req, res, next) => {
  if (!req.userId) {
    return res.status(401).json({ ok: false, error: 'auth_required' });
  }
  next();
});
tempRouter.use(express.static(tempDir, { fallthrough: false }));
app.use('/temp', tempRouter);

// ===== Static content pages (MVP) =====
const contentDir = path.join(__dirname, 'content');
const clientBuildDir = path.join(__dirname, '..', 'client', 'build');
const clientIndexFile = path.join(clientBuildDir, 'index.html');
const trimmedClientOrigin = CLIENT_ORIGIN.replace(/\/+$/, '');

function serveSpaRoute(req, res) {
  if (fs.existsSync(clientIndexFile)) {
    return res.sendFile(clientIndexFile);
  }

  if (trimmedClientOrigin) {
    const originalPath = req.originalUrl || req.url || '/';
    const redirectTarget = `${trimmedClientOrigin}${originalPath.startsWith('/') ? originalPath : `/${originalPath}`}`;
    return res.redirect(302, redirectTarget);
  }

  res.status(503).send('Client application is not available. Build the client or set CLIENT_ORIGIN.');
}

// Белый список slug -> файл
const PAGE_WHITELIST = new Map([
  ['privacy', 'privacy.html'],
  ['about-portal', 'about-portal.html'],
  ['terms', 'terms.html'],
  ['yandex-metrika-consent', 'yandex-metrika-consent.html'],
  ['about-unique', 'about-unique.html'],
  ['personal-data-consent', 'personal-data-consent.html'],

]);

app.get('/pages/:slug', (req, res) => {
  try {
    const slug = String(req.params.slug || '').toLowerCase().trim();
    const file = PAGE_WHITELIST.get(slug);
    if (!file) return res.status(404).send('Not found');
    const full = path.join(contentDir, file);
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(full);
  } catch (e) {
    console.error('Serve page error:', e);
    res.status(500).send('Internal error');
  }
});

const { startCounterpartyWorker } = require('./services/counterparty/worker');
startCounterpartyWorker();

// ---------- тестовый роут ----------
app.get('/test-server', (req, res) => {
  res.send('Сервер работает!');
});

// ---------- старт ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Доступно по адресу: http://localhost:${PORT}`);

  const fs = require('fs');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log('Создана папка temp:', tempDir);
  }
    

});

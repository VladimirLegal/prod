const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { query } = require('../db');
const requireAuth = require('../middlewares/requireAuth');
const { createRateLimiter } = require('../utils/inMemoryRateLimiter');

const AGREEMENTS_DIR = path.join(__dirname, '..', 'templates', 'agreements');
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function getClientIp(req) {
  return (
    req.ip ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    ''
  );
}

const presignLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => {
    const email = String(req.body?.email || '').toLowerCase();
    return `${req.ip || 'unknown'}:${email}`;
  },
  responseBody: { ok: false, error: 'rate_limited' },
});

router.use(express.json({ limit: '1mb' }));

router.post('/', async (req, res) => {
  try {
    const userId = req.userId || null; // техпользователь уже подставляется, но гостя оставим null
    const {
      role = 'guest',
      agreementVersion,
      consentText,
    } = req.body || {};

    if (!agreementVersion || !consentText) {
      return res.status(400).json({ error: 'agreementVersion_and_consentText_required' });
    }

    const ip = getClientIp(req) || null;
    const ua = req.headers['user-agent'] || null;

    const sql = `
      insert into user_consents (user_id, role, agreement_version, consent_text, ip_address, user_agent)
      values ($1,$2,$3,$4,$5,$6)
      returning id, accepted_at
    `;
    const { rows } = await query(sql, [userId, role, agreementVersion, consentText, ip, ua]);
    return res.json({ id: rows[0].id, accepted_at: rows[0].accepted_at });
  } catch (e) {
    console.error('POST /api/consents error:', e);
    return res.status(500).json({ error: 'failed_to_save_consent' });
  }
});

// === PRESHN: предварительная подпись согласия (без user_id) ===
// POST /api/consents/presign  { docType, docVersion, email }
router.post('/presign', presignLimiter, async (req, res) => {
  try {
    const { docType, docVersion, email } = req.body || {};
    if (!docType || !docVersion || !email) {
      return res.status(400).json({ ok: false, error: 'bad_request' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ ok: false, error: 'invalid_email' });
    }

    const normalizedType = String(docType).trim().toLowerCase();
    const normalizedVersion = String(docVersion).trim().toLowerCase();
    const versionFile = path.join(AGREEMENTS_DIR, `${normalizedType}_${normalizedVersion}.html`);
    if (!fs.existsSync(versionFile)) {
      return res.status(400).json({ ok: false, error: 'unknown_version' });
    }
    
    const ua = req.get('user-agent') || '';
    const ip = getClientIp(req);

    const hash = crypto.createHash('sha256').update(`${normalizedType}:${normalizedVersion}`).digest('hex');
   
    const ins = await query(
      `INSERT INTO consents(email, user_id, doc_type, doc_version, hash, ip, user_agent, signed_at, created_at)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, now(), now())
       RETURNING id`,
      [normalizedEmail, normalizedType, normalizedVersion, hash, ip, ua]
    );

    return res.json({ ok: true, consentId: ins.rows[0].id });
  } catch (e) {
    console.error('POST /api/consents/presign', e);
    return res.status(500).json({ ok: false, error: 'presign_failed' });
  }
});

// === ATTACH: привязать предварительное согласие к пользователю после логина ===
// POST /api/consents/attach  { consentId, email }
router.post('/attach', async (req, res) => {
  try {
    const { consentId, email } = req.body || {};
    if (!consentId || !email) {
      return res.status(400).json({ ok: false, error: 'bad_request' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // 1) найдём пользователя по email без учёта регистра
    const u = await query(
      `SELECT id, email FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [normalizedEmail]
    );
    const userId = u.rows[0]?.id;
    if (!userId) {
      return res.status(404).json({ ok: false, error: 'user_not_found' });
    }

    // 2) привяжем именно по id согласия (email в consents мог быть в другом регистре)
    const upd = await query(
      `UPDATE consents
          SET user_id = $1
        WHERE id = $2
          AND (user_id IS NULL OR user_id = $1)`,
      [userId, consentId]
    );

    // 3) на всякий случай: подхватим все неподцеплённые согласия по этому email
    //    (если вдруг есть другие свежие записи)
    await query(
      `UPDATE consents
          SET user_id = $1
        WHERE user_id IS NULL
          AND lower(email) = lower($2)`,
      [userId, normalizedEmail]
    );

    return res.json({ ok: upd.rowCount > 0 });
  } catch (e) {
    console.error('POST /api/consents/attach', e);
    return res.status(500).json({ ok: false, error: 'attach_failed' });
  }
});

// === REVOKE: отзыв последнего согласия ПДн текущего пользователя ===
// POST /api/consents/revoke
router.post('/revoke', async (req, res) => {
  try {
    const uid = req.userId || null;
    if (!uid) return res.status(401).json({ ok: false, error: 'unauthorized' });

    // Проверяем, что у пользователя есть подписанное ПДн
    const { rows } = await query(
      `SELECT id
         FROM consents
        WHERE user_id = $1
          AND doc_type = 'pdn'
          AND signed_at IS NOT NULL
        ORDER BY signed_at DESC NULLS LAST, created_at DESC
        LIMIT 1`,
      [uid]
    );
    if (!rows[0]) {
      // Нечего отзывать
      return res.status(409).json({ ok: false, error: 'no_active_consent' });
    }

    // Блокируем кабинет: помечаем в users
    await query(`UPDATE users SET pdn_revoked_at = now(), updated_at = now() WHERE id = $1`, [uid]);
    return res.json({ ok: true, revoked: true });
  } catch (e) {
    console.error('POST /api/consents/revoke', e);
    return res.status(500).json({ ok: false, error: 'revoke_failed' });
  }
});

// === SIGN-AUTH: подписать ПДн от имени текущего авторизованного пользователя ===
// POST /api/consents/sign-auth  { docVersion }
router.post('/sign-auth', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const { docVersion } = req.body || {};
    if (!docVersion) return res.status(400).json({ ok: false, error: 'bad_request' });

    const normalizedVersion = String(docVersion).trim().toLowerCase();
    const versionFile = path.join(AGREEMENTS_DIR, `pdn_${normalizedVersion}.html`);
    if (!fs.existsSync(versionFile)) {
      return res.status(400).json({ ok: false, error: 'unknown_version' });
    }

    // Подтянем email пользователя
    const u = await query(`SELECT email FROM users WHERE id=$1`, [userId]);
    if (!u.rows[0]) return res.status(404).json({ ok: false, error: 'user_not_found' });
    const email = u.rows[0].email;

    const ua = req.get('user-agent') || '';
    const ip = getClientIp(req);

    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(`pdn:${normalizedVersion}`).digest('hex');

    // Если было активное согласие — отзовём его
    await query(
      `UPDATE consents
          SET revoked_at = now()
        WHERE user_id = $1 AND doc_type='pdn' AND signed_at IS NOT NULL AND revoked_at IS NULL`,
      [userId]
    );

    // Создаём новую ПОДПИСАННУЮ запись
    const ins = await query(
      `INSERT INTO consents(user_id, email, doc_type, doc_version, hash, ip, user_agent, signed_at)
       VALUES ($1,$2,'pdn',$3,$4,$5,$6, now())
       RETURNING id, doc_version, signed_at`,
      [userId, email, normalizedVersion, hash, ip, ua]
    );
    await query(`UPDATE users SET pdn_revoked_at = NULL WHERE id=$1`, [userId]);

    return res.json({ ok: true, consent: ins.rows[0] });
  } catch (e) {
    console.error('POST /api/consents/sign-auth', e);
    return res.status(500).json({ ok: false, error: 'sign_failed' });
  }
});

module.exports = router;
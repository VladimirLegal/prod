const express = require('express');
const router = express.Router();
const { query } = require('../db');

function requireAuth(req, res, next) {
  if (!req.userId) return res.status(401).json({ ok:false, error:'unauthorized' });
  next();
}

router.use(express.json({ limit: '1mb' }));

router.post('/', async (req, res) => {
  try {
    const userId = req.userId || null; // техпользователь уже подставляется, но гостя оставим null
    const {
      role = 'guest',
      agreementVersion,
      consentText
    } = req.body || {};

    if (!agreementVersion || !consentText) {
      return res.status(400).json({ error: 'agreementVersion_and_consentText_required' });
    }

    const ip =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;
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
router.post('/presign', async (req, res) => {
  try {
    const { docType, docVersion, email } = req.body || {};
    if (!docType || !docVersion || !email) {
      return res.status(400).json({ ok:false, error:'bad_request' });
    }
    const ua = req.get('user-agent') || '';
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';

    // простой хэш версии (на будущее можно хранить сам текст версии и считать hash на сервере)
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(`${docType}:${docVersion}`).digest('hex');

    
    const ins = await query(
      `INSERT INTO consents(email, user_id, doc_type, doc_version, hash, ip, user_agent, signed_at, created_at)
      VALUES ($1, NULL, $2, $3, $4, $5, $6, now(), now())
      RETURNING id`,
      [email, docType, docVersion, hash, ip, ua]
    );

    return res.json({ ok:true, consentId: ins.rows[0].id });
  } catch(e) {
    console.error('POST /api/consents/presign', e);
    return res.status(500).json({ ok:false, error:'presign_failed' });
  }
});

// === ATTACH: привязать предварительное согласие к пользователю после логина ===
// POST /api/consents/attach  { consentId, email }
router.post('/attach', async (req, res) => {
  try {
    const { consentId, email } = req.body || {};
    if (!consentId || !email) {
      return res.status(400).json({ ok:false, error:'bad_request' });
    }

    // 1) найдём пользователя по email без учёта регистра
    const u = await query(
      `SELECT id, email FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email]
    );
    const userId = u.rows[0]?.id;
    if (!userId) {
      return res.status(404).json({ ok:false, error:'user_not_found' });
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
      [userId, email]
    );

    return res.json({ ok: upd.rowCount > 0 });
  } catch(e) {
    console.error('POST /api/consents/attach', e);
    return res.status(500).json({ ok:false, error:'attach_failed' });
  }
});

// === SIGN-AUTH: подписать ПДн для авторизованного пользователя ===
// POST /api/consents/sign-auth  { docVersion }
router.post('/sign-auth', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ ok:false, error:'unauthorized' });
    }
    const { docVersion } = req.body || {};
    if (!docVersion) {
      return res.status(400).json({ ok:false, error:'docVersion_required' });
    }

    const { query } = require('../db');
    const u = await query(`SELECT id, email FROM users WHERE id=$1`, [userId]);
    const crypto = require('crypto');
    // Хэш должен совпадать с тем, как мы делали в /presign:
    const hash = crypto.createHash('sha256').update(`pdn:${docVersion}`).digest('hex');

    if (!u.rows[0]) return res.status(404).json({ ok:false, error:'user_not_found' });

    const ua = req.get('user-agent') || '';
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '';

    await query(
      `INSERT INTO consents (id, email, user_id, doc_type, doc_version, hash, signed_at, ip, user_agent, created_at)
      VALUES (gen_random_uuid(), $1, $2, 'pdn', $3, $4, now(), $5, $6, now())`,
      [u.rows[0].email, u.rows[0].id, docVersion, hash, ip, ua]
    );


    // реактивируем кабинет
    await query(`UPDATE users SET pdn_revoked_at = NULL WHERE id=$1`, [u.rows[0].id]);

    return res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/consents/sign-auth', e);
    return res.status(500).json({ ok:false, error:'sign_failed' });
  }
});

// === REVOKE: отзыв последнего согласия ПДн текущего пользователя ===
// POST /api/consents/revoke
router.post('/revoke', async (req, res) => {
  try {
    const uid = req.userId || null;
    if (!uid) return res.status(401).json({ ok:false, error:'unauthorized' });

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
      return res.status(409).json({ ok:false, error:'no_active_consent' });
    }

    // Блокируем кабинет: помечаем в users
    await query(`UPDATE users SET pdn_revoked_at = now(), updated_at = now() WHERE id = $1`, [uid]);
    return res.json({ ok:true, revoked:true });
  } catch (e) {
    console.error('POST /api/consents/revoke', e);
    return res.status(500).json({ ok:false, error:'revoke_failed' });
  }
});

// === SIGN-AUTH: подписать ПДн от имени текущего авторизованного пользователя ===
// POST /api/consents/sign-auth  { docVersion }
router.post('/sign-auth', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const { docVersion } = req.body || {};
    if (!docVersion) return res.status(400).json({ ok:false, error:'bad_request' });

    // Подтянем email пользователя
    const { query } = require('../db');
    const u = await query(`SELECT email FROM users WHERE id=$1`, [userId]);
    if (!u.rows[0]) return res.status(404).json({ ok:false, error:'user_not_found' });
    const email = u.rows[0].email;

    const ua = req.get('user-agent') || '';
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';

    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(`pdn:${docVersion}`).digest('hex');

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
      [userId, email, docVersion, hash, ip, ua]
    );

    return res.json({ ok:true, consent: ins.rows[0] });
  } catch (e) {
    console.error('POST /api/consents/sign-auth', e);
    return res.status(500).json({ ok:false, error:'sign_failed' });
  }
});


module.exports = router;

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { query } = require('../db');
const { createRateLimiter } = require('../utils/inMemoryRateLimiter');
const { CURRENT_AGREEMENTS, AGREEMENT_DOC_TYPES } = require('../config/currentAgreements');

const APP_URL = process.env.PUBLIC_APP_URL || 'https://legal-portal.pro';
const MAGIC_TTL_MIN = 15; // время жизни токена, минут

const magicRequestLimiter = createRateLimiter({
  windowMs: MAGIC_TTL_MIN * 60 * 1000,
  max: 5,
  keyGenerator: (req) => {
    const email = String(req.body?.email || '').toLowerCase();
    return `${req.ip || 'unknown'}:${email}`;
  },
  responseBody: { ok: false, error: 'rate_limited' },
});

// --- Реальная отправка письма через SMTP (Yandex) ---
const nodemailer = require('nodemailer');

async function sendMagicEmail({ to, link }) {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASSWORD,
    SMTP_FROM
  } = process.env;

  // ВАЖНО: все значения берём из .env, НИКАКИХ «сырых» строк прямо в коде
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,                               // например: smtp.yandex.ru
    port: Number(SMTP_PORT) || 465,               // 465 или 587
    secure: String(SMTP_SECURE) === 'true',       // 'true' -> true
    auth: {
      user: SMTP_USER,                            // no-reply@legal-portal.pro
      pass: SMTP_PASSWORD,                        // пароль приложения Яндекса
    },
  });

  const mailOptions = {
    from: SMTP_FROM || `"Legal Portal" <${SMTP_USER}>`,
    to,
    subject: 'Вход на портал legal-portal.pro',
    text: `Для входа на портал перейдите по ссылке (действует 15 минут):\n${link}\n\nЕсли вы не запрашивали вход, просто проигнорируйте это письмо.`,
    html: `
      <p>Здравствуйте!</p>
      <p>Для входа на <b>legal-portal.pro</b> нажмите на кнопку ниже:</p>
      <p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#1d72b8;color:#fff;border-radius:5px;text-decoration:none;">Войти в личный кабинет</a></p>
      <p>Ссылка действует 15 минут. Если вы не запрашивали вход, просто проигнорируйте это письмо.</p>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`📤 Magic link sent to ${to}: messageId=${info.messageId}`);
    return true;
  } catch (err) {
    console.error('❌ Ошибка при отправке magic-link письма:', err.message);
    throw new Error('email_send_failed');
  }
}


function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

const USER_NOT_FOUND_MESSAGE = 'Пользователь с таким email не зарегистрирован. Сначала пройдите регистрацию.';
const USER_NOT_REGISTERED_MESSAGE = 'Пользователь не зарегистрирован.';

const PROFILE_ROLE_VALUES = ['private', 'realtor', 'lawyer'];

function normalizeProfileRole(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (!normalized) {
    return '';
  }

  if (!PROFILE_ROLE_VALUES.includes(normalized)) {
    const err = new Error('invalid_profile_role');
    err.status = 400;
    throw err;
  }

  return normalized;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isUserUnavailable(user) {
  return user?.status === 'blocked' || user?.status === 'deleted';
}

async function findUserByEmail(email) {
  const { rows } = await query(
    `SELECT id, email, status
       FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function createUserForRegistration(email) {
  const existing = await findUserByEmail(email);
  if (existing) return existing;

  const { rows } = await query(
    `INSERT INTO users(email, email_verified_at, role)
    VALUES ($1, NULL, 'user')
    ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
    RETURNING id, email, status`,
    [email]
  );
  return rows[0] || null;
}

async function validateRegistrationProfile({ full_name, phone, profile_role, birth_date }) {
  if (!(full_name && phone && profile_role && birth_date)) {
    const err = new Error('registration_profile_required');
    err.status = 400;
    throw err;
  }

  normalizeProfileRole(profile_role);

  const bd = new Date(birth_date);
  if (isNaN(bd.getTime())) {
    const err = new Error('invalid_birth_date');
    err.status = 400;
    throw err;
  }

  const today = new Date();
  const age =
    today.getFullYear() - bd.getFullYear() -
    ((today.getMonth() < bd.getMonth() || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())) ? 1 : 0);

  if (age < 14) {
    const err = new Error('age_restriction');
    err.status = 400;
    throw err;
  }
}

async function savePendingProfile(email, { full_name, phone, profile_role, birth_date }) {
  if (!(full_name && phone && profile_role && birth_date)) return;

  const safeProfileRole = normalizeProfileRole(profile_role);

  try {
    await query(
      `INSERT INTO pending_profiles(email, full_name, phone, profile_role, birth_date)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (email) DO UPDATE SET
        full_name=EXCLUDED.full_name,
        phone=EXCLUDED.phone,
        profile_role=EXCLUDED.profile_role,
        birth_date=EXCLUDED.birth_date,
        created_at=now()`,
      [email, full_name, phone, safeProfileRole, birth_date]
    );
  } catch(e) {
    console.error('[magic/request] pending_profiles upsert failed:', e.message);

    const err = new Error('pending_profile_save_failed');
    err.status = 500;
    throw err;
  }
}

async function createMagicTokenAndSend({ req, user, email, continueUrl }) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + (MAGIC_TTL_MIN * 60 * 1000));

  await query(
    `INSERT INTO magic_tokens(user_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, tokenHash, expiresAt, req.ip || null, req.get('user-agent') || null]
  );

  const link = `${APP_URL}/auth/magic?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(email)}&continue=${encodeURIComponent(continueUrl || '/cabinet')}`;
  console.log('[magic/request] send email…');
  await sendMagicEmail({ to: email, link });
  console.log('[magic/request] ok, sent.');
}


// POST /api/auth/magic/request
router.post('/auth/magic/request', magicRequestLimiter, async (req, res) => {
  try {
    const { continueUrl } = req.body || {};
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ ok: false, error: 'email_required' });

    console.log('[magic/request] email=', email, 'continueUrl=', continueUrl);
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(404).json({
        ok: false,
        error: 'user_not_found',
        message: USER_NOT_FOUND_MESSAGE,
      });
    }

    if (isUserUnavailable(user)) {
      return res.status(403).json({ ok: false, error: 'account_unavailable' });
    }
    await createMagicTokenAndSend({ req, user, email, continueUrl });
    res.json({ ok: true, sent: true });
  } catch (e) {
    console.error('POST /auth/magic/request', e);
    res.status(500).json({ ok: false, error: 'send_failed', detail: String(e?.message || e) });
  }
});
    

// POST /api/auth/register/magic/request
router.post('/auth/register/magic/request', magicRequestLimiter, async (req, res) => {
  try {
    const { continueUrl, full_name, phone, birth_date } = req.body || {};
    const profile_role = normalizeProfileRole(req.body?.profile_role || req.body?.role);
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ ok: false, error: 'email_required' });

    console.log('[register/magic/request] email=', email, 'continueUrl=', continueUrl);

    await validateRegistrationProfile({ full_name, phone, profile_role, birth_date });

    // Сначала сохраняем черновик анкеты.
    // Если это не получилось — пользователя не создаём и magic-link не отправляем.
    await savePendingProfile(email, { full_name, phone, profile_role, birth_date });

    const user = await createUserForRegistration(email);
    if (!user) {
      return res.status(500).json({ ok: false, error: 'registration_failed' });
    }

    if (isUserUnavailable(user)) {
      return res.status(403).json({ ok: false, error: 'account_unavailable' });
    }

    await createMagicTokenAndSend({ req, user, email, continueUrl });
    res.json({ ok: true, sent: true });
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ ok: false, error: e.message });
    }
    console.error('POST /auth/register/magic/request', e);
    res.status(500).json({ ok: false, error: 'send_failed', detail: String(e?.message || e) });
  }
});


// POST /api/auth/magic/verify
router.post('/auth/magic/verify', async (req, res) => {
  try {
    const { token } = req.body || {};
    const email = normalizeEmail(req.body?.email);
    if (!token || !email) return res.status(400).json({ ok: false, error: 'missing' });

    const tokenHash = sha256(token);

    // пользователь должен уже существовать: login-flow не создаёт аккаунт на verify
    const user = await findUserByEmail(email);
    if (!user) {
      await query(`UPDATE magic_tokens SET consumed_at = now() WHERE token_hash = $1 AND consumed_at IS NULL`, [tokenHash]);
      return res.status(404).json({
        ok: false,
        error: 'user_not_found',
        message: USER_NOT_REGISTERED_MESSAGE,
      });
    }

    if (isUserUnavailable(user)) {
      await query(`UPDATE magic_tokens SET consumed_at = now() WHERE token_hash = $1 AND consumed_at IS NULL`, [tokenHash]);
      return res.status(403).json({ ok: false, error: 'account_unavailable' });
    }

    // токен
    const t1 = await query(
      `select id, expires_at, consumed_at
         from magic_tokens
        where user_id = $1 and token_hash = $2`,
      [user.id, tokenHash]
    );
    const t = t1.rows[0];
    if (!t) return res.status(400).json({ ok: false, error: 'invalid_token' });
    if (t.consumed_at) {
      return res.status(400).json({ ok: false, error: 'already_used' });
    }

    if (t.expires_at && new Date(t.expires_at).getTime() < Date.now()) {
      await query('DELETE FROM magic_tokens WHERE id = $1', [t.id]);
      return res.status(400).json({ ok: false, error: 'token_expired' });
    }

    // пометить использованным
    await query(`update magic_tokens set consumed_at = now() where id = $1`, [t.id]);

    // email считается верифицированным
    await query(`update users set email_verified_at = coalesce(email_verified_at, now()) where id = $1`, [user.id]);

    // сессия
    const previousSessionData = { ...req.session };
    delete previousSessionData.cookie;
    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) return reject(err);
        return resolve();
      });
    });
    Object.entries(previousSessionData).forEach(([key, value]) => {
      if (key !== 'userId') {
        req.session[key] = value;
      }
    });
    req.session.userId = user.id;
    try {
      // 1) если есть черновик — применим к профилю
      // ВАЖНО: users.role не трогаем. Это техническая роль доступа: user / manager / admin.
      // Анкетную роль сохраняем отдельно в users.profile_role.
      const p = await query(
        `SELECT
            full_name,
            phone,
            COALESCE(profile_role, role) AS profile_role,
            birth_date
        FROM pending_profiles
        WHERE email=$1`,
        [email]
      );

      if (p.rows[0]) {
        const pf = p.rows[0];
        const safeProfileRole = normalizeProfileRole(pf.profile_role);

        await query(
          `UPDATE users
            SET full_name = COALESCE($2, full_name),
                phone = COALESCE($3, phone),
                profile_role = COALESCE($4, profile_role),
                birth_date = COALESCE($5, birth_date),
                last_login_at = now()
          WHERE id=$1`,
          [user.id, pf.full_name, pf.phone, safeProfileRole, pf.birth_date]
        );

        await query(`DELETE FROM pending_profiles WHERE email=$1`, [email]);
      } else {
        // просто обновим last_login_at
        await query(`UPDATE users SET last_login_at=now() WHERE id=$1`, [user.id]);
      }

      // 2) привяжем все неподцеплённые согласия по этому email (без учёта регистра)
      await query(
        `UPDATE consents
            SET user_id = $1
          WHERE user_id IS NULL
            AND lower(email) = lower($2)`,
        [user.id, email]
      );
    } catch(e) {
      console.warn('[magic/verify] attach pending failed:', e.message);
    }

    res.json({ ok: true, user: { id: user.id, email: user.email } });
  } catch (e) {
    console.error('POST /auth/magic/verify', e);
    res.status(500).json({ ok: false, error: 'verify_failed' });
  }
});

// GET /api/me
router.get('/me', async (req, res) => {
  try {
    const uid = req.userId || null;
    res.set('Cache-Control', 'no-store');

    if (!uid) {
      return res.json({ ok: true, user: null });
    }

    const { rows } = await query(`
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.phone,
        u.role,
        u.profile_role,
        u.birth_date,
        u.email_verified_at,
        u.phone_verified_at,
        u.pdn_revoked_at
      FROM users u
      WHERE u.id = $1
      LIMIT 1
    `, [uid]);

    if (!rows[0]) {
      return res.json({ ok: true, user: null });
    }

    const r = rows[0];
    const latest = await query(
      `SELECT DISTINCT ON (doc_type)
          doc_type,
          doc_version,
          signed_at
         FROM consents
        WHERE user_id = $1
          AND doc_type = ANY($2::text[])
          AND signed_at IS NOT NULL
          AND revoked_at IS NULL
        ORDER BY doc_type, signed_at DESC NULLS LAST, created_at DESC`,
      [uid, AGREEMENT_DOC_TYPES]
    );

    const latestByType = latest.rows.reduce((acc, row) => {
      acc[row.doc_type] = row;
      return acc;
    }, {});

    const agreements = AGREEMENT_DOC_TYPES.reduce((acc, docType) => {
      const signed = latestByType[docType] || null;
      const isCurrent = Boolean(
        signed?.doc_version &&
        signed.doc_version === CURRENT_AGREEMENTS[docType] &&
        !(docType === 'pdn' && r.pdn_revoked_at)
      );

      acc[docType] = {
        currentVersion: CURRENT_AGREEMENTS[docType],
        signedVersion: signed?.doc_version || null,
        signedAt: signed?.signed_at || null,
        isCurrent,
      };
      return acc;
    }, {});

    const pdnActive = Boolean(agreements.pdn.signedVersion && !r.pdn_revoked_at);
    const agreementsRequired = AGREEMENT_DOC_TYPES.some((docType) => !agreements[docType].isCurrent);

    return res.json({
      ok: true,
      user: {
        id: r.id,
        email: r.email,
        full_name: r.full_name,
        phone: r.phone,
        role: r.role,
        profile_role: r.profile_role,
        birth_date: r.birth_date,
        email_verified_at: r.email_verified_at,
        phone_verified_at: r.phone_verified_at,
        agreementsRequired,
        agreements,
        consentVersion: agreements.pdn.signedVersion,
        consentSignedAt: agreements.pdn.signedAt,
        consent: agreements.pdn.signedVersion ? {
          doc_version: agreements.pdn.signedVersion,
          signed_at: agreements.pdn.signedAt,
        } : null,
        pdnActive,
      },
    });
  } catch (e) {
    console.error('GET /me error:', e);
    res.set('Cache-Control', 'no-store');
    return res.status(500).json({ ok: false, error: 'me_failed' });
  }
});

function handleLogout(req, res) {
  try {
    req.session.destroy?.(() => {
      res.clearCookie('sid');
      res.json({ ok: true });
    });
  } catch (e) {
    console.error('POST /auth/logout', e);
    res.status(500).json({ ok: false, error: 'logout_failed' });
  }
}

// POST /api/auth/logout (legacy path)
router.post('/auth/logout', handleLogout);
// POST /api/logout (explicit path)
router.post('/logout', handleLogout);

// === PATCH /api/me ===
// Обновление профиля текущего пользователя
router.patch('/me', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ ok:false, error:'unauthorized' });

    const { full_name, phone, birth_date } = req.body || {};
    const profile_role = req.body?.profile_role !== undefined
      ? normalizeProfileRole(req.body.profile_role)
      : undefined;

    // Валидация и нормализация телефона
    let cleanPhone = null;
    if (phone) {
      let digits = phone.replace(/[^\d+]/g, '');
      if (digits.startsWith('8')) digits = '+7' + digits.slice(1);
      else if (!digits.startsWith('+')) digits = '+' + digits;
      if (!/^\+7\d{10}$/.test(digits))
        return res.status(400).json({ ok:false, error:'invalid_phone_format' });
      cleanPhone = digits;
    }

    // Валидация возраста
    if (birth_date) {
      const bd = new Date(birth_date);
      if (isNaN(bd.getTime()))
        return res.status(400).json({ ok:false, error:'invalid_birth_date' });
      const today = new Date();
      const age =
        today.getFullYear() - bd.getFullYear() -
        ((today.getMonth() < bd.getMonth() ||
          (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())) ? 1 : 0);
      if (age < 14)
        return res.status(400).json({ ok:false, error:'too_young' });
    }

    // Обновляем только переданные поля
    const fields = [];
    const values = [];
    let idx = 1;
    for (const [key, val] of Object.entries({
      full_name, phone: cleanPhone, profile_role, birth_date, updated_at: new Date(),
    })) {
      if (val !== undefined && val !== null) {
        fields.push(`${key} = $${idx++}`);
        values.push(val);
      }
    }
    if (!fields.length) return res.json({ ok:true, message:'nothing_to_update' });

    const sql = `
      UPDATE users
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING id, email, full_name, phone, role, profile_role, birth_date, email_verified_at, updated_at
    `;
    const { rows } = await query(sql, [...values, userId]);
    return res.json({ ok:true, user: rows[0] });
  } catch (e) {
    console.error('PATCH /api/me error:', e);
    return res.status(500).json({ ok:false, error:'update_failed' });
  }
});

module.exports = router;

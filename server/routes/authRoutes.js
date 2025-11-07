const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { query } = require('../db');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const MAGIC_TTL_MIN = 15; // время жизни токена, минут

// Заглушка: отправка письма (пока просто лог). Заменишь на nodemailer.
async function sendMagicEmail({ to, link }) {
  console.log(`📧 [DEV] Magic link for ${to}: ${link}`);
}

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

// POST /api/auth/magic/request
router.post('/auth/magic/request', async (req, res) => {
  try {
    const { email, continueUrl } = req.body || {};
    if (!email) return res.status(400).json({ ok: false, error: 'email_required' });

    console.log('[magic/request] email=', email, 'continueUrl=', continueUrl);

    // 1) найдём/создадим пользователя
    let user = null;
    {
      const { rows: u1rows } = await query('SELECT id, email FROM users WHERE email = $1', [email]);
      user = u1rows[0] || null;
      if (!user) {
        const { rows: u2rows } = await query(
          'INSERT INTO users(email, email_verified_at) VALUES ($1, NULL) RETURNING id, email',
          [email]
        );
        user = u2rows[0];
      }
    }
    console.log('[magic/request] user.id =', user.id);
    // (опционально) принять черновик профиля с клиента
    const { full_name, phone, role, birth_date } = req.body || {};
    if (full_name && phone && role && birth_date) {
      // серверная проверка 14+
      try {
        const bd = new Date(birth_date);
        if (isNaN(bd.getTime())) {
          return res.status(400).json({ ok:false, error:'invalid_birth_date' });
        }
        const today = new Date();
        const age =
          today.getFullYear() - bd.getFullYear() -
          ( (today.getMonth() < bd.getMonth() || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())) ? 1 : 0 );
        if (age < 14) {
          return res.status(400).json({ ok:false, error:'age_restriction' });
        }
      } catch {
        return res.status(400).json({ ok:false, error:'invalid_birth_date' });
      }

      try {
        await query(
          `INSERT INTO pending_profiles(email, full_name, phone, role, birth_date)
          VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (email) DO UPDATE SET
            full_name=EXCLUDED.full_name,
            phone=EXCLUDED.phone,
            role=EXCLUDED.role,
            birth_date=EXCLUDED.birth_date,
            created_at=now()`,
          [email, full_name, phone, role, birth_date]
        );
      } catch(e) {
        console.warn('[magic/request] pending_profiles upsert failed:', e.message);
      }
    }


    // 2) одноразовый токен
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + (MAGIC_TTL_MIN * 60 * 1000));

    console.log('[magic/request] insert token…');
    await query(
      `INSERT INTO magic_tokens(user_id, token_hash, expires_at, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, tokenHash, expiresAt, req.ip || null, req.get('user-agent') || null]
    );

    // 3) отправка письма (dev-лог)
    const link = `${APP_URL}/auth/magic?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(email)}&continue=${encodeURIComponent(continueUrl || '/cabinet')}`;
    console.log('[magic/request] send email…');
    await sendMagicEmail({ to: email, link });

    console.log('[magic/request] ok, sent.');
    res.json({ ok: true, sent: true });
  } catch (e) {
    console.error('POST /auth/magic/request', e);
    res.status(500).json({ ok: false, error: 'send_failed', detail: String(e?.message || e) });
  }
});


// POST /api/auth/magic/verify
router.post('/auth/magic/verify', async (req, res) => {
  try {
    const { token, email } = req.body || {};
    if (!token || !email) return res.status(400).json({ ok: false, error: 'missing' });

    const tokenHash = sha256(token);

    // пользователь
    const u1 = await query('select id from users where email = $1', [email]);
    const user = u1.rows[0];
    if (!user) return res.status(400).json({ ok: false, error: 'user_not_found' });

    // токен
    const t1 = await query(
      `select id, expires_at, consumed_at
         from magic_tokens
        where user_id = $1 and token_hash = $2`,
      [user.id, tokenHash]
    );
    const t = t1.rows[0];
    if (!t) return res.status(400).json({ ok: false, error: 'invalid_token' });
    // если токен уже использован, но у клиента уже есть сессия этого юзера — считаем вход валидным
    if (t.consumed_at) {
      if (req.session?.userId === user.id) {
        return res.json({ ok: true, user: { id: user.id, email } });
      }
    return res.status(400).json({ ok: false, error: 'already_used' });
      
    }

    // пометить использованным
    await query(`update magic_tokens set consumed_at = now() where id = $1`, [t.id]);

    // email считается верифицированным
    await query(`update users set email_verified_at = coalesce(email_verified_at, now()) where id = $1`, [user.id]);

    // сессия
    req.session.userId = user.id;
    try {
      // 1) если есть черновик — применим к профилю
      const p = await query(`SELECT full_name, phone, role, birth_date FROM pending_profiles WHERE email=$1`, [email]);
      if (p.rows[0]) {
        const pf = p.rows[0];
        await query(
          `UPDATE users
            SET full_name = COALESCE($2, full_name),
                phone     = COALESCE($3, phone),
                role      = COALESCE($4, role),
                birth_date= COALESCE($5, birth_date),
                last_login_at = now()
          WHERE id=$1`,
          [user.id, pf.full_name, pf.phone, pf.role, pf.birth_date]
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

    res.json({ ok: true, user: { id: user.id, email } });
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

    // Берём профиль + последнюю подписанную версию ПДн через LATERAL,
    // и смотрим флаг блокировки по users.pdn_revoked_at
    const { rows } = await query(`
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.phone,
        u.role,
        u.birth_date,
        u.email_verified_at,
        u.phone_verified_at,
        u.pdn_revoked_at,
        c.doc_version AS consent_version,
        c.signed_at   AS consent_signed_at
      FROM users u
      LEFT JOIN LATERAL (
        SELECT c1.doc_version, c1.signed_at
        FROM consents c1
        WHERE c1.user_id = u.id AND c1.doc_type = 'pdn'
        ORDER BY c1.signed_at DESC NULLS LAST, c1.created_at DESC
        LIMIT 1
      ) c ON TRUE
      WHERE u.id = $1
      LIMIT 1
    `, [uid]);

    if (!rows[0]) {
      return res.json({ ok: true, user: null });
    }

    const r = rows[0];

    return res.json({
      ok: true,
      user: {
        id: r.id,
        email: r.email,
        full_name: r.full_name,
        phone: r.phone,
        role: r.role,
        birth_date: r.birth_date,
        email_verified_at: r.email_verified_at,
        phone_verified_at: r.phone_verified_at,
        consentVersion: r.consent_version || null,
        consentSignedAt: r.consent_signed_at || null,
        pdnActive: !r.pdn_revoked_at, // активно если НЕ отозвано
      }
    });
  } catch (e) {
    console.error('GET /me error:', e);
    res.set('Cache-Control', 'no-store');
    return res.status(500).json({ ok: false, error: 'me_failed' });
  }
});


// POST /api/auth/logout
router.post('/auth/logout', (req, res) => {
  try {
    req.session?.destroy(() => {
      res.clearCookie?.('sid');
      return res.json({ ok: true });
    });
  } catch {
    return res.json({ ok: true });
  }
});

// === PATCH /api/me ===
// Обновление профиля текущего пользователя
router.patch('/me', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ ok:false, error:'unauthorized' });

    const { full_name, phone, role, birth_date } = req.body || {};

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

    // Валидация роли
    const allowedRoles = ['private', 'realtor', 'lawyer'];
    if (role && !allowedRoles.includes(role))
      return res.status(400).json({ ok:false, error:'invalid_role' });

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
      full_name, phone: cleanPhone, role, birth_date, updated_at: new Date(),
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
      RETURNING id, email, full_name, phone, role, birth_date, email_verified_at, updated_at
    `;
    const { rows } = await query(sql, [...values, userId]);
    return res.json({ ok:true, user: rows[0] });
  } catch (e) {
    console.error('PATCH /api/me error:', e);
    return res.status(500).json({ ok:false, error:'update_failed' });
  }
});


module.exports = router;

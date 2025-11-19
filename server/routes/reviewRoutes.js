const express = require('express');
const crypto = require('crypto');
const sanitizeHtml = require('sanitize-html');
const router = express.Router({ mergeParams: true });
const { query } = require('../db');
const nodemailer = require('nodemailer');

router.use(express.json({ limit: '10mb' }));
router.use(express.urlencoded({ extended: true, limit: '10mb' }));

function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function sanitizeIncomingHtml(html) {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'td',
      'th',
      'colgroup',
      'col'
    ]),
    allowedAttributes: {
      '*': ['class', 'style', 'data-hint', 'data-ph', 'data-slot'],
      a: ['href', 'name', 'target', 'rel'],
      table: ['class', 'border', 'cellpadding', 'cellspacing', 'width', 'style'],
      td: ['class', 'colspan', 'rowspan', 'width', 'style', 'align'],
      th: ['class', 'colspan', 'rowspan', 'width', 'style', 'align'],
      colgroup: ['span', 'width', 'style'],
      col: ['span', 'width', 'style']
    },
    allowedStyles: {
      '*': {
        'text-align': [/^(?:left|right|center|justify)$/i],
        'text-indent': [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)?$/i],
        'margin': [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)?(\s+-?\d+(?:\.\d+)?(?:px|em|rem|%)?){0,3}$/i],
        'margin-left': [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)?$/i],
        'margin-right': [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)?$/i],
        'margin-top': [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)?$/i],
        'margin-bottom': [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)?$/i],
        'padding': [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)?(\s+-?\d+(?:\.\d+)?(?:px|em|rem|%)?){0,3}$/i],
        'padding-left': [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)?$/i],
        'padding-right': [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)?$/i],
        'padding-top': [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)?$/i],
        'padding-bottom': [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)?$/i],
        'font-weight': [/^(?:normal|bold|bolder|lighter|\d{3})$/i],
        'font-style': [/^(?:normal|italic|oblique)$/i],
        'font-size': [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)?$/i],
        'font-family': [/^[-"'\w\s,]+$/i],
        'line-height': [/^(?:normal|-?\d+(?:\.\d+)?(?:px|em|rem|%)?)$/i],
        'color': [/^(?:#[0-9a-f]{3,8}|rgba?\(.*\)|[a-z]+)$/i],
        'background': [/^.*$/],
        'background-color': [/^(?:#[0-9a-f]{3,8}|rgba?\(.*\)|[a-z]+)$/i],
        'background-image': [/^.*$/],
        'background-repeat': [/^.*$/],
        'background-position': [/^.*$/],
        'background-size': [/^.*$/],
        'border': [/^.*$/],
        'border-left': [/^.*$/],
        'border-right': [/^.*$/],
        'border-top': [/^.*$/],
        'border-bottom': [/^.*$/],
        'border-width': [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)?$/i],
        'border-style': [/^(?:solid|dashed|dotted|double|none)$/i],
        'border-color': [/^(?:#[0-9a-f]{3,8}|rgba?\(.*\)|[a-z]+)$/i],
        'list-style-type': [/^.*$/],
        'list-style-position': [/^.*$/],
        'list-style-image': [/^.*$/],
        'vertical-align': [/^.*$/],
        'text-decoration': [/^.*$/],
        'letter-spacing': [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)?$/i],
        'word-break': [/^.*$/],
        'word-wrap': [/^.*$/],
        'white-space': [/^.*$/],
        'display': [/^.*$/],
        'width': [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)?$/i],
        'max-width': [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)?$/i],
        'min-width': [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)?$/i],
        'height': [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)?$/i],
        'max-height': [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)?$/i],
        'min-height': [/^-?\d+(?:\.\d+)?(?:px|em|rem|%)?$/i]
      }
    },
    allowProtocolRelative: true
  });
}

async function findSessionByToken(token) {
  const tokenHash = sha256(token);
  const { rows } = await query(
    `select rs.*, d.title as document_title, d.owner_id
       from review_sessions rs
       join documents d on d.id = rs.document_id
      where rs.token_hash = $1
      limit 1`,
    [tokenHash]
  );
  return rows[0] || null;
}

async function recordEvent(sessionId, type, req, meta = null) {
  try {
    await query(
      `insert into review_events (review_session_id, type, ip, user_agent, meta)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [
        sessionId,
        type,
        req.ip || null,
        req.get('user-agent') || null,
        meta ? JSON.stringify(meta) : null
      ]
    );
  } catch (err) {
    console.warn('[reviewEvents] failed to record event', err.message);
  }
}

async function sendOwnerEmail(ownerId, payload) {
  try {
    const { rows } = await query(`select email from users where id = $1`, [ownerId]);
    const user = rows[0];
    if (!user || !user.email) return;

    const {
      SMTP_HOST,
      SMTP_PORT,
      SMTP_SECURE,
      SMTP_USER,
      SMTP_PASSWORD,
      SMTP_FROM
    } = process.env;

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
      console.log('[reviewEmail] SMTP not configured, skip email');
      return;
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 465,
      secure: String(SMTP_SECURE) === 'true',
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASSWORD
      }
    });

    const mailOptions = {
      from: SMTP_FROM || `"Legal Portal" <${SMTP_USER}>`,
      to: user.email,
      subject: payload.subject,
      text: payload.text,
      html: payload.html
    };

    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.warn('[reviewEmail] failed to send email', err.message);
  }
}

function buildCompletedEmail({ documentTitle, reviewUrl, noChanges }) {
  const statusLine = noChanges
    ? 'Контрагент подтвердил документ без изменений.'
    : 'Контрагент внёс изменения в документ.';
  const urlLine = reviewUrl
    ? `\n\nОткройте документ для просмотра: ${reviewUrl}`
    : '';
  return {
    subject: `Новые правки по документу «${documentTitle}»`,
    text: `${statusLine}${urlLine}`,
    html: `<p>${statusLine}</p>${reviewUrl ? `<p><a href="${reviewUrl}">Открыть документ</a></p>` : ''}`
  };
}

router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(404).json({ ok: false, error: 'not_found' });

    const session = await findSessionByToken(token);
    if (!session) {
      return res.status(404).json({ ok: false, error: 'session_not_found' });
    }

    if (session.status !== 'pending') {
      return res.status(410).json({ ok: false, error: `session_${session.status}` });
    }

    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
      await query(
        `update review_sessions set status = 'expired' where id = $1 and status = 'pending'`,
        [session.id]
      );
      return res.status(410).json({ ok: false, error: 'session_expired' });
    }

    await query(
      `update review_sessions set open_count = open_count + 1, last_open_at = now() where id = $1`,
      [session.id]
    );
    await recordEvent(session.id, 'link_opened', req);

    const baseVersionId = session.base_version_id;
    const { rows: versionRows } = await query(
      `select id, html, created_at from document_versions where id = $1 limit 1`,
      [baseVersionId]
    );
    const version = versionRows[0];
    if (!version) {
      return res.status(500).json({ ok: false, error: 'base_version_missing' });
    }

    res.json({
      ok: true,
      documentTitle: session.document_title,
      counterpartyRole: session.counterparty_role,
      editMode: session.edit_mode,
      expiresAt: session.expires_at,
      status: session.status,
      initialMessage: session.initial_message,
      html: version.html
    });
  } catch (e) {
    console.error('GET /api/review/:token failed', e);
    res.status(500).json({ ok: false, error: 'review_load_failed' });
  }
});

router.post('/:token/complete', async (req, res) => {
  try {
    const { token } = req.params;
    const { html, noChanges = false, counterpartyComment = null } = req.body || {};
    const safeComment = counterpartyComment ? String(counterpartyComment).trim() : null;

    const normalizedNoChanges =
      typeof noChanges === 'string'
        ? noChanges.toLowerCase() === 'true'
        : Boolean(noChanges);

    if (!token) return res.status(404).json({ ok: false, error: 'not_found' });

    const session = await findSessionByToken(token);
    if (!session) {
      return res.status(404).json({ ok: false, error: 'session_not_found' });
    }

    if (session.status !== 'pending') {
      return res.status(410).json({ ok: false, error: `session_${session.status}` });
    }

    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
      await query(
        `update review_sessions set status = 'expired' where id = $1 and status = 'pending'`,
        [session.id]
      );
      return res.status(410).json({ ok: false, error: 'session_expired' });
    }

    const safeHtml = sanitizeIncomingHtml(html || '');

    const { rows: versionRows } = await query(
      `insert into document_versions (document_id, html, source, author_type, review_session_id)
       values ($1,$2,'review_counterparty','counterparty',$3)
       returning id, created_at`,
      [session.document_id, safeHtml, session.id]
    );
    const newVersion = versionRows[0];

    await query(
      `update documents
          set status = $1,
              current_html = $2
        where id = $3`,
      [
        normalizedNoChanges ? 'reviewed_without_changes' : 'reviewed_with_changes',
        safeHtml,
        session.document_id
      ]
    );

    await query(
      `update review_sessions
          set status = 'responded',
              review_version_id = $1,
              responded_at = now(),
              no_changes = $2,
              counterparty_comment = $3
        where id = $4`,
      [newVersion.id, normalizedNoChanges, safeComment, session.id]
    );

    await recordEvent(session.id, 'completed', req, { noChanges: normalizedNoChanges });

    const ownerLink = process.env.PUBLIC_APP_URL
      ? `${process.env.PUBLIC_APP_URL.replace(/\/$/, '')}/document-editor?docId=${encodeURIComponent(session.document_id)}`
      : null;
    const emailPayload = buildCompletedEmail({
      documentTitle: session.document_title,
      reviewUrl: ownerLink,
      noChanges: normalizedNoChanges
    });
    await sendOwnerEmail(session.owner_id, emailPayload);

    res.json({ ok: true, status: 'completed', versionId: newVersion.id });
  } catch (e) {
    console.error('POST /api/review/:token/complete failed', e);
    res.status(500).json({ ok: false, error: 'review_complete_failed' });
  }
});

module.exports = router;
const express = require('express');
const router = express.Router();

const { query } = require('../db');
const { requireAuth, requireRole } = require('../middlewares/authz');
const { exportPdf } = require('../services/documentService');
const { exportHtmlToDocxBuffer } = require('../services/docxGenerator');

const VALID_ROLES = ['user', 'manager', 'admin'];
const VALID_USER_STATUS = ['active', 'blocked', 'deleted'];
const VALID_FEEDBACK_STATUS = ['new', 'in_progress', 'done'];

router.use(express.json({ limit: '1mb' }));

router.use(requireAuth);

router.use(async (req, res, next) => {
  try {
    const userId = req.user?.id || req.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'auth_required' });
    }
    const { rows } = await query(
      `SELECT id, email, role, status, display_name
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [userId]
    );
    if (!rows[0]) {
      return res.status(401).json({ ok: false, error: 'auth_required' });
    }
    if (!req.user) req.user = {};
    Object.assign(req.user, rows[0]);
    return next();
  } catch (err) {
    console.error('[admin] failed to load session user', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

function parsePagination(queryObj, { defaultLimit = 50, maxLimit = 200 } = {}) {
  let limit = Number.parseInt(queryObj.limit, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = defaultLimit;
  limit = Math.min(limit, maxLimit);
  let offset = Number.parseInt(queryObj.offset, 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  return { limit, offset };
}

function buildSort(sortParam, allowed) {
  if (!sortParam) return allowed.default;
  const [field, directionRaw] = String(sortParam).split('.');
  const column = allowed.fields[field];
  if (!column) return allowed.default;
  const dir = String(directionRaw || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return `${column} ${dir}`;
}

async function logAudit({ user }, { action, entityType, entityId, meta }) {
  try {
    await query(
      `INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, meta)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      [user?.id || null, user?.role || null, action, entityType || null, entityId || null, meta ? JSON.stringify(meta) : null]
    );
  } catch (err) {
    console.error('[admin] failed to log audit', err);
  }
}

router.get('/whoami', requireRole('manager', 'admin'), (req, res) => {
  const { id, email, role } = req.user;
  return res.json({ ok: true, user: { id, email, role } });
});

// ---------- Users ----------
router.get('/users', requireRole('manager', 'admin'), async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    const search = String(req.query.query || '').trim();
    const roleFilter = String(req.query.role || '').trim();
    const statusFilter = String(req.query.status || '').trim();
    const sortSql = buildSort(req.query.sort, {
      default: 'created_at DESC',
      fields: {
        created_at: 'created_at',
        email: 'email',
        last_login_at: 'last_login_at',
      },
    });

    const conditions = [];
    const params = [];
    let idx = 1;
    if (search) {
      conditions.push(`(email ILIKE $${idx} OR display_name ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx += 1;
    }
    if (roleFilter && VALID_ROLES.includes(roleFilter)) {
      conditions.push(`role = $${idx}`);
      params.push(roleFilter);
      idx += 1;
    }
    if (statusFilter && VALID_USER_STATUS.includes(statusFilter)) {
      conditions.push(`status = $${idx}`);
      params.push(statusFilter);
      idx += 1;
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalSql = `SELECT COUNT(*) AS cnt FROM users ${whereSql}`;
    const totalRes = await query(totalSql, params);
    const total = Number(totalRes.rows[0]?.cnt || 0);

    const itemsSql = `
      SELECT id, email, display_name, role, status, created_at, last_login_at
      FROM users
      ${whereSql}
      ORDER BY ${sortSql}
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    const listRes = await query(itemsSql, [...params, limit, offset]);

    return res.json({ ok: true, total, items: listRes.rows });
  } catch (err) {
    console.error('GET /api/admin/users error', err);
    return res.status(500).json({ ok: false, error: 'users_list_failed' });
  }
});

router.patch('/users/:id', requireRole('manager', 'admin'), async (req, res) => {
  try {
    const targetId = req.params.id;
    const actorRole = req.user.role;
    const { role, status, display_name, displayName, phone } = req.body || {};

    const updates = [];
    const params = [];
    let idx = 1;

    if (role !== undefined) {
      if (actorRole !== 'admin') {
        return res.status(403).json({ ok: false, error: 'role_change_forbidden' });
      }
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ ok: false, error: 'invalid_role' });
      }
      updates.push(`role = $${idx}`);
      params.push(role);
      idx += 1;
    }

    if (status !== undefined) {
      if (!VALID_USER_STATUS.includes(status)) {
        return res.status(400).json({ ok: false, error: 'invalid_status' });
      }
      updates.push(`status = $${idx}`);
      params.push(status);
      idx += 1;
    }

    const nameValue = display_name ?? displayName;
    if (nameValue !== undefined) {
      updates.push(`display_name = $${idx}`);
      params.push(nameValue || null);
      idx += 1;
    }

    if (phone !== undefined) {
      updates.push(`phone = $${idx}`);
      params.push(phone || null);
      idx += 1;
    }

    if (!updates.length) {
      return res.status(400).json({ ok: false, error: 'nothing_to_update' });
    }

    const sql = `
      UPDATE users
         SET ${updates.join(', ')},
             updated_at = now()
       WHERE id = $${idx}
       RETURNING id, email, display_name, role, status, phone
    `;
    const result = await query(sql, [...params, targetId]);
    if (!result.rows[0]) {
      return res.status(404).json({ ok: false, error: 'user_not_found' });
    }

    await logAudit(req, {
      action: 'user.update',
      entityType: 'user',
      entityId: targetId,
      meta: { role, status, display_name: nameValue ?? undefined, phone },
    });

    return res.json({ ok: true, user: result.rows[0] });
  } catch (err) {
    console.error('PATCH /api/admin/users/:id error', err);
    return res.status(500).json({ ok: false, error: 'user_update_failed' });
  }
});

async function updateUserStatus(req, res, targetStatus, action) {
  try {
    const targetId = req.params.id;
    if (!VALID_USER_STATUS.includes(targetStatus)) {
      return res.status(400).json({ ok: false, error: 'invalid_status' });
    }
    const result = await query(
      `UPDATE users SET status = $1, updated_at = now() WHERE id = $2 RETURNING id`,
      [targetStatus, targetId]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ ok: false, error: 'user_not_found' });
    }
    await logAudit(req, {
      action,
      entityType: 'user',
      entityId: targetId,
      meta: { status: targetStatus },
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(`[admin] user status change error`, err);
    return res.status(500).json({ ok: false, error: 'user_status_failed' });
  }
}

router.post('/users/:id/block', requireRole('manager', 'admin'), (req, res) =>
  updateUserStatus(req, res, 'blocked', 'user.block')
);
router.post('/users/:id/unblock', requireRole('manager', 'admin'), (req, res) =>
  updateUserStatus(req, res, 'active', 'user.unblock')
);

router.get('/users/:id/activity', requireRole('manager', 'admin'), async (req, res) => {
  try {
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 20, 100);
    const targetId = req.params.id;
    const { rows } = await query(
      `SELECT ts, actor_id, actor_role, action, entity_type, entity_id, meta
         FROM audit_logs
        WHERE (entity_type = 'user' AND entity_id = $1)
           OR actor_id = $1
        ORDER BY ts DESC
        LIMIT $2`,
      [targetId, limit]
    );
    return res.json({ ok: true, items: rows });
  } catch (err) {
    console.error('GET /api/admin/users/:id/activity error', err);
    return res.status(500).json({ ok: false, error: 'user_activity_failed' });
  }
});

// ---------- Documents ----------
router.get('/documents', requireRole('manager', 'admin'), async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    const sortSql = buildSort(req.query.sort, {
      default: 'updated_at DESC',
      fields: {
        updated_at: 'updated_at',
        created_at: 'created_at',
        title: 'title',
      },
    });
    const conditions = [];
    const params = [];
    let idx = 1;
    if (req.query.user_id) {
      conditions.push(`owner_id = $${idx}`);
      params.push(req.query.user_id);
      idx += 1;
    }
    if (req.query.type) {
      conditions.push(`type = $${idx}`);
      params.push(req.query.type);
      idx += 1;
    }
    if (req.query.status) {
      conditions.push(`status = $${idx}`);
      params.push(req.query.status);
      idx += 1;
    }
    const q = String(req.query.q || '').trim();
    if (q) {
      conditions.push(`(title ILIKE $${idx})`);
      params.push(`%${q}%`);
      idx += 1;
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const totalRes = await query(`SELECT COUNT(*) AS cnt FROM documents ${whereSql}`, params);
    const total = Number(totalRes.rows[0]?.cnt || 0);
    const itemsSql = `
      SELECT id, owner_id AS user_id, type, title, status, updated_at
      FROM documents
      ${whereSql}
      ORDER BY ${sortSql}
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    const { rows } = await query(itemsSql, [...params, limit, offset]);
    const enriched = rows.map((row) => ({ ...row, meta: null }));
    return res.json({ ok: true, total, items: enriched });
  } catch (err) {
    console.error('GET /api/admin/documents error', err);
    return res.status(500).json({ ok: false, error: 'documents_list_failed' });
  }
});

router.delete('/documents/:id', requireRole('admin'), async (req, res) => {
  try {
    const docId = req.params.id;
    const { rowCount } = await query(
      `UPDATE documents SET status = 'deleted', updated_at = now() WHERE id = $1`,
      [docId]
    );
    if (!rowCount) {
      return res.status(404).json({ ok: false, error: 'document_not_found' });
    }
    await logAudit(req, {
      action: 'doc.delete',
      entityType: 'document',
      entityId: docId,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/admin/documents/:id error', err);
    return res.status(500).json({ ok: false, error: 'document_delete_failed' });
  }
});

router.post('/documents/:id/export', requireRole('manager', 'admin'), async (req, res) => {
  try {
    const docId = req.params.id;
    const format = String(req.body?.format || '').toLowerCase();
    if (!['pdf', 'docx'].includes(format)) {
      return res.status(400).json({ ok: false, error: 'unsupported_format' });
    }
    const { rows } = await query(
      `SELECT id, title, current_html FROM documents WHERE id = $1 LIMIT 1`,
      [docId]
    );
    const doc = rows[0];
    if (!doc) {
      return res.status(404).json({ ok: false, error: 'document_not_found' });
    }
    if (!doc.current_html) {
      return res.status(400).json({ ok: false, error: 'document_empty' });
    }

    let buffer;
    if (format === 'pdf') {
      buffer = await exportPdf(doc.current_html);
    } else {
      buffer = await exportHtmlToDocxBuffer(doc.current_html);
    }

    await logAudit(req, {
      action: format === 'pdf' ? 'doc.export.pdf' : 'doc.export.docx',
      entityType: 'document',
      entityId: docId,
    });

    return res.json({ ok: true, format, data: buffer.toString('base64') });
  } catch (err) {
    console.error('POST /api/admin/documents/:id/export error', err);
    return res.status(500).json({ ok: false, error: 'document_export_failed' });
  }
});

// ---------- Consents ----------
router.get('/consents', requireRole('manager', 'admin'), async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    const conditions = [];
    const params = [];
    let idx = 1;
    if (req.query.user_id) {
      conditions.push(`user_id = $${idx}`);
      params.push(req.query.user_id);
      idx += 1;
    }
    if (req.query.version) {
      conditions.push(`doc_version = $${idx}`);
      params.push(req.query.version);
      idx += 1;
    }
    if (req.query.from) {
      conditions.push(`created_at >= $${idx}`);
      params.push(new Date(req.query.from));
      idx += 1;
    }
    if (req.query.to) {
      conditions.push(`created_at <= $${idx}`);
      params.push(new Date(req.query.to));
      idx += 1;
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const totalRes = await query(`SELECT COUNT(*) AS cnt FROM consents ${whereSql}`, params);
    const total = Number(totalRes.rows[0]?.cnt || 0);
    const sql = `
      SELECT id, user_id, doc_version AS agreement_version, created_at
        FROM consents
        ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}
    `;
    const { rows } = await query(sql, [...params, limit, offset]);
    return res.json({ ok: true, total, items: rows });
  } catch (err) {
    console.error('GET /api/admin/consents error', err);
    return res.status(500).json({ ok: false, error: 'consents_list_failed' });
  }
});

router.get('/consents/:id', requireRole('manager', 'admin'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, user_id, doc_type, doc_version, consent_text, signed_at, created_at, revoked_at
         FROM consents
        WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ ok: false, error: 'consent_not_found' });
    }
    return res.json({ ok: true, consent: rows[0] });
  } catch (err) {
    console.error('GET /api/admin/consents/:id error', err);
    return res.status(500).json({ ok: false, error: 'consent_fetch_failed' });
  }
});

// ---------- Templates ----------
router.get('/templates', requireRole('manager', 'admin'), async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, code, title, version, updated_at FROM templates ORDER BY updated_at DESC`
    );
    return res.json({ ok: true, items: rows });
  } catch (err) {
    console.error('GET /api/admin/templates error', err);
    return res.status(500).json({ ok: false, error: 'templates_list_failed' });
  }
});

router.get('/templates/:id', requireRole('manager', 'admin'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, code, title, type, body, version, updated_at FROM templates WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ ok: false, error: 'template_not_found' });
    }
    return res.json({ ok: true, template: rows[0] });
  } catch (err) {
    console.error('GET /api/admin/templates/:id error', err);
    return res.status(500).json({ ok: false, error: 'template_fetch_failed' });
  }
});

router.put('/templates/:id', requireRole('admin'), async (req, res) => {
  try {
    const { title, body, version } = req.body || {};
    const updates = [];
    const params = [];
    let idx = 1;
    if (title !== undefined) {
      updates.push(`title = $${idx}`);
      params.push(title);
      idx += 1;
    }
    if (body !== undefined) {
      updates.push(`body = $${idx}`);
      params.push(body);
      idx += 1;
    }
    if (version !== undefined) {
      updates.push(`version = $${idx}`);
      params.push(version);
      idx += 1;
    }
    if (!updates.length) {
      return res.status(400).json({ ok: false, error: 'nothing_to_update' });
    }
    updates.push(`updated_at = now()`);
    updates.push(`updated_by = $${idx}`);
    params.push(req.user.id);
    idx += 1;

    const sql = `
      UPDATE templates
         SET ${updates.join(', ')}
       WHERE id = $${idx}
       RETURNING id, code, title, version, updated_at
    `;
    const result = await query(sql, [...params, req.params.id]);
    if (!result.rows[0]) {
      return res.status(404).json({ ok: false, error: 'template_not_found' });
    }

    await logAudit(req, {
      action: 'template.update',
      entityType: 'template',
      entityId: req.params.id,
      meta: { title, version },
    });

    return res.json({ ok: true, template: result.rows[0] });
  } catch (err) {
    console.error('PUT /api/admin/templates/:id error', err);
    return res.status(500).json({ ok: false, error: 'template_update_failed' });
  }
});

// ---------- Feedback ----------
router.get('/feedback', requireRole('manager', 'admin'), async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    const status = String(req.query.status || '').trim();
    const q = String(req.query.q || '').trim();
    const conditions = [];
    const params = [];
    let idx = 1;
    if (status && VALID_FEEDBACK_STATUS.includes(status)) {
      conditions.push(`status = $${idx}`);
      params.push(status);
      idx += 1;
    }
    if (q) {
      conditions.push(`(topic ILIKE $${idx} OR message ILIKE $${idx})`);
      params.push(`%${q}%`);
      idx += 1;
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const totalRes = await query(`SELECT COUNT(*) AS cnt FROM feedback ${whereSql}`, params);
    const total = Number(totalRes.rows[0]?.cnt || 0);
    const sql = `
      SELECT id, user_id, source, topic, message, status, created_at
        FROM feedback
        ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}
    `;
    const { rows } = await query(sql, [...params, limit, offset]);
    return res.json({ ok: true, total, items: rows });
  } catch (err) {
    console.error('GET /api/admin/feedback error', err);
    return res.status(500).json({ ok: false, error: 'feedback_list_failed' });
  }
});

router.patch('/feedback/:id', requireRole('manager', 'admin'), async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!VALID_FEEDBACK_STATUS.includes(status)) {
      return res.status(400).json({ ok: false, error: 'invalid_status' });
    }
    const result = await query(
      `UPDATE feedback SET status = $1 WHERE id = $2 RETURNING id`,
      [status, req.params.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ ok: false, error: 'feedback_not_found' });
    }
    await logAudit(req, {
      action: 'feedback.status',
      entityType: 'feedback',
      entityId: req.params.id,
      meta: { status },
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/admin/feedback/:id error', err);
    return res.status(500).json({ ok: false, error: 'feedback_update_failed' });
  }
});

router.post('/feedback/:id/note', requireRole('manager', 'admin'), async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) {
      return res.status(400).json({ ok: false, error: 'text_required' });
    }
    await query(
      `INSERT INTO admin_notes (entity_type, entity_id, author_id, text)
       VALUES ('feedback', $1, $2, $3)`,
      [req.params.id, req.user.id, text]
    );
    await logAudit(req, {
      action: 'feedback.note',
      entityType: 'feedback',
      entityId: req.params.id,
      meta: { text },
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/admin/feedback/:id/note error', err);
    return res.status(500).json({ ok: false, error: 'feedback_note_failed' });
  }
});

router.get('/feedback/:id/notes', requireRole('manager', 'admin'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, author_id, text, created_at
         FROM admin_notes
        WHERE entity_type = 'feedback' AND entity_id = $1
        ORDER BY created_at DESC`,
      [req.params.id]
    );
    return res.json({ ok: true, items: rows });
  } catch (err) {
    console.error('GET /api/admin/feedback/:id/notes error', err);
    return res.status(500).json({ ok: false, error: 'feedback_notes_failed' });
  }
});

// ---------- Audit ----------
router.get('/audit', requireRole('manager', 'admin'), async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    const conditions = [];
    const params = [];
    let idx = 1;
    if (req.query.actor_id) {
      conditions.push(`actor_id = $${idx}`);
      params.push(req.query.actor_id);
      idx += 1;
    }
    if (req.query.action) {
      conditions.push(`action = $${idx}`);
      params.push(req.query.action);
      idx += 1;
    }
    if (req.query.entity_type) {
      conditions.push(`entity_type = $${idx}`);
      params.push(req.query.entity_type);
      idx += 1;
    }
    if (req.query.entity_id) {
      conditions.push(`entity_id = $${idx}`);
      params.push(req.query.entity_id);
      idx += 1;
    }
    if (req.query.from) {
      conditions.push(`ts >= $${idx}`);
      params.push(new Date(req.query.from));
      idx += 1;
    }
    if (req.query.to) {
      conditions.push(`ts <= $${idx}`);
      params.push(new Date(req.query.to));
      idx += 1;
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const totalRes = await query(`SELECT COUNT(*) AS cnt FROM audit_logs ${whereSql}`, params);
    const total = Number(totalRes.rows[0]?.cnt || 0);
    const sql = `
      SELECT ts, actor_id, actor_role, action, entity_type, entity_id, meta
        FROM audit_logs
        ${whereSql}
       ORDER BY ts DESC
       LIMIT $${idx} OFFSET $${idx + 1}
    `;
    const { rows } = await query(sql, [...params, limit, offset]);
    return res.json({ ok: true, total, items: rows });
  } catch (err) {
    console.error('GET /api/admin/audit error', err);
    return res.status(500).json({ ok: false, error: 'audit_list_failed' });
  }
});

// ---------- Settings ----------
router.get('/settings', requireRole('manager', 'admin'), async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT key, value, updated_at FROM app_settings ORDER BY key`
    );
    const settings = rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    return res.json({ ok: true, settings });
  } catch (err) {
    console.error('GET /api/admin/settings error', err);
    return res.status(500).json({ ok: false, error: 'settings_fetch_failed' });
  }
});

router.patch('/settings', requireRole('admin'), async (req, res) => {
  try {
    if (typeof req.body !== 'object' || !req.body) {
      return res.status(400).json({ ok: false, error: 'invalid_payload' });
    }
    const now = new Date();
    const entries = Object.entries(req.body);
    for (const [key, value] of entries) {
      await query(
        `INSERT INTO app_settings (key, value, updated_at, updated_by)
         VALUES ($1,$2::jsonb,$3,$4)
         ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value,
               updated_at = EXCLUDED.updated_at,
               updated_by = EXCLUDED.updated_by`,
        [key, JSON.stringify(value), now, req.user.id]
      );
    }
    await logAudit(req, {
      action: 'settings.update',
      entityType: 'settings',
      entityId: null,
      meta: { keys: entries.map(([key]) => key) },
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/admin/settings error', err);
    return res.status(500).json({ ok: false, error: 'settings_update_failed' });
  }
});

// ---------- Roles summary ----------
router.get('/roles', requireRole('manager', 'admin'), async (_req, res) => {
  try {
    const roleStats = await query(
      `SELECT role, COUNT(*) AS count FROM users GROUP BY role`
    );
    const statusStats = await query(
      `SELECT status, COUNT(*) AS count FROM users GROUP BY status`
    );
    return res.json({
      ok: true,
      roles: roleStats.rows,
      statuses: statusStats.rows,
    });
  } catch (err) {
    console.error('GET /api/admin/roles error', err);
    return res.status(500).json({ ok: false, error: 'roles_summary_failed' });
  }
});

module.exports = router;
const express = require('express');
const crypto = require('crypto');
const router = express.Router({ mergeParams: true });
const { query } = require('../db');
const requireAuth = require('../middlewares/requireAuth');

const APP_URL = process.env.PUBLIC_APP_URL || 'https://legal-portal.pro';

async function requireActivePDN(req, res, next) {
  try {
    const uid = req.userId || null;
    if (!uid) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const c = await query(
      `select signed_at, revoked_at
         from consents
        where user_id = $1 and doc_type='pdn'
        order by signed_at desc nulls last, created_at desc
        limit 1`,
      [uid]
    );
    const last = c.rows[0];
    const active = !!(last && last.signed_at && !last.revoked_at);
    if (!active) {
      return res.status(403).json({ ok: false, error: 'pdn_required' });
    }
    next();
  } catch (e) {
    console.error('[reviewSessions] requireActivePDN error', e);
    return res.status(500).json({ ok: false, error: 'pdn_check_failed' });
  }
}

function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function buildReviewUrl(token) {
  const base = APP_URL.replace(/\/$/, '');
  return `${base}/review/${encodeURIComponent(token)}`;
}

async function loadDocumentForOwner(documentId, ownerId) {
  const { rows } = await query(
    `select id, owner_id, title, status from documents where id = $1 and owner_id = $2 limit 1`,
    [documentId, ownerId]
  );
  return rows[0] || null;
}

async function loadDocumentVersion(documentId, versionId) {
  const { rows } = await query(
    `select id, document_id, html, created_at, source, author_type, review_session_id, is_baseline_for_review
       from document_versions
      where document_id = $1 and id = $2
      limit 1`,
    [documentId, versionId]
  );
  return rows[0] || null;
}

async function markBaselineVersion(versionId, documentId) {
  await query(
    `update document_versions
        set is_baseline_for_review = true
      where id = $1 and document_id = $2`,
    [versionId, documentId]
  );
}

router.use(express.json({ limit: '10mb' }));
router.use(express.urlencoded({ extended: true, limit: '10mb' }));
router.use(requireAuth);
router.use(requireActivePDN);

// Create review session
router.post('/:documentId/reviews', async (req, res) => {
  try {
    const ownerId = req.userId;
    const { documentId } = req.params;
    const {
      baseVersionId,
      expiresAt,
      counterpartyRole = 'other',
      counterpartyName = null,
      counterpartyEmail = null,
      initialMessage = null,
      editMode = 'full'
    } = req.body || {};

    const allowedRoles = ['landlord', 'tenant', 'agent', 'lawyer', 'other'];
    const normalizedRole = allowedRoles.includes(String(counterpartyRole))
      ? String(counterpartyRole)
      : 'other';
    const allowedEditModes = ['full', 'comments'];
    const normalizedEditMode = allowedEditModes.includes(String(editMode))
      ? String(editMode)
      : 'full';
    const safeName = counterpartyName ? String(counterpartyName).trim() : null;
    const safeEmail = counterpartyEmail ? String(counterpartyEmail).trim() : null;
    const safeMessage = initialMessage ? String(initialMessage).trim() : null;

    if (!baseVersionId) {
      return res.status(400).json({ ok: false, error: 'base_version_required' });
    }

    const document = await loadDocumentForOwner(documentId, ownerId);
    if (!document) {
      return res.status(404).json({ ok: false, error: 'document_not_found' });
    }

    const baseVersion = await loadDocumentVersion(documentId, baseVersionId);
    if (!baseVersion) {
      return res.status(400).json({ ok: false, error: 'version_not_found' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);
    const tokenLastChars = rawToken.slice(-6);

    const expiresDate = expiresAt ? new Date(expiresAt) : null;
    if (expiresDate && Number.isNaN(expiresDate.getTime())) {
      return res.status(400).json({ ok: false, error: 'invalid_expires_at' });
    }

    const { rows } = await query(
      `insert into review_sessions (
         document_id,
         owner_user_id,
         base_version_id,
         token_hash,
         token_last_chars,
         status,
         expires_at,
         counterparty_role,
         counterparty_name,
         counterparty_email,
         initial_message,
         edit_mode
       ) values ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10,$11)
       returning *`,
      [
        documentId,
        ownerId,
        baseVersionId,
        tokenHash,
        tokenLastChars,
        expiresDate ? expiresDate.toISOString() : null,
        normalizedRole,
        safeName,
        safeEmail,
        safeMessage,
        normalizedEditMode
      ]
    );
    const session = rows[0];

    await markBaselineVersion(baseVersionId, documentId);

    await query(
      `update documents set status = 'sent_for_review' where id = $1`,
      [documentId]
    );

    const reviewUrl = buildReviewUrl(rawToken);

    const safeSession = { ...session };
    delete safeSession.token_hash;

    res.json({
      ok: true,
      reviewUrl,
      session: {
        id: safeSession.id,
        documentId: safeSession.document_id,
        ownerUserId: safeSession.owner_user_id,
        baseVersionId: safeSession.base_version_id,
        reviewVersionId: safeSession.review_version_id,
        status: safeSession.status,
        createdAt: safeSession.created_at,
        updatedAt: safeSession.updated_at,
        expiresAt: safeSession.expires_at,
        respondedAt: safeSession.responded_at,
        revokedAt: safeSession.revoked_at,
        counterpartyRole: safeSession.counterparty_role,
        counterpartyName: safeSession.counterparty_name,
        counterpartyEmail: safeSession.counterparty_email,
        editMode: safeSession.edit_mode,
        openCount: safeSession.open_count,
        lastOpenAt: safeSession.last_open_at,
        noChanges: safeSession.no_changes,
        tokenLastChars: safeSession.token_last_chars,
        initialMessage: safeSession.initial_message,
        counterpartyComment: safeSession.counterparty_comment
      }
    });
  } catch (e) {
    console.error('POST /api/docs/:documentId/reviews failed', e);
    res.status(500).json({ ok: false, error: 'create_review_failed' });
  }
});

// List review sessions for document
router.get('/:documentId/reviews', async (req, res) => {
  try {
    const ownerId = req.userId;
    const { documentId } = req.params;

    const document = await loadDocumentForOwner(documentId, ownerId);
    if (!document) {
      return res.status(404).json({ ok: false, error: 'document_not_found' });
    }

    const { rows } = await query(
      `select
         id,
         status,
         created_at,
         updated_at,
         expires_at,
         responded_at,
         revoked_at,
         counterparty_role,
         counterparty_name,
         edit_mode,
         open_count,
         last_open_at,
         base_version_id,
         review_version_id,
         no_changes,
         counterparty_comment
       from review_sessions
       where document_id = $1
       order by created_at desc`,
      [documentId]
    );

    const formatted = rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      expiresAt: r.expires_at,
      respondedAt: r.responded_at,
      revokedAt: r.revoked_at,
      counterpartyRole: r.counterparty_role,
      counterpartyName: r.counterparty_name,
      editMode: r.edit_mode,
      openCount: r.open_count,
      lastOpenAt: r.last_open_at,
      baseVersionId: r.base_version_id,
      reviewVersionId: r.review_version_id,
      noChanges: r.no_changes,
      counterpartyComment: r.counterparty_comment
    }));

    res.json({ ok: true, sessions: formatted });
  } catch (e) {
    console.error('GET /api/docs/:documentId/reviews failed', e);
    res.status(500).json({ ok: false, error: 'list_reviews_failed' });
  }
});

// Review session details
router.get('/:documentId/reviews/:sessionId', async (req, res) => {
  try {
    const ownerId = req.userId;
    const { documentId, sessionId } = req.params;

    const document = await loadDocumentForOwner(documentId, ownerId);
    if (!document) {
      return res.status(404).json({ ok: false, error: 'document_not_found' });
    }

    const { rows } = await query(
      `select * from review_sessions where id = $1 and document_id = $2 limit 1`,
      [sessionId, documentId]
    );
    const session = rows[0];
    if (!session) {
      return res.status(404).json({ ok: false, error: 'review_not_found' });
    }

    res.json({
      ok: true,
      session: {
        id: session.id,
        documentId: session.document_id,
        ownerUserId: session.owner_user_id,
        baseVersionId: session.base_version_id,
        reviewVersionId: session.review_version_id,
        status: session.status,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        expiresAt: session.expires_at,
        respondedAt: session.responded_at,
        revokedAt: session.revoked_at,
        counterpartyRole: session.counterparty_role,
        counterpartyName: session.counterparty_name,
        counterpartyEmail: session.counterparty_email,
        editMode: session.edit_mode,
        openCount: session.open_count,
        lastOpenAt: session.last_open_at,
        noChanges: session.no_changes,
        initialMessage: session.initial_message,
        counterpartyComment: session.counterparty_comment
      }
    });
  } catch (e) {
    console.error('GET /api/docs/:documentId/reviews/:sessionId failed', e);
    res.status(500).json({ ok: false, error: 'get_review_failed' });
  }
});

// Patch actions
router.patch('/:documentId/reviews/:sessionId', async (req, res) => {
  try {
    const ownerId = req.userId;
    const { documentId, sessionId } = req.params;
    const { action, expiresAt } = req.body || {};

    if (!action) {
      return res.status(400).json({ ok: false, error: 'action_required' });
    }

    const document = await loadDocumentForOwner(documentId, ownerId);
    if (!document) {
      return res.status(404).json({ ok: false, error: 'document_not_found' });
    }

    const { rows } = await query(
      `select * from review_sessions where id = $1 and document_id = $2 limit 1`,
      [sessionId, documentId]
    );
    const session = rows[0];
    if (!session) {
      return res.status(404).json({ ok: false, error: 'review_not_found' });
    }

    if (action === 'revoke') {
      if (session.status !== 'pending') {
        return res.status(400).json({ ok: false, error: 'cannot_revoke' });
      }
      await query(
        `update review_sessions set status = 'revoked', revoked_at = now() where id = $1`,
        [sessionId]
      );
      return res.json({ ok: true, status: 'revoked' });
    }

    if (action === 'update_expiration') {
      if (session.status !== 'pending') {
        return res.status(400).json({ ok: false, error: 'cannot_update_expiration' });
      }
      if (!expiresAt) {
        return res.status(400).json({ ok: false, error: 'expires_at_required' });
      }
      const date = new Date(expiresAt);
      if (Number.isNaN(date.getTime())) {
        return res.status(400).json({ ok: false, error: 'invalid_expires_at' });
      }
      await query(
        `update review_sessions set expires_at = $1 where id = $2`,
        [date.toISOString(), sessionId]
      );
      return res.json({ ok: true, status: 'updated', expiresAt: date.toISOString() });
    }

    return res.status(400).json({ ok: false, error: 'unsupported_action' });
  } catch (e) {
    console.error('PATCH /api/docs/:documentId/reviews/:sessionId failed', e);
    res.status(500).json({ ok: false, error: 'update_review_failed' });
  }
});

// Delete a responded diff (removes the returned version AND the session/link entirely)
router.delete('/:documentId/reviews/:sessionId/diff', async (req, res) => {
  const client = await query.getClient?.();
  try {
    const ownerId = req.userId;
    const { documentId, sessionId } = req.params;

    const document = await loadDocumentForOwner(documentId, ownerId);
    if (!document) {
      return res.status(404).json({ ok: false, error: 'document_not_found' });
    }

    const { rows } = await query(
      `select * from review_sessions where id = $1 and document_id = $2 limit 1`,
      [sessionId, documentId]
    );
    const session = rows[0];

    if (!session) {
      return res.status(404).json({ ok: false, error: 'review_not_found' });
    }

    // If we have a pooled client helper, use a transaction to keep state consistent
    const run = client || query;
    if (client) await client.query('begin');

    try {
      if (session.review_version_id) {
        await run(
          `delete from document_versions where id = $1 and document_id = $2`,
          [session.review_version_id, documentId]
        );
      }

      await run(
        `delete from review_sessions where id = $1 and document_id = $2`,
        [sessionId, documentId]
      );

      await run(
        `update documents set status = 'draft' where id = $1`,
        [documentId]
      );

      if (client) await client.query('commit');
    } catch (txErr) {
      if (client) await client.query('rollback');
      throw txErr;
    }

    return res.json({ ok: true, deletedSessionId: sessionId });
  } catch (e) {
    console.error('DELETE /api/docs/:documentId/reviews/:sessionId/diff failed', e);
    return res.status(500).json({ ok: false, error: 'delete_diff_failed' });
  } finally {
    if (client) client.release?.();
  }
});

// Versions associated with session
router.get('/:documentId/reviews/:sessionId/versions', async (req, res) => {
  try {
    const ownerId = req.userId;
    const { documentId, sessionId } = req.params;

    const document = await loadDocumentForOwner(documentId, ownerId);
    if (!document) {
      return res.status(404).json({ ok: false, error: 'document_not_found' });
    }

    const { rows } = await query(
      `select * from review_sessions where id = $1 and document_id = $2 limit 1`,
      [sessionId, documentId]
    );
    const session = rows[0];
    if (!session) {
      return res.status(404).json({ ok: false, error: 'review_not_found' });
    }

    const baseVersion = session.base_version_id
      ? await loadDocumentVersion(documentId, session.base_version_id)
      : null;
    const reviewVersion = session.review_version_id
      ? await loadDocumentVersion(documentId, session.review_version_id)
      : null;

    res.json({
      ok: true,
      status: session.status,
      baseVersion: baseVersion
        ? {
            id: baseVersion.id,
            html: baseVersion.html,
            createdAt: baseVersion.created_at,
            source: baseVersion.source,
            authorType: baseVersion.author_type
          }
        : null,
      reviewVersion: reviewVersion
        ? {
            id: reviewVersion.id,
            html: reviewVersion.html,
            createdAt: reviewVersion.created_at,
            source: reviewVersion.source,
            authorType: reviewVersion.author_type
          }
        : null
    });
  } catch (e) {
    console.error('GET /api/docs/:documentId/reviews/:sessionId/versions failed', e);
    res.status(500).json({ ok: false, error: 'get_review_versions_failed' });
  }
});

const ownerReviewRoutes = express.Router();
ownerReviewRoutes.use(express.json({ limit: '10mb' }));
ownerReviewRoutes.use(express.urlencoded({ extended: true, limit: '10mb' }));
ownerReviewRoutes.use(requireAuth);
ownerReviewRoutes.use(requireActivePDN);

ownerReviewRoutes.get('/', async (req, res) => {
  try {
    const ownerId = req.userId;
    const { status, documentId } = req.query || {};
    const limit = Math.min(200, Math.max(1, parseInt(req.query?.limit, 10) || 50));
    const offset = Math.max(0, parseInt(req.query?.offset, 10) || 0);

    const sqlParts = [
      `select
         id,
         document_id,
         status,
         created_at,
         expires_at,
         responded_at,
         counterparty_role,
         counterparty_name,
         edit_mode,
         open_count,
         last_open_at,
         base_version_id,
         review_version_id,
         no_changes
       from review_sessions
       where owner_user_id = $1`
    ];
    const params = [ownerId];

    if (status) {
      params.push(status);
      sqlParts.push(`and status = $${params.length}`);
    }
    if (documentId) {
      params.push(documentId);
      sqlParts.push(`and document_id = $${params.length}`);
    }

    params.push(limit);
    sqlParts.push(`order by created_at desc limit $${params.length}`);
    params.push(offset);
    sqlParts.push(`offset $${params.length}`);

    const { rows } = await query(sqlParts.join('\n'), params);

    const mapped = rows.map((r) => ({
      id: r.id,
      documentId: r.document_id,
      status: r.status,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      respondedAt: r.responded_at,
      counterpartyRole: r.counterparty_role,
      counterpartyName: r.counterparty_name,
      editMode: r.edit_mode,
      openCount: r.open_count,
      lastOpenAt: r.last_open_at,
      baseVersionId: r.base_version_id,
      reviewVersionId: r.review_version_id,
      noChanges: r.no_changes
    }));

    res.json({ ok: true, sessions: mapped });
  } catch (e) {
    console.error('GET /api/reviews failed', e);
    res.status(500).json({ ok: false, error: 'list_all_reviews_failed' });
  }
});

module.exports = { documentReviewRoutes: router, ownerReviewRoutes };
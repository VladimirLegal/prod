const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { v4: uuidv4 } = require('uuid');
const { diff_match_patch } = require('diff-match-patch');
const sanitizeHtml = require('sanitize-html');
const requireAuth = require('../middlewares/requireAuth');

// Блокируем доступ к документам, если нет активного ПДн у пользователя
async function requireActivePDN(req, res, next) {
  try {
    const uid = req.userId || null;
    if (!uid) return res.status(401).json({ ok:false, error:'unauthorized' });

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
      return res.status(403).json({ ok:false, error:'pdn_required' });
    }
    next();
  } catch (e) {
    console.error('[requireActivePDN] error', e);
    return res.status(500).json({ ok:false, error:'pdn_check_failed' });
  }
}


// === SQL helper: получить HTML версии документа из PostgreSQL ===
async function getSqlVersionHtml(docId, versionId) {
  const sql = `
    select html
    from document_versions
    where document_id = $1 and id = $2
    limit 1
  `;
  const { rows } = await query(sql, [docId, versionId]);
  if (!rows.length) return '';
  return rows[0].html || '';
}
// === Helper: построить diff-HTML из двух HTML строк ===
function buildDiffHtml(fromHtml, toHtml) {
  const dmp = new diff_match_patch();
  const diff = dmp.diff_main(String(fromHtml || ''), String(toHtml || ''));
  dmp.diff_cleanupSemantic(diff);

  const diffHtml = diff.map(([op, text]) => {
    if (!text) return '';
    if (op === diff_match_patch.DIFF_INSERT) return `<ins class="diff-ins">${text}</ins>`;
    if (op === diff_match_patch.DIFF_DELETE) return `<del class="diff-del">${text}</del>`;
    return text;
  }).join('');

  const wrapped = `<div class="diff-report">${diffHtml || '<p class="diff-empty">Изменений не найдено.</p>'}</div>`;

  // базовая очистка
  return sanitizeHtml(wrapped, {
    allowedTags: [
      'a','b','br','caption','col','colgroup','del','div','em','h1','h2','h3','h4','h5','h6',
      'hr','i','ins','li','ol','p','s','span','strong','sub','sup','table','tbody','td',
      'tfoot','th','thead','tr','u','ul'
    ],
    allowedAttributes: {
      '*': ['class'],
      a: ['href','name','target','rel'],
      table: ['class','border','cellpadding','cellspacing','width'],
      td: ['class','colspan','rowspan','width','align'],
      th: ['class','colspan','rowspan','width','align'],
      col: ['span','width'],
      colgroup: ['span','width'],
      ins: ['class'],
      del: ['class']
    },
    allowProtocolRelative: true
  });
}


router.use(express.json({ limit: '10mb' }));
router.use(express.urlencoded({ extended: true, limit: '10mb' }));
router.use(requireAuth);
router.use(requireActivePDN);

router.post('/', async (req, res) => {
  try {
    const ownerId = req.userId;
    const { type = 'rent', title = 'Новый документ', status = 'draft', html = '' } = req.body || {};
    const id = uuidv4();

    await query(
      `insert into documents (id, owner_id, type, title, status, current_html)
       values ($1,$2,$3,$4,$5,$6)`,
      [id, ownerId, type, title, status, html]
    );

    if (html && html.length) {
      await query(
        `insert into document_versions (document_id, html) values ($1,$2)`,
        [id, html]
      );
    }
    res.json({ id, type, title, status });
  } catch (e) {
    console.error('POST /api/documents', e);
    res.status(500).json({ error: 'failed_to_create_document' });
  }
});

router.get('/', async (req, res) => {
  try {
    const ownerId = req.userId;
    const trashed = String(req.query.trashed || 'false') === 'true';

    const { rows } = await query(
      `select id, type, title, status, created_at, updated_at, trashed_at
       from documents
       where owner_id = $1
         and ($2::boolean = true and trashed_at is not null
              or $2::boolean = false and trashed_at is null)
       order by updated_at desc
       limit 200`,
      [ownerId, trashed]
    );
    res.json(rows);

  } catch (e) {
    console.error('GET /api/documents', e);
    res.status(500).json({ error: 'failed_to_list_documents' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const ownerId = req.userId;
    const { id } = req.params;
    const { rows } = await query(
      `select id, type, title, status, current_html, created_at, updated_at
       from documents
       where id = $1 and owner_id = $2`,
      [id, ownerId]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('GET /api/documents/:id', e);
    res.status(500).json({ error: 'failed_to_get_document' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const ownerId = req.userId;
    const { id } = req.params;
    const { html, title, status } = req.body || {};

    const { rows: chk } = await query(
      `select id from documents where id = $1 and owner_id = $2`,
      [id, ownerId]
    );
    if (!chk.length) return res.status(404).json({ error: 'not_found' });

    if (html !== undefined) {
      await query(`update documents set current_html = $1 where id = $2`, [html, id]);
      await query(`insert into document_versions (document_id, html) values ($1,$2)`, [id, html]);
    }
    if (title !== undefined) {
      await query(`update documents set title = $1 where id = $2`, [title, id]);
    }
    if (status !== undefined) {
      await query(`update documents set status = $1 where id = $2`, [status, id]);
    }

    const { rows } = await query(
      `select id, type, title, status, current_html, created_at, updated_at
       from documents where id = $1`,
      [id]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('PUT /api/documents/:id', e);
    res.status(500).json({ error: 'failed_to_update_document' });
  }
});

router.get('/:id/versions', async (req, res) => {
  try {
    const ownerId = req.userId;
    const { id } = req.params;

    const { rows: chk } = await query(
      `select id from documents where id = $1 and owner_id = $2`,
      [id, ownerId]
    );
    if (!chk.length) return res.status(404).json({ error: 'not_found' });

    const { rows } = await query(
      `select id, created_at from document_versions
       where document_id = $1
       order by created_at desc`,
      [id]
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/documents/:id/versions', e);
    res.status(500).json({ error: 'failed_to_list_versions' });
  }
});

router.get('/:id/versions/:versionId', async (req, res) => {
  try {
    const ownerId = req.userId;
    const { id, versionId } = req.params;

    const { rows: chk } = await query(
      `select id from documents where id = $1 and owner_id = $2`,
      [id, ownerId]
    );
    if (!chk.length) return res.status(404).json({ error: 'not_found' });

    const { rows } = await query(
      `select id, html, created_at from document_versions
       where id = $1 and document_id = $2`,
      [versionId, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'version_not_found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('GET /api/documents/:id/versions/:versionId', e);
    res.status(500).json({ error: 'failed_to_get_version' });
  }
});

// Удалить конкретную версию
router.delete('/:id/versions/:versionId', async (req, res) => {
  try {
    const ownerId = req.userId;
    const { id, versionId } = req.params;

    // проверим, что документ принадлежит пользователю
    const { rows: chk } = await query(
      `select id from documents where id = $1 and owner_id = $2`,
      [id, ownerId]
    );
    if (!chk.length) return res.status(404).json({ ok: false, error: 'not_found' });

    // удалить версию
    const del = await query(
      `delete from document_versions where id = $1 and document_id = $2`,
      [versionId, id]
    );
    // del.rowCount === 0 -> не было такой версии
    if (del.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'version_not_found' });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/documents/:id/versions/:versionId', e);
    return res.status(500).json({ ok: false, error: 'failed_to_delete_version' });
  }
});


router.put('/:id/form', async (req, res) => {
  try {
    const ownerId = req.userId;
    const { id } = req.params;
    const json = req.body?.json;
    const consentId = req.body?.consentId || null;
    if (json == null) return res.status(400).json({ error: 'json_required' });

    const { rows: chk } = await query(
      `select id from documents where id = $1 and owner_id = $2`,
      [id, ownerId]
    );
    if (!chk.length) return res.status(404).json({ error: 'not_found' });

    const { rows: exist } = await query(
      `select id from forms where document_id = $1`,
      [id]
    );
    if (exist.length) {
      await query(`update forms set json = $1, updated_at = now(), consent_id = $3 where document_id = $2`, [json, id, consentId]);
    } else {
      await query(`insert into forms (document_id, json, consent_id) values ($1,$2,$3)`, [id, json, consentId]);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/documents/:id/form', e);
    res.status(500).json({ error: 'failed_to_save_form' });
  }
});

router.get('/:id/form', async (req, res) => {
  try {
    const ownerId = req.userId;
    const { id } = req.params;

    const { rows: chk } = await query(
      `select id from documents where id = $1 and owner_id = $2`,
      [id, ownerId]
    );
    if (!chk.length) return res.status(404).json({ error: 'not_found' });

    const { rows } = await query(
      `select json, created_at, updated_at from forms where document_id = $1`,
      [id]
    );
    res.json(rows[0] || { json: null });
  } catch (e) {
    console.error('GET /api/documents/:id/form', e);
    res.status(500).json({ error: 'failed_to_get_form' });
  }
});
// === Корзина документов ===

// Переместить в корзину
router.post('/:id/trash', async (req, res) => {
  try {
    const ownerId = req.userId;
    const { id } = req.params;

    // проверим, что документ принадлежит пользователю
    const { rows: chk } = await query(
      `select id from documents where id = $1 and owner_id = $2`,
      [id, ownerId]
    );
    if (!chk.length) return res.status(404).json({ ok: false, error: 'not_found' });

    await query(
      `update documents set trashed_at = now(), updated_at = now() where id = $1`,
      [id]
    );

    res.json({ ok: true, trashed_at: new Date().toISOString() });
  } catch (e) {
    console.error('POST /api/documents/:id/trash', e);
    res.status(500).json({ ok: false, error: 'failed_to_trash_document' });
  }
});

// Восстановить документ
router.post('/:id/restore', async (req, res) => {
  try {
    const ownerId = req.userId;
    const { id } = req.params;

    const { rows: chk } = await query(
      `select id from documents where id = $1 and owner_id = $2`,
      [id, ownerId]
    );
    if (!chk.length) return res.status(404).json({ ok: false, error: 'not_found' });

    await query(
      `update documents set trashed_at = null, updated_at = now() where id = $1`,
      [id]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/documents/:id/restore', e);
    res.status(500).json({ ok: false, error: 'failed_to_restore_document' });
  }
});

// Полное удаление (только если уже в корзине)
router.delete('/:id', async (req, res) => {
  try {
    const ownerId = req.userId;
    const { id } = req.params;

    const { rows: chk } = await query(
      `select id, trashed_at from documents where id = $1 and owner_id = $2`,
      [id, ownerId]
    );
    if (!chk.length) return res.status(404).json({ ok: false, error: 'not_found' });
    if (!chk[0].trashed_at)
      return res.status(400).json({ ok: false, error: 'not_in_trash' });

    // каскадно удаляем версии и формы
    await query(`delete from document_versions where document_id = $1`, [id]);
    await query(`delete from forms where document_id = $1`, [id]);
    await query(`delete from documents where id = $1`, [id]);

    res.json({ ok: true, deleted: true });
  } catch (e) {
    console.error('DELETE /api/documents/:id', e);
    res.status(500).json({ ok: false, error: 'failed_to_delete_document' });
  }
});

// === NEW (SQL/UUID): Diff по версиям из SQL ===
// Полный путь: /api/documents/:id/diff  (router смонтирован на /api)
router.get('/:id/diff', async (req, res) => {
  try {
    const docId = String(req.params.id || '').trim();
    const from  = String(req.query.from || '').trim();
    const to    = String(req.query.to   || '').trim();

    if (!docId || !from || !to) {
      return res.status(400).json({ html: '', error: 'missing docId/from/to' });
    }

    // (опционально) проверим, что документ принадлежит пользователю — как в твоих других хэндлерах:
    const { rows: chk } = await query(
      `select id from documents where id = $1 and owner_id = $2`,
      [docId, req.userId]
    );
    if (!chk.length) return res.status(404).json({ html: '', error: 'not_found' });

    const [fromHtml, toHtml] = await Promise.all([
      getSqlVersionHtml(docId, from),
      getSqlVersionHtml(docId, to)
    ]);

    if (!fromHtml) {
      return res.status(404).json({ html: '', error: `version ${from} not found for doc ${docId}` });
    }
    if (!toHtml) {
      return res.status(404).json({ html: '', error: `version ${to} not found for doc ${docId}` });
    }

    const html = buildDiffHtml(fromHtml, toHtml);
    return res.json({ html });
  } catch (e) {
    console.error('Build diff (SQL) error:', e);
    return res.status(500).json({ html: '', error: 'internal' });
  }
});

// требуем активное ПДн для всех операций с документами
router.use(requireActivePDN);

// === Автоматическая очистка корзины (старше 10 дней) ===
setInterval(async () => {
  try {
    const { rowCount } = await query(
      `delete from documents where trashed_at < now() - interval '10 days'`
    );
    if (rowCount > 0) console.log(`🗑 Очищено документов из корзины: ${rowCount}`);
  } catch (e) {
    console.error('Автоочистка корзины не удалась:', e);
  }
}, 24 * 60 * 60 * 1000); // раз в сутки


module.exports = router;

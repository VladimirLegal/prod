const express = require('express');
const fs = require('fs');
const path = require('path');

const { CURRENT_AGREEMENTS, AGREEMENT_DOC_TYPES } = require('../config/currentAgreements');

const router = express.Router();


router.get('/current', (req, res) => {
  const versions = { ...CURRENT_AGREEMENTS };
  return res.json({
    ok: true,
    versions,
    documents: AGREEMENT_DOC_TYPES.map((docType) => ({
      docType,
      version: versions[docType],
    })),
  });
});

/**
 * GET /api/agreements/html?doc=privacy|terms|pdn&v=v2025-10-01
 * Отдаёт HTML конкретного документа/версии.
 * Ищем файл сначала с версией: <doc>_<version>.html, потом без: <doc>.html
 * Директория: server/templates/agreements
 */
router.get('/html', async (req, res) => {
  try {
    const doc = String(req.query.doc || '').toLowerCase();
    const v = String(req.query.v || '').toLowerCase();

    if (!['privacy', 'terms', 'pdn'].includes(doc)) {
      return res.status(400).send('<p>bad_request: unknown doc</p>');
    }

    const baseDir = path.join(__dirname, '..', 'templates', 'agreements');
    const tryFiles = [];

    if (v) tryFiles.push(path.join(baseDir, `${doc}_${v}.html`));
    tryFiles.push(path.join(baseDir, `${doc}.html`));
    console.log('[agreements/html]', { doc, v, tryFiles });

    let filePath = null;
    for (const f of tryFiles) {
      if (fs.existsSync(f)) { filePath = f; break; }
    }

    if (!filePath) {
      return res
        .status(404)
        .send(`<div style="font:14px sans-serif;color:#b91c1c">
          Документ не найден: ${doc}${v ? ' ('+v+')' : ''}.
        </div>`);
    }

    let html = fs.readFileSync(filePath, 'utf8') || '';

    // 1) Проверяем: полноценная страница или фрагмент/чистый текст
    const looksLikeFullPage = /<\s*html[\s>]/i.test(html);
    const looksLikeHasTags = /<\s*[a-z][\s>]/i.test(html);

    // 2) Если это фрагмент или чистый текст — оборачиваем в простую HTML-страницу
    if (!looksLikeFullPage) {
    // Если чистый текст без тегов — экранируем, чтобы символы < > & не ломали разметку
    let inner = html;
    if (!looksLikeHasTags) {
        inner = String(inner)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
        inner = `<pre style="white-space: pre-wrap; margin:0">${inner}</pre>`;
    }

    html = `<!doctype html>
    <html lang="ru">
    <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>${doc.toUpperCase()} ${v ? '('+v+')' : ''}</title>
    <style>
        :root { color-scheme: light dark; }
        body{ margin:0; padding:24px; font:16px/1.6 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#fff; color:#111; }
        .doc{ max-width:900px; margin:0 auto; }
        h1,h2,h3{ line-height:1.3; }
        p{ margin:0 0 0.8em 0; text-align:justify; }
        ul,ol{ margin:0.6em 0 0.8em 1.4em; }
        table{ border-collapse:collapse; width:100%; margin:1em 0; }
        th,td{ border:1px solid #000; padding:6px 8px; vertical-align:top; }
        a{ color:#2563eb; }
        @media (prefers-color-scheme: dark){
        body{ background:#0b0f14; color:#e5e7eb; }
        a{ color:#60a5fa; }
        th,td{ border-color:#475569; }
        }
    </style>
    </head>
    <body>
    <main class="doc">
        ${looksLikeHasTags ? html : inner}
    </main>
    </body>
    </html>`;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // чтобы правки сразу были видны
    res.setHeader('Cache-Control', 'no-store');
    return res.send(html);

  } catch (e) {
    console.error('[agreements/html] error:', e);
    return res.status(500).send('<p>internal_error</p>');
  }
});

module.exports = router;

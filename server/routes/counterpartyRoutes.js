const express = require('express');
const path = require('path');
const fs = require('fs');
const handlebars = require('handlebars');
const requireAuth = require('../middlewares/requireAuth');
const checkPerson = require('../services/counterparty/checkPerson');
const { loadResult, listUserResults } = require('../services/counterparty/storage/loadResult');
const { loadRaw } = require('../services/counterparty/storage/loadRaw');
const { saveRaw } = require('../services/counterparty/storage/saveRaw');
const { exportHtmlToPdfBuffer } = require('../services/pdfGenerator');
const { innLookup } = require('../services/counterparty/innLookup');
const { query } = require('../db'); // добавь вверху


const router = express.Router();

router.use(requireAuth);

handlebars.registerHelper('json', (context) => JSON.stringify(context, null, 2));

function getTemplate() {
  const filePath = path.join(__dirname, '..', 'templates', 'counterpartyReport.html');
  const html = fs.readFileSync(filePath, 'utf8');
  return handlebars.compile(html);
}

router.post('/check/person', async (req, res) => {
  try {
    const payload = req.body || {};

    // если фронт уже шлёт чекбоксы providers: ['apicloud', 'kontur']
    // берём первый выбранный как текущий provider для job
    // (мультипровайдерный запуск потом можно расширить отдельно)
    const provider = Array.isArray(payload.providers) && payload.providers.length > 0
      ? payload.providers[0]
      : (payload.provider || 'apicloud');

    const subject = {
      lastName: payload.lastName || '',
      firstName: payload.firstName || '',
      middleName: payload.middleName || '',
      fullName: [payload.lastName, payload.firstName, payload.middleName]
        .filter(Boolean)
        .join(' ')
        .trim(),
      birthDate: payload.birthDate || '',
      region: payload.region || '',
      inn: payload.inn || '',
      passport: {
        series: payload.passportSeries || '',
        number: payload.passportNumber || '',
        issueDate: payload.passportIssueDate || '',
      },
    };

    // создаём запись проверки
    const { rows } = await query(
      `INSERT INTO counterparty_checks(user_id, provider, subject, payload, status)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, 'queued')
       RETURNING id, created_at`,
      [req.userId, provider, JSON.stringify(subject), JSON.stringify(payload)]
    );

    const checkId = rows[0].id;

    // создаём job
    await query(
      `INSERT INTO counterparty_jobs(check_id, user_id, status)
       VALUES ($1, $2, 'queued')`,
      [checkId, req.userId]
    );

    // сразу ответ
    res.json({
      ok: true,
      result: {
        id: checkId,
        status: 'queued',
        subject,
      },
    });
  } catch (err) {
    console.error('[counterparty] enqueue error', err);
    res.status(500).json({ ok: false, error: 'enqueue_failed' });
  }
});

router.get('/check/:id', async (req, res) => {
  const { rows } = await query(
    `SELECT id, created_at, status, result, error
     FROM counterparty_checks
     WHERE id=$1 AND user_id=$2
     LIMIT 1`,
    [req.params.id, req.userId]
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ ok:false, error:'not_found' });

  res.json({
    ok: true,
    result: {
      id: row.id,
      createdAt: row.created_at,
      status: row.status,
      ...(row.result || {}),
      error: row.error || null
    }
  });
});

router.get('/check/:id/raw', async (req, res) => {
  const raw = await loadRaw(req.params.id, req.userId);
  if (!raw) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, raw: raw.raw });
});

router.delete('/check/:id', async (req, res) => {
  try {
    const checkId = req.params.id;

    const { rowCount } = await query(
      `SELECT 1
       FROM counterparty_checks
       WHERE id = $1 AND user_id = $2`,
      [checkId, req.userId]
    );

    if (!rowCount) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    await query(
      `DELETE FROM counterparty_jobs
       WHERE check_id = $1 AND user_id = $2`,
      [checkId, req.userId]
    );

    await query(
      `DELETE FROM counterparty_checks
       WHERE id = $1 AND user_id = $2`,
      [checkId, req.userId]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[counterparty] delete error', err);
    res.status(500).json({ ok: false, error: 'delete_failed' });
  }
});

router.get('/history', async (req, res) => {
  const list = await listUserResults(req.userId);

  res.json({
    ok: true,
    items: list.map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      subject: item.subject || item.data?.subject || null,
      status: item.status || item.data?.status || null,
      hasResult: Boolean(item.data),
    })),
  });
});

router.get('/report/:id/html', async (req, res) => {
  const entry = await loadResult(req.params.id, req.userId);
  if (!entry) return res.status(404).send('not_found');
  const template = getTemplate();
  const html = template({
    ...entry.data,
    createdAt: entry.createdAt,
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

router.get('/report/:id/pdf', async (req, res) => {
  const entry = await loadResult(req.params.id, req.userId);
  if (!entry) return res.status(404).send('not_found');
  const template = getTemplate();
  const html = template({
    ...entry.data,
    createdAt: entry.createdAt,
  });
  try {
    const pdfBuffer = await exportHtmlToPdfBuffer(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="counterparty-report.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[counterparty] pdf error', err);
    res.status(500).send('pdf_failed');
  }
});


// Поиск ИНН по ФИО + дате рождения + паспорту через api-cloud (nalog.php?type=inn)
router.post('/inn-lookup', async (req, res, next) => {
  try {
    const { person } = req.body || {};
    if (!person) {
      return res.status(400).json({ error: 'PERSON_REQUIRED' });
    }

    const result = await innLookup(person);

    // result: { status: 'ok' | 'empty' | 'error', payload: {...} }
    res.json(result);
  } catch (err) {
    console.error('[counterparty] inn-lookup error', err);
    next(err);
  }
});

// Hook to store additional raw payloads if needed later
router.post('/check/:id/raw', async (req, res) => {
  const entry = await loadResult(req.params.id, req.userId);
  if (!entry) return res.status(404).json({ ok: false, error: 'not_found' });
  await saveRaw(entry.id, req.body, req.userId);
  res.json({ ok: true });
});

module.exports = router;
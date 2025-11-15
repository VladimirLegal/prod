#!/usr/bin/env node

const { pool, query } = require('../db');
const { v4: uuidv4 } = require('uuid');

async function tableExists(tableName) {
  const { rows } = await query('SELECT to_regclass($1) AS exists', [tableName]);
  return !!rows[0]?.exists;
}

async function upsertUser({ id, email, role = 'user', status = 'active', displayName, phone, createdAt, lastLoginAt }) {
  const userId = id || uuidv4();
  const display_name = displayName || email.split('@')[0];
  const existsSql = 'SELECT id FROM users WHERE email = $1 LIMIT 1';
  const { rows } = await query(existsSql, [email]);
  if (rows[0]) {
    await query(
      `UPDATE users
          SET role = $2,
              status = $3,
              display_name = COALESCE($4, display_name),
              phone = COALESCE($5, phone),
              created_at = COALESCE($6, created_at),
              last_login_at = COALESCE($7, last_login_at)
        WHERE id = $1`,
      [rows[0].id, role, status, display_name, phone || null, createdAt || null, lastLoginAt || null]
    );
    return rows[0].id;
  }

  const insertSql = `
    INSERT INTO users (id, email, role, status, display_name, phone, created_at, last_login_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING id
  `;
  const created = await query(insertSql, [
    userId,
    email,
    role,
    status,
    display_name,
    phone || null,
    createdAt || new Date(),
    lastLoginAt || null,
  ]);
  return created.rows[0].id;
}

async function seedUsers() {
  const now = new Date();
  const adminId = await upsertUser({
    email: 'admin@legal-portal.pro',
    role: 'admin',
    status: 'active',
    displayName: 'Администратор',
    phone: '+7 (999) 100-00-01',
    createdAt: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
    lastLoginAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
  });

  const managerId = await upsertUser({
    email: 'manager@legal-portal.pro',
    role: 'manager',
    status: 'active',
    displayName: 'Менеджер',
    phone: '+7 (999) 100-00-02',
    createdAt: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000),
    lastLoginAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
  });

  const randomUsers = Array.from({ length: 8 }).map((_, idx) => ({
    email: `user${idx + 1}@example.com`,
    role: 'user',
    status: idx % 6 === 0 ? 'blocked' : 'active',
    displayName: `Пользователь ${idx + 1}`,
    phone: `+7 (999) 200-0${idx}${idx}`,
    createdAt: new Date(now.getTime() - (idx + 5) * 5 * 24 * 60 * 60 * 1000),
    lastLoginAt: new Date(now.getTime() - (idx + 1) * 12 * 60 * 60 * 1000),
  }));

  const userIds = [];
  for (const u of randomUsers) {
    const id = await upsertUser(u);
    userIds.push(id);
  }

  return { adminId, managerId, userIds };
}

async function seedDocuments(userIds) {
  if (!(await tableExists('documents'))) return;
  const baseHtml = '<h1>Договор аренды</h1><p>Черновик документа.</p>';
  const types = ['lease', 'agreement'];
  const statuses = ['draft', 'ready', 'deleted'];
  const insertSql = `
    INSERT INTO documents (id, owner_id, type, title, status, current_html, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (id) DO NOTHING
  `;

  for (let i = 0; i < 30; i += 1) {
    const ownerId = userIds[i % userIds.length];
    const status = statuses[i % statuses.length];
    const createdAt = new Date(Date.now() - (i + 1) * 3 * 24 * 60 * 60 * 1000);
    await query(insertSql, [
      uuidv4(),
      ownerId,
      types[i % types.length],
      `Документ #${i + 1}`,
      status,
      baseHtml,
      createdAt,
      createdAt,
    ]);
  }
}

async function seedConsents(userIds) {
  if (!(await tableExists('consents'))) return;
  const insertSql = `
    INSERT INTO consents (id, user_id, doc_type, doc_version, signed_at, created_at)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (id) DO NOTHING
  `;

  const versions = ['v1.0', 'v1.1'];
  for (let i = 0; i < 15; i += 1) {
    const userId = userIds[i % userIds.length];
    const version = versions[i % versions.length];
    const signedAt = new Date(Date.now() - (i + 1) * 2 * 24 * 60 * 60 * 1000);
    await query(insertSql, [uuidv4(), userId, 'pdn', version, signedAt, signedAt]);
  }
}

async function seedFeedback(userIds) {
  if (!(await tableExists('feedback'))) return;
  const statuses = ['new', 'in_progress', 'done'];
  const insertSql = `
    INSERT INTO feedback (id, user_id, source, topic, message, status, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (id) DO NOTHING
  `;
  for (let i = 0; i < 8; i += 1) {
    const createdAt = new Date(Date.now() - i * 36 * 60 * 60 * 1000);
    await query(insertSql, [
      uuidv4(),
      userIds[i % userIds.length] || null,
      i % 2 === 0 ? 'form' : 'email',
      `Вопрос ${i + 1}`,
      `Сообщение обратной связи #${i + 1}`,
      statuses[i % statuses.length],
      createdAt,
    ]);
  }
}

async function seedAuditLogs(adminId, managerId, userIds) {
  if (!(await tableExists('audit_logs'))) return;
  const insertSql = `
    INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, meta, ts)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
  `;
  const actions = [
    ['user.update', 'user', () => userIds[Math.floor(Math.random() * userIds.length)]],
    ['doc.export.pdf', 'document', () => uuidv4()],
    ['doc.delete', 'document', () => uuidv4()],
    ['feedback.status', 'feedback', () => uuidv4()],
  ];
  for (let i = 0; i < 15; i += 1) {
    const [action, entityType, entityFn] = actions[i % actions.length];
    const actorId = i % 3 === 0 ? adminId : managerId;
    const actorRole = i % 3 === 0 ? 'admin' : 'manager';
    const ts = new Date(Date.now() - i * 6 * 60 * 60 * 1000);
    await query(insertSql, [
      actorId,
      actorRole,
      action,
      entityType,
      entityFn(),
      JSON.stringify({ sample: true, index: i }),
      ts,
    ]);
  }
}

async function seedAdminNotes(adminId, userIds) {
  if (!(await tableExists('admin_notes'))) return;
  const insertSql = `
    INSERT INTO admin_notes (entity_type, entity_id, author_id, text, created_at)
    VALUES ($1,$2,$3,$4,$5)
  `;
  for (let i = 0; i < 5; i += 1) {
    const createdAt = new Date(Date.now() - i * 12 * 60 * 60 * 1000);
    await query(insertSql, [
      'user',
      userIds[i % userIds.length],
      adminId,
      `Комментарий администратора ${i + 1}`,
      createdAt,
    ]);
  }
}

async function seedTemplates(adminId) {
  if (!(await tableExists('templates'))) return;
  const upsertSql = `
    INSERT INTO templates (id, code, title, type, body, version, updated_at, updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (code) DO UPDATE
      SET title = EXCLUDED.title,
          type = EXCLUDED.type,
          body = EXCLUDED.body,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          updated_by = EXCLUDED.updated_by
  `;
  const templates = [
    {
      code: 'lease.html',
      title: 'Шаблон договора аренды',
      type: 'html',
      body: '<h1>Шаблон аренды</h1><p>Обновите текст шаблона.</p>',
      version: '1.0.0',
    },
    {
      code: 'consent.txt',
      title: 'Согласие на обработку ПДн',
      type: 'txt',
      body: 'Согласие на обработку персональных данных',
      version: '1.0.0',
    },
  ];

  for (const tpl of templates) {
    await query(upsertSql, [uuidv4(), tpl.code, tpl.title, tpl.type, tpl.body, tpl.version, new Date(), adminId]);
  }
}

async function seedSettings(adminId) {
  if (!(await tableExists('app_settings'))) return;
  const upsertSql = `
    INSERT INTO app_settings (key, value, updated_at, updated_by)
    VALUES ($1,$2::jsonb,$3,$4)
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_at = EXCLUDED.updated_at,
          updated_by = EXCLUDED.updated_by
  `;
  const now = new Date();
  const settings = [
    ['consent.current_version', { pdn: 'v1.1' }],
    ['features.mass_export_enabled', { value: true }],
  ];
  for (const [key, value] of settings) {
    await query(upsertSql, [key, JSON.stringify(value), now, adminId]);
  }
}

async function main() {
  try {
    console.log('🌱 Seeding admin data…');
    const { adminId, managerId, userIds } = await seedUsers();
    await seedDocuments([adminId, managerId, ...userIds]);
    await seedConsents([adminId, managerId, ...userIds]);
    await seedFeedback([adminId, managerId, ...userIds]);
    await seedAuditLogs(adminId, managerId, userIds);
    await seedAdminNotes(adminId, userIds);
    await seedTemplates(adminId);
    await seedSettings(adminId);
    console.log('✅ Seed completed');
  } catch (err) {
    console.error('❌ Seed failed:', err);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

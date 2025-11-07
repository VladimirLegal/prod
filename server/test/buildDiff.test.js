const assert = require('assert').strict;
const {
  saveDraft,
  buildDiff,
  clearVersions,
  deleteVersion,
  listVersions,
} = require('../services/documentService');

(async () => {
  const docId = 'diff-smoke-test';

  clearVersions(docId);
  const first = await saveDraft(docId, '<p>Первый вариант</p>');
  const second = await saveDraft(docId, '<p>Первый вариант</p><p>Дополнение</p>');

  const { html } = await buildDiff(docId, 1, 2);

  assert.ok(html.includes('diff-report'), 'Diff отчёт должен содержать контейнер.');
  assert.ok(html.includes('diff-ins'), 'Diff отчёт должен подсвечивать добавленные блоки.');

  const removed = await deleteVersion(docId, first.versionId);
  assert.equal(removed, true, 'Версия должна удаляться из стора.');

  const afterDelete = await listVersions(docId);
  assert.ok(!afterDelete.some(v => v.versionId === first.versionId), 'Удалённая версия не должна присутствовать в списке.');

  const third = await saveDraft(docId, '<p>Третий вариант</p>');
  assert.ok(third.versionId > second.versionId, 'Новые версии получают возрастающий идентификатор.');

  console.log('buildDiff basic scenario: OK');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
# Прогресс рефакторинга document routes

Документ фиксирует состояние после старых инвентаризаций:

- `docs/refactoring/formatting-inventory.md`
- `docs/refactoring/document-routes-inventory.md`
- `docs/refactoring/document-routes-rent-helpers-inventory.md`

Production-код в рамках этой проверки не менялся.

## Executive summary

`server/routes/documentRoutes.js` всё ещё остаётся крупным route-файлом и содержит не только Express orchestration, но и значительную часть rent render/export pipeline. При этом из него уже вынесены несколько безопасных и переиспользуемых helper'ов: маски ввода на клиенте, client-side date/person helpers, server-side person display helpers, contacts builder, group labels, money words helper и общий builder блока зарегистрированных прав / документов-оснований.

Рефакторинг идёт маленькими пакетами. Основное правило сохраняется: не менять поведение документов и не трогать render/export pipeline без snapshot/golden тестов и ручной проверки generated document.

## Уже закрытые пакеты

| Пакет / файл | Текущий статус | Фактическое состояние |
| ------------ | -------------- | --------------------- |
| `docs/refactoring/formatting-inventory.md` | закрыто | Создана первая инвентаризация форматирования, нормализации и сборки текстов. |
| `client/src/utils/inputMasks.js` | закрыто | Файл найден. Вынесены UI-маски `formatDateInput`, `formatPassportInput`, `formatDepartmentCodeInput`. |
| `client/src/utils/dateUtils.js` | закрыто | Файл найден. Вынесены client date helpers: `toDisplayDate`, `parseDateParts`, `toDate`, `calculateAgeOnDate`. |
| `client/src/utils/personIdentity.js` | закрыто | Файл найден. Вынесены client identity helpers: `getFullName`, `splitFullName`, `splitPassport`. |
| `client/src/utils/personNameRu.js` | закрыто | Файл найден. Вынесены client FIO helpers: `splitFio`, `joinFio`, `declineGenitive`. |
| `server/utils/personDisplay.js` | закрыто | Файл найден. Вынесены server person display helpers: `splitPassportSeriesNumber`, `ensureGoda`, `buildPersonTitle` и related person display helpers. `documentRoutes.js` импортирует `splitPassportSeriesNumber` и `ensureGoda`. |
| `server/services/documentTypes/rent/contacts.js` | закрыто | Файл найден. Вынесен `buildContactsHtml`; `documentRoutes.js` использует его для `data.calc.contacts.landlords` и `data.calc.contacts.tenants`. |
| `server/services/documentTypes/rent/groupLabels.js` | закрыто | Файл найден. Вынесены `GROUP_FORMS` и `buildGroupLabels`; route использует helper для labels наймодателей и нанимателей. |
| `server/utils/formatters.js` | закрыто | Файл найден. Добавлен / используется `numberToWordsRuTitleCase`; локальный `rublesToWordsTitleCase` в `documentRoutes.js` больше не найден и больше не нужен. |
| `server/services/documentShared/propertyRights.js` | закрыто | Файл найден. Создан общий builder `buildPropertyRightsBlockHtml` для блока зарегистрированных прав и документов-оснований. Договор найма использует его через адаптер `buildLandlordsBasisHtml(data)` в `documentRoutes.js`. |
| `server/services/documentTypes/rent/ownershipDocs.js` | устаревший промежуточный остаток | Файл найден и экспортирует `insertShareWord`, но текущий `documentRoutes.js` использует общий `server/services/documentShared/propertyRights.js`, а не этот rent-only модуль. Перед удалением нужен отдельный cleanup-пакет с проверкой импортов. |

## Старый пункт инвентаризации → текущий статус

| Зона / helper | Было в inventory | Текущий статус | Комментарий |
| ------------- | ---------------- | -------------- | ----------- |
| input masks | кандидат на безопасный вынос | закрыто | Вынесено в `client/src/utils/inputMasks.js`. |
| client date helpers | кандидат на безопасный вынос после фиксации поведения | закрыто частично | `client/src/utils/dateUtils.js` существует; server-side rent date helpers отдельно не трогались. |
| client identity helpers | кандидат на отделение от UI | закрыто | `client/src/utils/personIdentity.js` существует. |
| client FIO helpers | кандидат на отделение от UI | закрыто | `client/src/utils/personNameRu.js` существует. |
| `splitPassportSeriesNumber` | рекомендованный минимальный server-side шаг | закрыто | Находится в `server/utils/personDisplay.js` и импортируется route-файлом. |
| `ensureGoda` | date/person display helper | закрыто частично | Shared helper находится в `server/utils/personDisplay.js`; `formatDateLongLocal` и `parseAnyDateLocal` остаются в route из-за юридически значимого date behavior. |
| `buildContactsHtml` | rent helper | закрыто | Находится в `server/services/documentTypes/rent/contacts.js`. |
| `GROUP_FORMS` / `buildGroupLabels` | high risk в старой inventory | закрыто маленьким пакетом | Поведение сохранено через перенос в `server/services/documentTypes/rent/groupLabels.js`; route только импортирует `buildGroupLabels`. |
| `rublesToWordsTitleCase` | money helper в `documentRoutes.js` | закрыто | Заменено на `numberToWordsRuTitleCase` из `server/utils/formatters.js`. |
| `buildLandlordsBasisHtml` / `insertShareWord` | ownership docs | закрыто частично / адаптер остался | Общая логика перенесена в `server/services/documentShared/propertyRights.js`; rent adapter `buildLandlordsBasisHtml(data)` пока остаётся в route для маппинга lease data. |
| `parseAnyDateLocal` / `formatDateLongLocal` | date helpers | не трогать | Высокий риск: юридический текст, разные входные форматы, сроки, расписки, доверенности и PDF/DOCX-rendered HTML. |
| representatives grouping | representative helpers | не трогать | Высокий риск: мутирует `data`, влияет на вводную часть, подписи и grouping одного представителя на нескольких лиц. |
| registration clauses | registration helpers | не трогать | Высокий риск: влияет на юридический текст регистрации/проживания и зависит от `lease.html`. |
| receipt/installments | payment HTML | не трогать | Высокий риск: суммы, даты, нумерация денежных условий и HTML расписок/графиков. |
| export preprocessing | PDF/DOCX HTML transforms | не трогать | Высокий риск: влияет на PDF/DOCX export и требует golden/snapshot проверок. |
| `/docs/:id/render` | main render pipeline | не трогать | Большой mutating pipeline, тесно связан с `lease.html`, `documentService` и template data. |

## Что осталось в `server/routes/documentRoutes.js`

Актуальные крупные блоки, которые всё ещё находятся в route-файле:

1. Route / middleware / export orchestration: JSON/urlencoded middleware, editor/render/export/version/draft/diff endpoints.
2. Document type resolution: `DOCUMENT_TYPE_META`, `isUuidValue`, `resolveDocumentType`, `normalizeDocumentType`.
3. Guest cooldown: `_guestCooldown`, `COOLDOWN_MS`, `getGuestKey`, `checkAndSetCooldown`.
4. Date helpers для договора найма: `parseAnyDateLocal`, `formatDateLongLocal`, inline date calculations for rent periods, receipt and installments.
5. `buildDisplayForPerson` and related display preparation used by landlords, tenants and representatives.
6. `normalizeLandlords` / `normalizeTenants` mutating input data before template rendering.
7. Registration helpers: `buildRegistrationClauseForPerson`, `applyRegistrationClauses`, `buildRegistrationText`.
8. Representative grouping helpers: `promoteCommonRepresentative`, `promoteTenantsCommonRepresentative`, `buildRepresentativeGroups`, `buildTenantRepresentativeGroups`, representative keys and named-later flags.
9. Signature decoration: `decorateForSignatures`.
10. Receipt builder: inline `buildReceiptHtml(data)` inside `/docs/:id/render`.
11. Installments schedule builder: inline `buildInstallmentsScheduleHtml(...)` inside `/docs/:id/render`.
12. PDF/DOCX preprocessing: `stripEditorHints`, `enforceInlineAlignment`, `insertDocxPageBreaks`.
13. Main `/docs/:id/render` pipeline: rent and maternity-capital branching, data normalization, calc mutations, template rendering and response assembly.

## Do not move yet

| Зона | Причина |
| ---- | ------- |
| `parseAnyDateLocal` | Влияет на юридический текст дат, сроки найма, доверенности, расписки и графики; требует snapshot/golden тестов. |
| `formatDateLongLocal` | Влияет на русский юридический date text и зависит от текущего поведения `lease.html`; требует golden тестов. |
| `buildDisplayForPerson` | Формирует display structure для шаблона и влияет на паспортные/регистрационные формулировки. |
| `normalizeLandlords` | Мутирует `data.landlords`, влияет на вводную часть, основания прав, представителей и подписи. |
| `normalizeTenants` | Мутирует `data.tenants`, влияет на вводную часть, представителей, регистрацию и подписи. |
| `buildRegistrationClauseForPerson` | Влияет на юридический текст регистрации/проживания; зависит от lease fields. |
| `applyRegistrationClauses` | Мутирует данные сторон и calc для шаблона; требует fixtures по вариантам регистрации. |
| `buildRegistrationText` | Формирует видимый legal text; нельзя менять без snapshot. |
| `promoteCommonRepresentative` | Мутирует `data.landlordsRepresentative` и flags; влияет на группировку и вводную часть. |
| `promoteTenantsCommonRepresentative` | Мутирует `data.tenantsRepresentative` и flags; влияет на группировку и вводную часть. |
| `buildRepresentativeGroups` | Группирует наймодателей по представителю; ошибка меняет юридические роли и подписи. |
| `buildTenantRepresentativeGroups` | Группирует нанимателей по представителю; ошибка меняет юридические роли и подписи. |
| `buildPersonShortHtml` | Видимый HTML legal description; зависит от escaping, падежей и `lease.html`. |
| `buildPersonShortHtmlWithCase` | Видимый HTML legal description с падежами; зависит от representatives rendering. |
| `decorateForSignatures` | Мутирует массивы участников для подписей; зависит от `lease.html` repeats. |
| `buildReceiptHtml` | Влияет на расписку, суммы, даты, no-claims text и HTML; требует golden тестов. |
| `buildInstallmentsScheduleHtml` | Влияет на график платежей, суммы, даты, падежи и HTML; требует golden тестов. |
| `stripEditorHints` | Влияет на HTML перед export; нужен snapshot HTML до/после. |
| `enforceInlineAlignment` | Влияет на PDF/DOCX rendering; нужен export regression test. |
| `insertDocxPageBreaks` | Влияет на DOCX pagination; нужен DOCX golden/manual check. |
| PDF/DOCX export endpoints | Export pipeline меняет HTML и файлы; нельзя переносить без проверки generated PDF/DOCX. |
| main `/docs/:id/render` pipeline | Центральный mutating render pipeline, зависит от `lease.html`, `documentService`, calc fields and document type branching. |

## Следующие безопасные кандидаты для маленьких пакетов

1. **Пакет: document-only update of inventory status** — текущая задача. Только `docs/refactoring/refactoring-progress.md`, без production-кода.
2. **Пакет: точечная инвентаризация `escapeHtml` без замены в коде** — описать все локальные escaping helpers и потребителей; не менять импорты и generated HTML.
3. **Пакет: route-level document type meta inventory** — отдельно описать `DOCUMENT_TYPE_META`, `resolveDocumentType`, `normalizeDocumentType` и имена export-файлов; переносить только если появится тест/fixture route behavior.
4. **Пакет: подготовить fixtures/snapshot для render договора найма перед переносом представителей** — зафиксировать кейсы: один представитель, общий представитель, разные представители, без представителей.
5. **Пакет: подготовить tests/fixtures для registration clauses** — зафиксировать варианты постоянной/временной/отсутствующей регистрации и совпадения с адресом квартиры.

Не предлагать следующим шагом прямой перенос representatives, registration или render pipeline: сначала нужны fixtures/snapshots.

## Рекомендованная стратегия дальнейшего рефакторинга

1. Один пакет — одна маленькая группа helper'ов или один документ inventory.
2. Сначала inventory / fixtures / snapshot expectations.
3. Потом перенос helper без изменения public API и шаблонных полей.
4. Потом проверка `node -c` для затронутых server files.
5. Потом ручная проверка generated document для релевантного сценария.
6. Потом commit с узким описанием пакета.

## Проверки текущей задачи

После создания этого документа нужно проверить рабочее дерево:

```bash
git diff --name-only
git status --short
```

Ожидаемый изменённый файл: `docs/refactoring/refactoring-progress.md`.

Не должны быть staged/modified production-файлы. Untracked-файлы уведомления о продаже доли (`client/src/pages/ShareSaleNoticeWizard.js`, `client/src/utils/shareSaleNotice/`) не должны добавляться, форматироваться, изменяться или попадать в commit.

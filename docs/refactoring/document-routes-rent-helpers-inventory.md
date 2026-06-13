\# Инвентаризация rent helpers в `server/routes/documentRoutes.js`



Документ описывает состояние `server/routes/documentRoutes.js` после выполненных пакетов рефакторинга, включая уже существующий общий `server/utils/personDisplay.js` и вынесенную сборку соглашения по материнскому капиталу в `server/services/documentTypes/maternityCapitalShares.js`.



Production-код в рамках этой инвентаризации не менялся.



\## 1. Executive summary



`server/routes/documentRoutes.js` всё ещё содержит значительный объём логики, которая относится не к Express routes, а к подготовке договора найма (`lease.html`): нормализация наймодателей/нанимателей, display-объекты физических лиц, регистрационные фразы, представители, группировка одного представителя на нескольких лиц, основания права собственности, контакты, подписи, платежи, суммы прописью и подготовка HTML к PDF/DOCX export.



После пакетов 6–8 из файла уже вынесен `splitPassportSeriesNumber`, а материнский капитал в `/render` в основном делегируется в `buildMaternityCapitalSharesRenderData`. Тем не менее rent pipeline остаётся монолитным: большинство helper-функций мутируют `data`, `data.calc`, `landlords`, `tenants`, `representative`, `documents` и `terms`, а затем эти поля напрямую читаются шаблоном `lease.html`.



Главный вывод: \*\*следующий рефакторинг должен быть очень маленьким\*\*. Без snapshot/golden-тестов нельзя переносить крупные группы: вводную часть договора найма, представителей, registration clauses, раздел 1.2, HTML для расписок/графиков и export preprocessing.



\## 2. Группы helper-функций в `documentRoutes.js`



\### Date helpers



\* `parseAnyDateLocal`

\* `formatDateLongLocal`

\* `ensureGoda`

\* inline date helpers внутри `/docs/:id/render`, включая расчёт сроков, графиков платежей и форматирование дат доверенностей через `decorateForSignatures`.



Назначение: парсить разные пользовательские форматы дат и превращать их в юридический русский текст для договора найма, расписок, сроков и export-rendered HTML.



\### Person/display helpers



\* `buildDisplayForPerson`

\* `buildPersonShortHtml`

\* `buildPersonShortHtmlWithCase`

\* `normalizeFio`

\* `sanitizeAddress`

\* `escapeHtml`

\* `buildRegistrationText`

\* `decorateForSignatures`

\* `assignLandlordsNamedAs`

\* `assignTenantsNamedAs`



Назначение: собрать display-поля физического лица, короткие HTML-карточки, подписи и именования «Наймодатель / Наниматель».



\### Registration helpers



\* `buildRegistrationClauseForPerson`

\* `applyRegistrationClauses`

\* `buildRegistrationText`



Назначение: строить юридически значимые фразы регистрации/проживания для наймодателей и нанимателей, включая варианты отсутствия регистрации, временной регистрации, прежней регистрации и связи с адресом квартиры.



\### Representative/grouping helpers



\* `ensureRepresentativesDisplay`

\* `ensureTenantsRepresentativesDisplay`

\* `assignTenantsNamedAs`

\* `markShowNamedLaterForTenants`

\* `promoteTenantsCommonRepresentative`

\* `buildTenantRepresentativeGroups`

\* `normalizeFio`

\* `buildRepKey`

\* `promoteCommonRepresentative`

\* `buildRepresentativeGroups`

\* `markShowNamedLaterForLandlords`

\* `assignLandlordsNamedAs`



Назначение: нормализовать представителей, находить одного общего представителя, строить группы представляемых лиц и проставлять display-поля, от которых зависит вводная часть и подписи договора найма.



\### Ownership/basis documents helpers



\* `insertShareWord`

\* `buildLandlordsBasisHtml`



Назначение: собрать раздел 1.2 об основаниях права собственности наймодателей, включая документы, доли, номера регистрации и HTML-структуру.



\### Payment/amount helpers



\* `rublesToWordsTitleCase`

\* вложенные helpers внутри `rublesToWordsTitleCase`: `triadToWords`, `unitName`

\* inline helpers в `/render` для оплаты, расписок, депозитов, предоплаты, графиков платежей и нумерации §5.



Назначение: формировать суммы прописью, платежные условия, расписку, графики платежей и динамическую нумерацию денежных пунктов.



\### Contacts/signature helpers



\* `buildContactsHtml`

\* `decorateForSignatures`



Назначение: собрать HTML блока контактов и дополнить массивы участников служебными `current` / `calc` для шаблонных повторов подписей.



\### Export/render route logic



\* middleware `router.use(express.json(...))`, `router.use(express.urlencoded(...))`

\* `resolveDocumentType`

\* `normalizeDocumentType`

\* `getGuestKey`

\* `checkAndSetCooldown`

\* `stripEditorHints`

\* `enforceInlineAlignment`

\* `insertDocxPageBreaks`

\* routes: `/docs/:id/editor`, `/docs/:id/render`, `/docs/:id/export/pdf`, `/docs/:id/export/docx`, `/versions`, `/clear`, `/drafts`, `/diff`.



Назначение: Express endpoint orchestration, render pipeline, export pipeline, version/draft/diff operations and guest cooldown.



\### Maternity-capital-specific logic



В `documentRoutes.js` сейчас остаётся только маршрутизация/делегирование для материнского капитала:



\* `DOCUMENT\_TYPE\_META.maternity\_capital\_shares`

\* `resolveDocumentType` / `normalizeDocumentType` распознают `maternity\_capital\_shares`

\* `/docs/:id/render` при `docType === 'maternity\_capital\_shares'` вызывает `buildMaternityCapitalSharesRenderData`

\* PDF/DOCX file names выбираются через `DOCUMENT\_TYPE\_META`.



Основная сборка соглашения МК уже не живёт в `documentRoutes.js`.



\## 3. Таблица функций и блоков



| № | Функция / блок | Назначение | Область | Зависит от `lease.html` | Зависит от данных | Можно ли безопасно вынести без изменения поведения |

| - | -------------- | ---------- | ------- | ---------------------- | ----------------- | ------------------------------------------------- |

| 1 | `router.use(express.json(...))` | Middleware для больших JSON/HTML payload. | both | Нет | request body | Да, но нет смысла: это router setup. |

| 2 | `router.use(express.urlencoded(...))` | Middleware для URL-encoded payload. | both | Нет | request body | Да, но лучше оставить в router. |

| 3 | `DOCUMENT\_TYPE\_META` | Метаданные типа документа: templateType, имена PDF/DOCX. | both | Частично: выбирает template/export names | docType | Средний риск; можно вынести в `server/services/documentTypes/meta.js`, но это не rent helper. |

| 4 | `isUuidValue` | Проверяет UUID для DB lookup типа документа. | both | Нет | `req.params.id` | Низкий риск, но связан с route resolution. |

| 5 | `resolveDocumentType` | Определяет тип документа по query/body/data/DB. | both | Нет | `req`, `documents.type`, fallback data | Средний риск: DB + route behavior. Оставить до отдельного routing пакета. |

| 6 | `normalizeDocumentType` | Нормализует alias `maternity\_capital\_shares\_agreement`. | both | Нет | docType | Низкий риск, но лучше рядом с resolver. |

| 7 | `getGuestKey` | Возвращает ключ гостя по `X-Consent-Id`. | both/export | Нет | auth/user headers | Низкий риск, но относится к cooldown middleware. |

| 8 | `checkAndSetCooldown` | Ограничивает экспорт для гостей. | both/export | Нет | `\_guestCooldown`, `COOLDOWN\_MS` | Средний риск из-за UX/API поведения export. |

| 9 | `parseAnyDateLocal` | Парсит `DD.MM.YYYY`, `DD.MM.YY`, `YYYY-MM-DD`, fallback `new Date`. | rent | Косвенно: даты попадают в `lease.html` | `terms`, `documents`, `representative`, payment dates | Средний/высокий риск; похоже на `personDisplay.parseDateLocal`, но fallback отличается. |

| 10 | `GROUP\_FORMS` | Русские падежи «Наймодатель/Наниматель». | rent | Да, текст вводной части и блоков representatives | `calc.landlordsCountIsOne`, `calc.tenantsCountIsOne` | Высокий риск: влияет на вводную часть и group labels. |

| 11 | `buildGroupLabels` | Возвращает набор падежей для стороны. | rent | Да | `data.calc.\*Labels` | Высокий риск; переносить только с snapshot tests. |

| 12 | `formatDateLongLocal` | Форматирует дату как `1 января 2026 года`. | rent | Да | даты паспорта, доверенности, сроков, платежей | Средний/высокий риск; похожа на `personDisplay.formatDateLongRu + ensureGoda`, но возвращает уже с `года`. |

| 13 | `ensureGoda` | Добавляет слово `года`, если его нет. | rent | Да | legal date strings | Средний риск; дублирует `personDisplay.ensureGoda`, но перенос может изменить пробелы/окончания. |

| 14 | `buildDisplayForPerson` | Создаёт `display` для человека: passport series/number, long issueDate, genderWord, registrationVerb, escaped text. | rent | Да | person passport/gender/registration | Средний риск; частично дублирует `personDisplay.getPassportParts/getGenderWordRu/getRegisteredVerbRu/buildPersonTitle`, но структура `display` завязана на `lease.html`. |

| 15 | `ensureRepresentativesDisplay` | Добавляет `display` представителям наймодателей. | rent | Да | `landlords\[].representative` | Средний риск; можно позже вынести вместе с representative display. |

| 16 | `ensureTenantsRepresentativesDisplay` | Добавляет `display` представителям нанимателей. | rent | Да | `tenants\[].representative` | Средний риск; симметрично landlord logic. |

| 17 | `normalizeTenants` | Нормализует массив нанимателей и проставляет `display`. | rent | Да | `data.tenants` | Высокий риск: мутирует данные перед шаблоном. |

| 18 | `normalizeLandlords` | Нормализует массив наймодателей и проставляет `display`. | rent | Да | `data.landlords` | Высокий риск: влияет на всю вводную часть. |

| 19 | `assignTenantsNamedAs` | Проставляет `Наниматель`, `Наниматель N`, `именуемый/именуемая`. | rent | Да | `tenants`, `calc.tenantRepGroups` | Высокий риск: group labels and visible text. |

| 20 | `markShowNamedLaterForTenants` | Управляет показом named-later фраз для нанимателей/представляемых. | rent | Да | `tenants`, `tenantRepGroups`, common representative flags | Высокий риск: влияет на grouped representative rendering. |

| 21 | `promoteTenantsCommonRepresentative` | Находит общего представителя всех нанимателей и переносит в `data.tenantsRepresentative`. | rent | Да | `tenants\[].representative`, `calc` | Высокий риск: меняет структуру данных и шаблонные ветки. |

| 22 | `buildTenantRepresentativeGroups` | Группирует нанимателей по представителю. | rent | Да | `tenants`, `representative`, `calc.tenantRepGroups` | Высокий риск: один представитель на нескольких лиц. |

| 23 | `normalizeFio` | Нормализует ФИО для сравнения. | rent | Нет напрямую | representatives grouping | Средний риск; технический helper, но влияет на группировку. |

| 24 | `buildRepKey` | Строит ключ представителя по ФИО/доверенности/паспортным данным. | rent | Нет напрямую | representative identity | Высокий риск: неправильный key ломает grouping. |

| 25 | `sanitizeAddress` | Очищает адрес от хвостовых запятых/пробелов. | rent | Да | registration/address fields | Низкий/средний риск; похож на `personDisplay.getRegistrationAddress`, но локально проще. |

| 26 | `buildRegistrationClauseForPerson` | Строит registration clause для одного лица. | rent | Да | `registrationType`, `registrationAddress`, `address`, apartment address | Высокий риск: юридические фразы регистрации. |

| 27 | `applyRegistrationClauses` | Проставляет registration display всем наймодателям/нанимателям/представителям. | rent | Да | landlords, tenants, representatives, apartment address | Высокий риск: массовая мутация display-полей. |

| 28 | `promoteCommonRepresentative` | Находит общего представителя всех наймодателей. | rent | Да | landlords representatives, calc | Высокий риск: вводная часть наймодателей. |

| 29 | `escapeHtml` | HTML escaping для локальных builders. | rent | Да | all HTML builder inputs | Низкий риск технически, но глобальная замена опасна из-за double-escape. |

| 30 | `buildPersonShortHtml` | HTML-карточка лица в именительном падеже. | rent | Да | person display/name/passport/registration | Высокий риск: меняет вид вводной части и representatives. |

| 31 | `buildPersonShortHtmlWithCase` | HTML-карточка лица с падежом/представлением. | rent | Да | person, `fioCase`, registration | Высокий риск: падежи/HTML. |

| 32 | `buildRegistrationText` | Альтернативная сборка текста регистрации. | rent | Да | registration fields | Высокий риск; похожа на `buildRegistrationClauseForPerson` и `personDisplay.buildRegistrationPhrase`, но формулировки отличаются. |

| 33 | `buildRepresentativeGroups` | Группирует наймодателей по представителю. | rent | Да | landlords representative data | Высокий риск: один представитель на нескольких наймодателей. |

| 34 | `markShowNamedLaterForLandlords` | Управляет показом named-later фраз для наймодателей/представляемых. | rent | Да | landlords, landlordRepGroups | Высокий риск. |

| 35 | `insertShareWord` | Добавляет слово «доля» в title при необходимости. | rent | Да, раздел 1.2 | ownership document titles | Средний риск; маленький helper, но связан с юридическим текстом. |

| 36 | `buildLandlordsBasisHtml` | Собирает HTML раздела 1.2 об основаниях права собственности. | rent | Да | landlords, documents, shares, registration numbers/dates | Высокий риск: раздел 1.2. |

| 37 | `rublesToWordsTitleCase` | Переводит рубли в слова с заглавной буквы. | rent | Да | rent/deposit/payment amounts | Средний риск; лучше покрыть unit tests перед переносом. |

| 38 | `buildContactsHtml` | Строит HTML контактов `ФИО: тел.; email`. | rent | Да | participants contacts | Низкий/средний риск; отдельный маленький HTML helper. |

| 39 | `decorateForSignatures` | Обогащает участников для блока подписей: `current`, index, formatted attorney date, calc. | rent | Да | landlords, tenants, representatives, calc | Средний/высокий риск: подписи и data-repeat. |

| 40 | `assignLandlordsNamedAs` | Проставляет `Наймодатель`, `Наймодатель N`, named-later для наймодателей и групп. | rent | Да | landlords, landlordRepGroups | Высокий риск: вводная часть договора. |

| 41 | `stripEditorHints` | Удаляет `data-hint` элементы из HTML перед export. | both/export | Нет к lease структуре, но зависит от editor HTML | html | Средний риск: export fidelity. |

| 42 | `enforceInlineAlignment` | Проставляет inline alignment для headings/paragraphs перед PDF. | both/export | Да, фактический HTML всех шаблонов | html | Высокий риск для PDF/DOCX визуального вида. |

| 43 | `insertDocxPageBreaks` | Добавляет page breaks перед приложениями/распиской для DOCX. | rent/export | Да | rendered headings | Высокий риск: DOCX layout. |

| 44 | `GET /docs/:id/editor` | Возвращает свежий шаблон для редактора. | both | Да: выбирает template | docType/template info | Оставить в router. |

| 45 | `POST /docs/:id/render` | Главный render pipeline: для МК делегирует builder, для rent мутирует `data` и рендерит lease. | both, rent-heavy | Да | calc, landlords, tenants, representative, documents, terms | `do\_not\_move\_yet`: главный опасный pipeline. |

| 46 | maternity branch inside `/render` | Вызывает `buildMaternityCapitalSharesRenderData` и `renderFinalHtml`. | maternity\_capital\_shares | Зависит от MК template, не lease | formData | Не rent helper; оставить до отдельного document-type routing пакета. |

| 47 | rent inline normalization inside `/render` | Большой блок расчёта `data.calc`, terms, payments, receipt, installments, tables. | rent | Да | all formData | `do\_not\_move\_yet`: слишком много side effects. |

| 48 | `POST /docs/:id/export/pdf` | Рендерит HTML и экспортирует PDF с cooldown для гостей. | both/export | Да, итоговый HTML | html, data, auth/cooldown | Не переносить вместе с helpers. |

| 49 | `POST /docs/:id/export/docx` | Рендерит HTML, чистит hints, добавляет page breaks и экспортирует DOCX. | both/export | Да | html, data, auth | Не переносить вместе с helpers. |

| 50 | versions/drafts/diff/clear routes | Управляют версиями, черновиками, diff. | both | Нет | document service | Не rent helpers. |



\## 4. Сравнение с `server/utils/personDisplay.js`



В `server/utils/personDisplay.js` уже есть:



\* `splitPassportSeriesNumber`

\* `text`

\* `getPersonFullName`

\* `normalizeGender`

\* `getGenderWordRu`

\* `getRegisteredVerbRu`

\* `parseDateLocal`

\* `formatDateLongRu`

\* `ensureGoda`

\* `getPassportParts`

\* `getRegistrationAddress`

\* `buildRegistrationPhrase`

\* `buildPersonTitle`



\### Уже фактически вынесено / не дублируется напрямую



\* `splitPassportSeriesNumber` уже импортируется из `server/utils/personDisplay.js`. Локальной функции в `documentRoutes.js` больше быть не должно.



\### Дублирует или частично дублирует `personDisplay.js`



| Логика в `documentRoutes.js` | Аналог в `personDisplay.js` | Степень совпадения | Почему нельзя просто заменить сейчас |

| --------------------------- | --------------------------- | ------------------ | ------------------------------------ |

| `parseAnyDateLocal` | `parseDateLocal` | Частично похоже | `parseAnyDateLocal` допускает fallback `new Date(s)`; `personDisplay.parseDateLocal` строже и валидирует дату. Замена может изменить legal dates. |

| `formatDateLongLocal` | `formatDateLongRu` + `ensureGoda` | Частично похоже | Rent helper возвращает строку со словом `года`; `formatDateLongRu` — без `года`. Нужно проверить все места использования. |

| локальный `ensureGoda` | `ensureGoda` | Похоже | Вероятно можно вынести, но сначала проверить trailing spaces/case and existing date strings. |

| `buildDisplayForPerson` passport/gender/registration parts | `getPassportParts`, `getGenderWordRu`, `getRegisteredVerbRu`, `buildPersonTitle` | Частично похоже | `buildDisplayForPerson` создаёт объект `display`, который напрямую ожидает `lease.html`; `buildPersonTitle` возвращает plain text title. |

| `sanitizeAddress` | `getRegistrationAddress` | Частично похоже | `sanitizeAddress` работает с готовой строкой; `getRegistrationAddress` выбирает поле из person. |

| `buildRegistrationClauseForPerson` / `buildRegistrationText` | `buildRegistrationPhrase` | Похоже по зоне ответственности, но отличается текстом | Rent registration clauses завязаны на адрес квартиры и варианты проживания; замена меняет юридические формулировки. |

| `normalizeFio` / `fullName`-подобные inline операции | `getPersonFullName`, `text` | Частично похоже | В rent grouping важны правила сравнения ФИО и representative keys; изменение нормализации ломает grouping. |



\### Нельзя переносить без изменения `lease.html`



Эти helpers создают поля или HTML, которые шаблон договора найма читает напрямую:



\* `buildDisplayForPerson`

\* `ensureRepresentativesDisplay`

\* `ensureTenantsRepresentativesDisplay`

\* `normalizeTenants`

\* `normalizeLandlords`

\* `assignTenantsNamedAs`

\* `assignLandlordsNamedAs`

\* `markShowNamedLaterForTenants`

\* `markShowNamedLaterForLandlords`

\* `buildRepresentativeGroups`

\* `buildTenantRepresentativeGroups`

\* `promoteCommonRepresentative`

\* `promoteTenantsCommonRepresentative`

\* `applyRegistrationClauses`

\* `buildPersonShortHtml`

\* `buildPersonShortHtmlWithCase`

\* `buildLandlordsBasisHtml`

\* `decorateForSignatures`



Причина: они не только форматируют данные, но и формируют контракт между render-data и `lease.html` (`display.\*`, `calc.\*`, `current.\*`, groups, represented lists, raw HTML fragments).



\## 5. Опасные зоны



Любое изменение может сломать следующие части:



\### Вводная часть договора найма



Опасны:



\* `normalizeLandlords`

\* `normalizeTenants`

\* `assignLandlordsNamedAs`

\* `assignTenantsNamedAs`

\* `buildGroupLabels`

\* `buildPersonShortHtml`

\* `buildPersonShortHtmlWithCase`

\* `/render` inline calculation of counts and labels.



Риск: изменятся «Наймодатель/Наймодатели», «Наниматель/Наниматели», named-later labels, падежи и порядок вывода лиц.



\### Представители наймодателей



Опасны:



\* `ensureRepresentativesDisplay`

\* `promoteCommonRepresentative`

\* `buildRepresentativeGroups`

\* `markShowNamedLaterForLandlords`

\* `buildRepKey`

\* `normalizeFio`.



Риск: один представитель может перестать группироваться на нескольких наймодателей или появится дублирование представителя в тексте.



\### Представители нанимателей



Опасны:



\* `ensureTenantsRepresentativesDisplay`

\* `promoteTenantsCommonRepresentative`

\* `buildTenantRepresentativeGroups`

\* `markShowNamedLaterForTenants`

\* `assignTenantsNamedAs`.



Риск: ломается симметрия tenant representative blocks and common representative paths.



\### Группировка одного представителя на нескольких лиц



Опасны:



\* `buildRepKey`

\* `normalizeFio`

\* `buildRepresentativeGroups`

\* `buildTenantRepresentativeGroups`

\* `promoteCommonRepresentative`

\* `promoteTenantsCommonRepresentative`.



Риск: малое изменение ключа или сравнения ФИО меняет результат группировки.



\### Раздел 1.2 об основаниях права собственности



Опасны:



\* `insertShareWord`

\* `buildLandlordsBasisHtml`

\* любые inline fields для ownership documents в `/render`.



Риск: меняются формулировки документов-оснований, доли, номера регистрации и HTML раздела.



\### Экспорт PDF/DOCX



Опасны:



\* `stripEditorHints`

\* `enforceInlineAlignment`

\* `insertDocxPageBreaks`

\* `/export/pdf`

\* `/export/docx`.



Риск: визуально меняется PDF/DOCX, ломаются page breaks, alignment, очищение editor hints или auth/cooldown behavior.



\## 6. Рекомендации по следующему безопасному пакету



\### Вариант 9.1 — вынести только `buildContactsHtml`



\*\*Кандидаты:\*\*



\* `buildContactsHtml`



\*\*Новый файл:\*\*



\* `server/services/documentTypes/rent/contacts.js` или `server/utils/contactsHtml.js`



\*\*Риск:\*\* низкий / средний.



\*\*Почему относительно безопасно:\*\* helper изолирован, принимает список и возвращает простой HTML контактов. Он не мутирует `data`, не влияет на representatives grouping, не меняет `calc` и не связан с датами/регистрацией.



\*\*Что нужно проверить:\*\* escaping, формат `ФИО: тел.; email`, fallback `—`, отсутствие контактов.



\### Вариант 9.2 — вынести date helpers только с golden tests



\*\*Кандидаты:\*\*



\* `parseAnyDateLocal`

\* `formatDateLongLocal`

\* `ensureGoda`



\*\*Новый файл:\*\*



\* `server/services/documentTypes/rent/dateHelpers.js`



\*\*Риск:\*\* средний / высокий.



\*\*Почему не первый выбор:\*\* даты попадают в паспортные данные, доверенности, сроки договора, платежи, расписку и export. Кроме того, `parseAnyDateLocal` отличается от `personDisplay.parseDateLocal` fallback-логикой.



\*\*Минимальные тесты:\*\* `DD.MM.YYYY`, `DD.MM.YY`, `YYYY-MM-DD`, invalid input, already formatted strings, use cases for attorney dates and payment dates.



\### Вариант 9.3 — вынести только `insertShareWord`



\*\*Кандидаты:\*\*



\* `insertShareWord`



\*\*Новый файл:\*\*



\* `server/services/documentTypes/rent/ownershipDocs.js`



\*\*Риск:\*\* средний.



\*\*Почему не совсем безопасно:\*\* функция маленькая, но влияет на раздел 1.2 об основаниях права собственности. Даже маленькая правка может изменить юридический текст документа-основания.



\*\*Минимальные тесты:\*\* titles with/without доля, punctuation, uppercase/lowercase, no double insertion.



\### Рекомендуемый следующий пакет



\*\*Рекомендуемый вариант 9.1: вынести только `buildContactsHtml`\*\*.



Это самый маленький rent-helper с наименьшим количеством зависимостей. Его можно вынести без изменения `lease.html`, без затрагивания `/render` pipeline и без риска для представителей, registration clauses, ownership documents, PDF/DOCX export или материнского капитала. Перед переносом достаточно smoke/unit-тестов на HTML escaping и fallback `—`.



\## 7. Что пока не переносить



Пока не переносить:



\* основной `/docs/:id/render` pipeline;

\* `buildDisplayForPerson` и массовую замену на `buildPersonTitle`;

\* `normalizeLandlords` / `normalizeTenants`;

\* representative common/group logic для наймодателей и нанимателей;

\* `buildRegistrationClauseForPerson`, `applyRegistrationClauses`, `buildRegistrationText`;

\* `buildPersonShortHtml`, `buildPersonShortHtmlWithCase`;

\* `buildLandlordsBasisHtml` целиком;

\* payment/receipt/installments inline blocks;

\* `rublesToWordsTitleCase` без unit tests;

\* `stripEditorHints`, `enforceInlineAlignment`, `insertDocxPageBreaks`;

\* PDF/DOCX endpoints;

\* любые изменения `lease.html` одновременно с выносом helpers;

\* maternity-capital render delegation, так как она уже находится в отдельном document type service.




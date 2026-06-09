\# Инвентаризация `server/routes/documentRoutes.js`



Пакет 5: документационная ревизия `server/routes/documentRoutes.js` перед server-side рефакторингом. Production-код не менялся.



\## Executive summary



`server/routes/documentRoutes.js` сейчас является не только Express router, но и крупным rent document builder: внутри находятся routes, middleware, определение типа документа, cooldown, подготовка `data.calc`, русская грамматика, даты, паспортные display helpers, регистрационные фразы, представители, HTML-сборка, расписка, графики платежей и PDF/DOCX pre-processing.



Главный вывод: \*\*файл нельзя безопасно рефакторить одним пакетом\*\*. Самые рискованные зоны — `/docs/:id/render`, representative grouping, registration clauses, даты юридического текста, money words, receipt/installments HTML и export-related HTML transformations. Для пакета 6 рекомендуется самый маленький server-side шаг: вынести только `splitPassportSeriesNumber` в отдельный rent/personDisplay helper без переноса `buildDisplayForPerson` и без изменения render pipeline.



\## 1. Общая картина



В `documentRoutes.js` найдено примерно \*\*65 функций, констант, route/middleware-блоков и крупных inline-блоков\*\*. Основные группы логики:



\* Express middleware и endpoints: editor, render, PDF/DOCX export, versions, drafts, diff.

\* Document type resolution для `rent` и `maternity\_capital\_shares`.

\* Guest cooldown для export.

\* Date parsing/formatting для юридического текста и payment schedule.

\* Passport display splitting.

\* Русская грамматика: падежи сторон, глаголы, числительные, суммы прописью.

\* Person display builders: gender, passport, dates, named-as labels.

\* Registration text builders.

\* Landlord/tenant normalization.

\* Representative normalization and grouping.

\* HTML builders for people, ownership docs, contacts, receipt, installments.

\* Template/export preparation: stripping editor hints, inline alignment, DOCX page breaks.

\* Delegation to `server/services/documentTypes/maternityCapitalShares.js` for maternity capital shares.



Файл опасен для одномоментного рефакторинга, потому что большинство helpers меняют итоговый HTML договора или мутируют `data` перед `renderFinalHtml`. Нужно выделять маленькие группы с тестами и не переносить route/export pipeline вместе с document text builders.



\## 2. Легенда типов и колонок



Колонки таблицы:



\* \*\*Имя / блок\*\* — локальная функция, константа, route или крупный inline-блок.

\* \*\*Тип\*\* — классификация ответственности: `express\_route`, `middleware`, `document\_type\_resolver`, `date\_parser`, `date\_formatter`, `passport\_formatter`, `person\_display\_builder`, `registration\_text\_builder`, `representative\_normalizer`, `representative\_group\_builder`, `landlord\_tenant\_normalizer`, `ru\_grammar`, `html\_builder`, `template\_preparer`, `render\_data\_preparer`, `export\_related`, `db\_related`, `cooldown\_related`, `debug\_or\_logging`, `unknown\_or\_mixed`.

\* \*\*Где используется\*\* — документная область: `rent`, `maternity\_capital\_shares`, `both`, `unknown`.

\* \*\*Риск переноса\*\* — `low`, `medium`, `high`, `do\_not\_move\_yet`.

\* \*\*Куда потенциально вынести\*\* — будущая область, если перенос будет запланирован отдельным пакетом.



\## 3. Таблица функций и блоков



| № | Имя / блок | Тип | Что делает | Где используется | Риск переноса | Куда потенциально вынести | Комментарий |

| - | ---------- | --- | ---------- | ---------------- | ------------- | ------------------------- | ----------- |

| 1 | `router.use(express.json({ limit: '10mb' }))` | middleware | Подключает JSON body parser для больших HTML payload. | both | low | keep\_in\_documentRoutes\_for\_now | Инфраструктурный middleware. |

| 2 | `router.use(express.urlencoded(...))` | middleware | Подключает URL-encoded parser. | both | low | keep\_in\_documentRoutes\_for\_now | Инфраструктурный middleware. |

| 3 | imports from `documentService` | unknown\_or\_mixed | Подключает render/export/version/template/table helpers. | both | medium | keep\_in\_documentRoutes\_for\_now | Показывает плотную связку route с service layer. |

| 4 | `exportHtmlToDocxBuffer` import | export\_related | DOCX export dependency. | both | medium | keep\_in\_documentRoutes\_for\_now | Export dependency, не helper. |

| 5 | `buildMaternityCapitalSharesRenderData` import | render\_data\_preparer | Делегирует сборку render-data маткапитала отдельному builder. | maternity\_capital\_shares | medium | keep\_in\_documentRoutes\_for\_now | Уже вынесено в отдельный document type service. |

| 6 | `query` import | db\_related | DB-запрос для определения типа документа. | both | medium | keep\_in\_documentRoutes\_for\_now | Используется в `resolveDocumentType`. |

| 7 | `\_guestCooldown` | cooldown\_related | In-memory Map состояния cooldown. | both | medium | keep\_in\_documentRoutes\_for\_now | Stateful; вынос отдельно от document refactor. |

| 8 | `COOLDOWN\_MS` | cooldown\_related | Константа 15 минут для guest cooldown. | both | low | keep\_in\_documentRoutes\_for\_now | Связана с `\_guestCooldown`. |

| 9 | `DOCUMENT\_TYPE\_META` | document\_type\_resolver | Метаданные типа документа и имена PDF/DOCX файлов. | both | medium | keep\_in\_documentRoutes\_for\_now | Может уйти в document type registry позже. |

| 10 | `isUuidValue` | document\_type\_resolver | Проверяет, похож ли id на UUID. | both | low | `unknown` | Малый helper, но не приоритет. |

| 11 | `resolveDocumentType(req, fallbackData)` | document\_type\_resolver | Определяет тип документа из query/body/data/DB. | both | high | keep\_in\_documentRoutes\_for\_now | Затрагивает route contract и DB fallback. |

| 12 | `normalizeDocumentType(type)` | document\_type\_resolver | Нормализует alias `maternity\_capital\_shares\_agreement`. | both | low | keep\_in\_documentRoutes\_for\_now | Малый route-level helper. |

| 13 | `getGuestKey(req)` | cooldown\_related | Возвращает ключ гостя по `X-Consent-Id`, не ограничивает авторизованных. | both | medium | keep\_in\_documentRoutes\_for\_now | Auth/header behavior лучше оставить рядом с routes. |

| 14 | `checkAndSetCooldown(req)` | cooldown\_related | Проверяет и выставляет cooldown для guest export. | both | medium | keep\_in\_documentRoutes\_for\_now | Stateful; не document formatting. |

| 15 | `parseAnyDateLocal(input)` | date\_parser | Парсит `DD.MM.YYYY`, `DD.MM.YY`, `YYYY-MM-DD`, fallback `new Date`. | rent | do\_not\_move\_yet | `server/utils/dateUtils.js` | Влияет на юридический текст и schedules. |

| 16 | `GROUP\_FORMS` | ru\_grammar | Падежи `Наймодатель/Наниматель` в ед./мн. числе. | rent | high | `server/services/documentTypes/rent/renderData.js` | Юридическая грамматика сторон. |

| 17 | `buildGroupLabels(nounKey, isOne)` | ru\_grammar | Возвращает labels по падежам для стороны. | rent | high | `server/services/documentTypes/rent/renderData.js` | Используется в `data.calc`. |

| 18 | `formatDateLongLocal(input)` | date\_formatter | Формирует дату вида `4 января 2026`. | rent | do\_not\_move\_yet | `server/utils/dateUtils.js` | Критично для юридического текста. |

| 19 | `ensureGoda(s)` | date\_formatter | Добавляет `года`, если отсутствует. | rent | do\_not\_move\_yet | `server/utils/dateUtils.js` | Малый helper, но меняет финальный текст. |

| 20 | `splitPassportSeriesNumber(passport)` | passport\_formatter | Оставляет цифры, первые 4 — серия, следующие 6 — номер. | rent | medium | `server/services/documentTypes/rent/personDisplay.js` | Рекомендуемый минимальный кандидат пакета 6. |

| 21 | `buildDisplayForPerson(p)` | person\_display\_builder | Готовит gender words, date text, passport series/number. | rent | high | `server/services/documentTypes/rent/personDisplay.js` | Смешивает даты, паспорт и gender display. |

| 22 | `ensureRepresentativesDisplay(data)` | representative\_normalizer | Проставляет `display` общему/индивидуальным представителям наймодателей. | rent | high | `server/services/documentTypes/rent/representatives.js` | Мутирует `data`. |

| 23 | `ensureTenantsRepresentativesDisplay(data)` | representative\_normalizer | Проставляет `display` представителям нанимателей. | rent | high | `server/services/documentTypes/rent/representatives.js` | Аналог landlord branch. |

| 24 | `normalizeTenants(data)` | landlord\_tenant\_normalizer | Удаляет пустых representatives и фиксирует `hasRepresentative`. | rent | high | `server/services/documentTypes/rent/renderData.js` | Меняет структуру tenants. |

| 25 | `normalizeLandlords(data)` | landlord\_tenant\_normalizer | Удаляет пустых representatives и фиксирует `hasRepresentative`. | rent | high | `server/services/documentTypes/rent/renderData.js` | Меняет структуру landlords. |

| 26 | `assignTenantsNamedAs(data)` | person\_display\_builder | Проставляет `namedLater` / `namedAs` для нанимателей. | rent | high | `server/services/documentTypes/rent/personDisplay.js` | Влияет на юридические labels. |

| 27 | `markShowNamedLaterForTenants(data)` | person\_display\_builder | Управляет inline-показом `именуемый...` для tenant/group branches. | rent | high | `server/services/documentTypes/rent/personDisplay.js` | Завязан на counts/groups. |

| 28 | `promoteTenantsCommonRepresentative(data)` | representative\_group\_builder | Поднимает общего представителя нанимателей, формирует represented. | rent | do\_not\_move\_yet | `server/services/documentTypes/rent/representatives.js` | Очень чувствительная логика группировки. |

| 29 | `buildTenantRepresentativeGroups(data)` | representative\_group\_builder | Группирует нанимателей по одинаковому представителю и строит represented HTML. | rent | do\_not\_move\_yet | `server/services/documentTypes/rent/representatives.js` | HTML + registration + grouping. |

| 30 | `normalizeFio(s)` | representative\_normalizer | Нормализует ФИО для ключа представителя. | rent | medium | `server/utils/representativeGroups.js` | Малый helper, но влияет на grouping. |

| 31 | `buildRepKey(rep)` | representative\_normalizer | Ключ представителя по ФИО, паспорту, доверенности. | rent | high | `server/utils/representativeGroups.js` | Ошибка меняет grouping. |

| 32 | `sanitizeAddress(s)` | registration\_text\_builder | Чистит хвостовые запятые/пробелы адреса. | rent | medium | `server/utils/registrationText.js` | Часть legal registration phrase. |

| 33 | `buildRegistrationClauseForPerson(p)` | registration\_text\_builder | Строит фразу регистрации с `previous/temporary/none` и gender verb. | rent | do\_not\_move\_yet | `server/utils/registrationText.js` | Юридически значимая фраза. |

| 34 | `applyRegistrationClauses(data)` | registration\_text\_builder | Массово проставляет `display.registrationClause` сторонам/представителям. | rent | do\_not\_move\_yet | `server/utils/registrationText.js` | Мутирует many branches. |

| 35 | `promoteCommonRepresentative(data)` | representative\_group\_builder | Поднимает общего представителя всех наймодателей. | rent | do\_not\_move\_yet | `server/services/documentTypes/rent/representatives.js` | Критично для общего представителя. |

| 36 | `escapeHtml(s)` | html\_builder | Экранирует HTML entities. | rent | medium | `unknown` | Много HTML-потребителей. |

| 37 | `buildPersonShortHtml(p)` | html\_builder | Собирает HTML-карточку лица с паспортом/регистрацией. | rent | do\_not\_move\_yet | `server/services/documentTypes/rent/personDisplay.js` | Финальный HTML договора/расписки. |

| 38 | `buildPersonShortHtmlWithCase(p, fioCase)` | html\_builder | HTML-карточка лица с ФИО в нужном падеже. | rent | do\_not\_move\_yet | `server/services/documentTypes/rent/personDisplay.js` | Падежи влияют на юридический текст. |

| 39 | `buildRegistrationText(p)` | registration\_text\_builder | Возвращает registration text для receipt/person text blocks. | rent | do\_not\_move\_yet | `server/utils/registrationText.js` | Частично дублирует clause logic. |

| 40 | `buildRepresentativeGroups(data)` | representative\_group\_builder | Группирует наймодателей по представителю и строит represented HTML. | rent | do\_not\_move\_yet | `server/services/documentTypes/rent/representatives.js` | Одна из самых опасных зон. |

| 41 | `markShowNamedLaterForLandlords(data)` | person\_display\_builder | Управляет inline `именуемый...` для landlord/group branches. | rent | high | `server/services/documentTypes/rent/personDisplay.js` | Завязан на `landlordRepGroups`. |

| 42 | `insertShareWord(title)` | unknown\_or\_mixed | Добавляет `доли` после дроби в заголовке ownership doc. | rent | medium | `server/services/documentTypes/rent/ownershipDocs.js` | Узкая логика документов-оснований. |

| 43 | `buildLandlordsBasisHtml(data)` | html\_builder | Собирает HTML оснований права собственности. | rent | do\_not\_move\_yet | `server/services/documentTypes/rent/ownershipDocs.js` | Опасная ownership docs зона. |

| 44 | `rublesToWordsTitleCase(n)` | ru\_grammar | Рубли прописью с заглавной буквы. | rent | high | `server/services/documentTypes/rent/renderData.js` | Деньги в юридическом тексте. |

| 45 | `triadToWords(num, female)` | ru\_grammar | Внутренний helper числительных. | rent | high | `server/services/documentTypes/rent/renderData.js` | Не переносить без money tests. |

| 46 | `unitName(n, forms)` | ru\_grammar | Склоняет единицы измерения/валюты. | rent | high | `server/services/documentTypes/rent/renderData.js` | Деньги/числительные. |

| 47 | `buildContactsHtml(list)` | html\_builder | Собирает HTML контактов сторон. | rent | medium | `server/services/documentTypes/rent/contacts.js` | Запасной малый кандидат после passport helper. |

| 48 | `decorateForSignatures(arr, calc, formatDateLongLocal)` | render\_data\_preparer | Обогащает стороны для подписей. | rent | high | `server/services/documentTypes/rent/renderData.js` | Влияет на подписи. |

| 49 | `assignLandlordsNamedAs(data)` | person\_display\_builder | Проставляет `namedAs` / `namedLater` наймодателям и groups. | rent | high | `server/services/documentTypes/rent/personDisplay.js` | Нумерация сторон. |

| 50 | `stripEditorHints(html)` | template\_preparer | Удаляет элементы с `data-hint`. | both | medium | keep\_in\_documentRoutes\_for\_now | Editor/export preparation. |

| 51 | `enforceInlineAlignment(html)` | export\_related | Проставляет inline alignment heading/paragraph tags. | both | do\_not\_move\_yet | keep\_in\_documentRoutes\_for\_now | PDF/DOCX-sensitive. |

| 52 | `insertDocxPageBreaks(html)` | export\_related | Вставляет page breaks перед приложениями/распиской через JSDOM. | rent | do\_not\_move\_yet | keep\_in\_documentRoutes\_for\_now | DOCX binary output sensitive. |

| 53 | `GET /docs/:id/editor` | express\_route | Возвращает свежий template с no-cache headers. | both | medium | keep\_in\_documentRoutes\_for\_now | Настоящий route. |

| 54 | `POST /docs/:id/render` | express\_route | Главный render endpoint для rent/maternity. | both | do\_not\_move\_yet | keep\_in\_documentRoutes\_for\_now | Основной pipeline, не переносить целиком. |

| 55 | Inline `detectPersonGender` in `/render` | ru\_grammar | Определяет gender единственного landlord/tenant для verbs. | rent | high | `server/services/documentTypes/rent/personDisplay.js` | Inline helper внутри render. |

| 56 | `/render` landlord calc block | render\_data\_preparer | Counts, labels, verbs, ownership, representatives, named flags. | rent | do\_not\_move\_yet | `server/services/documentTypes/rent/renderData.js` | Большой mutating block. |

| 57 | `/render` tenant calc block | render\_data\_preparer | Counts, labels, verbs, representatives, named flags. | rent | do\_not\_move\_yet | `server/services/documentTypes/rent/renderData.js` | Большой mutating block. |

| 58 | `/render` terms/copies/numbering blocks | render\_data\_preparer | Даты договора, срок, экземпляры, §5 numbering, flags. | rent | do\_not\_move\_yet | `server/services/documentTypes/rent/renderData.js` | Много условий по terms. |

| 59 | `addMonthsSafeLocal(dateObj, months)` | date\_parser | Безопасно прибавляет месяцы для срока договора. | rent | high | `server/utils/dateUtils.js` | Date behavior юридически значимо. |

| 60 | `makeMoneyParts(amount)` | ru\_grammar | Формирует parts суммы: formatted, words, rub/kop. | rent | high | `server/services/documentTypes/rent/renderData.js` | Деньги прописью. |

| 61 | `buildReceiptHtml(data)` | html\_builder | Собирает HTML расписки и no-claims text. | rent | do\_not\_move\_yet | `server/services/documentTypes/rent/renderData.js` | Критичный legal HTML. |

| 62 | `addMonthsSafe(dateObj, months)` | date\_parser | Безопасно прибавляет месяцы для графика платежей. | rent | high | `server/utils/dateUtils.js` | Почти дубль `addMonthsSafeLocal`. |

| 63 | `buildInstallmentsScheduleHtml(...)` | html\_builder | Собирает HTML графика платежей с датами и суммами. | rent | do\_not\_move\_yet | `server/services/documentTypes/rent/renderData.js` | Деньги + даты + HTML. |

| 64 | Inline table build try/catch in `/render` | html\_builder | Заполняет `terms.apartmentHtml` и `terms.inventoryHtml`. | rent | high | keep\_in\_documentRoutes\_for\_now | Есть дублирование, но не трогать без tests. |

| 65 | Debug/logging in `/render` | debug\_or\_logging | Логирует lengths, keys, calc, groups, numbering. | both | medium | keep\_in\_documentRoutes\_for\_now | Чистить отдельным cleanup-пакетом. |

| 66 | `POST /docs/:id/export/pdf` | express\_route | Рендерит HTML, alignment, cooldown, PDF export. | both | do\_not\_move\_yet | keep\_in\_documentRoutes\_for\_now | Export endpoint. |

| 67 | `POST /docs/:id/export/docx` | express\_route | Рендерит HTML, alignment, page breaks, DOCX buffer. | both | do\_not\_move\_yet | keep\_in\_documentRoutes\_for\_now | Export endpoint. |

| 68 | `GET /docs/:id/versions` | express\_route | Возвращает версии документа. | both | low | keep\_in\_documentRoutes\_for\_now | Route/service orchestration. |

| 69 | `DELETE /docs/:id/versions/:versionId` | express\_route | Удаляет версию и возвращает список. | both | low | keep\_in\_documentRoutes\_for\_now | Route/service orchestration. |

| 70 | `POST /docs/:id/clear` | express\_route | Очищает версии документа. | both | low | keep\_in\_documentRoutes\_for\_now | Route/service orchestration. |

| 71 | `POST /docs/:id/drafts` | express\_route | Сохраняет draft/version HTML. | both | medium | keep\_in\_documentRoutes\_for\_now | Route/service orchestration. |

| 72 | `GET /docs/:id/diff` | express\_route | Возвращает diff HTML между версиями. | both | medium | keep\_in\_documentRoutes\_for\_now | Diff logic делегируется service. |



\## 4. Дубли с клиентскими модулями



\### `client/src/utils/inputMasks.js`



\* `splitPassportSeriesNumber` концептуально похож на `formatPassportInput`, потому что оба оставляют цифры и работают с серией/номером паспорта.

\* Отличие: клиентский helper — input mask для ввода, серверный helper — display preparation для финального договора.

\* Вывод: не использовать клиентский модуль на сервере; можно создать отдельный server-side helper.



\### `client/src/utils/dateUtils.js`



\* `parseAnyDateLocal`, `formatDateLongLocal`, `ensureGoda`, `addMonthsSafeLocal`, `addMonthsSafe` концептуально похожи на клиентские date helpers.

\* Отличие: серверные даты используются в юридическом тексте, расписке, сроках и export; `parseAnyDateLocal` поддерживает `DD.MM.YY` и fallback `new Date`.

\* Вывод: переносить только в server-side module с golden-тестами.



\### `client/src/utils/personIdentity.js`



\* `normalizeFio`, `buildRepKey`, `splitPassportSeriesNumber` частично похожи на технические identity helpers.

\* Отличие: серверные helpers влияют на grouping представителей и финальный display.

\* Вывод: нельзя автоматически переиспользовать client identity helpers на сервере.



\### `client/src/utils/personNameRu.js`



\* Клиентский `declineGenitive` используется для UX-подсказок.

\* Серверные падежи и `buildPersonShortHtmlWithCase` используются в финальном договоре/расписке.

\* Вывод: клиентская и серверная FIO/grammar логика похожи только концептуально; серверный перенос требует document snapshots.



\## 5. Опасные зоны



Пока нельзя переносить без тестов:



\* Даты в юридическом тексте: `parseAnyDateLocal`, `formatDateLongLocal`, `ensureGoda`.

\* Group labels / падежи сторон: `GROUP\_FORMS`, `buildGroupLabels`, inline gender verb blocks.

\* Регистрационные фразы: `buildRegistrationClauseForPerson`, `applyRegistrationClauses`, `buildRegistrationText`.

\* Представители и группировка представителей: `promoteCommonRepresentative`, `promoteTenantsCommonRepresentative`, `buildRepresentativeGroups`, `buildTenantRepresentativeGroups`, `buildRepKey`.

\* HTML-карточки людей: `buildPersonShortHtml`, `buildPersonShortHtmlWithCase`.

\* Документы-основания: `buildLandlordsBasisHtml`, `insertShareWord`.

\* Расписка: `buildReceiptHtml`.

\* Суммы прописью: `rublesToWordsTitleCase`, `triadToWords`, `unitName`, `makeMoneyParts`.

\* Графики платежей: `buildInstallmentsScheduleHtml`, `addMonthsSafe`, `addMonthsSafeLocal`.

\* PDF/DOCX export: `enforceInlineAlignment`, `insertDocxPageBreaks`, PDF/DOCX endpoints.

\* Основной `/render` pipeline, включая landlord/tenant/terms/copies/numbering side effects.

\* Ветка `maternity\_capital\_shares` в `/render` и `server/services/documentTypes/maternityCapitalShares.js`.



\## 6. Что можно вынести первым безопасным пакетом



\### Вариант А — server date helpers



Кандидаты:



\* `parseAnyDateLocal`

\* `formatDateLongLocal`

\* `ensureGoda`



Потенциальный файл:



\* `server/utils/dateUtils.js`



Оценка: группа логически цельная, но рискованная. Эти helpers влияют на юридический текст, даты расписок, сроки договора и export. Нужны snapshot/golden-тесты до переноса.



\### Вариант Б — passport helper



Кандидат:



\* `splitPassportSeriesNumber`



Потенциальный файл:



\* `server/services/documentTypes/rent/personDisplay.js` или `server/utils/personDisplay.js`



Оценка: самый безопасный кандидат. Это одна функция без HTML, падежей, дат, регистрации и representative grouping. Достаточно unit-тестов на пустой ввод, короткий ввод, 10 цифр и ввод с пробелами/символами.



\### Вариант В — contacts helper



Кандидат:



\* `buildContactsHtml`



Потенциальный файл:



\* `server/services/documentTypes/rent/contacts.js`



Оценка: запасной вариант после passport helper. Логика тематически отдельная, но это HTML builder; нужно зафиксировать escaping и формат HTML.



\*\*Рекомендуемый пакет 6: вынести только `splitPassportSeriesNumber` в отдельный server-side rent/personDisplay helper, без переноса `buildDisplayForPerson` и без изменения render pipeline.\*\*



\## 7. Что пока не переносить



Пока не переносить:



\* Express routes и middleware.

\* `/docs/:id/render` endpoint и его landlord/tenant/terms pipeline.

\* PDF/DOCX export endpoints.

\* `stripEditorHints`, `enforceInlineAlignment`, `insertDocxPageBreaks`.

\* Representative grouping: `promoteCommonRepresentative`, `promoteTenantsCommonRepresentative`, `buildRepresentativeGroups`, `buildTenantRepresentativeGroups`.

\* Registration clauses: `buildRegistrationClauseForPerson`, `applyRegistrationClauses`, `buildRegistrationText`.

\* HTML-карточки людей: `buildPersonShortHtml`, `buildPersonShortHtmlWithCase`.

\* Ownership docs: `buildLandlordsBasisHtml`, `insertShareWord`.

\* Receipt and installments: `buildReceiptHtml`, `buildInstallmentsScheduleHtml`, money words helpers.

\* Maternity capital builder branch and `server/services/documentTypes/maternityCapitalShares.js`.

\* Любые функции с большим количеством условий по landlord/tenant, representatives, counts или `data.calc` side effects.


# Инвентаризация форматирования, нормализации и сборки текстов

Пакет 1: ревизия проекта `legal-portal` без изменения production-кода.

## 1. Краткое резюме

### Где больше всего смешана логика

* `server/routes/documentRoutes.js` — самый плотный узел: локальные парсеры дат, длинные русские даты, грамматика множественного числа, сборка отображаемых данных участников, HTML для сторон/расписок/графиков платежей, рендер шаблонов и экспортные HTML-преобразования находятся в одном route-файле.
* `client/src/components/RentApartmentWizard.js` — мастер найма содержит в компоненте нормализацию состояния, валидацию дат, склонение ФИО через `petrovich`, построение display-полей, расчёт/форматирование сумм, HTML подписей, HTML таблицы описи и текст показаний счётчиков.
* `client/src/components/LandlordSection/LandlordSection.jsx` и `client/src/components/TenantSection/TenantSection.jsx` — UI-маски, импорт из свободного текста, склонение ФИО и отображение паспортных/регистрационных данных смешаны с React-формами.
* `server/services/documentTypes/maternityCapitalShares.js` — специализированный document-builder одновременно нормализует пол/ФИО, склоняет имена, собирает юридические фразы и HTML-фрагменты для соглашения о выделении долей.
* `client/src/utils/freeTextParser.js`, `client/src/utils/extractEGRNDataFromPdf.js`, `client/src/utils/extractEGRNFromZip.js`, `client/src/utils/maternityCapitalShares/extractMaternityCapitalStatement.js` — parser-specific логика содержит собственные нормализаторы дат, телефонов, СНИЛС, паспорта и ФИО.

### Самые рискованные файлы

* `server/routes/documentRoutes.js` — критичен для `/render`, PDF/DOCX экспорта, расписок и подстановки данных в шаблоны; перенос без golden/snapshot-тестов может изменить документный HTML.
* `server/services/documentService.js` — отвечает за placeholder-rendering, повторы, условные блоки, формат сумм и HTML-таблицы; риск сломать редактор и версии документов.
* `client/src/components/RentApartmentWizard.js` — логика мастера формирует `display`-данные, которые затем потребляются серверным рендером; изменение может затронуть итоговый договор.
* `server/services/documentTypes/maternityCapitalShares.js` — документный текст для маткапитала зависит от грамматики, ролей и склонений; нужен набор fixture-тестов по участникам.
* `client/src/utils/freeTextParser.js` и EGRN/PDF/ZIP парсеры — высокая чувствительность к «грязному» входу из OCR/Госуслуг/ЕГРН.

### Кандидаты на вынос в первую очередь

* UI-маски без document-side effects: `formatDateInput` из секций сторон и `participantsStep`, `formatPassport`, `formatDepartmentCode`, `formatPhone`.
* Чистые display-formatters с совпадающей логикой: `formatDateToText` в client/server `utils/formatters.js`, короткое форматирование даты/времени в `client/src/utils/date.js`.
* Низкорисковые normalizers: `onlyDigits`, `norm`, `normalizeText`, `normalizeSnils`, если сначала зафиксировать текущие edge cases.
* Денежные helpers (`amountRu`, `formatAmountRu`, `formatRubShort*`) — только после сравнения формата копеек, регистра первой буквы и склонения.

### Зоны, которые пока нельзя трогать без тестов

* Рендер и экспорт: `/api/docs/:id/render`, `/export/pdf`, `/export/docx`, `renderFinalHtml`, `enforceInlineAlignment`, `insertDocxPageBreaks`.
* Любая сборка юридических фраз и HTML: `buildReceiptHtml`, `buildInstallmentsScheduleHtml`, `participantDescription`, `rightsText`, `sharesText`, `formatApartmentDescriptionHtml`, `formatContactsListHtml`.
* Парсеры из OCR/PDF/XML/ZIP: `parseFreeTextPerson`, `parseBirthCertificateText`, `extractEGRNDataFromPdf`, `parseEGRNXml`, `parseMaternityCapitalStatementText`.
* Склонение ФИО и пол: все `petrovich`-участки, `normalizeGender`, `genderVerbRegistered`, `declineGenitive`, `buildFioCases`.

## 2. Таблица найденных функций и блоков

| № | Файл | Функция / блок | Что делает | Категория | Где используется | Дубли / похожая логика | Риск переноса | Рекомендация |
| - | ---- | -------------- | ---------- | --------- | ---------------- | ---------------------- | ------------- | ------------ |
| 1 | `client/src/utils/formatters.js` | `formatDateToText` | Преобразует `ddmmyy`/`ddmmyyyy`/`dd.mm.yyyy` в длинную русскую дату. | display_formatter | UI подсказки сторон, documentFormatters. | Почти дубль `server/utils/formatters.js`, похожи `formatDateLongLocal`, `formatDateLongRu`, `toDisplayDate`. | Средний | Вынести после snapshot edge cases по 2-значному году и ошибкам. |
| 2 | `client/src/utils/formatters.js` | `formatPassport` | Маска паспорта `0000 000000`. | input_mask | Landlord/Tenant формы. | Дубли: `splitPassport`, parser passport normalizers. | Низкий | Безопасный кандидат пакета 2 при сохранении API. |
| 3 | `client/src/utils/formatters.js` | `formatPhone` | Маска телефона `+7 (...) ...`. | input_mask | Landlord/Tenant формы. | `normalizePhone` в `freeTextParser`; контакты в `documentFormatters`. | Средний | Сначала описать поведение для 7/8/коротких номеров. |
| 4 | `client/src/utils/formatters.js` | `formatPassportText` | Текст `серия ... номер ...`. | document_text_builder | UI preview, documentFormatters. | `splitPassport`, server route passport summary. | Средний | Не менять до сверки с документами. |
| 5 | `client/src/utils/formatters.js` | `formatDepartmentCode` | Маска кода подразделения `000-000`. | input_mask | Landlord/Tenant формы. | `normalizeDepCode`, `maskPassportDivisionCode`. | Низкий | Кандидат пакета 2. |
| 6 | `client/src/utils/formatters.js` | `formatCadastral` | Маска кадастрового номера по группам. | input_mask | Потенциально формы объекта. | EGRN object normalizers. | Средний | Выносить отдельно от персональных данных. |
| 7 | `client/src/utils/formatters.js` | `parseDate` | Парсит 6/8 цифр в `Date`, расширяет 2-значный год относительно текущего века. | validation_related | Валидация мастера найма. | `parseAnyDateToISO`, `parseAnyDateLocal`, `normalizeDateSmart`. | Средний | Сначала тесты на 2-значный год. |
| 8 | `client/src/utils/formatters.js` | `numberToWords`, `formatRentAmount`, `amountRu`, `numberToWordsRu`, `declWord`, `triadToWords` | Деньги/числа прописью, рубли/копейки, формат суммы. | ru_grammar | Формирование сумм в документах/формах. | `server/utils/formatters.js`, `documentService.formatAmountRu`, `documentRoutes.makeMoneyParts`. | Высокий | Не трогать без golden-тестов документов. |
| 9 | `server/utils/formatters.js` | весь файл форматтеров | CommonJS-копия client formatter-логики плюс `amountRu`. | unknown_or_mixed | `maternityCapitalShares`, потенциально серверные документы. | Почти дубль `client/src/utils/formatters.js`. | Средний | Сравнить экспорт/потребителей, затем объединять только в отдельном пакете. |
| 10 | `client/src/utils/date.js` | `toDate`, `formatDateTime`, `formatDateTimeWithSeconds`, `formatDay`, `formatRelativeTime`, `startOfDay`, `subtractDays`, `isSameDay`, `isAfter` | UI даты/время через `Intl`. | display_formatter | Админка/страницы статусов. | Не совпадает с юридическими датами. | Низкий | Держать отдельно как UI time helpers. |
| 11 | `client/src/hooks/useFormattedCurrency.js` | `useFormattedCurrency` | React-hook для отображения валюты. | display_formatter | Секция условий найма. | `formatRubShort`, `formatAmountRu`. | Низкий | Можно оставить UI-only. |
| 12 | `client/src/utils/documentFormatters.js` | `formatLandlordData`, `formatTenantData` | Собирает текстовые блоки сторон с полом, датами, паспортом, регистрацией. | document_text_builder | Legacy/lease formatter usage. | `buildDisplayForPerson`, `formatLandlordInline`, `formatTenantInline`. | Высокий | Не переносить без проверки актуальности использования. |
| 13 | `client/src/utils/documentFormatters.js` | `onlyDigits`, `norm`, `normalizeRep`, `repKey`, `joinWithAnd` | Нормализация представителя и склейка списков. | data_normalizer | Группировка представителей арендодателей/арендаторов. | `buildRepKey`, `buildGroupRepresentative`. | Средний | Можно вынести после теста группировки одинаковых представителей. |
| 14 | `client/src/utils/documentFormatters.js` | `formatLandlordInline`, `formatTenantInline` | Однострочные юридические описания сторон. | document_text_builder | Representative group builders. | `buildPersonShortHtml`, `enrichPersonDisplay`. | Высокий | Не трогать без snapshot документов. |
| 15 | `client/src/utils/documentFormatters.js` | `prepareLandlordRepresentativeGroups`, `prepareTenantRepresentativeGroups` | Группирует нескольких лиц с одним представителем, формирует group text. | document_text_builder | Подготовка данных договора. | `documentRoutes.build*RepresentativeGroups`. | Высокий | Сначала выделить fixture на 1/2/3 представляемых. |
| 16 | `client/src/utils/documentFormatters.js` | `formatApartmentDescriptionText` | Многострочное описание помещений. | document_text_builder | Приложение к договору. | `buildApartmentTableHtml`, HTML-table builders. | Средний | Не смешивать с HTML-версией при рефакторинге. |
| 17 | `client/src/utils/documentFormatters.js` | `formatApartmentDescriptionHtml` | HTML-таблица описания квартиры с escape. | document_html_builder | Вставка в шаблон через editor/render. | `server/services/documentService.buildApartmentTableHtml`, wizard inventory HTML. | Высокий | Нужны HTML snapshots. |
| 18 | `client/src/utils/documentFormatters.js` | `formatContactsListHtml` | HTML `<ol>` контактов, телефоны/e-mail/представитель. | document_html_builder | Шаблон договора. | `buildSignaturesHtml`, route HTML. | Средний | Вынести только после теста escaping. |
| 19 | `client/src/utils/freeTextParser.js` | `normalizeDateNumeric`, `normalizeDateWords`, `normalizeDateSmart` | Нормализует даты из цифр и русских месяцев. | parser_normalizer | Паспорт/свидетельство из вставленного текста. | Все date parsers. | Высокий | Оставить parser-specific до набора OCR fixtures. |
| 20 | `client/src/utils/freeTextParser.js` | `extractBirthDateByMarkers`, `extractAllDates`, `stripDatesFromPlace`, `_toDate`, `_dateNum` | Извлекает/сравнивает даты в сыром тексте. | parser_normalizer | `parseFreeTextPerson`. | EGRN/PDF parsers. | Высокий | Не унифицировать раньше тестов на паспорт/Госуслуги. |
| 21 | `client/src/utils/freeTextParser.js` | `normalizePassportNumber`, `normalizeDepCode`, `normalizePhone`, `normalizeSnils` | Чистит паспорт, код подразделения, телефон, СНИЛС из сырого текста. | parser_normalizer | Импорт данных сторон. | `formatPassport`, `formatDepartmentCode`, `passportOcr` normalizers. | Средний | Выносить отдельно от UI-масок. |
| 22 | `client/src/utils/freeTextParser.js` | `detectGender`, `isLikelyFIO`, `findNameNearPassport` | Определяет пол/ФИО по тексту и контексту паспорта. | parser_normalizer | `parseFreeTextPerson`, `parseBirthCertificateText`. | `normalizeGender`, `petrovich` detect. | Высокий | Требуются примеры муж/жен/без отчества. |
| 23 | `client/src/utils/freeTextParser.js` | `parseFreeTextPerson` | Главный parser паспорта/контактов/регистрации из произвольного текста. | parser_normalizer | Landlord/Tenant import modals. | `passportOcr`, EGRN PDF extraction. | Высокий | Не трогать без fixture corpus. |
| 24 | `client/src/utils/freeTextParser.js` | `parseBirthCertificateText` | Parser свидетельства о рождении: ФИО, пол, дата, регистрация, СНИЛС, акт. | parser_normalizer | Маткапитал/участники. | `parseFreeTextPerson`. | Высокий | Отдельный тестовый пакет. |
| 25 | `client/src/utils/passportOcr.js` | `normalizePassportNumber`, `normalizeDepCode`, `normalizeDate`, `detectGenderFromText` | OCR-нормализация паспорта с исправлением символов и пола. | parser_normalizer | PassportImportModal/OCR flow. | `freeTextParser` normalizers. | Высокий | Не объединять с ручным import без OCR fixtures. |
| 26 | `client/src/utils/extractEGRNDataFromPdf.js` | `extractValueBeforeLabel`, `parseEgrnDocumentItem`, `parseEgrnDocumentsFromSection`, `extractEncumbranceFromText` | Парсинг документов-оснований и обременений из PDF ЕГРН. | parser_normalizer | EGRN import. | `extractEGRNFromZip.parseEGRNXml`. | Высокий | Parser-specific helpers оставить рядом. |
| 27 | `client/src/utils/extractEGRNDataFromPdf.js` | `normalizeChunk`, `normalizeName`, `extractContacts`, `extractPassport`, `extractLandlordsFromText` | Извлекает собственников, контакты, паспорт, регистрацию из PDF. | parser_normalizer | EGRN import for rent wizard. | `freeTextParser`, ZIP parser. | Высокий | Нужны реальные PDF fixtures. |
| 28 | `client/src/utils/extractEGRNFromZip.js` | `normalizeStr`, `parseShare`, `sumShares`, `parseRuDateToSortable`, `parseEGRNXml` | XML/ZIP ЕГРН: строки, доли, даты, права. | parser_normalizer | EGRN ZIP import. | `egrnUiAdapter.parseShare`, `shareCalculations.parseFraction`. | Высокий | Не смешивать XML parser с UI shares. |
| 29 | `client/src/utils/extractEGRNFromZip.js` | `normalizeName`, merge landlord blocks, PDF enrichment block | Мержит XML и PDF-паспорт/контакты/регистрацию. | parser_normalizer | Rent wizard EGRN import. | PDF extractor. | Высокий | Покрыть конфликтами XML/PDF. |
| 30 | `client/src/utils/egrnUiAdapter.js` | `splitFio`, `composeTitle`, `toBasisItem`, `toDateKey`, `normalizeOwnerForBlock` | Преобразует parsed EGRN к UI-блокам оснований. | data_normalizer | Lease terms/object rights UI. | `participantsStep.splitFullName`, `fullName`. | Средний | Можно выносить после фиксации UI schema. |
| 31 | `client/src/utils/egrnUiAdapter.js` | `parseShare`, `computeSharesTotal`, `computeSharesMismatch`, `buildOwnerRights`, `classifyEgrnForMaternityShares` | Парсинг/сложение долей и классификация для маткапитала. | data_normalizer | Мастера найма/маткапитала. | `shareCalculations.parseFraction`. | Средний | Разделить EGRN-specific и generic fraction позже. |
| 32 | `client/src/utils/extractBankDetailsFromText.js` | `extractBankDetailsFromText` | Нормализует банковские реквизиты из текста: БИК, счёт, банк. | parser_normalizer | Lease terms bank import. | `extractBankDetailsFromPDF`, QR extractor. | Средний | Parser-specific до тестов по банкам. |
| 33 | `client/src/utils/extractBankDetailsFromPdf.js` | text extraction block | Извлекает текст из PDF и применяет regex банковских реквизитов. | parser_normalizer | Bank details import. | Text parser. | Средний | Вынести общий mapper только после тестов. |
| 34 | `client/src/utils/extractBankDetailsFromQR.js` | QR `key=value` parser | Разбирает QR payload банковского платежа. | parser_normalizer | Bank details import. | Text/PDF bank parsers. | Низкий | Оставить отдельно из-за другого формата входа. |
| 35 | `client/src/utils/maternityCapitalShares/extractMaternityCapitalStatement.js` | `normalizeText`, `normalizeInlineText`, `normalizeDate`, `normalizeSnils`, `normalizeMoney*` | Нормализует текст, дату, СНИЛС, суммы из справки маткапитала. | parser_normalizer | Parser справки СФР/маткапитала. | `freeTextParser.normalizeSnils`, money parsers. | Высокий | Parser-specific until fixtures. |
| 36 | `client/src/utils/maternityCapitalShares/extractMaternityCapitalStatement.js` | `extractAmounts`, `extractOperations`, `findTotalAmount`, `extractHolderName`, `extractCertificate`, `parseMaternityCapitalStatementText` | Извлекает операции, сертификат, владельца и остатки маткапитала. | parser_normalizer | Maternity capital wizard. | `shareCalculations.parseMoney`. | Высокий | Не менять без реальных справок. |
| 37 | `client/src/utils/maternityCapitalShares/normalizeEgrnForMaternityShares.js` | `firstNonEmpty`, `normalizeEncumbrance`, `normalizeEgrnForMaternityShares` | Приводит parsed EGRN к state мастера маткапитала. | data_normalizer | MaternityCapitalSharesWizard. | `egrnUiAdapter`. | Средний | Можно документировать schema перед выносом. |
| 38 | `client/src/utils/maternityCapitalShares/participantsStep.js` | `formatDateInput`, `toDisplayDate`, `normalizeRussianDate`, `parseDateParts`, `toDate` | Маски и нормализация дат участников/семьи. | input_mask | ParticipantsSection validations/display. | Landlord/Tenant `formatDateInput`, route parsers. | Средний | Кандидат только после сравнения с lease masks. |
| 39 | `client/src/utils/maternityCapitalShares/participantsStep.js` | `parseMarriageCertificateText` | Parser данных свидетельства/брака из текста. | parser_normalizer | Participants step. | `parseBirthCertificateText`. | Высокий | Parser-specific fixtures. |
| 40 | `client/src/utils/maternityCapitalShares/participantsStep.js` | `getFullName`, `splitFullName`, `splitPassport`, `calculateAgeOnDate`, `withDisplayDates`, `applyParticipantAgeRules` | ФИО, паспорт, возраст, display даты и правила несовершеннолетних. | data_normalizer | Maternity participants. | `fullName`, `splitName`, `ageOnDate`, `splitPassport`. | Средний | Разделить generic/person vs domain rules. |
| 41 | `client/src/utils/maternityCapitalShares/participantsStep.js` | `formatParticipantName`, `genderText`, `snilsText`, `registrationText`, `passportText` | Текст summary участника с полом, СНИЛС, регистрацией, паспортом. | document_text_builder | Summary/preview participants step. | Server `participantDescription`. | Высокий | Не выносить без проверки UI summary. |
| 42 | `client/src/utils/maternityCapitalShares/shareCalculations.js` | `parseFraction`, `formatFraction` | Парсинг и формат долей. | data_normalizer | Расчёт долей маткапитала. | EGRN share parsers. | Средний | Хороший кандидат после unit-тестов дробей. |
| 43 | `client/src/utils/maternityCapitalShares/shareCalculations.js` | `parseMoney`, `moneyToKopecks`, `moneyRatioToFraction`, `formatMoneyInput` | Парсит деньги, копейки, пропорции, маску суммы. | data_normalizer | Расчёт долей. | `amountRu`, `formatAmountRu`. | Средний | Не объединять с документными суммами сразу. |
| 44 | `client/src/utils/maternityCapitalShares/objectCalculations.js` | `buildDistributionBaseDraft` | Собирает draft основания распределения долей из объекта. | data_normalizer | Maternity object wizard. | EGRN normalizers. | Средний | Domain-specific. |
| 45 | `client/src/components/LandlordSection/LandlordSection.jsx` | local `formatDateInput` | Маска даты `dd.mm.yyyy` для арендодателя/представителя. | input_mask | Поля birthDate, issueDate, attorneyDate. | Tenant local mask, participantsStep mask. | Низкий | Кандидат пакета 2. |
| 46 | `client/src/components/LandlordSection/LandlordSection.jsx` | `splitFio`, `declineGenitive` | Склоняет ФИО арендодателя в родительный падеж для подсказки представителя. | ru_grammar | UI блока представителя. | Tenant same logic, RentWizard `declineFioGenitive`. | Средний | Вынести после проверки `petrovich` behavior. |
| 47 | `client/src/components/LandlordSection/LandlordSection.jsx` | import handlers using `parseFreeTextPerson` | Маппит parsed fields в landlord/representative state. | parser_normalizer | FreeTextImportModal. | Tenant import handlers. | Средний | Оставить в UI, общий mapper позже. |
| 48 | `client/src/components/TenantSection/TenantSection.jsx` | local `formatDateInput` | Маска даты арендатора/представителя. | input_mask | Tenant date inputs. | Landlord local mask. | Низкий | Кандидат пакета 2. |
| 49 | `client/src/components/TenantSection/TenantSection.jsx` | `splitFio`, `declineGenitive` | Склонение ФИО нанимателя в родительный падеж. | ru_grammar | UI подсказки представителя. | Landlord same logic. | Средний | Объединить вместе с Landlord after tests. |
| 50 | `client/src/components/TenantSection/TenantSection.jsx` | import handlers using `parseFreeTextPerson` | Маппит parsed person в tenant/representative state. | parser_normalizer | FreeTextImportModal. | Landlord import handlers. | Средний | Общий mapper позже. |
| 51 | `client/src/components/RentApartmentWizard.js` | `normalizeParty` | Нормализует side state и представителя при загрузке draft. | data_normalizer | LocalStorage migration/load. | Similar participant state normalizers. | Средний | Не менять без migration tests. |
| 52 | `client/src/components/RentApartmentWizard.js` | validation date blocks using `parseDate` | Проверка возраста, совершеннолетия, дат представителей. | validation_related | Step validation. | `calculateAgeOnDate`, server `ageOnDate`. | Высокий | Не трогать без form validation tests. |
| 53 | `client/src/components/RentApartmentWizard.js` | `ruPlural`, `numToRuWords`, `numToGenitive` | Русские числительные/множественное число для ключей и текстов. | ru_grammar | Inventory/meter readings. | `pluralRu`, `pluralize`, `copiesCountWords`. | Средний | Вынести после snapshot inventory text. |
| 54 | `client/src/components/RentApartmentWizard.js` | `parseAnyDateToISO`, `formatDateLongRu` | Парсит дату и формирует длинную дату. | display_formatter | Enriched formData display. | `documentRoutes.parseAnyDateLocal`, `documentService.parseAnyDate`. | Высокий | Нужны договорные snapshots. |
| 55 | `client/src/components/RentApartmentWizard.js` | `genderWord`, `genderVerbRegistered`, `namedLater` | Пол/окончания для display. | ru_grammar | Enriched parties display. | route `buildDisplayForPerson`, maternity `normalizeGender`. | Средний | Вынести только с тестами male/female. |
| 56 | `client/src/components/RentApartmentWizard.js` | `splitPassport`, `splitFio`, `joinFio`, `declineFioGenitive`, `buildFioCases` | Паспорт, ФИО, падежи через `petrovich`. | ru_grammar | `enrichPersonDisplay`. | Maternity `splitName`/`inflectName`, section `declineGenitive`. | Высокий | Отдельный ru-person package with tests. |
| 57 | `client/src/components/RentApartmentWizard.js` | `enrichPersonDisplay`, `buildGroupRepresentative`, `enrichFormDataForParties`, `enrichPersonalReps` | Создаёт `display` модель сторон/представителей для шаблонов. | document_text_builder | Submit/generate document. | Server route display builders. | Высокий | Не менять до end-to-end render tests. |
| 58 | `client/src/components/RentApartmentWizard.js` | `escapeHtml`, `formatRubShort`, `buildSignaturesHtml` | HTML подписей и короткая сумма. | document_html_builder | Generated formData terms/signatures. | Server receipt/signature HTML. | Высокий | Сначала HTML snapshot. |
| 59 | `client/src/components/RentApartmentWizard.js` | inventory HTML block and `buildMeterReadingsText` | Собирает HTML описи и текст показаний/ключей. | document_html_builder | Lease appendices. | `documentService.buildInventoryTableHtml`. | Высокий | Не трогать без template snapshots. |
| 60 | `client/src/components/LeaseTermsSection/LeaseTermsSection.jsx` | EGRN import merge blocks | Разделяет паспорт на серию/номер, мержит регистрацию/телефон/основания. | data_normalizer | Мастер найма, условия/ЕГРН. | EGRN adapters, freeText parser. | Средний | Выносить после schema tests. |
| 61 | `client/src/components/LeaseTermsSection/LeaseTermsSection.jsx` | currency display via `useFormattedCurrency` | Отображает суммы аренды/депозита. | display_formatter | Lease terms UI. | `formatRubShort`, `formatAmountRu`. | Низкий | UI-only. |
| 62 | `client/src/components/maternityCapitalShares/ParticipantsSection.jsx` | date/passport/gender/fullName handlers via `participantsStep` utils | UI ввод и отображение участников маткапитала. | input_mask | Maternity participants wizard. | Landlord/Tenant masks. | Средний | Не менять вместе с rent wizard. |
| 63 | `client/src/components/maternityCapitalShares/MaternityCapitalAndSharesSection.jsx` | money/share display and validation | Отображает маткапитал, суммы и доли. | display_formatter | Maternity capital step. | `shareCalculations`, amount formatters. | Средний | Только после unit tests share/money. |
| 64 | `client/src/components/common/FreeTextImportModal.jsx` | raw text import UI | Собирает текст для parser functions. | parser_normalizer | Landlord/Tenant import. | PassportImportModal. | Низкий | UI можно не трогать. |
| 65 | `client/src/components/common/PassportImportModal.jsx` | OCR/passport import flow | Загружает OCR результат и маппит поля паспорта. | parser_normalizer | Person forms. | `passportOcr`, `freeTextParser`. | Средний | Не смешивать OCR и free-text. |
| 66 | `client/src/pages/MaternityCapitalSharesWizard.js` | `sameNormalized`, `passportKey`, `mergeEgrnParticipants` | Дедупликация участников по ФИО/паспорту. | data_normalizer | EGRN apply flow. | Generic fullName/passport normalizers. | Средний | Можно выделять после теста dedupe. |
| 67 | `client/src/pages/DocumentEditorPage.js` | `wrapPlaceholdersWithChips`, `setEditorContent`, `replaceIfEmptySlot`, restore/render blocks | Оборачивает placeholders, вставляет HTML таблицы, вызывает server render. | export_formatter | Документный редактор. | `renderFinalHtml`, route render. | Высокий | Не менять без editor/export tests. |
| 68 | `client/src/pages/DocumentEditorPage.js` | `formatDateTime` | UI формат времени версий/ревью. | display_formatter | Editor review/version UI. | `client/src/utils/date.js`. | Низкий | Можно заменить на общий UI formatter позже. |
| 69 | `client/src/pages/DocumentDiffPage.js` | `sanitizeDiffHtml` | Клиентская санитизация diff HTML. | export_formatter | Diff page. | `server/services/documentService.sanitizeDiffHtml`, API diff sanitization. | Средний | Не менять без XSS/diff tests. |
| 70 | `client/src/pages/ReviewEditorPage.js` | TipTap `parseHTML`/`renderHTML`, `formatDateTime` | Сохранение классов/стилей и UI даты ревью. | export_formatter | Review editor. | DocumentEditor formatDateTime. | Средний | Editor schema changes only with tests. |
| 71 | `server/services/documentService.js` | `sanitizeDiffHtml` | Санитизация diff HTML. | export_formatter | Versions/diff API. | Client `sanitizeDiffHtml`, `documentsApiRoutes.buildDiffHtml`. | Средний | Унифицировать позже с XSS tests. |
| 72 | `server/services/documentService.js` | `parseAnyDate`, `formatDateLong`, `formatDateShort` | Парсит даты, длинный и короткий формат. | display_formatter | Placeholder formatters `dateLong/dateShort`. | Route/client date parsers. | Высокий | Не менять без template snapshots. |
| 73 | `server/services/documentService.js` | `formatSpaced`, `pluralRu`, `amountToWordsRu`, `tripletToWords`, `pluralForm`, `pluralize`, `formatAmountRu` | Суммы и числа прописью для шаблонов. | ru_grammar | `{{amount|amountRu}}` rendering. | `amountRu`, `makeMoneyParts`. | Высокий | Golden tests по суммам/копейкам. |
| 74 | `server/services/documentService.js` | `expandRepeats`, `applyDataIfAll`, `renderFinalHtml` | Рендерит placeholders, условные блоки и repeat-блоки. | export_formatter | `/render`, PDF/DOCX. | DocumentEditor render flow. | Критический | Не трогать в пакете 2. |
| 75 | `server/services/documentService.js` | `escapeHtmlUi`, `formatRubShortUi`, `buildApartmentTableHtml`, `buildInventoryTableHtml` | HTML-таблицы приложений и UI escaping. | document_html_builder | Server document render. | Client HTML builders. | Высокий | Snapshot tables before extraction. |
| 76 | `server/services/documentTypes/maternityCapitalShares.js` | `escapeHtml`, `text`, `join`, `paragraph`, `list`, `pick` | HTML/text primitives для документа маткапитала. | document_html_builder | Maternity render data. | Many local escape/join helpers. | Средний | Можно вынести только внутри domain package. |
| 77 | `server/services/documentTypes/maternityCapitalShares.js` | `normalizeGender`, `fullName`, `splitName`, `inflectName`, `ageOnDate` | Пол, ФИО, склонение, возраст. | ru_grammar | Maternity participants text. | Rent wizard person helpers. | Высокий | Отдельные tests по ролям/ФИО. |
| 78 | `server/services/documentTypes/maternityCapitalShares.js` | `participantDescription`, `participantSignatures` | Юридическое описание участника и HTML подписи. | document_text_builder | Maternity agreement. | Client participants summary. | Высокий | Не трогать без document snapshots. |
| 79 | `server/services/documentTypes/maternityCapitalShares.js` | `rightsText`, `encumbranceText`, `buildMaternityCapitalText`, `familyText`, `sharesText`, `copiesText` | Юридические разделы соглашения. | document_text_builder | Maternity agreement. | Route legal phrase builders. | Высокий | Domain-specific builder package later. |
| 80 | `server/services/documentTypes/maternityCapitalShares.js` | `buildMaternityCapitalSharesRenderData` | Собирает render data и текстовые блоки для шаблона. | document_text_builder | `documentRoutes` render for docType. | `RentApartmentWizard.enrichFormDataForParties`. | Критический | Не трогать без E2E генерации. |
| 81 | `server/routes/documentRoutes.js` | `parseAnyDateLocal`, `formatDateLongLocal` | Локальная дата для route/render. | display_formatter | Display persons, terms, schedules. | `documentService` date helpers. | Высокий | Дублировать нельзя; объединять после route snapshots. |
| 82 | `server/routes/documentRoutes.js` | `buildGroupLabels`, `buildDisplayForPerson`, `buildTenantRepresentativeGroups`, `buildRepKey` | Грамматика сторон и группировка представителей. | document_text_builder | `/render` для rent. | Client `enrichPersonDisplay`, `prepare*RepresentativeGroups`. | Высокий | Сначала определить источник истины display model. |
| 83 | `server/routes/documentRoutes.js` | `sanitizeAddress`, `buildRegistrationClauseForPerson`, `buildRegistrationText` | Текст регистрации с полом/типом. | ru_grammar | Person HTML and receipt. | `documentFormatters.registrationText`, `genderVerbRegistered`. | Высокий | Нужны tests previous/temporary/none. |
| 84 | `server/routes/documentRoutes.js` | `escapeHtml`, `buildPersonShortHtml`, `buildPersonShortHtmlWithCase` | HTML описания лица с падежом ФИО. | document_html_builder | Расписки/представители/документы. | Maternity participant HTML. | Высокий | Не трогать без snapshots. |
| 85 | `server/routes/documentRoutes.js` | `enforceInlineAlignment`, `insertDocxPageBreaks` | HTML post-processing для PDF/DOCX. | export_formatter | Export endpoints. | DocumentEditor export flow. | Критический | Запретить в пакете 2. |
| 86 | `server/routes/documentRoutes.js` | render endpoint `/docs/:id/render` | Собирает `data.calc`, вызывает `renderFinalHtml`, строит receipt/installments blocks. | export_formatter | Документы rent/maternity. | `documentService.renderFinalHtml`. | Критический | Только E2E. |
| 87 | `server/routes/documentRoutes.js` | `makeMoneyParts`, `buildReceiptHtml`, `buildInstallmentsScheduleHtml` | Деньги прописью, расписка и график платежей HTML. | document_html_builder | Lease receipt/installments. | `formatAmountRu`, `amountRu`. | Критический | Golden tests по расписке. |
| 88 | `server/routes/documentsApiRoutes.js` | `buildDiffHtml` | Санитизация и HTML diff. | export_formatter | Documents API diff. | `documentService.buildDiff`, client diff. | Средний | Центральный diff sanitizer позже. |
| 89 | `server/routes/documentReviewRoutes.js` | `buildReviewUrl`, formatted rows | URL ревью и форматирование списка ревью. | display_formatter | Review API. | Editor review date format. | Низкий | UI/API display only. |
| 90 | `server/routes/reviewRoutes.js` | `sanitizeIncomingHtml`, `buildCompletedEmail` | Санитизация HTML ревью и сборка email текста. | export_formatter | Review submit flow. | `sanitizeDiffHtml`, mail templates. | Средний | Не смешивать с document HTML. |
| 91 | `server/services/pdfGenerator.js` / `server/services/pdfGenerator — копия.js` | PDF generator blocks | Экспортный формат PDF через pdfMake. | export_formatter | PDF export. | `documentRoutes` export post-processing. | Критический | Не трогать без visual/PDF tests. |
| 92 | `server/services/docxGenerator.js` | DOCX generation blocks | Экспорт HTML в DOCX. | export_formatter | DOCX endpoint. | `insertDocxPageBreaks`. | Критический | Не трогать без binary/golden checks. |
| 93 | `server/utils/counterpartyPrivacy.js` | `maskFioToInitials`, `maskBirthDate`, `maskPassport*`, `maskSnils`, `normalizeText`, rule detectors | Маскирование персональных данных и подбор правил по ключам. | data_normalizer | Counterparty reports/privacy. | Passport/SNILS/date normalizers. | Высокий | Это privacy logic, выносить отдельным безопасным пакетом. |
| 94 | `server/services/counterparty/normalize.js` | counterparty normalization helpers | Нормализация ФИО/дат/документов для проверок контрагента. | data_normalizer | Counterparty service. | UI person normalizers. | Средний | Не объединять с document person helpers. |
| 95 | `server/services/counterparty/sources/*` | `buildValidationMessage`, `normalizeKonturCheckState`, `build*CriterionText`, cached payload builders | Нормализация внешних API и текст критериев проверок. | validation_related | Counterparty sources. | Не документные builders. | Средний | Оставить в integration layer. |
| 96 | `server/templates/maternity-capital-shares.html` | placeholder HTML template | Шаблон с `data-ph` placeholders. | export_formatter | Render maternity agreement. | `renderFinalHtml`, document type builder. | Критический | Шаблон не менять. |
| 97 | `server/templates/counterpartyReport.html` | client-side `buildDropdown`, filtering text blocks | HTML/JS отчёта контрагента. | document_html_builder | Counterparty report. | Admin UI filters. | Средний | Отдельно от legal documents. |
| 98 | `templates/lease.html`, `client/public/templates/lease*.html/txt`, `server/templates/lease.html` | lease placeholders and static text | Шаблоны договора найма и приложений. | export_formatter | Editor/render/export. | Document routes/services. | Критический | Не менять без snapshot documents. |

## 3. Карта дублей

### Даты

* `client/src/utils/formatters.js` / `formatDateToText`.
* `server/utils/formatters.js` / `formatDateToText` — почти полная CommonJS-копия client версии.
* `client/src/utils/formatters.js` / `parseDate`.
* `client/src/components/LandlordSection/LandlordSection.jsx` / local `formatDateInput`.
* `client/src/components/TenantSection/TenantSection.jsx` / local `formatDateInput`.
* `client/src/utils/maternityCapitalShares/participantsStep.js` / `formatDateInput`, `toDisplayDate`, `normalizeRussianDate`, `parseDateParts`, `toDate`.
* `client/src/components/RentApartmentWizard.js` / `parseAnyDateToISO`, `formatDateLongRu`.
* `server/services/documentService.js` / `parseAnyDate`, `formatDateLong`, `formatDateShort`.
* `server/routes/documentRoutes.js` / `parseAnyDateLocal`, `formatDateLongLocal`.
* Parsers: `freeTextParser.normalizeDate*`, `passportOcr.normalizeDate`, `extractEGRNFromZip.parseRuDateToSortable`, `extractMaternityCapitalStatement.normalizeDate`.

Вывод: частично похоже. Есть минимум три разных назначения: input mask, юридическая длинная дата, parser-normalization. Объединять можно только слоями, не одним универсальным helper.

### Паспорт

* `formatPassport` / `formatPassportText` / `formatDepartmentCode` в client/server `utils/formatters.js`.
* `LandlordSection` и `TenantSection` применяют эти маски для сторон и представителей.
* `RentApartmentWizard.splitPassport` и `participantsStep.splitPassport` разбивают строку на серию/номер.
* `freeTextParser.normalizePassportNumber`, `passportOcr.normalizePassportNumber`, `extractEGRNDataFromPdf.extractPassport` нормализуют грязный input.
* `server/utils/counterpartyPrivacy.maskPassport*` маскирует паспорт для приватности.

Вывод: похоже только на уровне digits/series/number. UI-mask, parser-normalizer и privacy-mask имеют разное назначение.

### Телефон

* `client/src/utils/formatters.js` / `formatPhone` и `server/utils/formatters.js` / `formatPhone`.
* `freeTextParser.normalizePhone` извлекает телефон из текста.
* `documentFormatters.formatContactsListHtml` дедуплицирует телефоны через digits-only.
* `extractEGRNDataFromPdf.extractContacts` и EGRN ZIP/PDF merge блоки переносят контакты в state.

Вывод: частично похоже. Можно отдельно вынести digits-only и UI-mask, но extraction/merge оставить parser-specific.

### ФИО и склонения

* `LandlordSection.splitFio/declineGenitive` и `TenantSection.splitFio/declineGenitive` — явный дубль.
* `RentApartmentWizard.splitFio/joinFio/declineFioGenitive/buildFioCases` — более полный набор падежей.
* `server/services/documentTypes/maternityCapitalShares.fullName/splitName/inflectName` — domain builder с fallback на `petrovich`.
* `participantsStep.getFullName/splitFullName`, `egrnUiAdapter.splitFio`, `MaternityCapitalSharesWizard.sameNormalized` — data/UI normalizers.
* `freeTextParser.isLikelyFIO/findNameNearPassport` — parser heuristics.

Вывод: похоже, но уровень риска высокий из-за `petrovich`, отсутствия отчества, пола и падежей. Первый безопасный шаг — вынести только дубли `splitFio`/`declineGenitive` для Landlord/Tenant при тестах.

### Пол и регистрация

* `documentFormatters.formatLandlordData`, `formatLandlordInline`, `formatTenantInline` используют `зарегистрирован/зарегистрирована` и `мужской/женский`.
* `RentApartmentWizard.genderWord`, `genderVerbRegistered`, `namedLater`.
* `server/routes/documentRoutes.buildRegistrationClauseForPerson/buildRegistrationText`.
* `server/services/documentTypes/maternityCapitalShares.normalizeGender` и `participantDescription`.
* `participantsStep.genderText`, `registrationText`.
* `freeTextParser.detectGender`, `passportOcr.detectGenderFromText`.

Вывод: частично похоже. Определение пола из текста, UI-label и юридическая фраза регистрации должны остаться разными слоями.

### Суммы и деньги

* `client/src/utils/formatters.js` и `server/utils/formatters.js`: `numberToWords`, `formatRentAmount`, `amountRu`, `numberToWordsRu`.
* `server/services/documentService.formatAmountRu` и связанные helpers.
* `server/routes/documentRoutes.makeMoneyParts`, `fmtDetailed`, receipt/installments amounts.
* `RentApartmentWizard.formatRubShort`, `client/src/hooks/useFormattedCurrency`.
* `shareCalculations.parseMoney/formatMoneyInput/moneyToKopecks`.
* `extractMaternityCapitalStatement.normalizeMoney*`.

Вывод: похоже только на домен «деньги». Есть разные требования: input money, UI currency, amount in words, schedule kopecks, parser of statements. Переносить осторожно.

### Юридические фразы и HTML

* `client/src/utils/documentFormatters.js`: стороны, представители, контакты, квартира HTML/text.
* `client/src/components/RentApartmentWizard.js`: enriched display, signatures HTML, inventory HTML, meter readings text.
* `server/routes/documentRoutes.js`: person HTML, registration text, receipt HTML, installments HTML, render/export post-processing.
* `server/services/documentService.js`: render placeholders, apartment/inventory tables.
* `server/services/documentTypes/maternityCapitalShares.js`: all maternity legal text sections.
* `DocumentEditorPage`, `DocumentDiffPage`, `ReviewEditorPage`: editor/render/diff/export HTML handling.

Вывод: много смешения UI-логики и document-builder-логики. Это самая рискованная зона; сначала нужны snapshot/golden tests.

## 4. Предварительная схема будущего рефакторинга

Без изменения кода сейчас будущую структуру можно планировать так:

* `input masks`
  * date input mask `dd.mm.yyyy`;
  * passport mask;
  * department code mask;
  * phone mask;
  * cadastral and money input masks.
* `normalizers`
  * `digitsOnly`, whitespace normalizers;
  * person fields normalizers: ФИО, паспорт series/number, department code, SNILS;
  * EGRN-specific normalizers should stay in EGRN package until fixtures are stable.
* `display formatters`
  * UI `Intl` date/time;
  * long Russian date for UI/document preview;
  * short money/currency display.
* `ru grammar`
  * pluralization;
  * money/number words;
  * gender labels and verbs;
  * FIO cases via `petrovich` behind a small wrapper with fixtures.
* `document text builders`
  * side/person descriptions;
  * registration clauses;
  * representative group text;
  * maternity-specific clauses.
* `document HTML builders`
  * escape helper;
  * tables for inventory/apartment;
  * signatures/contacts;
  * receipt/installment HTML.
* `parser-specific helpers`
  * free text/passport OCR;
  * EGRN PDF/XML/ZIP;
  * maternity statement;
  * bank details text/PDF/QR.

Главный принцип: сначала разделять по назначению, а не по похожему имени функции. `normalizeDate` в OCR, `formatDateInput` в форме и `formatDateLong` в документе не должны попасть в один API без явных контрактов.

## 5. Что можно безопасно вынести в пакете 2

Самые безопасные кандидаты для следующего пакета при условии добавления минимальных unit tests:

1. Единая UI-маска даты `formatDateInput` для `LandlordSection`, `TenantSection` и, возможно, `participantsStep`, если подтверждено одинаковое поведение на пустой строке, коротком вводе и лишних символах.
2. `formatPassport` и `formatDepartmentCode` из `client/src/utils/formatters.js` как stable input-mask helpers; не смешивать с parser-normalizers и privacy-mask.
3. Малые `digitsOnly`/`normalizeWhitespace` helpers, но только для новых мест или с точной заменой локальных `onlyDigits`/`norm` после теста.
4. UI-only `formatDateTime` из `DocumentEditorPage`/`ReviewEditorPage` можно заменить на `client/src/utils/date.js`, если формат совпадает.
5. Дубли `splitFio` + `declineGenitive` в `LandlordSection`/`TenantSection` можно вынести в общий client helper, но только с тестами для мужского/женского пола, отсутствующего отчества и ошибки `petrovich`.

Не брать в пакет 2:

* `server/routes/documentRoutes.js` render/export/post-processing;
* `server/services/documentService.renderFinalHtml` и placeholder pipeline;
* `amountRu`/`formatAmountRu`/receipt money until golden tests;
* EGRN/OCR/free-text parsers;
* `server/services/documentTypes/maternityCapitalShares.js` legal text builders;
* templates and PDF/DOCX generators.

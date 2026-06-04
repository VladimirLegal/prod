import React, { useEffect, useMemo, useRef, useState } from "react";
import FreeTextImportModal from "../common/FreeTextImportModal";
import {
  extractMaternityCapitalStatementFromPdf,
  normalizeSnils,
  parseMaternityCapitalStatementText,
} from "../../utils/maternityCapitalShares/extractMaternityCapitalStatement";
import {
  compareFractions,
  decimalToFraction,
  divideFractionByNumber,
  formatFraction,
  multiplyFractions,
  parseFraction,
  parseMoney,
  sumFractions,
} from "../../utils/maternityCapitalShares/shareCalculations";
import {
  getFullName,
  getParticipantRoleLabel,
} from "../../utils/maternityCapitalShares/participantsStep";
import { validateMaternityCapitalAndSharesStep } from "../../utils/maternityCapitalShares/maternityCapitalAndSharesStep";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";
const pillClass =
  "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2";

const USE_PURPOSES = [
  ["", "Выберите назначение"],
  ["purchase_price_part", "Оплата части цены по договору купли-продажи"],
  ["mortgage_initial_payment", "Первоначальный взнос по ипотеке"],
  [
    "mortgage_debt_repayment",
    "Погашение основного долга / процентов по ипотеке",
  ],
  ["ddu_payment", "Оплата по договору участия в долевом строительстве"],
  ["other", "Иное"],
];

const CALCULATION_MODES = [
  ["minimum_by_maternity_capital", "Минимальные доли по материнскому капиталу"],
  ["equal_between_recipients", "Равные доли между всеми получателями"],
  ["manual", "Ручной расчёт"],
];

const BASE_LABELS = {
  whole_object: "Квартира / объект целиком",
  share_in_apartment: "Доля в квартире",
  communal_room_share: "Комната в коммунальной квартире",
  separate_room: "Отдельная комната",
  stub_house: "Дом с участком",
};

const normalizeName = (value = "") =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const findHolderMatches = (participants = [], parsed = {}) => {
  const parsedName = normalizeName(parsed.certificateHolderFullName);
  const parsedSnils = normalizeSnils(parsed.certificateHolderSnils);
  return participants.filter((participant) => {
    const participantName = normalizeName(getFullName(participant));
    const participantSnils = normalizeSnils(participant.snils || "");
    return (
      (parsedName && participantName && parsedName === participantName) ||
      (parsedSnils && participantSnils && parsedSnils === participantSnils)
    );
  });
};

const getBaseFraction = (base = {}) => {
  if (
    base.type === "share_in_apartment" ||
    base.type === "communal_room_share"
  ) {
    return (
      parseFraction(base.legalShare || base.purchasedShare) || { n: 1, d: 1 }
    );
  }
  if (base.type === "separate_room") {
    const legal = parseFraction(base.legalShare || base.purchasedShare);
    if (legal) return legal;
    const roomArea = Number(String(base.roomArea || "").replace(",", "."));
    const livingArea = Number(String(base.livingArea || "").replace(",", "."));
    if (roomArea > 0 && livingArea > 0)
      return decimalToFraction(roomArea / livingArea);
  }
  return { n: 1, d: 1 };
};

const buildRows = ({ participants, existingRows, recommendedShare, mode }) =>
  participants
    .filter((participant) => participant.receivesShare === true)
    .map((participant) => {
      const existing =
        existingRows.find((row) => row.participantId === participant.id) || {};
      const share =
        mode === "manual" ? existing.recommendedShare || "" : recommendedShare;
      const finalShare = existing.manuallyEdited ? existing.finalShare : share;
      return {
        participantId: participant.id,
        fullName: getFullName(participant),
        role: participant.role,
        personType: participant.personType,
        receivesShare: true,
        recommendedShare: share,
        finalShare: finalShare || "",
        source: existing.source || "auto",
        manuallyEdited: existing.manuallyEdited || false,
        warning:
          share && finalShare && compareFractions(finalShare, share) === -1
            ? "Итоговая доля меньше рекомендуемой."
            : "",
      };
    });

const calculateShares = ({ formData }) => {
  const participants =
    formData.participantsStep?.participants || formData.participants || [];
  const recipients = participants.filter(
    (participant) => participant.receivesShare === true,
  );
  const base = formData.distributionBase || {};
  const shares = formData.shares || {};
  const amountUsed = parseMoney(
    formData.maternityCapital?.amountUsed || shares.maternityCapitalAmount,
  );
  const purchasePrice = parseMoney(
    shares.purchasePriceForCalculation ||
      base.purchasePriceForCalculation ||
      formData.object?.purchasePrice,
  );
  const baseFraction = getBaseFraction(base);
  let maternityPart = null;
  let warning = base.calculationWarning || "";

  if (amountUsed > 0 && purchasePrice > 0) {
    const moneyPart = decimalToFraction(amountUsed / purchasePrice);
    maternityPart = multiplyFractions(baseFraction, moneyPart);
  }

  if (
    base.type === "separate_room" &&
    !parseFraction(base.legalShare || base.purchasedShare) &&
    baseFraction.d !== 1
  ) {
    warning =
      "Юридическая доля рассчитана ориентировочно по площади комнаты. Проверьте долю по ЕГРН и правоустанавливающим документам.";
  }

  let recommendedShare = "";
  if (
    shares.calculationMode === "equal_between_recipients" &&
    recipients.length
  ) {
    recommendedShare = formatFraction(
      divideFractionByNumber(baseFraction, recipients.length),
    );
  } else if (maternityPart && recipients.length) {
    recommendedShare = formatFraction(
      divideFractionByNumber(maternityPart, recipients.length),
    );
  }

  return {
    baseType: base.type || "",
    purchasePriceForCalculation:
      shares.purchasePriceForCalculation ||
      base.purchasePriceForCalculation ||
      formData.object?.purchasePrice ||
      "",
    maternityCapitalAmount:
      formData.maternityCapital?.amountUsed ||
      shares.maternityCapitalAmount ||
      "",
    calculatedMaternityPart: formatFraction(maternityPart),
    calculatedMaternityPartFraction: formatFraction(maternityPart),
    recipientsCount: recipients.length,
    recommendedSharePerRecipient: recommendedShare,
    recommendedSharePerRecipientFraction: recommendedShare,
    rows: buildRows({
      participants,
      existingRows: shares.rows || [],
      recommendedShare,
      mode: shares.calculationMode,
    }),
    warnings: warning ? [warning] : [],
  };
};

const Field = ({ label, children }) => (
  <label className="block">
    <span className={labelClass}>{label}</span>
    {children}
  </label>
);

const TextInput = ({ value, onChange, placeholder = "", type = "text" }) => (
  <input
    type={type}
    value={value || ""}
    onChange={(event) => onChange(event.target.value)}
    placeholder={placeholder}
    className={inputClass}
  />
);

const SelectInput = ({ value, onChange, children }) => (
  <select
    value={value || ""}
    onChange={(event) => onChange(event.target.value)}
    className={inputClass}
  >
    {children}
  </select>
);

const SummaryItem = ({ label, value }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
    <div className="font-medium text-gray-900">{value || "—"}</div>
  </div>
);

export default function MaternityCapitalAndSharesSection({
  formData,
  setFormData,
}) {
  const [parsedStatement, setParsedStatement] = useState(null);
  const [textModalOpen, setTextModalOpen] = useState(false);
  const fileInputRef = useRef(null);
  const participants = useMemo(
    () =>
      formData.participantsStep?.participants || formData.participants || [],
    [formData.participants, formData.participantsStep?.participants],
  );
  const maternityCapital = useMemo(
    () => formData.maternityCapital || {},
    [formData.maternityCapital],
  );
  const shares = formData.shares || {};
  const derived = useMemo(() => calculateShares({ formData }), [formData]);
  const validation = useMemo(
    () => validateMaternityCapitalAndSharesStep(formData),
    [formData],
  );
  const holderMatches = useMemo(
    () => findHolderMatches(participants, parsedStatement || maternityCapital),
    [participants, parsedStatement, maternityCapital],
  );
  const needsManualConfirmation =
    shares.calculationMode === "manual" ||
    (validation.warnings || []).some((warning) =>
      warning.includes("меньше рекомендуемой"),
    );

  useEffect(() => {
    setFormData((prev) => {
      const nextShares = {
        ...prev.shares,
        ...derived,
        warnings: Array.from(
          new Set([
            ...(derived.warnings || []),
            ...(validation.warnings || []),
          ]),
        ),
        errors: validation.errors || [],
      };
      if (JSON.stringify(prev.shares) === JSON.stringify(nextShares))
        return prev;
      return { ...prev, shares: nextShares };
    });
  }, [derived, validation.errors, validation.warnings, setFormData]);

  const updateMaternityCapital = (patch) => {
    setFormData((prev) => ({
      ...prev,
      maternityCapital: { ...prev.maternityCapital, ...patch },
    }));
  };

  const updateShares = (patch) => {
    setFormData((prev) => ({ ...prev, shares: { ...prev.shares, ...patch } }));
  };

  const setParseResult = (parsed, sourceMode, fileName = "") => {
    const matches = findHolderMatches(participants, parsed);
    setParsedStatement(parsed);
    updateMaternityCapital({
      sourceMode,
      parseStatus: "parsed",
      parseWarnings:
        matches.length === 0
          ? ["Владелец сертификата из выписки не найден среди участников."]
          : [],
      statementFileName: fileName,
    });
  };

  const handlePdf = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    updateMaternityCapital({
      sourceMode: "pdf",
      parseStatus: "parsing",
      parseWarnings: [],
      statementFileName: file.name,
    });
    try {
      const parsed = await extractMaternityCapitalStatementFromPdf(file);
      setParseResult(parsed, "pdf", file.name);
    } catch (error) {
      updateMaternityCapital({
        parseStatus: "error",
        parseWarnings: [error?.message || "Не удалось разобрать PDF-выписку."],
      });
    } finally {
      event.target.value = "";
    }
  };

  const handleTextApply = (text) => {
    const parsed = parseMaternityCapitalStatementText(text);
    setParseResult(parsed, "text");
    setTextModalOpen(false);
  };

  const applyParsedStatement = () => {
    if (!parsedStatement) return;
    const matches = findHolderMatches(participants, parsedStatement);
    const autoParticipantId =
      matches.length === 1
        ? matches[0].id
        : maternityCapital.certificateHolderParticipantId;
    updateMaternityCapital({
      ...parsedStatement,
      certificateHolderParticipantId: autoParticipantId || "",
      parseStatus: "applied",
      parseWarnings:
        matches.length === 0
          ? ["Владелец сертификата из выписки не найден среди участников."]
          : [],
    });
  };

  const rejectParsedStatement = () => {
    setParsedStatement(null);
    updateMaternityCapital({
      sourceMode: "manual",
      parseStatus: "idle",
      parseWarnings: [],
    });
  };

  const updateRowFinalShare = (participantId, finalShare) => {
    updateShares({
      rows: (shares.rows || []).map((row) =>
        row.participantId === participantId
          ? { ...row, finalShare, manuallyEdited: true, source: "manual" }
          : row,
      ),
    });
  };

  const finalSum = formatFraction(
    sumFractions(
      (shares.rows || []).map((row) => row.finalShare).filter(Boolean),
    ),
  );
  const isMortgagePurpose = [
    "mortgage_initial_payment",
    "mortgage_debt_repayment",
  ].includes(maternityCapital.usePurpose);

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Сведения о материнском капитале
            </h2>
            <p className="text-sm text-gray-500">
              Загрузите выписку ПФР/СФР или заполните сведения вручную.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`${pillClass} bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-400`}
            >
              Загрузить PDF-выписку
            </button>
            <button
              type="button"
              onClick={() => setTextModalOpen(true)}
              className={`${pillClass} bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-300`}
            >
              Вставить данные выписки текстом
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={handlePdf}
              className="hidden"
            />
          </div>
        </div>

        {maternityCapital.parseStatus === "parsing" && (
          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
            Идёт разбор выписки…
          </div>
        )}
        {maternityCapital.parseStatus === "error" && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {maternityCapital.parseWarnings?.[0] ||
              "Не удалось разобрать выписку."}
          </div>
        )}

        {parsedStatement && maternityCapital.parseStatus === "parsed" && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-4">
            <h3 className="font-semibold text-blue-950">
              Найдены данные из выписки
            </h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <SummaryItem
                label="Дата выписки"
                value={parsedStatement.statementDate}
              />
              <SummaryItem
                label="Владелец сертификата"
                value={parsedStatement.certificateHolderFullName}
              />
              <SummaryItem
                label="СНИЛС"
                value={parsedStatement.certificateHolderSnils}
              />
              <SummaryItem
                label="Серия и номер сертификата"
                value={parsedStatement.certificateFullNumber}
              />
              <SummaryItem
                label="Назначенный размер"
                value={parsedStatement.assignedAmount}
              />
              <SummaryItem
                label="Остаток"
                value={parsedStatement.remainingAmount}
              />
              <SummaryItem
                label="Зарезервировано"
                value={parsedStatement.reservedAmount}
              />
              <SummaryItem
                label="Выплачено"
                value={parsedStatement.paidAmount}
              />
            </div>
            {holderMatches.length === 1 && (
              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
                Владелец сертификата найден среди участников.
              </div>
            )}
            {holderMatches.length === 0 && (
              <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
                Владелец сертификата из выписки не найден среди участников.
                Проверьте участников или выберите владельца сертификата вручную.
              </div>
            )}
            {holderMatches.length > 1 && (
              <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
                Найдено несколько похожих совпадений. Выберите владельца
                сертификата вручную.
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyParsedStatement}
                className={`${pillClass} bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-400`}
              >
                Применить данные выписки
              </button>
              <button
                type="button"
                onClick={rejectParsedStatement}
                className={`${pillClass} bg-white text-gray-900 border border-gray-300 hover:bg-gray-50 focus:ring-gray-300`}
              >
                Не применять — заполнить вручную
              </button>
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Владелец сертификата">
            <SelectInput
              value={maternityCapital.certificateHolderParticipantId}
              onChange={(value) =>
                updateMaternityCapital({
                  certificateHolderParticipantId: value,
                })
              }
            >
              <option value="">Выберите участника</option>
              {participants.map((participant) => (
                <option key={participant.id} value={participant.id}>
                  {getFullName(participant) || "Участник без ФИО"}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="ФИО владельца из выписки / вручную">
            <TextInput
              value={maternityCapital.certificateHolderFullName}
              onChange={(value) =>
                updateMaternityCapital({ certificateHolderFullName: value })
              }
            />
          </Field>
          <Field label="СНИЛС владельца">
            <TextInput
              value={maternityCapital.certificateHolderSnils}
              onChange={(value) =>
                updateMaternityCapital({
                  certificateHolderSnils: normalizeSnils(value) || value,
                })
              }
              placeholder="000-000-000 00"
            />
          </Field>
          <Field label="Дата выписки">
            <TextInput
              value={maternityCapital.statementDate}
              onChange={(value) =>
                updateMaternityCapital({ statementDate: value })
              }
              placeholder="ДД.ММ.ГГГГ"
            />
          </Field>
          <Field label="Серия сертификата">
            <TextInput
              value={maternityCapital.certificateSeries}
              onChange={(value) =>
                updateMaternityCapital({
                  certificateSeries: value,
                  certificateFullNumber:
                    `${value} ${maternityCapital.certificateNumber || ""}`.trim(),
                })
              }
            />
          </Field>
          <Field label="Номер сертификата">
            <TextInput
              value={maternityCapital.certificateNumber}
              onChange={(value) =>
                updateMaternityCapital({
                  certificateNumber: value,
                  certificateFullNumber:
                    `${maternityCapital.certificateSeries || ""} ${value}`.trim(),
                })
              }
            />
          </Field>
          <Field label="Дата выдачи сертификата">
            <TextInput
              value={maternityCapital.certificateIssueDate}
              onChange={(value) =>
                updateMaternityCapital({ certificateIssueDate: value })
              }
              placeholder="ДД.ММ.ГГГГ"
            />
          </Field>
          <Field label="Кем выдан сертификат">
            <TextInput
              value={maternityCapital.certificateIssuedBy}
              onChange={(value) =>
                updateMaternityCapital({ certificateIssuedBy: value })
              }
            />
          </Field>
          <Field label="Номер решения">
            <TextInput
              value={maternityCapital.decisionNumber}
              onChange={(value) =>
                updateMaternityCapital({ decisionNumber: value })
              }
            />
          </Field>
          <Field label="Дата решения">
            <TextInput
              value={maternityCapital.decisionDate}
              onChange={(value) =>
                updateMaternityCapital({ decisionDate: value })
              }
              placeholder="ДД.ММ.ГГГГ"
            />
          </Field>
        </div>

        <div className="grid sm:grid-cols-4 gap-4 rounded-xl bg-gray-50 p-4">
          <SummaryItem
            label="Назначенный размер"
            value={maternityCapital.assignedAmount}
          />
          <SummaryItem
            label="Остаток"
            value={maternityCapital.remainingAmount}
          />
          <SummaryItem
            label="Зарезервировано"
            value={maternityCapital.reservedAmount}
          />
          <SummaryItem label="Выплачено" value={maternityCapital.paidAmount} />
        </div>

        {parseMoney(maternityCapital.paidAmount) > 0 && (
          <button
            type="button"
            onClick={() =>
              updateMaternityCapital({
                amountUsed: maternityCapital.paidAmount,
              })
            }
            className={`${pillClass} bg-green-600 text-white hover:bg-green-700 focus:ring-green-400`}
          >
            Подставить выплаченные средства как сумму, использованную на объект
          </button>
        )}
        {parseMoney(maternityCapital.reservedAmount) > 0 && (
          <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
            В выписке найдены зарезервированные средства. Проверьте, относятся
            ли они к этому объекту.
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Сумма материнского капитала, использованная на объект">
            <TextInput
              value={maternityCapital.amountUsed}
              onChange={(value) =>
                updateMaternityCapital({ amountUsed: value })
              }
              placeholder="800 000,00"
            />
          </Field>
          <Field label="Дата использования / перечисления, если известна">
            <TextInput
              value={maternityCapital.useDate}
              onChange={(value) => updateMaternityCapital({ useDate: value })}
              placeholder="ДД.ММ.ГГГГ"
            />
          </Field>
          <Field label="Назначение использования">
            <SelectInput
              value={maternityCapital.usePurpose}
              onChange={(value) =>
                updateMaternityCapital({ usePurpose: value })
              }
            >
              {USE_PURPOSES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>

        {isMortgagePurpose && (
          <div className="grid sm:grid-cols-3 gap-4 rounded-xl bg-gray-50 p-4">
            <Field label="Кредитный договор №">
              <TextInput
                value={maternityCapital.creditContractNumber}
                onChange={(value) =>
                  updateMaternityCapital({ creditContractNumber: value })
                }
              />
            </Field>
            <Field label="Дата кредитного договора">
              <TextInput
                value={maternityCapital.creditContractDate}
                onChange={(value) =>
                  updateMaternityCapital({ creditContractDate: value })
                }
                placeholder="ДД.ММ.ГГГГ"
              />
            </Field>
            <Field label="Банк / кредитор">
              <TextInput
                value={maternityCapital.lenderName}
                onChange={(value) =>
                  updateMaternityCapital({ lenderName: value })
                }
              />
            </Field>
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5">
        <h2 className="text-xl font-semibold text-gray-900">
          База расчёта долей
        </h2>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <SummaryItem
            label="Что приобреталось"
            value={
              BASE_LABELS[formData.distributionBase?.type] ||
              formData.acquisition?.type ||
              "—"
            }
          />
          <SummaryItem
            label="Площадь объекта"
            value={
              formData.distributionBase?.totalObjectArea ||
              formData.object?.area
            }
          />
          <SummaryItem
            label="Приобретённая доля"
            value={
              formData.distributionBase?.legalShare ||
              formData.distributionBase?.purchasedShare ||
              "—"
            }
          />
          <SummaryItem
            label="База для расчёта"
            value={BASE_LABELS[shares.baseType] || "—"}
          />
        </div>
        <Field label="Цена приобретения / цена приобретённой части">
          <TextInput
            value={
              shares.purchasePriceForCalculation ||
              formData.distributionBase?.purchasePriceForCalculation
            }
            onChange={(value) =>
              updateShares({ purchasePriceForCalculation: value })
            }
            placeholder="8 000 000,00"
          />
        </Field>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Способ расчёта долей">
            <SelectInput
              value={shares.calculationMode}
              onChange={(value) => updateShares({ calculationMode: value })}
            >
              {CALCULATION_MODES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-950">
            <div>
              Маткапитальная часть:{" "}
              <strong>{shares.calculatedMaternityPartFraction || "—"}</strong>
            </div>
            <div>
              Получателей долей: <strong>{shares.recipientsCount || 0}</strong>
            </div>
            <div>
              Рекомендуемая доля каждому:{" "}
              <strong>
                {shares.recommendedSharePerRecipientFraction || "—"}
              </strong>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2">Участник</th>
                <th className="px-3 py-2">Роль</th>
                <th className="px-3 py-2">Тип участника</th>
                <th className="px-3 py-2">Рекомендуемая доля</th>
                <th className="px-3 py-2">Итоговая доля</th>
                <th className="px-3 py-2">Комментарий / предупреждение</th>
              </tr>
            </thead>
            <tbody>
              {(shares.rows || []).map((row) => (
                <tr
                  key={row.participantId}
                  className="border-t border-gray-100"
                >
                  <td className="px-3 py-2 font-medium text-gray-900">
                    {row.fullName || "—"}
                  </td>
                  <td className="px-3 py-2">
                    {getParticipantRoleLabel(row.role)}
                  </td>
                  <td className="px-3 py-2">{row.personType || "—"}</td>
                  <td className="px-3 py-2">{row.recommendedShare || "—"}</td>
                  <td className="px-3 py-2 min-w-[120px]">
                    <TextInput
                      value={row.finalShare}
                      onChange={(value) =>
                        updateRowFinalShare(row.participantId, value)
                      }
                      placeholder="1/40"
                    />
                  </td>
                  <td className="px-3 py-2 text-yellow-800">
                    {row.warning ||
                      (row.manuallyEdited ? "Изменено вручную" : "")}
                  </td>
                </tr>
              ))}
              {!(shares.rows || []).length && (
                <tr>
                  <td className="px-3 py-4 text-gray-500" colSpan="6">
                    В Пакете 3 нет участников с флагом “Получает долю”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="text-sm text-gray-600">
          Сумма итоговых долей: <strong>{finalSum || "—"}</strong>
        </div>

        <div className="rounded-xl bg-gray-50 p-4 space-y-3">
          <h3 className="font-semibold text-gray-900">
            Остаток доли после выделения
          </h3>
          <Field label="Режим остатка">
            <SelectInput
              value={shares.remainderMode}
              onChange={(value) => updateShares({ remainderMode: value })}
            >
              <option value="keep_current_owners">
                Оставить текущим собственникам по данным ЕГРН
              </option>
              <option value="manual">Распределить вручную</option>
            </SelectInput>
          </Field>
          {shares.remainderMode === "manual" && (
            <Field label="Описание ручного распределения остатка">
              <TextInput
                value={shares.remainderDescription}
                onChange={(value) =>
                  updateShares({ remainderDescription: value })
                }
              />
            </Field>
          )}
        </div>

        {needsManualConfirmation && (
          <label className="flex gap-3 rounded-xl bg-yellow-50 p-4 text-sm text-yellow-900">
            <input
              type="checkbox"
              checked={shares.manualConfirmation === true}
              onChange={(event) =>
                updateShares({ manualConfirmation: event.target.checked })
              }
            />
            <span>
              Я понимаю, что итоговые доли указаны вручную и могут отличаться от
              автоматического расчёта.
            </span>
          </label>
        )}

        {!!validation.errors.length && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
            <strong>Блокирующие ошибки:</strong>
            <ul className="list-disc pl-5 mt-2">
              {validation.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        {!!validation.warnings.length && (
          <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800">
            <strong>Предупреждения:</strong>
            <ul className="list-disc pl-5 mt-2">
              {validation.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <FreeTextImportModal
        open={textModalOpen}
        title="Вставьте текст выписки ПФР/СФР"
        onClose={() => setTextModalOpen(false)}
        onApply={handleTextApply}
      />
    </div>
  );
}

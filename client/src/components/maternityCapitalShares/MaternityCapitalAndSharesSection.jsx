import React, { useEffect, useMemo, useRef, useState } from "react";
import FreeTextImportModal from "../common/FreeTextImportModal";
import {
  extractMaternityCapitalStatementFromPdf,
  normalizeSnils,
  parseMaternityCapitalStatementText,
} from "../../utils/maternityCapitalShares/extractMaternityCapitalStatement";
import {
  ceilFractionToReadableFraction,
  ceilPercent,
  ceilSquareMeters,
  compareFractions,
  decimalToFraction,
  divideFractionByNumber,
  formatFraction,
  formatMoneyInput,
  fractionToDecimal,
  moneyRatioToFraction,
  multiplyFractions,
  parseFraction,
  parseMoney,
  subtractFractions,
  sumFractions,
} from "../../utils/maternityCapitalShares/shareCalculations";
import {
  getFullName,
  getParticipantRoleLabel,
  validateParticipantsStep,
} from "../../utils/maternityCapitalShares/participantsStep";
import { validateMaternityCapitalAndSharesStep } from "../../utils/maternityCapitalShares/maternityCapitalAndSharesStep";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";
const pillClass =
  "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2";

const USE_PURPOSES = [
  ["", "Выберите назначение", ""],
  [
    "purchase_price_part",
    "Покупка жилья(без ипотеки)",
    "на приобретение жилого помещения(п. 1 ч. 1 ст. 10  ФЗ № 256-ФЗ от 29.12.2006).",
  ],
  [
    "ddu_payment",
    "Строительство жилья(ДДУ, ЖСК - без ипотки)",
    "на строительство жилого помещения(п. 1 ч. 1 ст. 10  ФЗ № 256-ФЗ от 29.12.2006).",
  ],
  [
    "self_construction",
    "Самостоятельное строительство",
    "на строительство объекта индивидуального жилищного строительства без привлечения организации(п. 2 ч. 1 ст. 10  ФЗ № 256-ФЗ от 29.12.2006).",
  ],
  [
    "self_reconstruction",
    "Самостоятельная реконструкция",
    "на реконструкцию объекта индивидуального жилищного строительства, реконструкцию дома блокированной застройки без привлечения организации(п. 2 ч. 1 ст. 10  ФЗ № 256-ФЗ от 29.12.2006).",
  ],
  [
    "escrow_contractor_ihs",
    "Строительство ИЖС с подрядчиком через эскроу",
    "на строительство объекта индивидуального жилищного строительства  с привлечением организации  по договорам строительного подряда с использованием счетов эскроу(п. 3 ч. 1 ст. 10  ФЗ № 256-ФЗ от 29.12.2006).",
  ],
  [
    "cost_compensation",
    "Компенсация затрат",
    "на компенсацию затрат на построенный объект индивидуального жилищного строительства, реконструированный дом блокированной застройки(ч. 1.3 ст. 10  ФЗ № 256-ФЗ от 29.12.2006).",
  ],
  [
    "old_housing_obligations",
    "Исполнение старых жилищных обязательств",
    "на исполнение связанных с улучшением жилищных условий обязательств, возникших до даты приобретения права на дополнительные меры государственной поддержки(ч. 2 ст. 10  ФЗ № 256-ФЗ от 29.12.2006).",
  ],
  [
    "mortgage_initial_payment",
    "Первоначальный взнос по ипотеке",
    "на уплату первоначального взноса по кредитам или займам на приобретение (строительство) жилого помещения, включая ипотечные кредиты(ч. 6 ст. 10  ФЗ № 256-ФЗ от 29.12.2006).",
  ],
  [
    "mortgage_debt_repayment",
    "Погашение основного долга по ипотеке, кредиту или займу",
    "на погашение основного долга по кредитам или займам на приобретение (строительство) жилого помещения, включая ипотечные кредиты(ч. 6 ст. 10  ФЗ № 256-ФЗ от 29.12.2006)",
  ],
  [
    "mortgage_interest_payment",
    "Уплата процентов по ипотеке, кредиту или займу",
    "на уплату процентов по кредитам или займам на приобретение (строительство) жилого помещения, включая ипотечные кредиты(ч. 6 ст. 10  ФЗ № 256-ФЗ от 29.12.2006).",
  ],
];

const findUsePurposeOption = (value) =>
  USE_PURPOSES.find(([itemValue]) => itemValue === value) || USE_PURPOSES[0];

const CALCULATION_MODES = [
  [
    "area_equal_min_round",
    "1.1 — Точный расчёт по площади с минимальным округлением",
  ],
  [
    "area_children_increased",
    "1.2 — Детям по понятной площади, родителям остаток",
  ],
  ["area_total_rounded_meter", "1.3 — Понятный расчёт по площади"],
  ["cost_total_percent", "2.1 — Простой расчёт в процентах"],
  [
    "cost_children_increased",
    "2.2 — Детям по понятному проценту, родителям остаток",
  ],
  ["cost_equal_rounded_fraction", "2.3 — Рекомендуемый расчёт по стоимости"],
  ["manual", "Ручное распределение долей"],
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

const asPercent = (fraction) => {
  const decimal = fractionToDecimal(fraction);
  return decimal
    ? `${(decimal * 100).toLocaleString("ru-RU", { maximumFractionDigits: 4 })}%`
    : "—";
};

const formatArea = (value) =>
  Number(value || 0).toLocaleString("ru-RU", {
    maximumFractionDigits: 2,
  });

const normalizeCalculationMode = (mode = "") => {
  if (
    ["minimum_by_maternity_capital", "equal_between_recipients", ""].includes(
      mode,
    )
  ) {
    return "cost_equal_rounded_fraction";
  }
  return mode;
};

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


const findTitleOwnerParticipantId = (participants = [], rights = {}) => {
  const ownerBlocks = rights.ownerBlocks || [];
  const titleOwnerName = normalizeName(
    ownerBlocks.find((owner) => owner.fullName || owner.ownerFullName)?.fullName ||
      ownerBlocks.find((owner) => owner.fullName || owner.ownerFullName)?.ownerFullName ||
      rights.owners?.[0]?.fullName ||
      rights.owners?.[0]?.ownerFullName ||
      "",
  );
  if (!titleOwnerName) return "";
  return (
    participants.find(
      (participant) => normalizeName(getFullName(participant)) === titleOwnerName,
    )?.id || ""
  );
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

const getChildren = (recipients = []) =>
  recipients.filter((participant) => participant.role === "child");

const getParents = (recipients = []) =>
  recipients.filter((participant) =>
    ["certificateHolder", "spouse"].includes(participant.role),
  );

const hasMarriageContract = (family = {}) =>
  family.marriageContract?.status === "concluded";

const getRemainderLegalMode = (family = {}, shares = {}) => {
  if (hasMarriageContract(family)) {
    return shares.remainderMode && shares.remainderMode !== "keep_current_owners"
      ? shares.remainderMode
      : "keep_title_owner_by_contract"
  }
  if (shares.remainderMode && shares.remainderMode !== "keep_current_owners")
    return shares.remainderMode;
  if (family.maritalStatusMode === "current_marriage") return "keep_title_owner";
  return "keep_current_owners";
};

const getRemainderLegalText = (mode) => {
  if (mode === "keep_title_owner_by_contract")
    return "Не-МСК-остаток сохраняется за титульным собственником в соответствии с брачным договором. МСК-часть распределяется между обязательными членами семьи.";
  if (mode === "joint_spouses")
    return "Оставшаяся часть объекта после выделения долей по материнскому капиталу сохраняется в общей совместной собственности супругов.";
  if (mode === "manual")
    return "Ручное распределение не-МСК-остатка может изменить режим совместной собственности супругов или иной ранее существующий режим собственности. В этой ситуации может потребоваться нотариальное удостоверение соглашения.";
  if (mode === "keep_title_owner")
    return "Оставшаяся часть объекта остается за текущим титульным собственником по данным ЕГРН. Если объект приобретен в браке и брачный договор отсутствует, семейно-правовой режим указанной части как общего имущества супругов настоящим соглашением не изменяется.";
  return "Оставшаяся часть объекта остается текущим правообладателям по данным ЕГРН.";
};

const buildObjectReadiness = (formData = {}) => {
  const object = formData.object || {};
  const rights = formData.rights || {};
  const encumbrance = formData.encumbrance || {};
  const errors = [];
  const warnings = [];

  if (!formData.ui?.sourceMode) errors.push("Не выбран источник данных.");
  if (!String(object.address || "").trim())
    errors.push("Не заполнен адрес объекта.");
  if (!String(object.cadastralNumber || "").trim())
    errors.push("Не заполнен кадастровый номер.");
  if (!String(object.area || "").trim())
    errors.push("Не заполнена площадь объекта.");
  if (!formData.acquisition?.type) errors.push("Не выбран тип приобретения.");
  if (
    ["house_with_land", "house_with_land_share"].includes(
      formData.acquisition?.type,
    )
  ) {
    errors.push(
      "Выбран дом с участком / доля в доме с участком — сценарий пока не поддержан.",
    );
  }
  if (!rights.ownershipType && !(rights.ownerBlocks || []).length) {
    errors.push("Не заполнены данные права собственности.");
  }
  if (
    !(rights.basisDocuments || []).length &&
    !(rights.documents || []).length
  ) {
    errors.push("Не заполнены документы-основания.");
  }
  if (encumbrance.type && !["none", "unknown"].includes(encumbrance.type)) {
    warnings.push(
      `Есть обременение: ${encumbrance.subtype || encumbrance.description || encumbrance.type}.`,
    );
  }

  return { errors, warnings };
};

const toRow = ({
  participant,
  existing,
  exactShare,
  recommendedShare,
  objectArea,
  retainedRemainderShare,
}) => {
  const automaticShare = retainedRemainderShare
    ? formatFraction(sumFractions([recommendedShare, retainedRemainderShare]))
    : recommendedShare;
  const finalShare = existing?.manuallyEdited
    ? existing.finalShare
    : automaticShare;
  const finalFraction = parseFraction(finalShare);
  return {
    participantId: participant.id,
    fullName: getFullName(participant),
    role: participant.role,
    personType: participant.personType,
    receivesShare: true,
    exactMskShare: formatFraction(exactShare),
    retainedRemainderShare: formatFraction(retainedRemainderShare),
    recommendedShare,
    finalShare: finalShare || "",
    finalShareArea:
      finalFraction && objectArea
        ? formatArea(fractionToDecimal(finalFraction) * objectArea)
        : "",
    exceedsMskMinimum:
      finalFraction && exactShare
        ? compareFractions(finalFraction, exactShare) === 1
        : false,
    source: existing?.source || "auto",
    manuallyEdited: existing?.manuallyEdited || false,
    warning:
      finalFraction &&
      recommendedShare &&
      compareFractions(finalFraction, recommendedShare) === -1
        ? "Итоговая доля меньше рекомендуемой."
        : retainedRemainderShare
          ? "Итоговая доля включает МСК-долю и сохраняемый не-МСК-остаток"
          : "",
  };
};

const calculateShares = ({ formData }) => {
  const participants =
    formData.participantsStep?.participants || formData.participants || [];
  const recipients = participants.filter(
    (participant) => participant.receivesShare === true,
  );
  const base = formData.distributionBase || {};
  const object = formData.object || {};
  const shares = formData.shares || {};
  const mode = normalizeCalculationMode(shares.calculationMode);
  const amountUsed = parseMoney(
    formData.maternityCapital?.amountUsed || shares.maternityCapitalAmount,
  );
  const purchasePrice = parseMoney(
    shares.purchasePriceForCalculation ||
      base.purchasePriceForCalculation ||
      object.purchasePrice,
  );
  const objectArea =
    Number(
      String(object.area || base.totalObjectArea || "").replace(",", "."),
    ) || 0;
  const baseFraction = getBaseFraction(base);
  const acquiredFraction = baseFraction;
  const mskShareRaw =
    amountUsed > 0 && purchasePrice > 0
      ? multiplyFractions(baseFraction, moneyRatioToFraction(amountUsed, purchasePrice))
      : null;
  const mskShare =
    mskShareRaw && compareFractions(mskShareRaw, baseFraction) >= 0
      ? baseFraction
      : mskShareRaw;
  const nonMskShare = mskShare
    ? subtractFractions(baseFraction, mskShare)
    : null;
  const exactPerRecipient =
    mskShare && recipients.length
      ? divideFractionByNumber(mskShare, recipients.length)
      : null;
  const children = getChildren(recipients);
  const parents = getParents(recipients);
  const existingRows = shares.rows || [];
  const titleOwnerParticipantId = hasMarriageContract(formData.family || {})
    ? findTitleOwnerParticipantId(participants, formData.rights || {}) ||
      parents[0]?.id ||
      recipients[0]?.id
    : "";
  const warnings = [];
  let recommendationById = new Map();
  let exactById = new Map();

  recipients.forEach((participant) =>
    exactById.set(participant.id, exactPerRecipient),
  );

  if (mskShare && recipients.length) {
    if (mode === "area_equal_min_round") {
      const personArea = ceilSquareMeters(
        (objectArea * fractionToDecimal(mskShare)) / recipients.length,
        2,
      );
      recipients.forEach((participant) =>
        recommendationById.set(
          participant.id,
          formatFraction(decimalToFraction(personArea / objectArea)),
        ),
      );
    } else if (mode === "area_total_rounded_meter") {
      const roundedMskArea = ceilSquareMeters(
        objectArea * fractionToDecimal(mskShare),
        0,
      );
      const personArea = ceilSquareMeters(
        roundedMskArea / recipients.length,
        2,
      );
      recipients.forEach((participant) =>
        recommendationById.set(
          participant.id,
          formatFraction(decimalToFraction(personArea / objectArea)),
        ),
      );
    } else if (mode === "area_children_increased") {
      const mskArea = objectArea * fractionToDecimal(mskShare);
      const childArea = Math.max(
        1,
        ceilSquareMeters(mskArea / recipients.length, 0),
      );
      const childShare = decimalToFraction(childArea / objectArea);
      const childTotal = decimalToFraction(
        (childArea * children.length) / objectArea,
      );
      const parentBase = subtractFractions(mskShare, childTotal);
      const parentShare =
        parents.length && parentBase && fractionToDecimal(parentBase) > 0
          ? ceilFractionToReadableFraction(
              divideFractionByNumber(parentBase, parents.length),
            )
          : ceilFractionToReadableFraction(exactPerRecipient);
      recipients.forEach((participant) =>
        recommendationById.set(
          participant.id,
          formatFraction(
            participant.role === "child" ? childShare : parentShare,
          ),
        ),
      );
    } else if (mode === "cost_total_percent") {
      const roundedPercent = ceilPercent(fractionToDecimal(mskShare), 0);
      const roundedTotal = decimalToFraction(roundedPercent / 100);
      recipients.forEach((participant) =>
        recommendationById.set(
          participant.id,
          formatFraction(
            divideFractionByNumber(roundedTotal, recipients.length),
          ),
        ),
      );
    } else if (mode === "cost_children_increased") {
      const childPercent = Math.max(
        1,
        ceilPercent(fractionToDecimal(exactPerRecipient), 0),
      );
      const childShare = decimalToFraction(childPercent / 100);
      const childTotal = decimalToFraction(
        (childPercent * children.length) / 100,
      );
      const parentBase = subtractFractions(mskShare, childTotal);
      const parentShare =
        parents.length && parentBase && fractionToDecimal(parentBase) > 0
          ? ceilFractionToReadableFraction(
              divideFractionByNumber(parentBase, parents.length),
            )
          : ceilFractionToReadableFraction(exactPerRecipient);
      recipients.forEach((participant) =>
        recommendationById.set(
          participant.id,
          formatFraction(
            participant.role === "child" ? childShare : parentShare,
          ),
        ),
      );
    } else if (mode !== "manual") {
      const rounded = ceilFractionToReadableFraction(exactPerRecipient);
      recipients.forEach((participant) =>
        recommendationById.set(participant.id, formatFraction(rounded)),
      );
    }
  }

  if (
    base.type === "separate_room" &&
    !parseFraction(base.legalShare || base.purchasedShare) &&
    baseFraction.d !== 1
  ) {
    warnings.push(
      "Юридическая доля рассчитана ориентировочно по площади комнаты. Проверьте долю по ЕГРН и правоустанавливающим документам.",
    );
  }

  const rows = recipients.map((participant) => {
    const existing = existingRows.find(
      (row) => row.participantId === participant.id,
    );
    const recommendedShare =
      mode === "manual"
        ? existing?.recommendedShare || ""
        : recommendationById.get(participant.id) || "";
    return toRow({
      participant,
      existing,
      exactShare: exactById.get(participant.id),
      recommendedShare,
      objectArea,
      retainedRemainderShare:
        participant.id === titleOwnerParticipantId ? nonMskShare : null,
    });
  });
  const distributedShare = sumFractions(
    rows.map((row) => row.finalShare).filter(Boolean),
  );
  const remainderShare = distributedShare
    ? subtractFractions(baseFraction, distributedShare)
    : nonMskShare;
  const overMskShare =
    distributedShare && mskShare
      ? subtractFractions(distributedShare, mskShare)
      : null;
  let riskLevel = "green";
  let manualDistributionWarning = "";
  let notaryRiskWarning = "";

  if (mode === "manual" && distributedShare && mskShare) {
    if (
      compareFractions(distributedShare, baseFraction) === 0 &&
      compareFractions(mskShare, baseFraction) === -1
    ) {
      riskLevel = "red";
      manualDistributionWarning =
        "Выбранный вариант предусматривает распределение всей квартиры между членами семьи в долевую собственность. Такой вариант может изменить режим общей совместной собственности супругов. В этой ситуации может потребоваться нотариальное удостоверение соглашения.";
    } else if (compareFractions(distributedShare, mskShare) === 1) {
      riskLevel = "yellow";
      manualDistributionWarning =
        "Вы распределяете между членами семьи больше, чем часть объекта, оплаченная средствами материнского капитала. Превышение приходится на часть объекта, приобретённую не за счёт средств МСК.";
    } else {
      manualDistributionWarning =
        "Выбранное распределение долей соответствует логике выделения долей в рамках материнского капитала. Оставшаяся часть объекта сохраняет прежний правовой режим.";
    }
  }

  const preservesNonMskRemainder = [
    "keep_title_owner",
    "keep_title_owner_by_contract",
    "keep_current_owners",
    "joint_spouses",
  ].includes(getRemainderLegalMode(formData.family || {}, shares));

  if (
    riskLevel === "red" ||
    (!preservesNonMskRemainder &&
      distributedShare &&
      compareFractions(distributedShare, baseFraction) === 0 &&
      nonMskShare &&
      fractionToDecimal(nonMskShare) > 0)
  ) {
    notaryRiskWarning =
      "Выбранный вариант может изменить режим совместной собственности супругов или предусматривать передачу долей сверх части, оплаченной средствами материнского капитала. В этом случае может потребоваться нотариальное удостоверение соглашения.";
  }

  if (rows.some((row) => row.exceedsMskMinimum)) {
    warnings.push(
      "Доли отдельных членов семьи превышают минимальные расчётные доли, приходящиеся на них в рамках материнского капитала. Это допустимо по соглашению сторон, однако такое увеличение может затрагивать часть объекта, приобретённую не за счёт средств МСК.",
    );
  }
  if (manualDistributionWarning && riskLevel !== "green")
    warnings.push(manualDistributionWarning);
  if (notaryRiskWarning) warnings.push(notaryRiskWarning);

  const remainderLegalMode = getRemainderLegalMode(formData.family || {}, shares);
  const remainderLegalText = getRemainderLegalText(remainderLegalMode);
  if (remainderLegalMode === "manual") {
    warnings.push(remainderLegalText);
    if (!notaryRiskWarning) notaryRiskWarning = remainderLegalText;
  }
  if (hasMarriageContract(formData.family || {})) {
    warnings.push(
      "Объект или не-МСК-остаток принадлежит титульному собственнику в соответствии с брачным договором. МСК-часть рассчитывается на всех обязательных членов семьи. Расчетная МСК-доля титульного собственника прибавляется к сохраняемому за ним остатку.",
    );
  }

  return {
    calculationMode: mode,
    baseType: base.type || "",
    purchasePriceForCalculation:
      shares.purchasePriceForCalculation ||
      base.purchasePriceForCalculation ||
      object.purchasePrice ||
      "",
    maternityCapitalAmount:
      formData.maternityCapital?.amountUsed ||
      shares.maternityCapitalAmount ||
      "",
    calculatedMaternityPart: formatFraction(mskShare),
    calculatedMaternityPartFraction: formatFraction(mskShare),
    mskShare: formatFraction(mskShare),
    nonMskShare: formatFraction(nonMskShare),
    mskArea:
      mskShare && objectArea
        ? formatArea(objectArea * fractionToDecimal(mskShare))
        : "",
    nonMskArea:
      nonMskShare && objectArea
        ? formatArea(objectArea * fractionToDecimal(nonMskShare))
        : "",
    baseFraction: formatFraction(baseFraction),
    acquiredFraction: formatFraction(acquiredFraction),
    recipientsCount: recipients.length,
    exactSharePerRecipient: formatFraction(exactPerRecipient),
    recommendedSharePerRecipient: rows[0]?.recommendedShare || "",
    recommendedSharePerRecipientFraction: rows[0]?.recommendedShare || "",
    distributedShareTotal: formatFraction(distributedShare),
    remainderShare: formatFraction(remainderShare),
    overMskShare:
      overMskShare && fractionToDecimal(overMskShare) > 0
        ? formatFraction(overMskShare)
        : "",
    remainderLegalMode,
    remainderLegalText,
    riskLevel,
    notaryRiskWarning,
    manualDistributionWarning,
    rows,
    warnings,
  };
};

const Field = ({ label, children }) => (
  <label className="block">
    <span className={labelClass}>{label}</span>
    {children}
  </label>
);

const TextInput = ({ value, onChange, onBlur, placeholder = "" }) => (
  <input
    type="text"
    value={value || ""}
    onChange={(event) => onChange(event.target.value)}
    onBlur={onBlur}
    placeholder={placeholder}
    className={inputClass}
  />
);

const MoneyInput = ({ value, onChange, placeholder = "" }) => (
  <TextInput
    value={value}
    onChange={onChange}
    onBlur={() => {
      if (String(value || "").trim()) onChange(formatMoneyInput(value));
    }}
    placeholder={placeholder}
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

const ReadinessGroup = ({ title, errors = [], warnings = [] }) => (
  <div className="rounded-xl border border-gray-200 p-4">
    <h3 className="font-semibold text-gray-900">{title}</h3>
    {!errors.length && !warnings.length && (
      <div className="mt-2 text-sm text-green-700">
        Критичных замечаний нет.
      </div>
    )}
    {!!errors.length && (
      <div className="mt-2 text-sm text-red-800">
        <strong>Критичные ошибки:</strong>
        <ul className="list-disc pl-5 mt-1">
          {errors.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    )}
    {!!warnings.length && (
      <div className="mt-2 text-sm text-yellow-800">
        <strong>Предупреждения:</strong>
        <ul className="list-disc pl-5 mt-1">
          {warnings.map((item) => (
            <li key={item.message || item}>{item.message || item}</li>
          ))}
        </ul>
      </div>
    )}
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
  const holderId =
    formData.participantsStep?.certificateHolderParticipantId || "";
  const holderParticipant = participants.find(
    (participant) => participant.id === holderId,
  );
  const calculationMode = normalizeCalculationMode(shares.calculationMode);
  const derived = useMemo(() => calculateShares({ formData }), [formData]);
  const matcapValidation = useMemo(
    () => validateMaternityCapitalAndSharesStep(formData),
    [formData],
  );
  const participantsValidation = useMemo(
    () =>
      validateParticipantsStep(
        formData.participantsStep || {},
        formData.family || {},
      ),
    [formData.family, formData.participantsStep],
  );
  const objectReadiness = useMemo(
    () => buildObjectReadiness(formData),
    [formData],
  );
  const holderMatches = useMemo(
    () => findHolderMatches(participants, parsedStatement || maternityCapital),
    [participants, parsedStatement, maternityCapital],
  );
  
  const needsManualConfirmation =
    calculationMode === "manual" ||
    (matcapValidation.warnings || []).some((warning) =>
      String(warning).includes("меньше рекомендуемой"),
    );

  useEffect(() => {
    setFormData((prev) => {
      const nextShares = {
        ...prev.shares,
        ...derived,
        warnings: Array.from(
          new Set([
            ...(derived.warnings || []),
            ...(matcapValidation.warnings || []),
          ]),
        ),
        errors: matcapValidation.errors || [],
      };
      if (JSON.stringify(prev.shares) === JSON.stringify(nextShares))
        return prev;
      return { ...prev, shares: nextShares };
    });
  }, [
    derived,
    matcapValidation.errors,
    matcapValidation.warnings,
    setFormData,
  ]);

  const updateMaternityCapital = (patch) => {
    setFormData((prev) => ({
      ...prev,
      maternityCapital: { ...prev.maternityCapital, ...patch },
    }));
  };

  const updateShares = (patch) => {
    setFormData((prev) => ({ ...prev, shares: { ...prev.shares, ...patch } }));
  };

  const updateHolderParticipantId = (value) => {
    setFormData((prev) => ({
      ...prev,
      participantsStep: {
        ...prev.participantsStep,
        certificateHolderParticipantId: value || null,
      },
      maternityCapital: {
        ...prev.maternityCapital,
        certificateHolderParticipantId: value || "",
      },
      family: { ...prev.family, certificateHolderParticipantId: value || "" },
    }));
  };

  const setParseResult = (parsed, sourceMode, fileName = "") => {
    const matches = findHolderMatches(participants, parsed);
    setParsedStatement(parsed);
    updateMaternityCapital({
      sourceMode,
      parseStatus: "parsed",
      parseWarnings: [
        ...(parsed.parseWarnings || []),
        ...(matches.length === 0
          ? ["Владелец сертификата из выписки не найден среди участников."]
          : []),
      ],
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
    const autoParticipantId = matches.length === 1 ? matches[0].id : holderId;
    setFormData((prev) => ({
      ...prev,
      participantsStep: {
        ...prev.participantsStep,
        certificateHolderParticipantId: autoParticipantId || null,
      },
      maternityCapital: {
        ...prev.maternityCapital,
        ...parsedStatement,
        certificateHolderParticipantId: autoParticipantId || "",
        parseStatus: "applied",
        parseWarnings: [
          ...(parsedStatement.parseWarnings || []),
          ...(matches.length === 0
            ? ["Владелец сертификата из выписки не найден среди участников."]
            : []),
        ],
      },
      family: {
        ...prev.family,
        certificateHolderParticipantId:
          autoParticipantId ||
          prev.family?.certificateHolderParticipantId ||
          "",
      },
    }));
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

  const isMortgagePurpose = [
    "mortgage_initial_payment",
    "mortgage_debt_repayment",
    "mortgage_interest_payment",
  ].includes(maternityCapital.usePurpose);
  const allCriticalErrors = [
    ...objectReadiness.errors,
    ...(participantsValidation.errors || []).map(
      (item) => item.message || item,
    ),
    ...(matcapValidation.errors || []),
  ];

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
                label="Тип выписки"
                value={parsedStatement.statementType}
              />
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
            {!!parsedStatement.parseWarnings?.length && (
              <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
                {parsedStatement.parseWarnings.join(" ")}
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
            <SelectInput value={holderId} onChange={updateHolderParticipantId}>
              <option value="">Выберите участника</option>
              {participants.map((participant) => (
                <option key={participant.id} value={participant.id}>
                  {getFullName(participant) || "Участник без ФИО"}
                </option>
              ))}
            </SelectInput>
          </Field>
          <SummaryItem
            label="Выбранный владелец из участников"
            value={holderParticipant ? getFullName(holderParticipant) : "—"}
          />
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

        {!!(maternityCapital.operations || []).length && (
          <div className="rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900">Операции по выписке</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <tbody>
                  {maternityCapital.operations.map((operation) => (
                    <tr
                      key={`${operation.index}-${operation.date}`}
                      className="border-t"
                    >
                      <td className="py-2 pr-3">{operation.date || "—"}</td>
                      <td className="py-2 pr-3">{operation.operationName}</td>
                      <td className="py-2 pr-3 font-medium">
                        {operation.amount}
                      </td>
                      <td className="py-2 text-gray-500">
                        {operation.operationType}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
            Подставить перечисленные средства как сумму, использованную на
            объект
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
            <MoneyInput
              value={maternityCapital.amountUsed}
              onChange={(value) =>
                updateMaternityCapital({ amountUsed: value })
              }
              placeholder="800 000"
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
              onChange={(value) => {
                const [, , usePurposeText = ""] = findUsePurposeOption(value);

                updateMaternityCapital({
                  usePurpose: value,
                  usePurposeText,
                });
              }}
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
          <MoneyInput
            value={
              shares.purchasePriceForCalculation ||
              formData.distributionBase?.purchasePriceForCalculation
            }
            onChange={(value) =>
              updateShares({ purchasePriceForCalculation: value })
            }
            placeholder="8 000 000"
          />
        </Field>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5">
        <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-950 space-y-2">
          <p className="font-semibold">
            Выберите способ расчёта долей по материнскому капиталу.
          </p>
          <p>
            По общему правилу доли определяются исходя из того, какая часть
            стоимости квартиры была оплачена средствами материнского капитала.
            Эта часть распределяется между родителями и детьми. Оставшаяся часть
            квартиры, которая была оплачена не средствами материнского капитала,
            сохраняет прежний режим собственности.
          </p>
          <p>
            Рекомендуемый вариант — расчёт по стоимости квартиры с равным
            распределением долей между всеми членами семьи. Система не округляет
            доли вниз: если применяется округление, оно производится только в
            большую сторону.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Способ расчёта долей">
            <SelectInput
              value={calculationMode}
              onChange={(value) => updateShares({ calculationMode: value })}
            >
              {CALCULATION_MODES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <SummaryItem
            label="Вариант по умолчанию"
            value="2.3 — рекомендуемый расчёт по стоимости"
          />
        </div>

        {calculationMode === "manual" && (
          <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
            Вы можете самостоятельно указать долю каждого члена семьи. После
            ввода долей система проверит, соответствует ли выбранное
            распределение части квартиры, оплаченной средствами материнского
            капитала.
          </div>
        )}

        <div className="grid sm:grid-cols-4 gap-4 rounded-xl bg-gray-50 p-4 text-sm">
          <SummaryItem
            label="Сумма МСК для расчёта"
            value={shares.maternityCapitalAmount}
          />
          <SummaryItem
            label="Дата перечисления"
            value={maternityCapital.useDate}
          />
          <SummaryItem
            label="Цена приобретения"
            value={shares.purchasePriceForCalculation}
          />
          <SummaryItem
            label="Источник цены"
            value={shares.purchasePriceForCalculation ? "поле расчёта / база распределения / объект" : "—"}
          />
          <SummaryItem
            label="МСК-часть объекта"
            value={`${shares.mskShare || "—"} (${asPercent(parseFraction(shares.mskShare))})`}
          />
          <SummaryItem
            label="Распределённая доля"
            value={shares.distributedShareTotal}
          />
          <SummaryItem
            label="Не-МСК-остаток"
            value={shares.remainderShare || shares.nonMskShare}
          />
          <SummaryItem
            label="Правовой режим остатка"
            value={shares.remainderLegalText || getRemainderLegalText(shares.remainderLegalMode)}
          />
          <SummaryItem
            label="МСК-площадь"
            value={shares.mskArea ? `${shares.mskArea} кв. м` : "—"}
          />
          <SummaryItem
            label="Не-МСК площадь"
            value={shares.nonMskArea ? `${shares.nonMskArea} кв. м` : "—"}
          />
          <SummaryItem
            label="Точная доля каждому"
            value={shares.exactSharePerRecipient}
          />
          <SummaryItem
            label="Рекомендуемая доля каждому"
            value={shares.recommendedSharePerRecipientFraction}
          />
        </div>

        {shares.manualDistributionWarning && (
          <div
            className={`rounded-lg p-4 text-sm ${shares.riskLevel === "red" ? "bg-red-50 text-red-800" : shares.riskLevel === "yellow" ? "bg-yellow-50 text-yellow-800" : "bg-green-50 text-green-800"}`}
          >
            {shares.manualDistributionWarning}
          </div>
        )}
        {shares.notaryRiskWarning && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
            {shares.notaryRiskWarning}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2">Участник</th>
                <th className="px-3 py-2">Роль</th>
                <th className="px-3 py-2">Минимальная МСК-доля</th>
                <th className="px-3 py-2">Рекомендуемая доля</th>
                <th className="px-3 py-2">Не-МСК-остаток</th>
                <th className="px-3 py-2">Итоговая доля</th>
                <th className="px-3 py-2">Площадь</th>
                <th className="px-3 py-2">Комментарий</th>
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
                  <td className="px-3 py-2">{row.exactMskShare || "—"}</td>
                  <td className="px-3 py-2">{row.recommendedShare || "—"}</td>
                  <td className="px-3 py-2">
                    {row.retainedRemainderShare || "—"}
                  </td>
                  <td className="px-3 py-2 min-w-[120px]">
                    <TextInput
                      value={row.finalShare}
                      onChange={(value) =>
                        updateRowFinalShare(row.participantId, value)
                      }
                      placeholder="1/40"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {row.finalShareArea ? `${row.finalShareArea} кв. м` : "—"}
                  </td>
                  <td className="px-3 py-2 text-yellow-800">
                    {row.warning ||
                      (row.exceedsMskMinimum
                        ? "Доля выше минимальной МСК-доли"
                        : row.manuallyEdited
                          ? "Изменено вручную"
                          : "")}
                  </td>
                </tr>
              ))}
              {!(shares.rows || []).length && (
                <tr>
                  <td className="px-3 py-4 text-gray-500" colSpan="8">
                    В Пакете 3 нет участников с флагом “Получает долю”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
              <option value="keep_title_owner">
                Оставить остаток за титульным собственником по данным ЕГРН
              </option>
              <option value="joint_spouses">
                Зарегистрировать / сохранить остаток в общей совместной собственности супругов
              </option>
              <option value="keep_current_owners">
                Оставить текущим правообладателям по данным ЕГРН
              </option>
              <option value="keep_title_owner_by_contract">
                Оставить не-МСК-остаток за титульным собственником по брачному договору
              </option>
              <option value="manual">Распределить остаток вручную</option>
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
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Проверка готовности соглашения
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Переходы между вкладками не блокируются. В будущем критичные
              ошибки будут блокировать только кнопку формирования соглашения.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${allCriticalErrors.length ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}
          >
            {allCriticalErrors.length ? "Есть ошибки" : "Готово"}
          </span>
        </div>
        <ReadinessGroup
          title="Объект и право собственности"
          errors={objectReadiness.errors}
          warnings={objectReadiness.warnings}
        />
        <ReadinessGroup
          title="Участники и подписи"
          errors={(participantsValidation.errors || []).map(
            (item) => item.message || item,
          )}
          warnings={participantsValidation.warnings || []}
        />
        <ReadinessGroup
          title="Материнский капитал и расчёт долей"
          errors={matcapValidation.errors || []}
          warnings={Array.from(
            new Set([
              ...(shares.warnings || []),
              ...(matcapValidation.warnings || []),
            ]),
          )}
        />
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

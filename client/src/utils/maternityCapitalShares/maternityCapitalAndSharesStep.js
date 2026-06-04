import { getFullName } from "./participantsStep";
import {
  compareFractions,
  formatFraction,
  parseFraction,
  parseMoney,
  sumFractions,
} from "./shareCalculations";

const normalize = (value = "") => String(value || "").trim();

const getRecipients = (formData = {}) =>
  (
    formData.participantsStep?.participants ||
    formData.participants ||
    []
  ).filter((participant) => participant.receivesShare === true);

const getBaseFraction = (base = {}) => {
  if (
    base.type === "share_in_apartment" ||
    base.type === "communal_room_share" ||
    base.type === "separate_room"
  ) {
    return (
      parseFraction(base.legalShare || base.purchasedShare) || { n: 1, d: 1 }
    );
  }
  return { n: 1, d: 1 };
};

export function validateMaternityCapitalAndSharesStep(formData = {}) {
  const maternityCapital = formData.maternityCapital || {};
  const shares = formData.shares || {};
  const distributionBase = formData.distributionBase || {};
  const participants =
    formData.participantsStep?.participants || formData.participants || [];
  const recipients = getRecipients(formData);
  const errors = [];
  const warnings = [];

  if (!normalize(maternityCapital.certificateHolderParticipantId)) {
    errors.push("Не выбран владелец сертификата.");
  }

  const amountUsed = parseMoney(
    maternityCapital.amountUsed || shares.maternityCapitalAmount,
  );
  const purchasePrice = parseMoney(
    shares.purchasePriceForCalculation ||
      distributionBase.purchasePriceForCalculation ||
      formData.object?.purchasePrice,
  );

  if (!amountUsed)
    errors.push(
      "Не указана сумма материнского капитала, использованная на объект.",
    );
  if (!purchasePrice)
    errors.push("Не указана цена приобретения / цена для расчёта.");
  if (amountUsed && purchasePrice && amountUsed > purchasePrice) {
    errors.push("Сумма материнского капитала больше цены приобретения.");
  }

  if (!recipients.length)
    errors.push("Нет участников с флагом “Получает долю”.");

  const rows = shares.rows || [];
  const recipientRows = rows.filter((row) => row.receivesShare === true);
  if (
    recipients.length &&
    recipientRows.some((row) => !normalize(row.finalShare))
  ) {
    errors.push("Не заполнены итоговые доли.");
  }

  const finalFractions = recipientRows
    .map((row) => parseFraction(row.finalShare))
    .filter(Boolean);
  const finalSum = sumFractions(finalFractions);
  const baseFraction = getBaseFraction(distributionBase);
  if (
    finalSum &&
    baseFraction &&
    compareFractions(finalSum, baseFraction) === 1
  ) {
    errors.push("Сумма итоговых долей больше доступной базы.");
  }

  if (
    distributionBase.type === "stub_house" ||
    ["house_with_land", "house_with_land_share"].includes(
      formData.acquisition?.type,
    )
  ) {
    errors.push("Выбран дом с участком — сценарий пока не поддержан.");
  }

  if (
    maternityCapital.certificateHolderFullName &&
    !maternityCapital.certificateHolderParticipantId
  ) {
    warnings.push(
      "Владелец сертификата из выписки не найден среди участников.",
    );
  }

  participants.forEach((participant) => {
    if (participant.role === "child" && participant.receivesShare === false) {
      warnings.push(
        `Ребёнок ${getFullName(participant) || "без ФИО"} указан в участниках, но не получает долю.`,
      );
    }
    if (participant.role === "spouse" && participant.receivesShare === false) {
      warnings.push(
        `Супруг/супруга ${getFullName(participant) || "без ФИО"} указан в участниках, но не получает долю.`,
      );
    }
  });

  recipientRows.forEach((row) => {
    if (
      row.recommendedShare &&
      row.finalShare &&
      compareFractions(row.finalShare, row.recommendedShare) === -1
    ) {
      warnings.push(
        `Итоговая доля ${row.fullName || "участника"} меньше рекомендуемой (${formatFraction(parseFraction(row.recommendedShare))}).`,
      );
    }
  });

  if (shares.calculationMode === "manual")
    warnings.push("Используется ручной расчёт.");
  if (parseMoney(maternityCapital.reservedAmount) > 0) {
    warnings.push(
      "В выписке есть зарезервированные средства — проверьте, относятся ли они к этому объекту.",
    );
  }
  if (
    parseMoney(maternityCapital.paidAmount) > 0 &&
    amountUsed > 0 &&
    parseMoney(maternityCapital.paidAmount) !== amountUsed
  ) {
    warnings.push(
      "Размер выплаченных средств из выписки не равен сумме, указанной как использованная на объект.",
    );
  }

  return { isValid: errors.length === 0, errors, warnings };
}

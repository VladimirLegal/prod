import { formatDateInput } from "../inputMasks";
import { calculateAgeOnDate, toDisplayDate } from "../dateUtils";
import { getFullName, splitFullName, splitPassport } from "../personIdentity";

const ROLE_DEFAULTS = {
  certificateHolder: {
    label: "Владелец сертификата",
    personType: "adult",
    signingMode: "self",
    receivesShare: true,
    legalCapacityStatus: "full",
    documentType: "passport_rf",
  },
  spouse: {
    label: "Супруг/супруга",
    personType: "adult",
    signingMode: "self",
    receivesShare: true,
    legalCapacityStatus: "full",
    documentType: "passport_rf",
  },
  formerSpouse: {
    label: "Бывший супруг/бывшая супруга",
    personType: "adult",
    signingMode: "self",
    receivesShare: false,
    legalCapacityStatus: "full",
    documentType: "passport_rf",
  },
  child: {
    label: "Ребёнок",
    personType: "minor_under_14",
    signingMode: "by_legal_representative",
    receivesShare: true,
    legalCapacityStatus: "limited",
    documentType: "birth_certificate_rf",
  },
  otherParticipant: {
    label: "Иной участник",
    personType: "adult",
    signingMode: "self",
    receivesShare: false,
    legalCapacityStatus: "full",
    documentType: "passport_rf",
  },
  attorneyRepresentative: {
    label: "Представитель по доверенности",
    personType: "adult",
    signingMode: "as_attorney",
    receivesShare: false,
    legalCapacityStatus: "full",
    documentType: "passport_rf",
  },
};

const emptyDocument = (type = "") => ({
  type,
  series: "",
  number: "",
  issuedBy: "",
  issueDate: "",
  departmentCode: "",
  actRecordNumber: "",
  actRecordDate: "",
});

const makeId = (prefix = "p") =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export {
  calculateAgeOnDate,
  formatDateInput,
  getFullName,
  splitFullName,
  splitPassport,
  toDisplayDate,
  };

const RU_MONTHS = {
  января: "01",
  февраля: "02",
  марта: "03",
  апреля: "04",
  мая: "05",
  июня: "06",
  июля: "07",
  августа: "08",
  сентября: "09",
  октября: "10",
  ноября: "11",
  декабря: "12",
};

const normalizeRussianDate = (value = "") => {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  const numeric = toDisplayDate(text);
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(numeric)) return numeric;
  const match = text.match(/([0-3]?\d)\s+([а-яё]+)\s+(\d{4})/i);
  if (!match) return "";
  const month = RU_MONTHS[match[2]] || RU_MONTHS[match[2].replace(/я$/, "я")];
  if (!month) return "";
  return `${match[1].padStart(2, "0")}.${month}.${match[3]}`;
};

const normalizeText = (value = "") =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

export const parseMarriageCertificateText = (raw = "") => {
  const text = normalizeText(raw);
  const certificateMatch = text.match(
    /свидетельство\s+о\s+заключении\s+брака\s+([A-ZА-ЯЁIХVXLCDM0-9-]+)\s*№?\s*([0-9]+)/i,
  );
  const issueMatch = text.match(
    /выдано\s+(.+?)(?:\s+от\s+|\s+)([0-3]?\d[./-][01]?\d[./-]\d{2,4}|[0-3]?\d\s+[а-яё]+\s+\d{4})(?:\s*года|\s*г\.)?/i,
  );
  const actMatch = text.match(
    /запис[ьи]\s+акта\s+о\s+заключении\s+брака\s*№?\s*([0-9А-Яа-яA-Za-z/-]+)(?:\s+от\s+([0-3]?\d[./-][01]?\d[./-]\d{2,4}|[0-3]?\d\s+[а-яё]+\s+\d{4}))?/i,
  );
  const issueDate = normalizeRussianDate(issueMatch?.[2] || "");
  const actRecordDate = normalizeRussianDate(actMatch?.[2] || "") || issueDate;

  return {
    date: actRecordDate || issueDate,
    certificateSeries: certificateMatch?.[1] || "",
    certificateNumber: certificateMatch?.[2] || "",
    issuedBy: issueMatch?.[1]
      ? normalizeText(issueMatch[1]).replace(/[,.\s]+$/g, "")
      : "",
    issueDate,
    actRecordNumber: actMatch?.[1] || "",
    actRecordDate,
  };
};

export const emptyAttorneyRepresentative = () => ({
  lastName: "",
  firstName: "",
  middleName: "",
  fullNameRaw: "",
  gender: "",
  birthDate: "",
  birthPlace: "",
  registrationAddress: "",
  registrationType: "",
  snils: "",
  document: emptyDocument("passport_rf"),
});

export const emptyPowerOfAttorney = () => ({
  issueDate: "",
  registryNumber: "",
  certifiedBy: "",
  certificationType: "notary",
  // Legacy fields may exist in old drafts; package 3 no longer displays or validates them.
  powersSummary: "",
  allowsAgreementSigning: true,
  allowsStateRegistration: true,
  allowsRosreestrSubmission: true,
  expirationDate: "",
  isSubdelegation: false,
  basePowerOfAttorneyDate: "",
  baseRegistryNumber: "",
});

export const getParticipantRoleLabel = (role) =>
  ROLE_DEFAULTS[role]?.label || "Участник";

export const getPersonTypeByAge = ({
  role,
  birthDate,
  agreementDate,
  legalCapacityStatus,
}) => {
  if (role !== "child") return "adult";
  const age = calculateAgeOnDate(birthDate, agreementDate);
  if (age === null) return "minor_under_14";
  if (age >= 18 || legalCapacityStatus === "full_before_18") return "adult";
  if (age >= 14) return "minor_14_18";
  return "minor_under_14";
};

const withDisplayDates = (participant = {}) => ({
  ...participant,
  birthDate: toDisplayDate(participant.birthDate),
  document: {
    ...participant.document,
    issueDate: toDisplayDate(participant.document?.issueDate),
    actRecordDate: toDisplayDate(participant.document?.actRecordDate),
  },
  powerOfAttorney: participant.powerOfAttorney
    ? {
        ...participant.powerOfAttorney,
        issueDate: toDisplayDate(participant.powerOfAttorney.issueDate),
      }
    : participant.powerOfAttorney,
  attorneyRepresentative: participant.attorneyRepresentative
    ? {
        ...participant.attorneyRepresentative,
        birthDate: toDisplayDate(participant.attorneyRepresentative.birthDate),
        document: {
          ...participant.attorneyRepresentative.document,
          issueDate: toDisplayDate(
            participant.attorneyRepresentative.document?.issueDate,
          ),
        },
      }
    : participant.attorneyRepresentative,
});

export const applyParticipantAgeRules = (participant, agreementDate) => {
  const normalized = withDisplayDates(participant);
  const nextPersonType = getPersonTypeByAge({
    role: normalized.role,
    birthDate: normalized.birthDate,
    agreementDate,
    legalCapacityStatus: normalized.legalCapacityStatus,
  });

  if (normalized.role === "attorneyRepresentative") {
    return {
      ...normalized,
      personType: "adult",
      receivesShare: false,
      signingMode: "as_attorney",
      legalCapacityStatus: "full",
      document: { ...normalized.document, type: "passport_rf" },
    };
  }

  if (normalized.role !== "child") {
    return {
      ...normalized,
      personType: "adult",
      signingMode:
        normalized.signingMode === "as_attorney"
          ? "self"
          : normalized.signingMode,
      legalCapacityStatus: normalized.legalCapacityStatus || "full",
      document: { ...normalized.document, type: "passport_rf" },
    };
  }

  if (nextPersonType === "minor_under_14") {
    return {
      ...normalized,
      personType: nextPersonType,
      signingMode: "by_legal_representative",
      legalCapacityStatus: "limited",
      consentProviderParticipantId: null,
      document: { ...normalized.document, type: "birth_certificate_rf" },
    };
  }

  if (nextPersonType === "minor_14_18") {
    return {
      ...normalized,
      personType: nextPersonType,
      signingMode: "self_with_legal_representative_consent",
      legalCapacityStatus:
        normalized.legalCapacityStatus === "full_before_18"
          ? "full_before_18"
          : "limited",
      legalRepresentativeParticipantId: null,
      document: { ...normalized.document, type: "passport_rf" },
    };
  }

  return {
    ...normalized,
    personType: "adult",
    signingMode: "self",
    legalCapacityStatus:
      normalized.legalCapacityStatus === "full_before_18"
        ? "full_before_18"
        : "full",
    legalRepresentativeParticipantId: null,
    consentProviderParticipantId: null,
    document: { ...normalized.document, type: "passport_rf" },
  };
};

export const createParticipant = (
  role = "otherParticipant",
  overrides = {},
  agreementDate = "",
) => {
  const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.otherParticipant;
  const participant = {
    id: makeId(),
    role,
    personType: defaults.personType,
    receivesShare: defaults.receivesShare,
    signingMode: defaults.signingMode,
    legalCapacityStatus: defaults.legalCapacityStatus,
    legalCapacityBasis: "",
    canBeLegalRepresentative: [
      "certificateHolder",
      "spouse",
      "formerSpouse",
      "otherParticipant",
    ].includes(role),
    guardianshipAuthorityAct: { title: "", number: "", date: "", issuedBy: "" },
    lastName: "",
    firstName: "",
    middleName: "",
    fullNameRaw: "",
    gender: "",
    birthDate: "",
    birthPlace: "",
    registrationAddress: "",
    registrationType: "",
    snils: "",
    document: emptyDocument(defaults.documentType),
    legalRepresentativeParticipantId: null,
    legalRepresentativeBasis: null,
    consentProviderParticipantId: null,
    actsThroughPowerOfAttorney: false,
    attorneyRepresentative: null,
    attorneyRepresentativeParticipantId: null,
    powerOfAttorney: null,
    source: { origin: "manual", needsReview: false, egrnOwnerIndex: null },
    ...overrides,
  };

  return applyParticipantAgeRules(
    {
      ...participant,
      document: {
        ...emptyDocument(defaults.documentType),
        ...(overrides.document || {}),
      },
      attorneyRepresentative: overrides.attorneyRepresentative
        ? {
            ...emptyAttorneyRepresentative(),
            ...overrides.attorneyRepresentative,
            document: {
              ...emptyDocument("passport_rf"),
              ...(overrides.attorneyRepresentative.document || {}),
              type: "passport_rf",
            },
          }
        : participant.attorneyRepresentative,
      source: { ...participant.source, ...(overrides.source || {}) },
    },
    agreementDate,
  );
};

export const createAttorneyRepresentative = (
  overrides = {},
  agreementDate = "",
) => createParticipant("attorneyRepresentative", overrides, agreementDate);

export const createParticipantsStepState = (patch = {}) => ({
  agreementDate: toDisplayDate(patch.agreementDate || ""),
  certificateHolderParticipantId: patch.certificateHolderParticipantId || null,
  participants: Array.isArray(patch.participants) ? patch.participants : [],
});

export const normalizeParticipantsStepState = (
  state = {},
  fallbackAgreementDate = "",
) => {
  const agreementDate = toDisplayDate(
    state.agreementDate || fallbackAgreementDate || "",
  );
  const participants = (
    Array.isArray(state.participants) ? state.participants : []
  ).map((participant) =>
    applyParticipantAgeRules(
      {
        ...createParticipant(
          participant.role || "otherParticipant",
          {},
          agreementDate,
        ),
        ...participant,
        document: {
          ...emptyDocument(participant.document?.type || ""),
          ...(participant.document || {}),
        },
        attorneyRepresentative: participant.attorneyRepresentative
          ? {
              ...emptyAttorneyRepresentative(),
              ...participant.attorneyRepresentative,
              document: {
                ...emptyDocument("passport_rf"),
                ...(participant.attorneyRepresentative.document || {}),
                type: "passport_rf",
              },
            }
          : null,
        source: {
          origin: "manual",
          needsReview: false,
          egrnOwnerIndex: null,
          ...(participant.source || {}),
        },
      },
      agreementDate,
    ),
  );
  const holderId =
    state.certificateHolderParticipantId ||
    participants.find((item) => item.role === "certificateHolder")?.id ||
    null;
  return {
    agreementDate,
    certificateHolderParticipantId: holderId,
    participants,
  };
};

const isBlank = (value) => !String(value || "").trim();
const hasPassport = (person) =>
  ["series", "number", "issuedBy", "issueDate", "departmentCode"].every(
    (key) => !isBlank(person.document?.[key]),
  );
const hasBirthCertificate = (participant) =>
  [
    "series",
    "number",
    "issuedBy",
    "issueDate",
    "actRecordNumber",
    "actRecordDate",
  ].every((key) => !isBlank(participant.document?.[key]));

export const getLegalRepresentativeOptions = (
  participants = [],
  currentParticipantId = "",
) =>
  participants.filter(
    (participant) =>
      participant.id !== currentParticipantId &&
      participant.personType === "adult" &&
      participant.role !== "attorneyRepresentative" &&
      participant.canBeLegalRepresentative,
  );

const validateAdultPerson = ({
  person,
  label,
  code = "P3.5",
  errors,
  requireBirthPlace = true,
  requireRegistration = true,
}) => {
  if (requireBirthPlace && isBlank(person.birthPlace)) {
    errors.push({ code, message: `${label}: заполните место рождения.` });
  }
  if (!hasPassport(person)) {
    errors.push({
      code,
      message: `${label}: заполните паспорт, кем выдан, дату выдачи и код подразделения.`,
    });
  }
  if (
    requireRegistration &&
    person.registrationType !== "none" &&
    isBlank(person.registrationAddress)
  ) {
    errors.push({
      code,
      message: `${label}: заполните адрес регистрации или выберите «Без регистрации».`,
    });
  }
};

const requiredMarriageFields = [
  "date",
  "certificateSeries",
  "certificateNumber",
  "issuedBy",
  "issueDate",
  "actRecordNumber",
];

const hasMissingFields = (target = {}, fields = []) =>
  fields.some((field) => isBlank(target[field]));

export const validateParticipantsStep = (state = {}, family = {}) => {
  const participants = Array.isArray(state.participants)
    ? state.participants
    : [];
  const shareParticipants = participants.filter(
    (participant) => participant.role !== "attorneyRepresentative",
  );
  const errors = [];
  const warnings = [];

  if (!shareParticipants.length)
    errors.push({
      code: "P3.1",
      message: "Добавьте хотя бы одного участника.",
    });

  const holderCount = shareParticipants.filter(
    (participant) => participant.id === state.certificateHolderParticipantId,
  ).length;
  if (holderCount !== 1)
    errors.push({
      code: "P3.2",
      message: "Выберите ровно одного владельца сертификата.",
    });

  if (
    !shareParticipants.some((participant) => participant.receivesShare === true)
  ) {
    errors.push({
      code: "P3.3",
      message: "Укажите хотя бы одного получателя доли.",
    });
  }

  shareParticipants.forEach((participant, index) => {
    const label =
      getFullName(participant) ||
      `${getParticipantRoleLabel(participant.role)} #${index + 1}`;
    if (
      [
        participant.lastName,
        participant.firstName,
        participant.gender,
        participant.birthDate,
      ].some(isBlank)
    ) {
      errors.push({
        code: "P3.4",
        message: `${label}: заполните ФИО, пол и дату рождения.`,
      });
    }

    if (participant.source?.needsReview) {
      errors.push({
        code: "P3.12",
        message: `${label}: подтвердите данные, импортированные из ЕГРН или парсера.`,
      });
    }

    if (participant.personType === "adult") {
      validateAdultPerson({ person: participant, label, code: "P3.5", errors });
    }

    if (participant.personType === "minor_under_14") {
      if (!hasBirthCertificate(participant)) {
        errors.push({
          code: "P3.6",
          message: `${label}: заполните реквизиты свидетельства о рождении и актовой записи.`,
        });
      }
      const representatives = getLegalRepresentativeOptions(
        participants,
        participant.id,
      ).map((item) => item.id);
      if (
        !participant.legalRepresentativeParticipantId ||
        !representatives.includes(participant.legalRepresentativeParticipantId)
      ) {
        errors.push({
          code: "P3.7",
          message: `${label}: выберите допустимого законного представителя.`,
        });
      }
    }

    if (participant.personType === "minor_14_18") {
      validateAdultPerson({
        person: participant,
        label,
        code: "P3.8",
        errors,
        requireBirthPlace: false,
        requireRegistration: false,
      });
      if (participant.legalCapacityStatus !== "full_before_18") {
        const representatives = getLegalRepresentativeOptions(
          participants,
          participant.id,
        ).map((item) => item.id);
        if (
          !participant.consentProviderParticipantId ||
          !representatives.includes(participant.consentProviderParticipantId)
        ) {
          errors.push({
            code: "P3.9",
            message: `${label}: выберите лицо, дающее согласие.`,
          });
        }
      }
    }

    if (participant.actsThroughPowerOfAttorney) {
      const representative = participant.attorneyRepresentative || {};
      const representativeLabel = `${label}: представитель по доверенности`;
      if (
        [
          representative.lastName,
          representative.firstName,
          representative.gender,
          representative.birthDate,
        ].some(isBlank)
      ) {
        errors.push({
          code: "P3.10",
          message: `${representativeLabel}: заполните ФИО, пол и дату рождения.`,
        });
      }
      validateAdultPerson({
        person: representative,
        label: representativeLabel,
        code: "P3.10",
        errors,
        requireBirthPlace: false,
        requireRegistration: false,
      });
      const power = participant.powerOfAttorney || {};
      if (
        ["issueDate", "registryNumber", "certifiedBy"].some((key) =>
          isBlank(power[key]),
        )
      ) {
        errors.push({
          code: "P3.10",
          message: `${label}: заполните дату, номер и удостоверившее лицо доверенности.`,
        });
      }
    }

    if (!participant.snils)
      warnings.push({ code: "P3.W1", message: `${label}: СНИЛС не указан.` });
    if (participant.role === "child" && participant.receivesShare === false) {
      warnings.push({
        code: "P3.W2",
        message: `${label}: ребёнок не получает долю — проверьте основание.`,
      });
    }
    if (participant.role === "spouse" && participant.receivesShare === false) {
      warnings.push({
        code: "P3.W3",
        message: `${label}: супруг/супруга не получает долю — проверьте основание.`,
      });
    }
    if (participant.role === "formerSpouse") {
      warnings.push({
        code: "P3.W4",
        message: `${label}: бывший супруг добавлен вручную — проверьте основание участия.`,
      });
    }
  });

  const hasSpouse = shareParticipants.some(
    (participant) => participant.role === "spouse",
  );
  const hasFormerSpouse = shareParticipants.some(
    (participant) => participant.role === "formerSpouse",
  );
  const hasMarriageParticipant = hasSpouse || hasFormerSpouse;
  const familyState = family || {};
  const marriage = familyState.marriage || {};
  const divorce = familyState.divorce || {};
  const contract = familyState.marriageContract || {};

  if (hasMarriageParticipant) {
    if (isBlank(familyState.maritalStatusMode)) {
      errors.push({
        code: "P3.M1",
        message: "Заполните тип семейной ситуации в сведениях о браке.",
      });
    }
    if (isBlank(familyState.spouseParticipantId)) {
      errors.push({
        code: "P3.M2",
        message: "Выберите супруга/бывшего супруга в сведениях о браке.",
      });
    }
  }

  if (hasSpouse && familyState.maritalStatusMode === "no_marriage") {
    errors.push({
      code: "P3.M3",
      message:
        "Участник указан как супруг/супруга, но в сведениях о браке выбрано «брак не указывается».",
    });
  }

  if (hasFormerSpouse && familyState.maritalStatusMode !== "former_marriage") {
    errors.push({
      code: "P3.M4",
      message:
        "Для бывшего супруга выберите режим «Брак был заключён, но расторгнут».",
    });
  }

  if (familyState.maritalStatusMode === "current_marriage") {
    if (
      isBlank(familyState.spouseParticipantId) ||
      hasMissingFields(marriage, requiredMarriageFields)
    ) {
      errors.push({
        code: "P3.M5",
        message:
          "Для действующего брака заполните супруга и реквизиты свидетельства о заключении брака.",
      });
    }
  }

  if (familyState.maritalStatusMode === "former_marriage") {
    if (isBlank(familyState.spouseParticipantId) || isBlank(marriage.date)) {
      errors.push({
        code: "P3.M6",
        message:
          "Для бывшего супруга укажите участника и дату заключения брака.",
      });
    }
    if (hasMissingFields(marriage, requiredMarriageFields)) {
      errors.push({
        code: "P3.M7",
        message:
          "Для бывшего супруга заполните реквизиты свидетельства о заключении брака.",
      });
    }
    if (
      isBlank(divorce.date) ||
      isBlank(divorce.certificateSeries) ||
      isBlank(divorce.certificateNumber)
    ) {
      warnings.push({
        code: "P3.MW1",
        message:
          "Указан бывший супруг. Проверьте, нужно ли указать реквизиты расторжения брака.",
      });
    }
  }

  if (contract.status === "concluded") {
    warnings.push({
      code: "P3.MW2",
      message:
        "Если брачный договор изменяет режим собственности в отношении объекта, соглашение требует дополнительной проверки.",
    });
  }

  return { errors, warnings, isValid: errors.length === 0 };
};

const looksLikePublicOwner = (owner = {}) => {
  const name = String(owner.fullName || owner.title || "").toLowerCase();
  return /санкт-петербург|российская федерация|муницип|субъект|город\s+москва|казна|комитет|администрац/.test(
    name,
  );
};

export const buildEgrnParticipantCandidates = (
  ownerBlocks = [],
  agreementDate = "",
) => {
  const candidates = [];
  ownerBlocks.forEach((block) => {
    (block.owners || []).forEach((owner) => {
      if (!owner?.fullName || looksLikePublicOwner(owner)) return;
      const name = splitFullName(owner.fullName);
      candidates.push(
        createParticipant(
          "otherParticipant",
          {
            ...name,
            fullNameRaw: owner.fullName,
            birthDate: toDisplayDate(owner.birthDate || ""),
            birthPlace: owner.birthPlace || "",
            snils: owner.snils || "",
            document: {
              type: "passport_rf",
              series: owner.passport?.series || "",
              number: owner.passport?.number || "",
              issuedBy: owner.passport?.issuedBy || "",
              issueDate: toDisplayDate(owner.passport?.issueDate || ""),
              departmentCode:
                owner.passport?.departmentCode ||
                owner.passport?.deptCode ||
                "",
            },
            source: {
              origin: "egrn",
              needsReview: true,
              egrnOwnerIndex: owner.ownerIndex ?? block.ownerIndex ?? null,
            },
          },
          agreementDate,
        ),
      );
    });
  });
  return candidates;
};

const formatParticipantName = (participant = {}) =>
  getFullName(participant) || participant.fullNameRaw || "[ФИО]";
const genderText = (gender = "") =>
  gender === "male" ? "мужской" : gender === "female" ? "женский" : "[пол]";
const snilsText = (participant = {}) =>
  participant.snils ? `, СНИЛС: ${participant.snils}` : "";
const registrationText = (person = {}) => {
  if (person.registrationType === "none") return "без регистрации";
  if (person.registrationType === "previous")
    return `ранее зарегистрирован по адресу: ${person.registrationAddress || "[адрес]"}`;
  if (person.registrationType === "temporary")
    return `временно зарегистрирован по адресу: ${person.registrationAddress || "[адрес]"}`;
  return `зарегистрирован по адресу: ${person.registrationAddress || "[адрес]"}`;
};
const passportText = (person = {}) => {
  const doc = person.document || {};
  return `паспорт: ${doc.series || "[серия]"} ${doc.number || "[номер]"}, выдан: ${doc.issuedBy || "[кем выдан]"}, ${doc.issueDate || "[дата выдачи]"}, код подразделения: ${doc.departmentCode || "[код]"}`;
};

export const buildParticipantSignatureText = (
  participant = {},
  participants = [],
) => {
  if (
    participant.actsThroughPowerOfAttorney &&
    participant.attorneyRepresentative
  ) {
    const representative = participant.attorneyRepresentative;
    const power = participant.powerOfAttorney || {};
    return `${formatParticipantName(participant)}, ${participant.birthDate || "[дата рождения]"} года рождения, ${passportText(participant)}, в лице представителя ${formatParticipantName(representative)}, ${passportText(representative)}, действующего на основании доверенности от ${power.issueDate || "[дата]"}, реестровый № ${power.registryNumber || "[номер]"}, удостоверенной ${power.certifiedBy || "[кем удостоверена]"}`;
  }

  if (participant.personType === "minor_under_14") {
    const legalRepresentative =
      participants.find(
        (item) => item.id === participant.legalRepresentativeParticipantId,
      ) || {};
    const doc = participant.document || {};
    return `за несовершеннолетнего ${formatParticipantName(participant)}, ${participant.birthDate || "[дата рождения]"} года рождения, свидетельство о рождении ${doc.series || "[серия]"} № ${doc.number || "[номер]"}, выдано ${doc.issuedBy || "[кем]"}, ${doc.issueDate || "[дата]"}, актовая запись № ${doc.actRecordNumber || "[номер]"} от ${doc.actRecordDate || "[дата]"}, действует его законный представитель ${formatParticipantName(legalRepresentative)}`;
  }

  if (participant.personType === "minor_14_18") {
    const consentProvider =
      participants.find(
        (item) => item.id === participant.consentProviderParticipantId,
      ) || {};
    return `${formatParticipantName(participant)}, ${participant.birthDate || "[дата рождения]"} года рождения, ${passportText(participant)}, действующий(ая) с согласия своего законного представителя ${formatParticipantName(consentProvider)}${snilsText(participant)}`;
  }

  return `гр. РФ ${formatParticipantName(participant)}, пол: ${genderText(participant.gender)}, ${participant.birthDate || "[дата рождения]"} года рождения, место рождения: ${participant.birthPlace || "[место рождения]"}, ${passportText(participant)}, ${registrationText(participant)}${snilsText(participant)}`;
};

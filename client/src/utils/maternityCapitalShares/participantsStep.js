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

export const emptyPowerOfAttorney = ({
  principalParticipantId = "",
  representativeParticipantId = "",
} = {}) => ({
  principalParticipantId,
  representativeParticipantId,
  issueDate: "",
  registryNumber: "",
  certifiedBy: "",
  certificationType: "notary",
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

export const getFullName = (participant = {}) =>
  [participant.lastName, participant.firstName, participant.middleName]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ") ||
  participant.fullNameRaw ||
  "";

export const splitFullName = (fullName = "") => {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  return {
    lastName: parts[0] || "",
    firstName: parts[1] || "",
    middleName: parts.slice(2).join(" "),
  };
};

export const calculateAgeOnDate = (birthDate, agreementDate) => {
  if (!birthDate || !agreementDate) return null;
  const birth = new Date(`${birthDate}T00:00:00`);
  const date = new Date(`${agreementDate}T00:00:00`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(date.getTime()))
    return null;
  let age = date.getFullYear() - birth.getFullYear();
  const monthDelta = date.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && date.getDate() < birth.getDate()))
    age -= 1;
  return age;
};

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

export const applyParticipantAgeRules = (participant, agreementDate) => {
  const nextPersonType = getPersonTypeByAge({
    role: participant.role,
    birthDate: participant.birthDate,
    agreementDate,
    legalCapacityStatus: participant.legalCapacityStatus,
  });

  if (participant.role === "attorneyRepresentative") {
    return {
      ...participant,
      personType: "adult",
      receivesShare: false,
      signingMode: "as_attorney",
      legalCapacityStatus: "full",
      document: { ...participant.document, type: "passport_rf" },
    };
  }

  if (participant.role !== "child") {
    return {
      ...participant,
      personType: "adult",
      signingMode:
        participant.signingMode === "as_attorney"
          ? "self"
          : participant.signingMode,
      legalCapacityStatus: participant.legalCapacityStatus || "full",
      document: { ...participant.document, type: "passport_rf" },
    };
  }

  if (nextPersonType === "minor_under_14") {
    return {
      ...participant,
      personType: nextPersonType,
      signingMode: "by_legal_representative",
      legalCapacityStatus: "limited",
      consentProviderParticipantId: null,
      document: { ...participant.document, type: "birth_certificate_rf" },
    };
  }

  if (nextPersonType === "minor_14_18") {
    return {
      ...participant,
      personType: nextPersonType,
      signingMode: "self_with_legal_representative_consent",
      legalCapacityStatus:
        participant.legalCapacityStatus === "full_before_18"
          ? "full_before_18"
          : "limited",
      legalRepresentativeParticipantId: null,
      document: { ...participant.document, type: "passport_rf" },
    };
  }

  return {
    ...participant,
    personType: "adult",
    signingMode: "self",
    legalCapacityStatus:
      participant.legalCapacityStatus === "full_before_18"
        ? "full_before_18"
        : "full",
    legalRepresentativeParticipantId: null,
    consentProviderParticipantId: null,
    document: { ...participant.document, type: "passport_rf" },
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
    guardianshipAuthorityAct: {
      title: "",
      number: "",
      date: "",
      issuedBy: "",
    },
    lastName: "",
    firstName: "",
    middleName: "",
    fullNameRaw: "",
    gender: "",
    birthDate: "",
    birthPlace: "",
    registrationAddress: "",
    snils: "",
    document: emptyDocument(defaults.documentType),
    legalRepresentativeParticipantId: null,
    legalRepresentativeBasis: null,
    consentProviderParticipantId: null,
    actsThroughPowerOfAttorney: false,
    attorneyRepresentativeParticipantId: null,
    powerOfAttorney: null,
    source: {
      origin: "manual",
      needsReview: false,
      egrnOwnerIndex: null,
    },
    notes: "",
    ...overrides,
  };

  return applyParticipantAgeRules(
    {
      ...participant,
      document: {
        ...emptyDocument(defaults.documentType),
        ...(overrides.document || {}),
      },
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
  agreementDate: patch.agreementDate || "",
  certificateHolderParticipantId: patch.certificateHolderParticipantId || null,
  participants: Array.isArray(patch.participants) ? patch.participants : [],
});

export const normalizeParticipantsStepState = (
  state = {},
  fallbackAgreementDate = "",
) => {
  const agreementDate = state.agreementDate || fallbackAgreementDate || "";
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
const hasPassport = (participant) =>
  ["series", "number", "issuedBy", "issueDate"].every(
    (key) => !isBlank(participant.document?.[key]),
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

export const validateParticipantsStep = (state = {}) => {
  const participants = Array.isArray(state.participants)
    ? state.participants
    : [];
  const errors = [];
  const warnings = [];

  if (!participants.length)
    errors.push({
      code: "P3.1",
      message: "Добавьте хотя бы одного участника.",
    });

  const holderCount = participants.filter(
    (participant) => participant.id === state.certificateHolderParticipantId,
  ).length;
  if (holderCount !== 1) {
    errors.push({
      code: "P3.2",
      message: "Выберите ровно одного владельца сертификата.",
    });
  }

  if (!participants.some((participant) => participant.receivesShare === true)) {
    errors.push({
      code: "P3.3",
      message: "Укажите хотя бы одного получателя доли.",
    });
  }

  participants.forEach((participant, index) => {
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

    if (
      participant.role === "attorneyRepresentative" &&
      participant.receivesShare
    ) {
      errors.push({
        code: "P3.11",
        message: `${label}: представитель по доверенности не может получать долю.`,
      });
    }

    if (participant.source?.needsReview) {
      errors.push({
        code: "P3.12",
        message: `${label}: подтвердите данные, импортированные из ЕГРН или парсера.`,
      });
    }

    const signsOrReceives =
      participant.receivesShare ||
      participant.signingMode !== "by_legal_representative";
    if (
      (participant.personType === "adult" ||
        participant.personType === "minor_14_18") &&
      signsOrReceives &&
      !hasPassport(participant)
    ) {
      errors.push({
        code: participant.personType === "minor_14_18" ? "P3.8" : "P3.5",
        message: `${label}: заполните паспортные реквизиты.`,
      });
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

    if (
      participant.personType === "minor_14_18" &&
      participant.legalCapacityStatus !== "full_before_18"
    ) {
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

    if (participant.actsThroughPowerOfAttorney) {
      const representative = participants.find(
        (item) => item.id === participant.attorneyRepresentativeParticipantId,
      );
      const power = participant.powerOfAttorney || {};
      const hasPower = [
        "issueDate",
        "certifiedBy",
        "registryNumber",
        "powersSummary",
      ].every((key) => !isBlank(power[key]));
      if (
        !representative ||
        representative.role !== "attorneyRepresentative" ||
        !hasPower
      ) {
        errors.push({
          code: "P3.10",
          message: `${label}: выберите поверенного и заполните реквизиты доверенности.`,
        });
      }
      if (representative && representative.id === participant.id) {
        errors.push({
          code: "P3.10",
          message: `${label}: представитель не может действовать от имени самого себя.`,
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
    if (participant.role === "formerSpouse" && !participant.notes) {
      warnings.push({
        code: "P3.W4",
        message: `${label}: добавьте пояснение по бывшему супругу в примечании.`,
      });
    }
  });

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
            birthDate: owner.birthDate || "",
            birthPlace: owner.birthPlace || "",
            snils: owner.snils || "",
            document: {
              type: "passport_rf",
              series: owner.passport?.series || "",
              number: owner.passport?.number || "",
              issuedBy: owner.passport?.issuedBy || "",
              issueDate: owner.passport?.issueDate || "",
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
const genderWord = (participant, maleWord, femaleWord) =>
  participant.gender === "female" ? femaleWord : maleWord;
const snilsText = (participant = {}) =>
  participant.snils ? `, СНИЛС: ${participant.snils}` : "";
const passportText = (participant = {}) => {
  const doc = participant.document || {};
  return `паспорт: ${doc.series || "[серия]"} ${doc.number || "[номер]"}, выдан: ${doc.issuedBy || "[кем выдан]"}, ${doc.issueDate || "[дата выдачи]"}, код подразделения: ${doc.departmentCode || "[код]"}`;
};

export const buildParticipantSignatureText = (
  participant = {},
  participants = [],
) => {
  const representative = participants.find(
    (item) => item.id === participant.attorneyRepresentativeParticipantId,
  );
  if (participant.actsThroughPowerOfAttorney && representative) {
    const power = participant.powerOfAttorney || {};
    return `от имени гр. РФ ${formatParticipantName(participant)}, пол: ${participant.gender || "[пол]"}, ${participant.birthDate || "[дата рождения]"} года рождения, место рождения: ${participant.birthPlace || "[место рождения]"}, ${passportText(participant)}, зарегистрирован(а) по адресу: ${participant.registrationAddress || "[адрес]"}, действует гр. РФ ${formatParticipantName(representative)}, ${passportText(representative)}, на основании доверенности от ${power.issueDate || "[дата]"}, удостоверенной ${power.certifiedBy || "[кем удостоверена]"}, реестровый № ${power.registryNumber || "[номер]"}`;
  }

  if (participant.personType === "minor_under_14") {
    const legalRepresentative =
      participants.find(
        (item) => item.id === participant.legalRepresentativeParticipantId,
      ) || {};
    const doc = participant.document || {};
    return `гр. РФ ${formatParticipantName(legalRepresentative)}, пол: ${legalRepresentative.gender || "[пол]"}, ${legalRepresentative.birthDate || "[дата рождения]"} года рождения, место рождения: ${legalRepresentative.birthPlace || "[место рождения]"}, ${passportText(legalRepresentative)}, зарегистрирован(а) по адресу: ${legalRepresentative.registrationAddress || "[адрес]"}, действующий(ая) за себя и как законный представитель своего несовершеннолетнего ${genderWord(participant, "сына", "дочери")} ${formatParticipantName(participant)}, пол: ${participant.gender || "[пол]"}, ${participant.birthDate || "[дата рождения]"} года рождения, зарегистрированного(ой) по адресу: ${participant.registrationAddress || "[адрес ребёнка]"} (свидетельство о рождении ${doc.series || "[серия]"} № ${doc.number || "[номер]"}, выдано ${doc.issuedBy || "[кем]"}, ${doc.issueDate || "[дата]"}, актовая запись № ${doc.actRecordNumber || "[номер]"} от ${doc.actRecordDate || "[дата]"})`;
  }

  if (participant.personType === "minor_14_18") {
    const consentProvider =
      participants.find(
        (item) => item.id === participant.consentProviderParticipantId,
      ) || {};
    return `гр. РФ ${formatParticipantName(participant)}, пол: ${participant.gender || "[пол]"}, ${participant.birthDate || "[дата рождения]"} года рождения, место рождения: ${participant.birthPlace || "[место рождения]"}, ${passportText(participant)}, зарегистрирован(а) по адресу: ${participant.registrationAddress || "[адрес]"}${snilsText(participant)}, действующий(ая) с согласия своего законного представителя ${formatParticipantName(consentProvider)}`;
  }

  return `гр. РФ ${formatParticipantName(participant)}, пол: ${participant.gender || "[пол]"}, ${participant.birthDate || "[дата рождения]"} года рождения, место рождения: ${participant.birthPlace || "[место рождения]"}, ${passportText(participant)}, зарегистрирован(а) по адресу: ${participant.registrationAddress || "[адрес]"}${snilsText(participant)}`;
};
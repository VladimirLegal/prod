import {
  normalizeParticipantsStepState,
  toDisplayDate,
} from "./participantsStep";
export const MATERNITY_CAPITAL_SHARES_STORAGE_KEY =
  "maternityCapitalShares:formData";

export const initialMaternityCapitalSharesForm = {
  documentType: "maternity_capital_shares",

  ui: {
    currentStep: 0,
    sourceMode: "",
    parseStatus: "idle",
    parseWarnings: [],
    clearDraftRequested: false,
  },

  agreement: {
    place: "",
    date: new Date().toLocaleDateString("ru-RU"),
  },

  acquisition: {
    type: "",
    suggestedType: "",
    confidence: "",
    reason: "",
    alternatives: [],
    confirmedByUser: false,
  },

  object: {
    address: "",
    cadastralNumber: "",
    area: "",
    floor: "",
    objectKindFromEgrn: "",
    purpose: "",
    objectName: "",
    residentialKind: "",
    cadastralValue: "",
    recordStatus: "",
    egrnActualDate: "",
    region: "",
    city: "",
    purchasePrice: "",
    purchasedShare: "",
    legalShare: "",
    roomNumber: "",
    roomArea: "",
    livingArea: "",
  },

  rights: {
    ownershipType: "",
    existingShare: "",
    existingShareSource: "",
    existingShareDisplayText: "",
    registrationNumber: "",
    registrationDate: "",
    owners: [],
    rights: [],
    documents: [],
    basisDocuments: [],

    // Новый основной формат для мастера маткапитала:
    // отдельные блоки права по правообладателям.
    // Старое поле basisDocuments не удаляем, чтобы не ломать уже написанную логику.
    ownerBlocks: [],

    shareTotal: "",
    shareTotalIsFullObject: false,
    isWholeObjectOwnership: false,
    sharesMismatch: false,
  },

  encumbrance: {
    type: "unknown",
    subtype: "",
    description: "",
    rawText: "",
    mortgagee: "",
    beneficiary: "",
    registrationNumber: "",
    registrationDate: "",
    term: "",
    basisDocuments: [],
  },

  recipientOwnerMatch: {
    matched: false,
    ambiguous: false,
    matchType: "none",
    recipientName: "",
    ownerFullName: "",
    ownerIndex: null,
    ownershipType: "",
    share: "",
    rights: [],
    documents: [],
  },

  distributionBase: {
    type: "",
    totalObjectArea: "",
    baseArea: "",
    purchasePriceForCalculation: "",
    purchasedShare: "",
    legalShare: "",
    roomArea: "",
    roomNumber: "",
    livingArea: "",
    calculationWarning: "",
    source: "",
  },

  egrn: {
    raw: null,
    parsed: null,
    applied: false,
    source: "",
    fileName: "",
    fileType: "",
  },

  participantsStep: {
    agreementDate: "",
    certificateHolderParticipantId: null,
    participants: [],
  },
  participants: [],
  maternityCapital: {
    sourceMode: "",
    parseStatus: "idle",
    parseWarnings: [],
    statementFileName: "",
    statementDate: "",
    certificateHolderParticipantId: "",
    certificateHolderFullName: "",
    certificateHolderSnils: "",
    certificateSeries: "",
    certificateNumber: "",
    certificateFullNumber: "",
    certificateIssueDate: "",
    certificateIssuedBy: "",
    decisionNumber: "",
    decisionDate: "",
    assignedAmount: "",
    remainingAmount: "",
    reservedAmount: "",
    paidAmount: "",
    amountUsed: "",
    amountUsedWords: "",
    usePurpose: "",
    useDate: "",
    relatedContractType: "",
    relatedContractNumber: "",
    relatedContractDate: "",
    creditContractNumber: "",
    creditContractDate: "",
    lenderName: "",
    operations: [],
    statementType: "",
    initialCertificateAmount: "",
    latestEstablishedAmount: "",
    holderStatus: "",
    rawText: "",
  },
  family: {
    maritalStatusMode: "",
    certificateHolderParticipantId: "",
    spouseParticipantId: "",
    marriage: {
      date: "",
      certificateSeries: "",
      certificateNumber: "",
      issuedBy: "",
      issueDate: "",
      actRecordNumber: "",
      actRecordDate: "",
    },
    divorce: {
      date: "",
      certificateSeries: "",
      certificateNumber: "",
      issuedBy: "",
      issueDate: "",
      actRecordNumber: "",
      actRecordDate: "",
    },
    marriageContract: {
      status: "not_concluded",
      description: "",
    },
    warnings: [],
  },
  shares: {
    calculationMode: "cost_equal_rounded_fraction",
    showAdvancedCalculationModes: false,
    baseType: "",
    purchasePriceForCalculation: "",
    maternityCapitalAmount: "",
    calculatedMaternityPart: "",
    calculatedMaternityPartFraction: "",
    mskShare: "",
    nonMskShare: "",
    mskArea: "",
    nonMskArea: "",
    baseFraction: "",
    acquiredFraction: "",
    recipientsCount: 0,
    exactSharePerRecipient: "",
    recommendedSharePerRecipient: "",
    recommendedSharePerRecipientFraction: "",
    distributedShareTotal: "",
    remainderShare: "",
    overMskShare: "",
    remainderMode: "keep_current_owners",
    remainderDescription: "",
    remainderLegalMode: "joint_spouses",
    riskLevel: "green",
    notaryRiskWarning: "",
    manualDistributionWarning: "",
    rows: [],
    warnings: [],
    errors: [],
    manualConfirmation: false,
  },
};

const mergeObjects = (base, patch) => {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;

  return Object.keys(base).reduce((acc, key) => {
    const baseValue = base[key];
    const patchValue = patch[key];

    if (patchValue === undefined) {
      acc[key] = baseValue;
    } else if (
      baseValue &&
      typeof baseValue === "object" &&
      !Array.isArray(baseValue) &&
      patchValue &&
      typeof patchValue === "object" &&
      !Array.isArray(patchValue)
    ) {
      acc[key] = mergeObjects(baseValue, patchValue);
    } else {
      acc[key] = patchValue;
    }

    return acc;
  }, {});
};

export const hydrateMaternityCapitalSharesForm = (saved) => {
  const hydrated = mergeObjects(initialMaternityCapitalSharesForm, saved || {});
  if (
    (!hydrated.participantsStep.participants ||
      !hydrated.participantsStep.participants.length) &&
    Array.isArray(hydrated.participants)
  ) {
    hydrated.participantsStep = {
      ...hydrated.participantsStep,
      agreementDate:
        hydrated.participantsStep.agreementDate ||
        hydrated.agreement.date ||
        "",
      participants: hydrated.participants,
    };
  }

  hydrated.agreement = {
    ...hydrated.agreement,
    date: toDisplayDate(
      hydrated.agreement.date || new Date().toLocaleDateString("ru-RU"),
    ),
  };
  if (
    ["minimum_by_maternity_capital", "equal_between_recipients"].includes(
      hydrated.shares?.calculationMode,
    )
  ) {
    hydrated.shares.calculationMode = "cost_equal_rounded_fraction";
  }
  hydrated.participantsStep = normalizeParticipantsStepState(
    {
      ...hydrated.participantsStep,
      agreementDate: hydrated.agreement.date,
    },
    hydrated.agreement.date,
  );
  hydrated.participants = hydrated.participantsStep.participants;
  return hydrated;
};
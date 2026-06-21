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
    usePurposeText: "",
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
    calculationMode: "area_recommended",
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
    remainderMode: "title_owner",
    remainderDescription: "",
    remainderLegalMode: "spouses_joint",
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
  const modeMap = {
    minimum_by_maternity_capital: "area_recommended",
    equal_between_recipients: "area_recommended",
    area_equal_min_round: "area_recommended",
    area_children_increased: "area_recommended",
    area_total_rounded_meter: "area_recommended",
    cost_equal_rounded_fraction: "area_recommended",
    cost_total_percent: "percent_whole",
    cost_children_increased: "percent_exact",
    manual: "manual",
  };
  hydrated.shares.calculationMode = modeMap[hydrated.shares?.calculationMode] || hydrated.shares?.calculationMode || "area_recommended";
  const remainderMap = {
    keep_current_owners: "title_owner",
    keep_title_owner: "title_owner",
    joint_spouses: "spouses_joint",
    manual: "fractional",
    keep_title_owner_by_contract: "marriage_contract_current_logic",
  };
  hydrated.shares.remainderMode = remainderMap[hydrated.shares?.remainderMode] || hydrated.shares?.remainderMode || "title_owner";
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
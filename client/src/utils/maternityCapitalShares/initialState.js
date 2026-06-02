export const MATERNITY_CAPITAL_SHARES_STORAGE_KEY =
  "maternityCapitalShares:formData";

export const initialMaternityCapitalSharesForm = {
  documentType: "maternity_capital_shares_agreement",

  ui: {
    currentStep: 0,
     sourceMode: "",
    parseStatus: "idle",
    parseWarnings: [],
    clearDraftRequested: false,
  },

  agreement: {
    place: "",
    date: "",
  },

  acquisition: {
    type: '',
    suggestedType: '',
    confidence: '',
    reason: '',
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
  maternityCapital: {},
  family: {},
  shares: {},
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
  hydrated.participants = hydrated.participantsStep.participants;
  return hydrated;
};
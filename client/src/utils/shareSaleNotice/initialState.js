export const SHARE_SALE_NOTICE_STORAGE_KEY = "share_sale_notice_wizard_draft";

export const initialShareSaleNoticeForm = {
  documentType: "share_sale_notice",

  ui: {
    currentStep: 0,
    sourceMode: "",
    parseStatus: "idle",
    parseWarnings: [],
    clearDraftRequested: false,
  },

  object: {
    address: "",
    cadastralNumber: "",
    area: "",
    floor: "",
    objectKindFromEgrn: "",
    egrnActualDate: "",
    city: "",
  },

  seller: {
    source: "manual",
    ownerIndex: null,
    fullName: "",
    gender: "",
    birthDate: "",
    birthPlace: "",
    passport: "",
    passportIssued: "",
    issueDate: "",
    departmentCode: "",
    registration: "",
    phone: "",
    email: "",
    egrnShare: "",
    saleShare: "",
  },

  saleTerms: {
    place: "",
    date: "",
    price: "",
    priceWords: "",
    noInstallmentClause: true,
  },

  coOwners: [],

  egrn: {
    raw: null,
    parsed: null,
    applied: false,
    source: "",
    fileName: "",
    fileType: "",
  },
};

const mergeObject = (base, value) => ({
  ...base,
  ...(value && typeof value === "object" ? value : {}),
});

export const hydrateShareSaleNoticeForm = (draft = {}) => ({
  ...initialShareSaleNoticeForm,
  ...mergeObject({}, draft),
  documentType: "share_sale_notice",
  ui: mergeObject(initialShareSaleNoticeForm.ui, draft.ui),
  object: mergeObject(initialShareSaleNoticeForm.object, draft.object),
  seller: mergeObject(initialShareSaleNoticeForm.seller, draft.seller),
  saleTerms: mergeObject(initialShareSaleNoticeForm.saleTerms, draft.saleTerms),
  coOwners: Array.isArray(draft.coOwners) ? draft.coOwners : [],
  egrn: mergeObject(initialShareSaleNoticeForm.egrn, draft.egrn),
});

export default initialShareSaleNoticeForm;

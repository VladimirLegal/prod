export const SHARE_SALE_NOTICE_STORAGE_KEY = "share_sale_notice_wizard_draft";

export const createDeliveryAddresses = (
  objectAddress = "",
  existing = null,
  correspondenceAddress = "",
) => {
  const list = Array.isArray(existing) ? existing : [];
  const objectAddressItem = list.find(
    (item) => item?.type === "object_address",
  );
  const correspondenceItem = list.find(
    (item) => item?.type === "correspondence_address",
  );

  return [
    {
      type: "object_address",
      label: "Направить извещение по адресу места нахождения имущества",
      address:
        objectAddressItem?.touched === true
          ? objectAddressItem.address || ""
          : objectAddress || objectAddressItem?.address || "",
      selected: objectAddressItem?.selected !== false,
      touched: objectAddressItem?.touched === true,
    },
    {
      type: "correspondence_address",
      label:
        "Направить извещение по адресу регистрации / месту жительства / месту пребывания",
      address: correspondenceItem?.address || correspondenceAddress || "",
      selected: correspondenceItem?.selected === true,
      touched: correspondenceItem?.touched === true,
    },
  ];
};

export const updateObjectAddressDeliveryAddresses = (
  deliveryAddresses = [],
  objectAddress = "",
) =>
  createDeliveryAddresses(objectAddress, deliveryAddresses).map((item) =>
    item.type === "object_address" && item.touched !== true
      ? { ...item, address: objectAddress || "" }
      : item,
  );

export const createCoOwnerDeliveryPayload = (
  objectAddress = "",
  correspondenceAddress = "",
) => ({
  noticeAddress: objectAddress || "",
  deliveryAddresses: createDeliveryAddresses(
    objectAddress,
    null,
    correspondenceAddress,
  ),
});

const hydrateCoOwner = (coOwner = {}, objectAddress = "") => {
  const legacyNoticeAddress = coOwner.noticeAddress || "";
  const correspondenceAddress = coOwner.registration || "";
  const baseAddress = objectAddress || legacyNoticeAddress;
  const deliveryAddresses = Array.isArray(coOwner.deliveryAddresses)
    ? createDeliveryAddresses(
        baseAddress,
        coOwner.deliveryAddresses,
        correspondenceAddress,
      )
    : createDeliveryAddresses(baseAddress, [
        {
          type: "object_address",
          address: legacyNoticeAddress || baseAddress,
          selected: true,
          touched: Boolean(
            legacyNoticeAddress && legacyNoticeAddress !== objectAddress,
          ),
        },
      ]);

  return {
    ...coOwner,
    noticeAddress: deliveryAddresses[0]?.address || baseAddress || "",
    deliveryAddresses,
  };
};

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
    registrationType: "",
    phone: "",
    email: "",
    egrnShare: "",
    saleShare: "",
    saleShareWords: "",
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

export const hydrateShareSaleNoticeForm = (draft = {}) => {
  const object = mergeObject(initialShareSaleNoticeForm.object, draft.object);

  return {
    ...initialShareSaleNoticeForm,
    ...mergeObject({}, draft),
    documentType: "share_sale_notice",
    ui: mergeObject(initialShareSaleNoticeForm.ui, draft.ui),
    object,
    seller: mergeObject(initialShareSaleNoticeForm.seller, draft.seller),
    saleTerms: mergeObject(
      initialShareSaleNoticeForm.saleTerms,
      draft.saleTerms,
    ),
    coOwners: Array.isArray(draft.coOwners)
      ? draft.coOwners.map((coOwner) => hydrateCoOwner(coOwner, object.address))
      : [],
    egrn: mergeObject(initialShareSaleNoticeForm.egrn, draft.egrn),
  };
};

export default initialShareSaleNoticeForm;

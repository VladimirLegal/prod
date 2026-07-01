import {
  computeSharesTotal,
  matchRecipientToOwner,
  toUiRightsPayload,
} from "../egrnUiAdapter";
import { createCoOwnerDeliveryPayload } from "./initialState";

const firstNonEmpty = (...values) =>
  values.find(
    (value) =>
      value !== undefined && value !== null && String(value).trim() !== "",
  ) || "";

const getShare = (owner = {}) => {
  if (owner.share) return owner.share;
  const fromRights = (owner.rights || [])
    .map((right) => right.share)
    .find(Boolean);
  if (fromRights) return fromRights;
  const fromDocs = (owner.documents || [])
    .map((doc) => doc.share)
    .find(Boolean);
  return fromDocs || "";
};

const joinPassport = (passport = {}) => {
  if (typeof passport === "string") return passport;
  return [passport.series, passport.number].filter(Boolean).join(" ").trim();
};

const ownerToPerson = (owner = {}, index = null) => ({
  source: "egrn",
  ownerIndex: index,
  fullName: owner.fullName || owner.name || "",
  gender: owner.gender || "",
  birthDate: owner.birthDate || "",
  birthPlace: owner.birthPlace || "",
  passport: joinPassport(owner.passport),
  passportIssued: owner.passport?.issuedBy || "",
  issueDate: owner.passport?.issueDate || "",
  departmentCode:
    owner.passport?.deptCode || owner.passport?.departmentCode || "",
  registration: owner.registration || owner.address || "",
  phone: owner.phone || "",
  email: owner.email || "",
  egrnShare: getShare(owner),
  saleShare: getShare(owner),
});

const ownerToCoOwner = (owner = {}, index = null, objectAddress = "") => {
  const registrationAddress = owner.registration || owner.address || "";

  return {
    source: "egrn",
    ownerIndex: index,
    fullName: owner.fullName || owner.name || "",
    birthDate: owner.birthDate || "",
    birthPlace: owner.birthPlace || "",
    registration: registrationAddress,
    phone: owner.phone || "",
    email: owner.email || "",
    ownershipType:
      owner.ownershipType || owner.rights?.[0]?.ownershipType || "",
    share: getShare(owner),
    ...createCoOwnerDeliveryPayload(objectAddress, registrationAddress),
  };
};

const detectCityFromAddress = (address = "") => {
  const text = String(address || "");
  const cityMatch = text.match(
    /(?:^|[,\s])(?:г\.?|город)\s*([А-ЯЁA-Z][А-ЯЁA-Zа-яёa-z\-\s]{1,40})(?=,|$)/u,
  );
  if (cityMatch) return cityMatch[1].trim();
  const settlementMatch = text.match(
    /(?:^|[,\s])(?:п\.?|пос(?:елок)?\.?|с\.?|дер(?:евня)?\.?)\s*([А-ЯЁA-Z][А-ЯЁA-Zа-яёa-z\-\s]{1,40})(?=,|$)/u,
  );
  return settlementMatch?.[1]?.trim() || "";
};

const buildOwnershipWarning = (ownershipType = "") => {
  if (
    ownershipType === "Собственность" ||
    ownershipType === "Индивидуальная собственность"
  ) {
    return "По выписке указан тип права «Собственность»: сособственников нет. Проверьте, нужен ли этот комплект документов.";
  }
  if (ownershipType === "Общая совместная собственность") {
    return "По выписке указана общая совместная собственность: доли не определены, автоматическая подготовка уведомлений невозможна без ручного уточнения.";
  }
  if (ownershipType && ownershipType !== "Общая долевая собственность") {
    return `По выписке указан тип права «${ownershipType}». Проверьте возможность подготовки уведомлений вручную.`;
  }
  return "";
};

export const normalizeEgrnForShareSaleNotice = (parsedEgrn = {}) => {
  const terms = parsedEgrn.terms || {};
  const owners =
    parsedEgrn.extractedLandlords ||
    parsedEgrn.landlords ||
    parsedEgrn.owners ||
    [];
  const rightsPayload = toUiRightsPayload(owners);
  const firstRight = rightsPayload[0] || {};
  const recipientName = firstNonEmpty(
    terms.recipientName,
    parsedEgrn.recipientName,
  );
  const recipientOwnerMatch = matchRecipientToOwner(recipientName, owners);
  const sellerIndex = recipientOwnerMatch.matched
    ? recipientOwnerMatch.ownerIndex
    : null;
  const sellerOwner = sellerIndex !== null ? owners[sellerIndex] : null;
  const ownershipType = firstNonEmpty(
    recipientOwnerMatch.ownershipType,
    firstRight.ownershipType,
    owners[0]?.ownershipType,
  );
  const address = firstNonEmpty(terms.address, parsedEgrn.address);
  const shareTotal = computeSharesTotal(owners);
  const warnings = [buildOwnershipWarning(ownershipType)].filter(Boolean);

  return {
    object: {
      address,
      cadastralNumber: firstNonEmpty(
        terms.cadastralNumber,
        parsedEgrn.cadastralNumber,
      ),
      area: firstNonEmpty(terms.area, parsedEgrn.area),
      floor: firstNonEmpty(terms.floor, parsedEgrn.floor),
      objectKindFromEgrn: firstNonEmpty(
        terms.objectKindFromEgrn,
        terms.residentialKind,
        terms.objectName,
        parsedEgrn.objectKindFromEgrn,
      ),
      egrnActualDate: firstNonEmpty(
        terms.egrnActualDate,
        parsedEgrn.egrnActualDate,
      ),
      city: detectCityFromAddress(address),
    },
    owners,
    rights: {
      ownershipType,
      rights: rightsPayload,
      shareTotal: shareTotal.total,
      shareTotalIsFullObject: shareTotal.isFullObject,
    },
    recipientOwnerMatch,
    suggestedSeller: sellerOwner
      ? ownerToPerson(sellerOwner, sellerIndex)
      : null,
    coOwners: owners
      .map((owner, index) => ownerToCoOwner(owner, index, address))
      .filter((owner) => owner.ownerIndex !== sellerIndex),
    warnings,
    raw: parsedEgrn,
  };
};

export default normalizeEgrnForShareSaleNotice;

import {
  classifyEgrnForMaternityShares,
  computeSharesMismatch,
  computeSharesTotal,
  matchRecipientToOwner,
  toOwnerRightsBlocks,
  toUiDocGroups,
  toUiRightsPayload,
} from '../egrnUiAdapter';
import { buildDistributionBaseDraft } from './objectCalculations';

const firstNonEmpty = (...values) =>
  values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') || '';

const normalizeEncumbrance = (raw) => {
  const empty = {
    type: 'unknown',
    subtype: '',
    description: '',
    rawText: '',
    mortgagee: '',
    beneficiary: '',
    registrationNumber: '',
    registrationDate: '',
    term: '',
    basisDocuments: [],
  };

  if (!raw) return empty;

  if (typeof raw === 'object') {
    const beneficiary = raw.beneficiary || raw.mortgagee || '';
    const type = raw.type || 'unknown';
    const subtype = raw.subtype || (type === 'mortgage' ? 'Ипотека' : '');
    const rawText = raw.rawText || (type === 'mortgage' ? raw.description || '' : '');

    return {
      ...empty,
      ...raw,
      type,
      subtype,
      description: type === 'mortgage'
        ? (subtype || 'Ипотека')
        : (raw.description || ''),
      rawText,
      mortgagee: raw.mortgagee || beneficiary,
      beneficiary,
      registrationNumber: raw.registrationNumber || '',
      registrationDate: raw.registrationDate || '',
      term: raw.term || '',
      basisDocuments: Array.isArray(raw.basisDocuments) ? raw.basisDocuments : [],
    };
  }

  const description = String(raw);
  const normalized = description.toLowerCase();

  if (/не\s+зарегистрировано|не\s+зарегистрированы|отсутств/.test(normalized)) {
    return {
      ...empty,
      type: 'none',
      description: 'Не зарегистрировано',
    };
  }

  if (/ипотек|залог/.test(normalized)) {
    return {
      ...empty,
      type: 'mortgage',
      subtype: 'Ипотека',
      description: 'Ипотека',
      rawText: description,
    };
  }

  if (/арест/.test(normalized)) {
    return {
      ...empty,
      type: 'arrest',
      description,
    };
  }

  if (/запрет|запрещ/.test(normalized)) {
    return {
      ...empty,
      type: 'registration_ban',
      description,
    };
  }

  return {
    ...empty,
    type: 'other',
    description,
  };
};

export const normalizeEgrnForMaternityShares = (parsedEgrn = {}) => {
  const terms = parsedEgrn.terms || {};
  const owners = parsedEgrn.extractedLandlords || parsedEgrn.landlords || [];
  const uiRights = toUiRightsPayload(owners);
  const firstRight = uiRights[0] || {};
  const recipientName = firstNonEmpty(terms.recipientName, parsedEgrn.recipientName);
  const recipientOwnerMatch = matchRecipientToOwner(recipientName, owners);
  const parsedWithMatch = {
    ...parsedEgrn,
    terms,
    extractedLandlords: owners,
    recipientOwnerMatch,
  };
  const suggestion = classifyEgrnForMaternityShares(parsedWithMatch);
  const shareTotal = computeSharesTotal(owners);

  const object = {
    address: firstNonEmpty(terms.address, parsedEgrn.address),
    cadastralNumber: firstNonEmpty(terms.cadastralNumber, parsedEgrn.cadastralNumber),
    area: firstNonEmpty(terms.area, parsedEgrn.area),
    floor: firstNonEmpty(terms.floor, parsedEgrn.floor),
    objectKindFromEgrn: firstNonEmpty(terms.objectKindFromEgrn, parsedEgrn.objectKindFromEgrn),
    purpose: firstNonEmpty(terms.purpose, parsedEgrn.purpose),
    objectName: firstNonEmpty(terms.objectName, parsedEgrn.objectName),
    residentialKind: firstNonEmpty(terms.residentialKind, parsedEgrn.residentialKind),
    cadastralValue: firstNonEmpty(terms.cadastralValue, parsedEgrn.cadastralValue),
    recordStatus: firstNonEmpty(terms.recordStatus, parsedEgrn.recordStatus),
    egrnActualDate: firstNonEmpty(terms.egrnActualDate, parsedEgrn.egrnActualDate),
  };

  const encumbrance = normalizeEncumbrance(firstNonEmpty(terms.encumbrance, parsedEgrn.encumbrance));
  const basisDocuments = owners.flatMap((owner) => toUiDocGroups(owner));
  const documents = owners.flatMap((owner) => owner.documents || []);
  const ownershipType = firstNonEmpty(
    recipientOwnerMatch.ownershipType,
    firstRight.ownershipType,
    owners[0]?.ownershipType,
  );
  let existingShare = firstNonEmpty(recipientOwnerMatch.share, firstRight.share, owners[0]?.share);
  let existingShareSource = existingShare ? 'egrn' : '';
  let shareDisplayText = existingShare;

  if (!existingShare && ownershipType === 'Собственность') {
    existingShare = '1/1';
    existingShareSource = 'implied_full_ownership';
    shareDisplayText = '1/1 — объект принадлежит правообладателю полностью';
  } else if (!existingShare && ownershipType === 'Общая совместная собственность') {
    shareDisplayText = 'Доли не определены — объект находится в общей совместной собственности';
  }

  const ownerBlocks = toOwnerRightsBlocks(owners, encumbrance, {
    recipientOwnerIndex: recipientOwnerMatch.matched ? recipientOwnerMatch.ownerIndex : null,
  });
  const rights = {
    ownershipType,
    existingShare,
    existingShareSource,
    existingShareDisplayText: shareDisplayText,
    registrationNumber: firstNonEmpty(firstRight.regNumber, firstRight.regNum),
    registrationDate: firstNonEmpty(firstRight.regDate),
    owners,
    rights: uiRights,
    documents,
    basisDocuments,
    // Новый основной формат для UI и будущей генерации:
    // отдельные блоки права по правообладателям.
    ownerBlocks,
    shareTotal: shareTotal.total,
    shareTotalIsFullObject: shareTotal.isFullObject,
    isWholeObjectOwnership: ownershipType === 'Собственность' || shareTotal.isFullObject,
    sharesMismatch: computeSharesMismatch(owners),
  };

  const distributionBaseDraft = buildDistributionBaseDraft({
    object,
    acquisitionType: suggestion.suggestedType,
    source: 'egrn-derived',
  });

  return {
    object,
    rights,
    encumbrance,
    recipientOwnerMatch,
    suggestion,
    distributionBaseDraft,
    raw: parsedEgrn,
  };
};

export default normalizeEgrnForMaternityShares;
const path = require('path');
const { amountRu } = require('../../utils/formatters');
const { buildPersonTitle } = require('../../utils/personDisplay');

let petrovich = null;
try {
  petrovich = require('petrovich');
} catch (e) {
  try {
    petrovich = require(path.join(__dirname, '../../../client/node_modules/petrovich'));
  } catch (inner) {
    console.warn('[maternityCapitalShares] Petrovich is not available, names will not be inflected.');
  }
}

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const join = (items, separator = ', ') => items.map(text).filter(Boolean).join(separator);
const paragraph = (content) => content ? `<p>${content}</p>` : '';
const list = (items) => `<ul>${items.filter(Boolean).map((item) => `<li>${item}</li>`).join('')}</ul>`;
const pick = (...values) => values.map(text).find(Boolean) || '';

const normalizeGender = (person = {}) => {
  const raw = text(person.gender || person.sex || person.display?.gender || person.display?.genderWord).toLowerCase();
  if (['female', 'f', 'ж', 'женский', 'женщина'].includes(raw)) return 'female';
  if (['male', 'm', 'м', 'мужской', 'мужчина'].includes(raw)) return 'male';
  const patronymic = text(person.patronymic || person.middleName).toLowerCase();
  if (patronymic.endsWith('вна') || patronymic.endsWith('чна')) return 'female';
  if (patronymic.endsWith('вич') || patronymic.endsWith('ич')) return 'male';
  return 'male';
};

const fullName = (person = {}) => {
  person = person || {};
  return pick(
  person.fullName,
  person.name,
  [person.lastName, person.firstName, person.patronymic || person.middleName].map(text).filter(Boolean).join(' '),
);
};

const splitName = (name = '') => {
  const parts = text(name).split(' ').filter(Boolean);
  return { last: parts[0] || '', first: parts[1] || '', middle: parts.slice(2).join(' ') };
};

const inflectName = (personOrName, grammaticalCase = 'nominative') => {
  const name = typeof personOrName === 'string' ? personOrName : fullName(personOrName);
  if (!name || grammaticalCase === 'nominative' || !petrovich) return name;
  try {
    const parts = splitName(name);
    const gender = normalizeGender(typeof personOrName === 'string' ? parts : personOrName);
    const engine = petrovich[gender] || petrovich.androgynous || petrovich.male;
    return [
      parts.last && engine.last?.[grammaticalCase]?.(parts.last),
      parts.first && engine.first?.[grammaticalCase]?.(parts.first),
      parts.middle && engine.middle?.[grammaticalCase]?.(parts.middle),
    ].filter(Boolean).join(' ') || name;
  } catch (e) {
    console.warn('[maternityCapitalShares] Petrovich failed for', name, grammaticalCase, e.message);
    return name;
  }
};

const ageOnDate = (birthDate, agreementDate) => {
  const parse = (v) => {
    const s = text(v);
    let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const b = parse(birthDate);
  const a = parse(agreementDate) || new Date();
  if (!b) return null;
  let age = a.getFullYear() - b.getFullYear();
  const beforeBirthday = a.getMonth() < b.getMonth() || (a.getMonth() === b.getMonth() && a.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return age;
};

const agreementDateOf = (formData = {}) =>
  formData.agreement?.date || formData.participantsStep?.agreementDate;

const participantAge = (formData, participant = {}) =>
  ageOnDate(participant.birthDate, agreementDateOf(formData));

const isUnder14 = (formData, participant = {}) => {
  const age = participantAge(formData, participant);
  return age !== null && age < 14;
};

const isMinor14To18 = (formData, participant = {}) => {
  const age = participantAge(formData, participant);
  return age !== null && age >= 14 && age < 18;
};

const findParticipant = (formData, idOrName) => {
  const participants = formData.participantsStep?.participants || formData.participants || [];
  return participants.find((p) => String(p.id) === String(idOrName) || fullName(p) === text(idOrName)) || null;
};

const representativeName = (formData, participant = {}) => {
  const rep = participant.legalRepresentative || participant.representative || participant.guardian || {};
  const fromId = findParticipant(
    formData,
    rep.participantId ||
      participant.legalRepresentativeParticipantId ||
      participant.representativeParticipantId ||
      participant.consentProviderParticipantId,
  );

  return fullName(fromId) || fullName(rep) || text(
    rep.fullName ||
      participant.legalRepresentativeFullName ||
      participant.representativeFullName,
  );
};

const representativeParticipant = (formData, participant = {}) => {
  const rep = participant.legalRepresentative || participant.representative || participant.guardian || {};
  return findParticipant(
    formData,
    rep.participantId ||
      participant.legalRepresentativeParticipantId ||
      participant.representativeParticipantId ||
      participant.consentProviderParticipantId,
  );
};

const representativeKey = (formData, participant = {}) => {
  const rep = participant.legalRepresentative || participant.representative || participant.guardian || {};
  const fromId =
    rep.participantId ||
    participant.legalRepresentativeParticipantId ||
    participant.representativeParticipantId ||
    participant.consentProviderParticipantId;

  if (fromId) return `id:${fromId}`;

  const repObj = representativeParticipant(formData, participant);
  if (repObj?.id) return `id:${repObj.id}`;

  const repFullName = representativeName(formData, participant);
  return repFullName ? `name:${repFullName}` : '';
};

const isPowerOfAttorney = (participant = {}) => Boolean(
  participant.signingByRepresentative || participant.hasRepresentative || participant.representative?.attorneyNumber || participant.representative?.powerOfAttorney || participant.powerOfAttorney,
);

const poaDetails = (participant = {}) => pick(
  participant.representative?.powerOfAttorney,
  participant.powerOfAttorney,
  join([
    participant.representative?.attorneyNumber && `№ ${escapeHtml(participant.representative.attorneyNumber)}`,
    participant.representative?.attorneyDate && `от ${escapeHtml(participant.representative.attorneyDate)}`,
  ], ' '),
);

const isPassportRfParticipant = (participant = {}) => {
  const type = participant.document?.type || participant.documentType || '';
  return !type || type === 'passport_rf';
};

const genderWordNoColon = (person = {}) => {
  const gender = normalizeGender(person);
  if (gender === 'female') return 'женский';
  if (gender === 'male') return 'мужской';
  return '';
};

const formatDateLongLocal = (value) => {
  const s = text(value);
  if (!s) return '';

  let m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) {
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) m = [m[0], m[3], m[2], m[1]];
  }

  if (!m) return s;

  const months = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ];

  const day = String(Number(m[1]));
  const month = months[Number(m[2]) - 1];
  const year = m[3];

  return month ? `${day} ${month} ${year}` : s;
};

const birthCertificateTitle = (participant = {}) => {
  const cert = participant.birthCertificate || participant.document || {};

  const series = text(cert.series || cert.birthCertificateSeries);
  const number = text(cert.number || cert.birthCertificateNumber);
  const issuedBy = text(cert.issuedBy || cert.birthCertificateIssuedBy);
  const actNumber = text(cert.actRecordNumber || cert.birthActRecordNumber);
  const actDate = formatDateLongLocal(cert.actRecordDate || cert.birthActRecordDate);

  const certParts = join([
    series,
    number && `№ ${number}`,
  ], ' ');

  const parts = [];

  if (certParts) {
    parts.push(`свидетельство о рождении ${certParts}`);
  } else {
    parts.push('свидетельство о рождении');
  }

  if (issuedBy) parts.push(`выдано ${issuedBy}`);

  if (actNumber || actDate) {
    parts.push(`запись акта о рождении${actNumber ? ` № ${actNumber}` : ''}${actDate ? ` от ${actDate}` : ''}`);
  }

  return parts.join(', ');
};

const under14ChildTitleGenitive = (participant = {}) => {
  const name = inflectName(participant, 'genitive') || fullName(participant);
  const birthDate = formatDateLongLocal(participant.birthDate);
  const birthPlace = text(participant.birthPlace);
  const genderWord = genderWordNoColon(participant);
  const registration = text(
    participant.registrationAddress ||
    participant.registration ||
    participant.address,
  );

  const parts = [
    name,
    birthDate && `${birthDate} года рождения`,
    birthPlace && `место рождения: ${birthPlace}`,
    genderWord && `пол ${genderWord}`,
  ];

  const cert = birthCertificateTitle(participant);
  if (cert) parts.push(cert);

  if (registration) {
    parts.push(`зарегистрированного по месту жительства по адресу: ${registration}`);
  }

  return parts.filter(Boolean).join(', ');
};

const under14ChildrenByRepresentative = (formData, participants = []) => {
  const result = new Map();

  participants
    .filter((participant) => isUnder14(formData, participant))
    .forEach((child) => {
      const key = representativeKey(formData, child);
      if (!key) return;
      if (!result.has(key)) result.set(key, []);
      result.get(key).push(child);
    });

  return result;
};

const under14RepresentativePhrase = (representative, children = []) => {
  if (!children.length) return '';

  const gender = normalizeGender(representative);
  const acting = gender === 'female' ? 'действующая' : 'действующий';
  const childWord = children.length === 1
    ? 'своего несовершеннолетнего ребёнка'
    : 'своих несовершеннолетних детей';

  const childrenText = children
    .map((child) => under14ChildTitleGenitive(child))
    .filter(Boolean)
    .join('; ');

  return childrenText
    ? `${acting} за себя и как законный представитель ${childWord}: ${childrenText}`
    : '';
};

const buildPersonTitleWithNameCase = (person = {}, grammaticalCase = 'nominative') => {
  const base = buildPersonTitle(person);
  if (grammaticalCase === 'nominative') return base;

  const nominativeName = fullName(person);
  const declinedName = inflectName(person, grammaticalCase);

  if (!base || !nominativeName || !declinedName) return base;

  if (base.startsWith(nominativeName)) {
    return `${declinedName}${base.slice(nominativeName.length)}`;
  }

  return base.replace(nominativeName, declinedName);
};

const representativeFullTitle = (formData, participant = {}) => {
  const repObj = representativeParticipant(formData, participant);
  if (repObj) return buildPersonTitleWithNameCase(repObj, 'genitive');

  const rep = participant.legalRepresentative || participant.representative || participant.guardian || {};
  if (fullName(rep) || rep.fullName) return buildPersonTitleWithNameCase(rep, 'genitive');

  return representativeName(formData, participant);
};

const participantDescription = (formData, participant) => {
  const name = escapeHtml(fullName(participant));
  const gender = normalizeGender(participant);
  const citizen = gender === 'female' ? 'Гражданка Российской Федерации' : 'Гражданин Российской Федерации';
  const registered = gender === 'female' ? 'зарегистрирована' : 'зарегистрирован';
  const acting = gender === 'female' ? 'действующая' : 'действующий';
  const minor = gender === 'female' ? 'несовершеннолетняя' : 'несовершеннолетний';
  const age = ageOnDate(participant.birthDate, formData.agreement?.date || formData.participantsStep?.agreementDate);
  const doc = participant.document || participant.passport || {};
  const birthCert = participant.birthCertificate || participant.document || {};
  const repName = representativeName(formData, participant);
  const repGender = normalizeGender(findParticipant(formData, participant.legalRepresentativeParticipantId) || participant.legalRepresentative || participant.representative || {});
  const byWhom = repGender === 'female' ? 'которую' : 'которого';

  let base;
  if (age !== null && age < 14) {
    base = `${minor} ${name}${participant.birthDate ? `, ${escapeHtml(participant.birthDate)} года рождения` : ''}`;
    const certParts = join([
      birthCert.series && `серия ${escapeHtml(birthCert.series)}`,
      birthCert.number && `№ ${escapeHtml(birthCert.number)}`,
    ], ' ');
    if (certParts) base += `, свидетельство о рождении ${certParts}`;
    if (birthCert.issuedBy) base += `, выдано ${escapeHtml(birthCert.issuedBy)}`;
    if (birthCert.issueDate) base += ` ${escapeHtml(birthCert.issueDate)}`;
    if (birthCert.actRecordNumber) base += `, запись акта о рождении № ${escapeHtml(birthCert.actRecordNumber)}`;
    if (birthCert.actRecordDate) base += ` от ${escapeHtml(birthCert.actRecordDate)}`;
    if (repName) base += `, за ${byWhom} действует законный представитель ${escapeHtml(repName)}`;
  } else {
    const fields = [
      `${citizen} ${name}`,
      participant.gender ? `пол: ${escapeHtml(participant.gender)}` : '',
      participant.birthDate ? `дата рождения: ${escapeHtml(participant.birthDate)} г.р.` : '',
      participant.birthPlace ? `место рождения: ${escapeHtml(participant.birthPlace)}` : '',
    ];
    if (doc.series || doc.number) fields.push(`паспорт: ${escapeHtml(join([doc.series, doc.number], ' '))}`);
    if (doc.issuedBy) fields.push(`выдан ${escapeHtml(doc.issuedBy)}${doc.issueDate ? `, ${escapeHtml(doc.issueDate)}` : ''}`);
    if (doc.departmentCode) fields.push(`код подразделения ${escapeHtml(doc.departmentCode)}`);
    if (participant.registrationAddress || participant.address) fields.push(`${registered} по адресу: ${escapeHtml(participant.registrationAddress || participant.address)}`);
    if (participant.snils) fields.push(`СНИЛС ${escapeHtml(participant.snils)}`);
    base = fields.filter(Boolean).join(', ');
    if (age !== null && age >= 14 && age < 18 && repName) {
      const relation = text(participant.legalRepresentativeRelation || participant.representativeRelation || 'законного представителя');
      const own = /мать|матер/i.test(relation) ? 'своей' : (/отец|отц/i.test(relation) ? 'своего' : 'своего/своей');
      base += `, ${acting} с согласия ${own} ${escapeHtml(relation)} ${escapeHtml(repName)}`;
    }
  }

  if (isPowerOfAttorney(participant)) {
    const rep = participant.representative || {};
    const repFullName = fullName(rep) || rep.fullName;
    if (repFullName) base += ` в лице представителя ${escapeHtml(repFullName)}, ${normalizeGender(rep) === 'female' ? 'действующей' : 'действующего'} на основании доверенности ${escapeHtml(poaDetails(participant))}`;
  }
  return base;
};

const participantDescriptionForTitle = (formData, participant) => {
  if (!isPassportRfParticipant(participant)) {
    return {
      text: participantDescription(formData, participant),
      alreadyEscaped: true,
    };
  }

  let base = buildPersonTitle(participant);

  if (isMinor14To18(formData, participant)) {
    const repTitle = representativeFullTitle(formData, participant);
    if (repTitle) {
      const gender = normalizeGender(participant);
      const acting = gender === 'female' ? 'действующая' : 'действующий';
      base += `, ${acting} с согласия своего законного представителя ${repTitle}`;
    }
  }

  if (isPowerOfAttorney(participant)) {
    const rep = participant.representative || {};
    const repFullName = fullName(rep) || rep.fullName;
    if (repFullName) {
      base += ` в лице представителя ${repFullName}, ${normalizeGender(rep) === 'female' ? 'действующей' : 'действующего'} на основании доверенности ${poaDetails(participant)}`;
    }
  }

  return {
    text: base,
    alreadyEscaped: false,
  };
};

const participantsTitleHtml = (formData, participants = []) => {
  const childrenByRep = under14ChildrenByRepresentative(formData, participants);
  const visibleParticipants = participants.filter((participant) => !isUnder14(formData, participant));

  return visibleParticipants
    .map((participant, index) => {
      const item = participantDescriptionForTitle(formData, participant);
      let safeText = item.alreadyEscaped ? item.text : escapeHtml(item.text);

      const key = participant.id ? `id:${participant.id}` : `name:${fullName(participant)}`;
      const representedChildren = childrenByRep.get(key) || [];
      const representedPhrase = under14RepresentativePhrase(participant, representedChildren);

      if (representedPhrase) {
        safeText += `, ${escapeHtml(representedPhrase)}`;
      }

      const tail = index < visibleParticipants.length - 1 ? ';' : '';

      return `<p style="text-indent: 2em;">${safeText}${tail}</p>`;
    })
    .join('\n');
};

const participantSignatures = (formData, participants) => participants.map((participant) => {
  const name = fullName(participant);
  const gender = normalizeGender(participant);
  const age = ageOnDate(participant.birthDate, formData.agreement?.date || formData.participantsStep?.agreementDate);
  let caption = escapeHtml(name);
  if (isPowerOfAttorney(participant)) {
    const rep = participant.representative || {};
    caption = `${escapeHtml(fullName(rep) || rep.fullName || '')}, ${normalizeGender(rep) === 'female' ? 'действующая' : 'действующий'} по доверенности от имени ${escapeHtml(name)}`;
  } else if (age !== null && age < 14) {
    const repName = representativeName(formData, participant) || 'законный представитель';
    caption = `${escapeHtml(repName)}, ${normalizeGender(findParticipant(formData, participant.legalRepresentativeParticipantId) || participant.legalRepresentative || {}) === 'female' ? 'действующая' : 'действующий'} за ${gender === 'female' ? 'несовершеннолетнюю' : 'несовершеннолетнего'} ${escapeHtml(name)}`;
  } else if (age !== null && age >= 14 && age < 18) {
    const repName = representativeName(formData, participant) || 'законного представителя';
    caption = `${escapeHtml(name)}, ${gender === 'female' ? 'действующая' : 'действующий'} с согласия ${escapeHtml(repName)}`;
  }
  return `<div class="signature-block"><p>______________________________</p><p>(${caption})</p></div>`;
}).join('\n');

const rightsText = (formData) => {
  const blocks = formData.rights?.ownerBlocks?.length ? formData.rights.ownerBlocks : (formData.rights?.owners || []).map((owner) => ({ ownerFullName: fullName(owner) || owner.fullName, ...owner }));
  if (!blocks.length) return 'Сведения об основаниях права собственности заполняются по данным ЕГРН и представленным документам.';
  return blocks.map((block) => {
    const docs = block.documents || block.basisDocuments || block.rights?.documents || [];
    const docsText = docs.length ? `Документы-основания: ${escapeHtml(docs.map((d) => pick(d.name, d.type, d.title, d.description, d.rawText)).filter(Boolean).join('; '))}.` : '';
    return join([
      escapeHtml(pick(block.ownerFullName, block.fullName, fullName(block.owner), block.name)),
      block.ownershipType || block.rightType || formData.rights?.ownershipType ? `вид права: ${escapeHtml(block.ownershipType || block.rightType || formData.rights?.ownershipType)}` : '',
      block.share || block.existingShare ? `доля: ${escapeHtml(block.share || block.existingShare)}` : '',
      block.registrationNumber || formData.rights?.registrationNumber ? `номер государственной регистрации ${escapeHtml(block.registrationNumber || formData.rights?.registrationNumber)}` : '',
      block.registrationDate || formData.rights?.registrationDate ? `дата государственной регистрации ${escapeHtml(block.registrationDate || formData.rights?.registrationDate)}` : '',
      docsText,
    ], ', ');
  }).join('<br>');
};

const encumbranceText = (formData) => {
  const all = [];
  const e = formData.encumbrance || {};
  if (text(e.type) && !['none', 'absent', 'unknown'].includes(text(e.type).toLowerCase())) all.push(e);
  (formData.rights?.ownerBlocks || []).forEach((b) => {
    const be = b.encumbrance || {};
    if (text(be.type) && !['none', 'absent', 'unknown'].includes(text(be.type).toLowerCase())) all.push(be);
  });
  const hasMortgage = all.some((item) => /ипотек|mortgage/i.test([item.type, item.subtype, item.description, item.rawText].join(' ')));
  if (!all.length) {
    return {
      hasMortgage: false,
      text: 'На момент заключения настоящего соглашения в отношении указанного жилого помещения отсутствуют зарегистрированные ограничения (обременения) права.',
      assurancesText: 'Стороны заявляют, что до подписания настоящего соглашения вышеуказанный объект никому не продан, не подарен, не обещан в дар, не заложен, в споре и под запрещением (арестом) не состоит, правами третьих лиц не обременён, зарегистрированные ограничения (обременения) права отсутствуют, иные лица, имеющие право на оформление вышеуказанных долей в общую собственность, отсутствуют.',
    };
  }
  const details = all.map((item) => {
    const docs = item.basisDocuments?.length ? ` Основания государственной регистрации ограничения (обременения): ${escapeHtml(item.basisDocuments.map((d) => pick(d.name, d.type, d.title, d.description, d.rawText)).filter(Boolean).join('; '))}.` : '';
    return `${escapeHtml(pick(item.subtype, item.type, item.description, 'обременение'))}${item.registrationNumber ? `, номер государственной регистрации ${escapeHtml(item.registrationNumber)}` : ''}${item.registrationDate ? ` от ${escapeHtml(item.registrationDate)}` : ''}${item.mortgagee || item.beneficiary ? `, залогодержатель: ${escapeHtml(item.mortgagee || item.beneficiary)}` : ''}${item.term ? `, срок обременения: ${escapeHtml(item.term)}` : ''}.${docs}`;
  }).join('<br>');
  return {
    hasMortgage,
    text: `${details}${hasMortgage ? '<br>Сторонам известно о наличии указанного ограничения (обременения). При этом в соответствии с пунктом 3 статьи 7 Федерального закона от 16.07.1998 № 102-ФЗ “Об ипотеке (залоге недвижимости)” согласие залогодержателя на оформление жилого помещения, приобретённого с использованием средств материнского (семейного) капитала и являющегося предметом залога, в общую собственность лица, его супруга (супруги) и детей до момента погашения регистрационной записи об ипотеке не требуется.' : ''}`,
    assurancesText: hasMortgage
      ? 'Сторонам известно о зарегистрированном ограничении (обременении) права в виде ипотеки, указанном в настоящем соглашении. Иные ограничения, аресты, судебные споры и притязания третьих лиц, кроме указанных в настоящем соглашении, сторонам не известны.'
      : 'Сторонам известны указанные в настоящем соглашении ограничения (обременения). Иные ограничения, аресты, судебные споры и притязания третьих лиц сторонам не известны.',
  };
};

const buildMaternityCapitalText = (formData) => {
  const m = formData.maternityCapital || {};
  const holder = findParticipant(formData, m.certificateHolderParticipantId || formData.participantsStep?.certificateHolderParticipantId);
  const holderName = fullName(holder) || m.certificateHolderFullName;
  const cert = join([m.certificateSeries && `серия ${escapeHtml(m.certificateSeries)}`, m.certificateNumber && `№ ${escapeHtml(m.certificateNumber)}`], ' ');
  return `В соответствии со статьёй 10 Федерального закона № 256-ФЗ “О дополнительных мерах государственной поддержки семей, имеющих детей” на основании государственного сертификата на материнский (семейный) капитал ${cert || 'серия/номер сертификата не указаны'}, выданного ${escapeHtml(m.certificateIssueDate || '')} ${escapeHtml(m.certificateIssuedBy || '')} на имя ${escapeHtml(holderName)}, средства материнского (семейного) капитала в размере ${amountRu(m.amountUsed || formData.shares?.maternityCapitalAmount)} были использованы${m.usePurpose ? ` ${escapeHtml(m.usePurpose)}` : ''}${m.useDate ? ` ${escapeHtml(m.useDate)}` : ''}.`;
};

const familyText = (formData) => {
  const f = formData.family || {};
  const holder = findParticipant(formData, f.certificateHolderParticipantId || formData.participantsStep?.certificateHolderParticipantId || formData.maternityCapital?.certificateHolderParticipantId);
  const spouse = findParticipant(formData, f.spouseParticipantId);
  const holderName = escapeHtml(fullName(holder) || formData.maternityCapital?.certificateHolderFullName || 'Владелец сертификата');
  const spouseName = escapeHtml(fullName(spouse) || 'супруг(а)');
  const marriage = f.marriage || {};
  const divorce = f.divorce || {};
  const contract = f.marriageContract || {};
  let out = '';
  if (f.maritalStatusMode === 'former_marriage' || f.maritalStatusMode === 'divorced') {
    out = `${holderName} и ${spouseName} состояли в зарегистрированном браке на момент приобретения объекта и/или использования средств материнского капитала; на дату заключения настоящего соглашения брак расторгнут${divorce.date ? ` ${escapeHtml(divorce.date)}` : ''}${divorce.actRecordNumber ? `, запись акта № ${escapeHtml(divorce.actRecordNumber)}` : ''}.`;
  } else if (f.maritalStatusMode) {
    out = `${holderName} и ${spouseName} на момент приобретения вышеуказанного объекта и на момент заключения настоящего соглашения состояли и состоят в зарегистрированном браке${marriage.date ? ` с ${escapeHtml(marriage.date)}` : ''}${marriage.certificateNumber ? ` (свидетельство о заключении брака ${escapeHtml(marriage.certificateSeries || '')} № ${escapeHtml(marriage.certificateNumber)}, выдано ${escapeHtml(marriage.issuedBy || '')} от ${escapeHtml(marriage.issueDate || '')}${marriage.actRecordNumber ? `, запись акта о заключении брака № ${escapeHtml(marriage.actRecordNumber)}` : ''})` : ''}.`;
  } else {
    out = 'Сведения о браке указаны Сторонами в данных настоящего соглашения.';
  }
  if (contract.status === 'concluded') {
    out += ` Между супругами заключён брачный договор${contract.description ? `: ${escapeHtml(contract.description)}` : ', условия которого требуют ручной проверки Сторонами'}.`;
  } else {
    out += ' Супруги заверяют, что брачный договор, изменяющий правовой режим совместной собственности в отношении вышеуказанного объекта, между ними не заключался.';
  }
  return out;
};

const sharesText = (formData) => {
  const participants = formData.participantsStep?.participants || formData.participants || [];
  const rows = formData.shares?.rows || [];
  const lines = rows.filter((row) => row.receivesShare === true && row.finalShare).map((row) => {
    const p = participants.find((item) => String(item.id) === String(row.participantId)) || { fullName: row.fullName };
    return `${escapeHtml(inflectName(p, 'dative'))} — ${escapeHtml(row.finalShare)} долей в праве общей долевой собственности на указанную квартиру`;
  });
  const remainder = formData.shares?.remainderShare;
  if (remainder && formData.shares?.remainderLegalMode === 'joint_spouses') {
    const spouseRole = participants.filter((p) => ['certificateHolder', 'spouse'].includes(p.role));
    const names = spouseRole.map((p) => escapeHtml(inflectName(p, 'genitive'))).join(' и ');
    lines.push(`${escapeHtml(remainder)} долей в праве собственности на вышеуказанную квартиру остаются в общей совместной собственности ${names || 'супругов'}`);
  }
  return lines.length ? list(lines) : 'Распределение долей определяется расчётом, выбранным Сторонами в мастере документа.';
};

const copiesCountWords = (count) => {
  const words = ['ноль', 'одном', 'двух', 'трёх', 'четырёх', 'пяти', 'шести', 'семи', 'восьми', 'девяти', 'десяти', 'одиннадцати', 'двенадцати', 'тринадцати', 'четырнадцати', 'пятнадцати', 'шестнадцати', 'семнадцати', 'восемнадцати', 'девятнадцати', 'двадцати'];
  return words[count] || String(count);
};

const copiesText = (formData, participants) => {
  const count = Math.max(1, participants.length);
  return `Настоящее соглашение подписано и составлено в ${count} (${copiesCountWords(count)}) экземплярах, имеющих одинаковую юридическую силу, по одному экземпляру для каждой из Сторон${participants.length ? `: ${escapeHtml(participants.map(fullName).filter(Boolean).join(', '))}` : ''}.`;
};

function buildMaternityCapitalSharesRenderData(formData = {}) {
  const participants = formData.participantsStep?.participants || formData.participants || [];
  const object = formData.object || {};
  const enc = encumbranceText(formData);
  const ownerNames = (formData.rights?.ownerBlocks || []).map((b) => b.ownerFullName || b.fullName).filter(Boolean);
  const ownerText = ownerNames.length === 1 ? escapeHtml(ownerNames[0]) : (ownerNames.length > 1 ? 'Участникам' : 'Сторонам');
  const acquisitionType = formData.acquisition?.type || formData.distributionBase?.type || '';
  const price = formData.shares?.purchasePriceForCalculation || formData.distributionBase?.purchasePriceForCalculation || object.purchasePrice;
  const pluralOwners = ownerNames.length > 1;

  return {
    agreement: formData.agreement || {},
    participants,
    object,
    rights: formData.rights || {},
    encumbrance: formData.encumbrance || {},
    maternityCapital: formData.maternityCapital || {},
    family: formData.family || {},
    shares: formData.shares || {},
    signatures: participantSignatures(formData, participants),
    copies: { count: Math.max(1, participants.length) },
    calc: {},
    participantsText: participantsTitleHtml(formData, participants),
    objectText: `${ownerText} принадлежит жилое помещение (${escapeHtml(object.objectKindFromEgrn || object.residentialKind || 'квартира')}), приобретённое с использованием средств материнского капитала, находящееся по адресу: ${escapeHtml(object.address || '')}${object.area ? `, площадью ${escapeHtml(object.area)} кв. м` : ''}${object.floor ? `, этаж № ${escapeHtml(object.floor)}` : ''}. ${object.cadastralNumber ? `Кадастровый номер ${escapeHtml(object.cadastralNumber)}.` : ''}`,
    rightsText: rightsText(formData),
    priceText: `${ownerNames.length ? escapeHtml(ownerNames.join(', ')) : 'Стороны'} ${pluralOwners ? 'приобрели' : 'приобрёл(а)'} ${/share|дол/i.test(acquisitionType) ? 'долю в праве собственности на указанное жилое помещение' : /room|комнат/i.test(acquisitionType) ? 'комнату / долю, соответствующую комнате' : 'указанное жилое помещение'} за сумму ${amountRu(price)}.`,
    encumbranceText: enc.text,
    maternityCapitalText: buildMaternityCapitalText(formData),
    familyText: familyText(formData),
    sharesText: sharesText(formData),
    assurancesText: enc.assurancesText,
    copiesText: copiesText(formData, participants),
    signaturesHtml: participantSignatures(formData, participants),
  };
}

module.exports = { buildMaternityCapitalSharesRenderData, inflectName };

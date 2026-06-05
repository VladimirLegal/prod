import React, { useEffect, useMemo, useState } from "react";
import FreeTextImportModal from "../common/FreeTextImportModal";
import {
  parseBirthCertificateText,
  parseFreeTextPerson,
  normalizeSnils,
} from "../../utils/freeTextParser";
import {
  applyParticipantAgeRules,
  buildEgrnParticipantCandidates,
  createParticipant,
  emptyAttorneyRepresentative,
  emptyPowerOfAttorney,
  formatDateInput,
  getFullName,
  getLegalRepresentativeOptions,
  getParticipantRoleLabel,
  parseMarriageCertificateText,
  splitFullName,
  splitPassport,
  validateParticipantsStep,
} from "../../utils/maternityCapitalShares/participantsStep";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";

const ROLE_BUTTONS = [
  ["certificateHolder", "Добавить владельца сертификата"],
  ["spouse", "Добавить супруга/супругу"],
  ["formerSpouse", "Добавить бывшего супруга/бывшую супругу"],
  ["child", "Добавить ребёнка"],
  ["otherParticipant", "Добавить иного участника"],
];

const ROLE_OPTIONS = [
  ["certificateHolder", "Владелец сертификата"],
  ["spouse", "Супруг/супруга"],
  ["formerSpouse", "Бывший супруг/бывшая супруга"],
  ["child", "Ребёнок"],
  ["otherParticipant", "Иной участник"],
];

const BASIS_OPTIONS = [
  ["parent", "Родитель"],
  ["adoptive_parent", "Усыновитель"],
  ["guardian", "Опекун"],
  ["custodian", "Попечитель"],
  [
    "appointed_representative_by_guardianship_authority",
    "Назначенный органом опеки представитель",
  ],
];

const SOURCE_LABELS = {
  manual: "Ручной ввод",
  egrn: "ЕГРН",
  passport_text_parser: "Парсер паспорта",
  birth_certificate_text_parser: "Парсер свидетельства",
};

const Field = ({ label, children }) => (
  <label className="block">
    <span className={labelClass}>{label}</span>
    {children}
  </label>
);

const TextInput = ({ value, onChange, placeholder = "" }) => (
  <input
    type="text"
    value={value || ""}
    onChange={(event) => onChange(event.target.value)}
    placeholder={placeholder}
    className={inputClass}
  />
);

const DateInput = ({ value, onChange }) => (
  <TextInput
    value={value}
    onChange={(next) => onChange(formatDateInput(next))}
    placeholder="ДД.ММ.ГГГГ"
  />
);

const SelectInput = ({ value, onChange, children }) => (
  <select
    value={value || ""}
    onChange={(event) => onChange(event.target.value)}
    className={inputClass}
  >
    {children}
  </select>
);

const TextArea = ({ value, onChange, placeholder = "" }) => (
  <textarea
    value={value || ""}
    onChange={(event) => onChange(event.target.value)}
    placeholder={placeholder}
    rows={2}
    className={inputClass}
  />
);

const formatPassportInput = (value = "") => {
  const digits = String(value).replace(/\D/g, "").slice(0, 10);
  return digits.length <= 4
    ? digits
    : `${digits.slice(0, 4)} ${digits.slice(4)}`;
};

const formatDepartmentCodeInput = (value = "") => {
  const digits = String(value).replace(/\D/g, "").slice(0, 6);
  return digits.length <= 3
    ? digits
    : `${digits.slice(0, 3)}-${digits.slice(3)}`;
};

const applyParsedPassport = (target, parsed) => {
  const name = splitFullName(parsed.fullName || "");
  const passport = splitPassport(parsed.passport || "");
  return {
    ...target,
    ...Object.fromEntries(Object.entries(name).filter(([, value]) => value)),
    fullNameRaw: parsed.fullName || target.fullNameRaw || "",
    gender: parsed.gender || target.gender || "",
    birthDate: parsed.birthDate || target.birthDate || "",
    birthPlace: parsed.birthPlace || target.birthPlace || "",
    registrationAddress:
      parsed.registration || target.registrationAddress || "",
    snils: parsed.snils || target.snils || "",
    document: {
      ...(target.document || {}),
      type: "passport_rf",
      series: passport.series || target.document?.series || "",
      number: passport.number || target.document?.number || "",
      issuedBy: parsed.passportIssued || target.document?.issuedBy || "",
      issueDate: parsed.issueDate || target.document?.issueDate || "",
      departmentCode:
        parsed.departmentCode || target.document?.departmentCode || "",
    },
  };
};

const applyParsedBirthCertificate = (target, parsed) => {
  const name = splitFullName(parsed.fullName || "");
  return {
    ...target,
    ...Object.fromEntries(Object.entries(name).filter(([, value]) => value)),
    fullNameRaw: parsed.fullName || target.fullNameRaw || "",
    gender: parsed.gender || target.gender || "",
    birthDate: parsed.birthDate || target.birthDate || "",
    birthPlace: parsed.birthPlace || target.birthPlace || "",
    registrationAddress:
      parsed.registration || target.registrationAddress || "",
    snils: parsed.snils || target.snils || "",
    document: {
      ...(target.document || {}),
      ...(parsed.document || {}),
      type: "birth_certificate_rf",
    },
  };
};

const getAgeBadge = (participant) => {
  if (participant.role !== "child") return "Взрослый режим";
  if (participant.personType === "minor_under_14") return "До 14 лет";
  if (participant.personType === "minor_14_18") return "14–18 лет";
  return "18+ / полная дееспособность";
};

const getDocumentBadge = (participant) =>
  participant.document?.type === "birth_certificate_rf"
    ? "Свидетельство о рождении"
    : "Паспорт РФ";

const ParticipantsSection = ({ formData, setFormData }) => {
  const [showImport, setShowImport] = useState(false);
  const [textImport, setTextImport] = useState(null);
  const step = formData.participantsStep;
  const participants = (step.participants || []).filter(
    (participant) => participant.role !== "attorneyRepresentative",
  );
  const validation = useMemo(
    () => validateParticipantsStep({ ...step, participants }, formData.family),
    [formData.family, step, participants],
  );
  const importCandidates = useMemo(
    () =>
      buildEgrnParticipantCandidates(
        formData.rights?.ownerBlocks || [],
        formData.agreement?.date || step.agreementDate,
      ),
    [
      formData.agreement?.date,
      formData.rights?.ownerBlocks,
      step.agreementDate,
    ],
  );

  const updateStep = (updater) => {
    setFormData((prev) => {
      const current = { ...prev.participantsStep, participants };
      const next = typeof updater === "function" ? updater(current) : updater;
      return {
        ...prev,
        agreement: {
          ...prev.agreement,
          date: next.agreementDate || prev.agreement.date,
        },
        participantsStep: next,
        participants: next.participants,
      };
    });
  };

  useEffect(() => {
    const agreementDate = formData.agreement?.date || step.agreementDate;
    if (!agreementDate || agreementDate === step.agreementDate) return;
    setFormData((prev) => ({
      ...prev,
      participantsStep: {
        ...prev.participantsStep,
        agreementDate,
        participants: (prev.participantsStep.participants || []).map(
          (participant) => applyParticipantAgeRules(participant, agreementDate),
        ),
      },
      participants: (prev.participantsStep.participants || []).map(
        (participant) => applyParticipantAgeRules(participant, agreementDate),
      ),
    }));
  }, [formData.agreement?.date, setFormData, step.agreementDate]);

  const updateFamily = (updater) => {
    setFormData((prev) => {
      const nextFamily =
        typeof updater === "function" ? updater(prev.family || {}) : updater;
      return { ...prev, family: nextFamily };
    });
  };

  const addParticipant = (role) => {
    updateStep((current) => {
      const participant = createParticipant(role, {}, current.agreementDate);
      return {
        ...current,
        certificateHolderParticipantId:
          role === "certificateHolder" &&
          !current.certificateHolderParticipantId
            ? participant.id
            : current.certificateHolderParticipantId,
        participants: [...current.participants, participant],
      };
    });
  };

  const updateParticipant = (id, patch) => {
    updateStep((current) => ({
      ...current,
      certificateHolderParticipantId:
        patch.role === "certificateHolder"
          ? id
          : current.certificateHolderParticipantId,
      participants: current.participants.map((participant) => {
        if (participant.id !== id) return participant;
        const merged = {
          ...participant,
          ...patch,
          document: { ...participant.document, ...(patch.document || {}) },
          source: { ...participant.source, ...(patch.source || {}) },
        };
        return applyParticipantAgeRules(merged, current.agreementDate);
      }),
    }));
  };

  const removeParticipant = (id) => {
    updateStep((current) => ({
      ...current,
      certificateHolderParticipantId:
        current.certificateHolderParticipantId === id
          ? null
          : current.certificateHolderParticipantId,
      participants: current.participants
        .filter((participant) => participant.id !== id)
        .map((participant) => ({
          ...participant,
          legalRepresentativeParticipantId:
            participant.legalRepresentativeParticipantId === id
              ? null
              : participant.legalRepresentativeParticipantId,
          consentProviderParticipantId:
            participant.consentProviderParticipantId === id
              ? null
              : participant.consentProviderParticipantId,
        })),
    }));
  };

  const togglePowerOfAttorney = (participant) => {
    updateParticipant(
      participant.id,
      participant.actsThroughPowerOfAttorney
        ? {
            actsThroughPowerOfAttorney: false,
            attorneyRepresentative: null,
            powerOfAttorney: null,
          }
        : {
            actsThroughPowerOfAttorney: true,
            attorneyRepresentative: emptyAttorneyRepresentative(),
            powerOfAttorney: emptyPowerOfAttorney(),
          },
    );
  };

  const importFromEgrn = (selectedCandidates) => {
    updateStep((current) => ({
      ...current,
      participants: [...current.participants, ...selectedCandidates],
    }));
    setShowImport(false);
  };

  const applyTextImport = (rawText) => {
    if (!textImport) return;
    if (textImport.kind === "marriage") {
      const parsedMarriage = parseMarriageCertificateText(rawText || "");
      updateFamily((current) => ({
        ...current,
        marriage: {
          ...(current.marriage || {}),
          ...parsedMarriage,
          actRecordDate:
            parsedMarriage.actRecordDate ||
            parsedMarriage.date ||
            current.marriage?.actRecordDate ||
            "",
        },
      }));
      setTextImport(null);
      return;
    }

    const parsed =
      textImport.kind === "birth"
        ? parseBirthCertificateText(rawText || "")
        : parseFreeTextPerson(rawText || "");
    updateParticipant(textImport.participantId, {
      source: {
        origin:
          textImport.kind === "birth"
            ? "birth_certificate_text_parser"
            : "passport_text_parser",
        needsReview: true,
      },
      ...(textImport.scope === "representative"
        ? {
            attorneyRepresentative: applyParsedPassport(
              textImport.currentRepresentative || emptyAttorneyRepresentative(),
              parsed,
            ),
          }
        : textImport.kind === "birth"
          ? applyParsedBirthCertificate(textImport.currentParticipant, parsed)
          : applyParsedPassport(textImport.currentParticipant, parsed)),
    });
    setTextImport(null);
  };

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Пакет 3. Участники и подписи
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Заполните участников соглашения, получателей долей, законных
              представителей и представителей по доверенности.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {ROLE_BUTTONS.map(([role, label]) => (
            <button
              key={role}
              type="button"
              onClick={() => addParticipant(role)}
              className="rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200"
          >
            {participants.some(
              (participant) => participant.source?.origin === "egrn",
            )
              ? "Обновить участников из ЕГРН"
              : "Создать участников из ЕГРН"}
          </button>
        </div>
      </section>

      {showImport && (
        <EgrnImportModal
          candidates={importCandidates}
          onClose={() => setShowImport(false)}
          onImport={importFromEgrn}
        />
      )}

      <FreeTextImportModal
        open={!!textImport}
        title={
          textImport?.kind === "birth"
            ? "Вставьте свидетельство о рождении текстом"
            : textImport?.kind === "marriage"
              ? "Вставьте свидетельство о браке текстом"
              : "Вставьте паспортные данные текстом"
        }
        onClose={() => setTextImport(null)}
        onApply={applyTextImport}
      />

      <section className="grid gap-4">
        {participants.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-gray-600">
            Участники ещё не добавлены.
          </div>
        )}
        {participants.map((participant, index) => (
          <ParticipantCard
            key={participant.id}
            participant={participant}
            index={index}
            participants={participants}
            certificateHolderParticipantId={step.certificateHolderParticipantId}
            onUpdate={(patch) => updateParticipant(participant.id, patch)}
            onRemove={() => removeParticipant(participant.id)}
            onTogglePowerOfAttorney={() => togglePowerOfAttorney(participant)}
            onTextImport={(payload) =>
              setTextImport({
                participantId: participant.id,
                currentParticipant: participant,
                ...payload,
              })
            }
          />
        ))}
      </section>

      <MarriageInfoSection
        family={formData.family || {}}
        participants={participants}
        onChange={updateFamily}
        onTextImport={() => setTextImport({ kind: "marriage" })}
      />

      <ValidationPanel validation={validation} />
    </div>
  );
};

const EgrnImportModal = ({ candidates, onClose, onImport }) => {
  const [selectedIds, setSelectedIds] = useState(
    candidates.map((candidate) => candidate.id),
  );
  const [drafts, setDrafts] = useState(candidates);
  const updateDraft = (id, patch) =>
    setDrafts((current) =>
      current.map((candidate) =>
        candidate.id === id ? { ...candidate, ...patch } : candidate,
      ),
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Создать участников из ЕГРН
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Импорт создаёт только кандидатов-физлиц. Роль и получение доли
              нужно подтвердить вручную.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800"
          >
            ✕
          </button>
        </div>

        {!drafts.length && (
          <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800">
            В ownerBlocks не найдено физических лиц для импорта.
          </div>
        )}
        <div className="space-y-3">
          {drafts.map((candidate) => (
            <div
              key={candidate.id}
              className="rounded-xl border border-gray-200 p-4"
            >
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(candidate.id)}
                  onChange={(event) =>
                    setSelectedIds((current) =>
                      event.target.checked
                        ? [...current, candidate.id]
                        : current.filter((id) => id !== candidate.id),
                    )
                  }
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    {getFullName(candidate) ||
                      candidate.fullNameRaw ||
                      "Без ФИО"}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Дата рождения: {candidate.birthDate || "—"} · СНИЛС:{" "}
                    {candidate.snils || "—"}
                  </div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Роль">
                      <SelectInput
                        value={candidate.role}
                        onChange={(role) => updateDraft(candidate.id, { role })}
                      >
                        {ROLE_OPTIONS.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                    <label className="flex items-center gap-2 pt-7 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={candidate.receivesShare === true}
                        onChange={(event) =>
                          updateDraft(candidate.id, {
                            receivesShare: event.target.checked,
                          })
                        }
                      />
                      Получает долю
                    </label>
                  </div>
                </div>
              </label>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-gray-100 px-5 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() =>
              onImport(
                drafts.filter((candidate) =>
                  selectedIds.includes(candidate.id),
                ),
              )
            }
            className="rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Импортировать выбранных
          </button>
        </div>
      </div>
    </div>
  );
};

const ParticipantCard = ({
  participant,
  index,
  participants,
  certificateHolderParticipantId,
  onUpdate,
  onRemove,
  onTogglePowerOfAttorney,
  onTextImport,
}) => {
  const legalOptions = getLegalRepresentativeOptions(
    participants,
    participant.id,
  );
  
  const isCertificateHolder = participant.id === certificateHolderParticipantId;
  const updateDocument = (patch) => onUpdate({ document: patch });
  const updateRepresentative = (patch) =>
    onUpdate({
      attorneyRepresentative: {
        ...(participant.attorneyRepresentative ||
          emptyAttorneyRepresentative()),
        ...patch,
        document: {
          ...(participant.attorneyRepresentative?.document ||
            emptyAttorneyRepresentative().document),
          ...(patch.document || {}),
          type: "passport_rf",
        },
      },
    });
  const updatePower = (patch) =>
    onUpdate({
      powerOfAttorney: {
        ...(participant.powerOfAttorney || emptyPowerOfAttorney()),
        ...patch,
      },
    });

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
              {getParticipantRoleLabel(participant.role)}
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
              {getAgeBadge(participant)}
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
              {getDocumentBadge(participant)}
            </span>
            <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs text-yellow-800">
              {SOURCE_LABELS[participant.source?.origin] || "Источник"}
            </span>
            {participant.source?.needsReview && (
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs text-red-700">
                Нужна проверка
              </span>
            )}
            {isCertificateHolder && (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs text-green-700">
                Владелец сертификата
              </span>
            )}
          </div>
          <h3 className="mt-3 text-lg font-semibold text-gray-900">
            {getFullName(participant) || `Участник ${index + 1}`}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {participant.source?.needsReview && (
            <button
              type="button"
              onClick={() => onUpdate({ source: { needsReview: false } })}
              className="rounded-full bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
            >
              Подтвердить данные
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            Удалить
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label="Роль">
          <SelectInput
            value={participant.role}
            onChange={(role) => onUpdate({ role })}
          >
            {ROLE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Владелец сертификата">
          <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
            <input
              type="radio"
              checked={isCertificateHolder}
              onChange={() => onUpdate({ role: "certificateHolder" })}
            />
            Это владелец сертификата
          </label>
        </Field>
        <Field label="Получает долю">
          <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={participant.receivesShare === true}
              onChange={(event) =>
                onUpdate({ receivesShare: event.target.checked })
              }
            />
            Включить в расчёт долей
          </label>
        </Field>
      </div>

      <PersonFields person={participant} onChange={onUpdate} />

      {participant.role === "child" &&
        participant.personType === "minor_14_18" && (
          <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={participant.legalCapacityStatus === "full_before_18"}
              onChange={(event) =>
                onUpdate({
                  legalCapacityStatus: event.target.checked
                    ? "full_before_18"
                    : "limited",
                })
              }
            />
            Полная дееспособность до 18 лет (advanced override)
          </label>
        )}

      <DocumentFields
        participant={participant}
        updateDocument={updateDocument}
        onTextImport={onTextImport}
        onUpdatePerson={onUpdate}
      />

      {participant.role === "child" &&
        participant.personType === "minor_under_14" && (
          <RepresentativeFields
            title="Законный представитель ребёнка до 14 лет"
            participant={participant}
            legalOptions={legalOptions}
            selectedId={participant.legalRepresentativeParticipantId}
            onSelect={(legalRepresentativeParticipantId) =>
              onUpdate({ legalRepresentativeParticipantId })
            }
            onBasis={(legalRepresentativeBasis) =>
              onUpdate({ legalRepresentativeBasis })
            }
          />
        )}

      {participant.role === "child" &&
        participant.personType === "minor_14_18" &&
        participant.legalCapacityStatus !== "full_before_18" && (
          <RepresentativeFields
            title="Лицо, дающее согласие ребёнку 14–18 лет"
            participant={participant}
            legalOptions={legalOptions}
            selectedId={participant.consentProviderParticipantId}
            onSelect={(consentProviderParticipantId) =>
              onUpdate({ consentProviderParticipantId })
            }
            onBasis={(legalRepresentativeBasis) =>
              onUpdate({ legalRepresentativeBasis })
            }
            consentMode
          />
        )}

      <div className="mt-5 rounded-xl border border-gray-200 p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
          <input
            type="checkbox"
            checked={participant.actsThroughPowerOfAttorney === true}
            onChange={onTogglePowerOfAttorney}
          />
          Подписывает через представителя по доверенности
        </label>
        {participant.actsThroughPowerOfAttorney && (
          <div className="mt-4 space-y-4">
            <h4 className="font-medium text-gray-900">
              Данные представителя по доверенности
            </h4>
            <button
              type="button"
              onClick={() =>
                onTextImport({
                  kind: "passport",
                  scope: "representative",
                  currentRepresentative:
                    participant.attorneyRepresentative ||
                    emptyAttorneyRepresentative(),
                })
              }
              className="rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
            >
              Вставить паспортные данные текстом
            </button>
                        <PersonFields
              person={
                participant.attorneyRepresentative ||
                emptyAttorneyRepresentative()
              }
              onChange={updateRepresentative}
            />

            <div className="rounded-xl border border-gray-200 p-4">
              <h4 className="font-medium text-gray-900">Паспорт РФ</h4>

              <PassportFields
                document={
                  participant.attorneyRepresentative?.document ||
                  emptyAttorneyRepresentative().document
                }
                onChange={(document) => updateRepresentative({ document })}
              />

              <div className="mt-4 border-t border-gray-100 pt-4">
                <h5 className="mb-3 text-sm font-medium text-gray-900">
                  Регистрация
                </h5>
                <RegistrationFields
                  person={
                    participant.attorneyRepresentative ||
                    emptyAttorneyRepresentative()
                  }
                  onChange={updateRepresentative}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Дата доверенности">
                <DateInput
                  value={participant.powerOfAttorney?.issueDate}
                  onChange={(issueDate) => updatePower({ issueDate })}
                />
              </Field>
              <Field label="Номер / реестровый номер доверенности">
                <TextInput
                  value={participant.powerOfAttorney?.registryNumber}
                  onChange={(registryNumber) => updatePower({ registryNumber })}
                />
              </Field>
              <Field label="Кем удостоверена доверенность">
                <TextInput
                  value={participant.powerOfAttorney?.certifiedBy}
                  onChange={(certifiedBy) => updatePower({ certifiedBy })}
                />
              </Field>
            </div>
          </div>
        )}
      </div>

      
    </article>
  );
};

const PersonFields = ({ person, onChange }) => (
  <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    <Field label="Фамилия">
      <TextInput
        value={person.lastName}
        onChange={(lastName) => onChange({ lastName })}
      />
    </Field>
    <Field label="Имя">
      <TextInput
        value={person.firstName}
        onChange={(firstName) => onChange({ firstName })}
      />
    </Field>
    <Field label="Отчество">
      <TextInput
        value={person.middleName}
        onChange={(middleName) => onChange({ middleName })}
      />
    </Field>
    <Field label="Пол">
      <SelectInput
        value={person.gender}
        onChange={(gender) => onChange({ gender })}
      >
        <option value="">Выберите</option>
        <option value="male">Мужской</option>
        <option value="female">Женский</option>
      </SelectInput>
    </Field>
    <Field label="Дата рождения">
      <DateInput
        value={person.birthDate}
        onChange={(birthDate) => onChange({ birthDate })}
      />
    </Field>
    <Field label="Место рождения">
      <TextInput
        value={person.birthPlace}
        onChange={(birthPlace) => onChange({ birthPlace })}
      />
    </Field>
    
    <Field label="СНИЛС (необязательно)">
      <TextInput
        value={person.snils}
        onChange={(snils) =>
          onChange({ snils: normalizeSnils(snils) || snils })
        }
      />
    </Field>
    <Field label="Может быть законным представителем">
      <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={person.canBeLegalRepresentative === true}
          onChange={(event) =>
            onChange({ canBeLegalRepresentative: event.target.checked })
          }
        />
        Родитель / опекун / попечитель
      </label>
    </Field>
  </div>
);

const RegistrationFields = ({ person, onChange }) => (
  <>
    {person.registrationType !== "none" && (
      <Field label="Адрес регистрации">
        <TextArea
          value={person.registrationAddress}
          onChange={(registrationAddress) => onChange({ registrationAddress })}
        />
      </Field>
    )}
    <Field label="Тип регистрации">
      <div className="grid grid-cols-1 gap-2 text-sm text-gray-700">
        {[
          ["previous", "Ранее"],
          ["temporary", "Временная"],
          ["none", "Без регистрации"],
        ].map(([value, label]) => (
          <label key={value} className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={person.registrationType === value}
              onChange={() =>
                onChange({
                  registrationType:
                    person.registrationType === value ? "" : value,
                })
              }
            />
            {label}
          </label>
        ))}
      </div>
    </Field>
  </>
);

const DocumentFields = ({
  participant,
  updateDocument,
  onTextImport,
  onUpdatePerson,
}) => {
  const isBirthCertificate =
    participant.document?.type === "birth_certificate_rf";
  return (
    <div className="mt-5 rounded-xl border border-gray-200 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h4 className="font-medium text-gray-900">
          {isBirthCertificate ? "Свидетельство о рождении" : "Паспорт РФ"}
        </h4>
        <button
          type="button"
          onClick={() =>
            onTextImport({ kind: isBirthCertificate ? "birth" : "passport" })
          }
          className="rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
        >
          {isBirthCertificate
            ? "Вставить свидетельство о рождении текстом"
            : "Вставить паспортные данные текстом"}
        </button>
      </div>
      {isBirthCertificate ? (
        <BirthCertificateFields
          document={participant.document}
          onChange={updateDocument}
        />
      ) : (
        <PassportFields
          document={participant.document}
          onChange={updateDocument}
        />
      )}
      <div className="mt-4 border-t border-gray-100 pt-4">
        <h5 className="mb-3 text-sm font-medium text-gray-900">
          Регистрация
        </h5>
        <RegistrationFields person={participant} onChange={onUpdatePerson} />
      </div>
    </div>
  );
};

const PassportFields = ({ document, onChange }) => (
  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    <Field label="Паспорт: серия и номер">
      <TextInput
        value={[document?.series, document?.number].filter(Boolean).join(" ")}
        onChange={(value) => {
          const passport = splitPassport(formatPassportInput(value));
          onChange({ series: passport.series, number: passport.number });
        }}
      />
    </Field>
    <Field label="Кем выдан">
      <TextInput
        value={document?.issuedBy}
        onChange={(issuedBy) => onChange({ issuedBy })}
      />
    </Field>
    <Field label="Дата выдачи">
      <DateInput
        value={document?.issueDate}
        onChange={(issueDate) => onChange({ issueDate })}
      />
    </Field>
    <Field label="Код подразделения">
      <TextInput
        value={document?.departmentCode}
        onChange={(departmentCode) =>
          onChange({
            departmentCode: formatDepartmentCodeInput(departmentCode),
          })
        }
      />
    </Field>
  </div>
);

const BirthCertificateFields = ({ document, onChange }) => (
  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    <Field label="Серия">
      <TextInput
        value={document?.series}
        onChange={(series) => onChange({ series })}
      />
    </Field>
    <Field label="Номер">
      <TextInput
        value={document?.number}
        onChange={(number) => onChange({ number })}
      />
    </Field>
    <Field label="Кем выдано">
      <TextInput
        value={document?.issuedBy}
        onChange={(issuedBy) => onChange({ issuedBy })}
      />
    </Field>
    <Field label="Дата выдачи">
      <DateInput
        value={document?.issueDate}
        onChange={(issueDate) => onChange({ issueDate })}
      />
    </Field>
    <Field label="Номер актовой записи">
      <TextInput
        value={document?.actRecordNumber}
        onChange={(actRecordNumber) => onChange({ actRecordNumber })}
      />
    </Field>
    <Field label="Дата актовой записи">
      <DateInput
        value={document?.actRecordDate}
        onChange={(actRecordDate) => onChange({ actRecordDate })}
      />
    </Field>
  </div>
);

const RepresentativeFields = ({
  title,
  participant,
  legalOptions,
  selectedId,
  onSelect,
  onBasis,
  consentMode = false,
}) => (
  <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
    <h4 className="font-medium text-blue-900">{title}</h4>
    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field
        label={consentMode ? "Кто даёт согласие" : "Кто подписывает за ребёнка"}
      >
        <SelectInput value={selectedId} onChange={onSelect}>
          <option value="">Выберите взрослого участника</option>
          {legalOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {getFullName(option) || getParticipantRoleLabel(option.role)}
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field label="Основание">
        <SelectInput
          value={participant.legalRepresentativeBasis}
          onChange={onBasis}
        >
          <option value="">Выберите основание</option>
          {BASIS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectInput>
      </Field>
    </div>
  </div>
);

const MarriageInfoSection = ({
  family,
  participants,
  onChange,
  onTextImport,
}) => {
  const hasMarriageParticipant = participants.some((participant) =>
    ["spouse", "formerSpouse"].includes(participant.role),
  );
  const certificateHolders = participants.filter(
    (participant) => participant.role === "certificateHolder",
  );
  const spouseOptions = participants.filter((participant) =>
    ["spouse", "formerSpouse"].includes(participant.role),
  );
  const marriage = family.marriage || {};
  const divorce = family.divorce || {};
  const marriageContract = family.marriageContract || {
    status: "not_concluded",
    description: "",
  };

  const patchFamily = (patch) => onChange({ ...family, ...patch });
  const patchMarriage = (patch) => {
    const nextMarriage = { ...marriage, ...patch };
    if (patch.date && !nextMarriage.actRecordDate)
      nextMarriage.actRecordDate = patch.date;
    onChange({ ...family, marriage: nextMarriage });
  };
  const patchDivorce = (patch) =>
    onChange({ ...family, divorce: { ...divorce, ...patch } });
  const patchContract = (patch) =>
    onChange({
      ...family,
      marriageContract: { ...marriageContract, ...patch },
    });

  if (!hasMarriageParticipant) {
    return (
      <section className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm text-gray-600">
        Если второй родитель является супругом или бывшим супругом владельца
        сертификата, добавьте его как “Супруг/супруга” или “Бывший супруг/бывшая
        супруга”.
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Сведения о браке
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Укажите семейную ситуацию владельца сертификата, реквизиты
            свидетельства о заключении брака и статус брачного договора.
          </p>
        </div>
        <button
          type="button"
          onClick={onTextImport}
          className="rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
        >
          Вставить свидетельство о браке текстом
        </button>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label="Тип семейной ситуации">
          <SelectInput
            value={family.maritalStatusMode}
            onChange={(maritalStatusMode) => patchFamily({ maritalStatusMode })}
          >
            <option value="">Выберите</option>
            <option value="current_marriage">
              Брак действует на дату соглашения
            </option>
            <option value="former_marriage">
              Брак был заключён, но расторгнут
            </option>
            <option value="no_marriage">
              Брак между участниками не заключался / не указывается
            </option>
            <option value="manual">Заполнить вручную</option>
          </SelectInput>
        </Field>
        <Field label="Владелец сертификата">
          <SelectInput
            value={family.certificateHolderParticipantId}
            onChange={(certificateHolderParticipantId) =>
              patchFamily({ certificateHolderParticipantId })
            }
          >
            <option value="">Выберите владельца сертификата</option>
            {certificateHolders.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {getFullName(participant) ||
                  getParticipantRoleLabel(participant.role)}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Супруг/супруга">
          <SelectInput
            value={family.spouseParticipantId}
            onChange={(spouseParticipantId) =>
              patchFamily({ spouseParticipantId })
            }
          >
            <option value="">Выберите супруга/бывшего супруга</option>
            {spouseOptions.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {getFullName(participant) ||
                  getParticipantRoleLabel(participant.role)}
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>

      {family.maritalStatusMode !== "no_marriage" && (
        <div className="mt-5 rounded-xl border border-gray-200 p-4">
          <h4 className="font-medium text-gray-900">
            Свидетельство о заключении брака
          </h4>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Дата заключения брака">
              <DateInput
                value={marriage.date}
                onChange={(date) => patchMarriage({ date })}
              />
            </Field>
            <Field label="Серия свидетельства">
              <TextInput
                value={marriage.certificateSeries}
                onChange={(certificateSeries) =>
                  patchMarriage({ certificateSeries })
                }
              />
            </Field>
            <Field label="Номер свидетельства">
              <TextInput
                value={marriage.certificateNumber}
                onChange={(certificateNumber) =>
                  patchMarriage({ certificateNumber })
                }
              />
            </Field>
            <Field label="Кем выдано свидетельство">
              <TextInput
                value={marriage.issuedBy}
                onChange={(issuedBy) => patchMarriage({ issuedBy })}
              />
            </Field>
            <Field label="Дата выдачи свидетельства">
              <DateInput
                value={marriage.issueDate}
                onChange={(issueDate) => patchMarriage({ issueDate })}
              />
            </Field>
            <Field label="Номер актовой записи">
              <TextInput
                value={marriage.actRecordNumber}
                onChange={(actRecordNumber) =>
                  patchMarriage({ actRecordNumber })
                }
              />
            </Field>
            <Field label="Дата актовой записи">
              <DateInput
                value={marriage.actRecordDate}
                onChange={(actRecordDate) => patchMarriage({ actRecordDate })}
              />
            </Field>
          </div>
        </div>
      )}

      {family.maritalStatusMode === "former_marriage" && (
        <div className="mt-5 rounded-xl border border-orange-100 bg-orange-50 p-4">
          <h4 className="font-medium text-orange-900">Расторжение брака</h4>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Дата расторжения брака">
              <DateInput
                value={divorce.date}
                onChange={(date) => patchDivorce({ date })}
              />
            </Field>
            <Field label="Серия свидетельства">
              <TextInput
                value={divorce.certificateSeries}
                onChange={(certificateSeries) =>
                  patchDivorce({ certificateSeries })
                }
              />
            </Field>
            <Field label="Номер свидетельства">
              <TextInput
                value={divorce.certificateNumber}
                onChange={(certificateNumber) =>
                  patchDivorce({ certificateNumber })
                }
              />
            </Field>
            <Field label="Кем выдано">
              <TextInput
                value={divorce.issuedBy}
                onChange={(issuedBy) => patchDivorce({ issuedBy })}
              />
            </Field>
            <Field label="Дата выдачи">
              <DateInput
                value={divorce.issueDate}
                onChange={(issueDate) => patchDivorce({ issueDate })}
              />
            </Field>
            <Field label="Номер актовой записи">
              <TextInput
                value={divorce.actRecordNumber}
                onChange={(actRecordNumber) =>
                  patchDivorce({ actRecordNumber })
                }
              />
            </Field>
            <Field label="Дата актовой записи">
              <DateInput
                value={divorce.actRecordDate}
                onChange={(actRecordDate) => patchDivorce({ actRecordDate })}
              />
            </Field>
          </div>
        </div>
      )}

      <div className="mt-5 rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Брачный договор">
            <SelectInput
              value={marriageContract.status || "not_concluded"}
              onChange={(status) => patchContract({ status })}
            >
              <option value="not_concluded">Не заключался</option>
              <option value="concluded">Заключался</option>
              <option value="unknown">Неизвестно</option>
            </SelectInput>
          </Field>
          {marriageContract.status === "concluded" && (
            <Field label="Описание условий брачного договора">
              <TextArea
                value={marriageContract.description}
                onChange={(description) => patchContract({ description })}
              />
            </Field>
          )}
        </div>
        {marriageContract.status === "concluded" && (
          <div className="mt-3 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
            Если брачный договор изменяет режим собственности в отношении
            объекта, соглашение требует дополнительной проверки.
          </div>
        )}
      </div>
    </section>
  );
};

const ValidationPanel = ({ validation }) => (
  <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
    <h3 className="text-lg font-semibold text-gray-900">
      Проверки перехода в пакет 4
    </h3>
    <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div>
        <h4 className="font-medium text-red-800">Блокирующие ошибки</h4>
        {validation.errors.length === 0 ? (
          <p className="mt-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            Блокирующих ошибок нет.
          </p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm text-red-700">
            {validation.errors.map((error, index) => (
              <li
                key={`${error.code}-${index}`}
                className="rounded-lg bg-red-50 p-3"
              >
                <strong>{error.code}</strong>: {error.message}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h4 className="font-medium text-yellow-800">Мягкие предупреждения</h4>
        {validation.warnings.length === 0 ? (
          <p className="mt-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            Предупреждений нет.
          </p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm text-yellow-800">
            {validation.warnings.map((warning, index) => (
              <li
                key={`${warning.code}-${index}`}
                className="rounded-lg bg-yellow-50 p-3"
              >
                <strong>{warning.code}</strong>: {warning.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  </section>
);

export default ParticipantsSection;

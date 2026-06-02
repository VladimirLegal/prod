import React, { useMemo, useState } from "react";
import {
  applyParticipantAgeRules,
  buildEgrnParticipantCandidates,
  buildParticipantSignatureText,
  createAttorneyRepresentative,
  createParticipant,
  emptyPowerOfAttorney,
  getFullName,
  getLegalRepresentativeOptions,
  getParticipantRoleLabel,
  validateParticipantsStep,
} from "../../utils/maternityCapitalShares/participantsStep";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500";
const smallInputClass = `${inputClass} py-1.5`;
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

const TextInput = ({ value, onChange, placeholder = "", type = "text" }) => (
  <input
    type={type}
    value={value || ""}
    onChange={(event) => onChange(event.target.value)}
    placeholder={placeholder}
    className={inputClass}
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
  const step = formData.participantsStep;
  const participants = step.participants || [];
  const validation = useMemo(() => validateParticipantsStep(step), [step]);
  const importCandidates = useMemo(
    () =>
      buildEgrnParticipantCandidates(
        formData.rights?.ownerBlocks || [],
        step.agreementDate,
      ),
    [formData.rights?.ownerBlocks, step.agreementDate],
  );

  const updateStep = (updater) => {
    setFormData((prev) => {
      const current = prev.participantsStep;
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

  const updateAgreementDate = (agreementDate) => {
    updateStep((current) => ({
      ...current,
      agreementDate,
      participants: current.participants.map((participant) =>
        applyParticipantAgeRules(participant, agreementDate),
      ),
    }));
  };

  const addParticipant = (role) => {
    updateStep((current) => {
      const participant = createParticipant(role, {}, current.agreementDate);
      const nextParticipants = [...current.participants, participant];
      return {
        ...current,
        certificateHolderParticipantId:
          role === "certificateHolder" &&
          !current.certificateHolderParticipantId
            ? participant.id
            : current.certificateHolderParticipantId,
        participants: nextParticipants,
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
          attorneyRepresentativeParticipantId:
            participant.attorneyRepresentativeParticipantId === id
              ? null
              : participant.attorneyRepresentativeParticipantId,
        })),
    }));
  };

  const togglePowerOfAttorney = (participant) => {
    updateStep((current) => {
      if (participant.actsThroughPowerOfAttorney) {
        return {
          ...current,
          participants: current.participants.map((item) =>
            item.id === participant.id
              ? {
                  ...item,
                  actsThroughPowerOfAttorney: false,
                  attorneyRepresentativeParticipantId: null,
                  powerOfAttorney: null,
                }
              : item,
          ),
        };
      }

      const representative = createAttorneyRepresentative(
        {},
        current.agreementDate,
      );
      return {
        ...current,
        participants: [
          ...current.participants.map((item) =>
            item.id === participant.id
              ? {
                  ...item,
                  actsThroughPowerOfAttorney: true,
                  attorneyRepresentativeParticipantId: representative.id,
                  powerOfAttorney: emptyPowerOfAttorney({
                    principalParticipantId: item.id,
                    representativeParticipantId: representative.id,
                  }),
                }
              : item,
          ),
          representative,
        ],
      };
    });
  };

  const importFromEgrn = (selectedCandidates) => {
    updateStep((current) => ({
      ...current,
      participants: [...current.participants, ...selectedCandidates],
    }));
    setShowImport(false);
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
              Заполните юридически размеченный список лиц: кто получает долю,
              кто подписывает сам, кто действует за ребёнка и кто подписывает по
              доверенности.
            </p>
          </div>
          <div className="min-w-[220px]">
            <Field label="Дата соглашения для расчёта возраста">
              <TextInput
                type="date"
                value={step.agreementDate}
                onChange={updateAgreementDate}
              />
            </Field>
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
            Создать участников из ЕГРН
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

      <section className="grid gap-4">
        {participants.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-gray-600">
            Участники ещё не добавлены. Начните с владельца сертификата или
            импортируйте кандидатов из ЕГРН.
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
          />
        ))}
      </section>

      <ValidationPanel validation={validation} />
    </div>
  );
};

const EgrnImportModal = ({ candidates, onClose, onImport }) => {
  const [selectedIds, setSelectedIds] = useState(
    candidates.map((candidate) => candidate.id),
  );
  const [drafts, setDrafts] = useState(candidates);

  const updateDraft = (id, patch) => {
    setDrafts((current) =>
      current.map((candidate) =>
        candidate.id === id ? { ...candidate, ...patch } : candidate,
      ),
    );
  };

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
}) => {
  const legalOptions = getLegalRepresentativeOptions(
    participants,
    participant.id,
  );
  const attorneyOptions = participants.filter(
    (item) =>
      item.role === "attorneyRepresentative" && item.id !== participant.id,
  );
  const signaturePreview = buildParticipantSignatureText(
    participant,
    participants,
  );

  const updateDocument = (patch) => onUpdate({ document: patch });
  const updatePower = (patch) =>
    onUpdate({
      powerOfAttorney: { ...(participant.powerOfAttorney || {}), ...patch },
    });

  const roleLocked = participant.role === "attorneyRepresentative";
  const shareLocked = participant.role === "attorneyRepresentative";
  const isCertificateHolder = participant.id === certificateHolderParticipantId;

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
                Выбран владелец сертификата
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
              <option
                key={value}
                value={value}
                disabled={roleLocked && value !== participant.role}
              >
                {label}
              </option>
            ))}
            {roleLocked && (
              <option value="attorneyRepresentative">
                Представитель по доверенности
              </option>
            )}
          </SelectInput>
        </Field>
        <Field label="Владелец сертификата">
          <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
            <input
              type="radio"
              checked={isCertificateHolder}
              onChange={() => onUpdate({ role: "certificateHolder" })}
              disabled={participant.role === "attorneyRepresentative"}
            />
            Это владелец сертификата
          </label>
        </Field>
        <Field label="Получает долю">
          <label
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${shareLocked ? "border-gray-200 bg-gray-50 text-gray-400" : "border-gray-200 text-gray-700"}`}
          >
            <input
              type="checkbox"
              checked={participant.receivesShare === true}
              disabled={shareLocked}
              onChange={(event) =>
                onUpdate({ receivesShare: event.target.checked })
              }
            />
            Включить в расчёт долей
          </label>
        </Field>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label="Фамилия">
          <TextInput
            value={participant.lastName}
            onChange={(lastName) => onUpdate({ lastName })}
          />
        </Field>
        <Field label="Имя">
          <TextInput
            value={participant.firstName}
            onChange={(firstName) => onUpdate({ firstName })}
          />
        </Field>
        <Field label="Отчество">
          <TextInput
            value={participant.middleName}
            onChange={(middleName) => onUpdate({ middleName })}
          />
        </Field>
        <Field label="Пол">
          <SelectInput
            value={participant.gender}
            onChange={(gender) => onUpdate({ gender })}
          >
            <option value="">Выберите</option>
            <option value="male">Мужской</option>
            <option value="female">Женский</option>
          </SelectInput>
        </Field>
        <Field label="Дата рождения">
          <TextInput
            type="date"
            value={participant.birthDate}
            onChange={(birthDate) => onUpdate({ birthDate })}
          />
        </Field>
        <Field label="Место рождения">
          <TextInput
            value={participant.birthPlace}
            onChange={(birthPlace) => onUpdate({ birthPlace })}
          />
        </Field>
        <Field label="Адрес регистрации">
          <TextArea
            value={participant.registrationAddress}
            onChange={(registrationAddress) =>
              onUpdate({ registrationAddress })
            }
          />
        </Field>
        <Field label="СНИЛС (необязательно)">
          <TextInput
            value={participant.snils}
            onChange={(snils) => onUpdate({ snils })}
          />
        </Field>
        <Field label="Может быть законным представителем">
          <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={participant.canBeLegalRepresentative === true}
              disabled={participant.role === "attorneyRepresentative"}
              onChange={(event) =>
                onUpdate({ canBeLegalRepresentative: event.target.checked })
              }
            />
            Родитель / опекун / попечитель
          </label>
        </Field>
      </div>

      {participant.legalCapacityStatus === "full_before_18" && (
        <div className="mt-4 rounded-xl border border-purple-100 bg-purple-50 p-4">
          <Field label="Основание полной дееспособности до 18 лет">
            <SelectInput
              value={participant.legalCapacityBasis}
              onChange={(legalCapacityBasis) =>
                onUpdate({ legalCapacityBasis })
              }
            >
              <option value="">Выберите основание</option>
              <option value="marriage_before_18">
                Вступление в брак до 18 лет
              </option>
              <option value="emancipation">Эмансипация</option>
            </SelectInput>
          </Field>
        </div>
      )}

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

      {participant.role !== "attorneyRepresentative" && (
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
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Поверенный">
                <SelectInput
                  value={participant.attorneyRepresentativeParticipantId}
                  onChange={(attorneyRepresentativeParticipantId) =>
                    onUpdate({
                      attorneyRepresentativeParticipantId,
                      powerOfAttorney: {
                        ...(participant.powerOfAttorney || {}),
                        principalParticipantId: participant.id,
                        representativeParticipantId:
                          attorneyRepresentativeParticipantId,
                      },
                    })
                  }
                >
                  <option value="">Выберите поверенного</option>
                  {attorneyOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {getFullName(option) ||
                        getParticipantRoleLabel(option.role)}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Дата доверенности">
                <TextInput
                  type="date"
                  value={participant.powerOfAttorney?.issueDate}
                  onChange={(issueDate) => updatePower({ issueDate })}
                />
              </Field>
              <Field label="Реестровый номер">
                <TextInput
                  value={participant.powerOfAttorney?.registryNumber}
                  onChange={(registryNumber) => updatePower({ registryNumber })}
                />
              </Field>
              <Field label="Кем удостоверена">
                <TextInput
                  value={participant.powerOfAttorney?.certifiedBy}
                  onChange={(certifiedBy) => updatePower({ certifiedBy })}
                />
              </Field>
              <Field label="Тип удостоверения">
                <SelectInput
                  value={
                    participant.powerOfAttorney?.certificationType || "notary"
                  }
                  onChange={(certificationType) =>
                    updatePower({ certificationType })
                  }
                >
                  <option value="notary">Нотариальная</option>
                  <option value="equated_under_185_1">
                    Приравнена к нотариальной по ст. 185.1 ГК РФ
                  </option>
                </SelectInput>
              </Field>
              <Field label="Полномочия">
                <TextArea
                  value={participant.powerOfAttorney?.powersSummary}
                  onChange={(powersSummary) => updatePower({ powersSummary })}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={
                    participant.powerOfAttorney?.allowsAgreementSigning !==
                    false
                  }
                  onChange={(event) =>
                    updatePower({
                      allowsAgreementSigning: event.target.checked,
                    })
                  }
                />{" "}
                Подписание соглашения
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={
                    participant.powerOfAttorney?.allowsStateRegistration !==
                    false
                  }
                  onChange={(event) =>
                    updatePower({
                      allowsStateRegistration: event.target.checked,
                    })
                  }
                />{" "}
                Госрегистрация прав
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={
                    participant.powerOfAttorney?.allowsRosreestrSubmission !==
                    false
                  }
                  onChange={(event) =>
                    updatePower({
                      allowsRosreestrSubmission: event.target.checked,
                    })
                  }
                />{" "}
                Подача в Росреестр
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={
                    participant.powerOfAttorney?.isSubdelegation === true
                  }
                  onChange={(event) =>
                    updatePower({ isSubdelegation: event.target.checked })
                  }
                />{" "}
                Передоверие
              </label>
            </div>
          )}
        </div>
      )}

      {participant.canBeLegalRepresentative &&
        [
          "guardian",
          "custodian",
          "appointed_representative_by_guardianship_authority",
        ].includes(participant.legalRepresentativeBasis) && (
          <div className="mt-5 rounded-xl border border-orange-100 bg-orange-50 p-4">
            <h4 className="font-medium text-orange-900">
              Основание представительства органа опеки
            </h4>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                className={smallInputClass}
                placeholder="Наименование акта"
                value={participant.guardianshipAuthorityAct?.title || ""}
                onChange={(event) =>
                  onUpdate({
                    guardianshipAuthorityAct: {
                      ...(participant.guardianshipAuthorityAct || {}),
                      title: event.target.value,
                    },
                  })
                }
              />
              <input
                className={smallInputClass}
                placeholder="Номер"
                value={participant.guardianshipAuthorityAct?.number || ""}
                onChange={(event) =>
                  onUpdate({
                    guardianshipAuthorityAct: {
                      ...(participant.guardianshipAuthorityAct || {}),
                      number: event.target.value,
                    },
                  })
                }
              />
              <input
                className={smallInputClass}
                type="date"
                value={participant.guardianshipAuthorityAct?.date || ""}
                onChange={(event) =>
                  onUpdate({
                    guardianshipAuthorityAct: {
                      ...(participant.guardianshipAuthorityAct || {}),
                      date: event.target.value,
                    },
                  })
                }
              />
              <input
                className={smallInputClass}
                placeholder="Кем выдан"
                value={participant.guardianshipAuthorityAct?.issuedBy || ""}
                onChange={(event) =>
                  onUpdate({
                    guardianshipAuthorityAct: {
                      ...(participant.guardianshipAuthorityAct || {}),
                      issuedBy: event.target.value,
                    },
                  })
                }
              />
            </div>
          </div>
        )}

      <Field label="Примечание">
        <TextArea
          value={participant.notes}
          onChange={(notes) => onUpdate({ notes })}
        />
      </Field>

      <details className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
        <summary className="cursor-pointer font-medium text-gray-900">
          Предпросмотр фрагмента подписанта
        </summary>
        <p className="mt-3 leading-6">{signaturePreview}</p>
      </details>
    </article>
  );
};

const DocumentFields = ({ participant, updateDocument }) => {
  const isBirthCertificate =
    participant.document?.type === "birth_certificate_rf";
  return (
    <div className="mt-5 rounded-xl border border-gray-200 p-4">
      <h4 className="font-medium text-gray-900">
        {isBirthCertificate ? "Свидетельство о рождении" : "Паспорт РФ"}
      </h4>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label="Серия">
          <TextInput
            value={participant.document?.series}
            onChange={(series) => updateDocument({ series })}
          />
        </Field>
        <Field label="Номер">
          <TextInput
            value={participant.document?.number}
            onChange={(number) => updateDocument({ number })}
          />
        </Field>
        <Field label="Кем выдан">
          <TextInput
            value={participant.document?.issuedBy}
            onChange={(issuedBy) => updateDocument({ issuedBy })}
          />
        </Field>
        <Field label="Дата выдачи">
          <TextInput
            type="date"
            value={participant.document?.issueDate}
            onChange={(issueDate) => updateDocument({ issueDate })}
          />
        </Field>
        {!isBirthCertificate && (
          <Field label="Код подразделения">
            <TextInput
              value={participant.document?.departmentCode}
              onChange={(departmentCode) => updateDocument({ departmentCode })}
            />
          </Field>
        )}
        {isBirthCertificate && (
          <Field label="Номер актовой записи">
            <TextInput
              value={participant.document?.actRecordNumber}
              onChange={(actRecordNumber) =>
                updateDocument({ actRecordNumber })
              }
            />
          </Field>
        )}
        {isBirthCertificate && (
          <Field label="Дата актовой записи">
            <TextInput
              type="date"
              value={participant.document?.actRecordDate}
              onChange={(actRecordDate) => updateDocument({ actRecordDate })}
            />
          </Field>
        )}
      </div>
    </div>
  );
};

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

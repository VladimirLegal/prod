import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import FreeTextImportModal from "./FreeTextImportModal";
import { parseFreeTextPerson } from "../../utils/freeTextParser";
import {
  formatDateInput,
  formatDepartmentCodeInput,
  formatPassportInput,
} from "../../utils/inputMasks";
import {
  formatDateToText,
  formatPassportText,
  formatPhone,
} from "../../utils/formatters";

const inputClass =
  "w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";
const hintClass = "mt-1 text-xs text-gray-500";
const buttonClass =
  "inline-flex items-center justify-center h-11 px-5 rounded-full text-sm font-medium transition-colors focus:outline-none focus:ring-2 bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-300";

const Field = ({ label, children, hint = "" }) => (
  <label className="block">
    <span className={labelClass}>{label}</span>
    {children}
    {hint ? <span className={hintClass}>{hint}</span> : null}
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

const TextArea = ({ value, onChange, placeholder = "" }) => (
  <textarea
    value={value || ""}
    onChange={(event) => onChange(event.target.value)}
    placeholder={placeholder}
    rows={3}
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

const toStateGender = (gender = "") => {
  if (gender === "male" || gender === "female") return gender;
  const normalized = String(gender).toLowerCase();
  if (normalized.includes("жен")) return "female";
  if (normalized.includes("муж")) return "male";
  return gender || "";
};

export default function PersonPassportFields({
  person = {},
  onChange,
  title = "Физическое лицо",
  titleIcon = null,
  required = false,
  showContactFields = true,
  showRegistrationType = true,
  freeTextTitle = "Вставьте текст с паспортными данными",
}) {
  const [isFreeTextOpen, setIsFreeTextOpen] = React.useState(false);
  const requiredMark = required ? " *" : "";

  const change = (field, value) => {
    onChange?.(field, value);
  };

  const applyFreeText = (rawText) => {
    const parsed = parseFreeTextPerson(rawText || "");
    const map = {
      fullName: parsed.fullName,
      gender: toStateGender(parsed.gender),
      birthDate: parsed.birthDate,
      birthPlace: parsed.birthPlace,
      passport: parsed.passport ? formatPassportInput(parsed.passport) : "",
      passportIssued: parsed.passportIssued,
      issueDate: parsed.issueDate,
      departmentCode: parsed.departmentCode
        ? formatDepartmentCodeInput(parsed.departmentCode)
        : "",
      registration: parsed.registration,
      phone: parsed.phone ? formatPhone(parsed.phone) : "",
      email: parsed.email,
    };

    Object.entries(map).forEach(([field, value]) => {
      if (value) change(field, value);
    });
    setIsFreeTextOpen(false);
  };

  const birthDateText = person.birthDate
    ? formatDateToText(person.birthDate)
    : "";
  const issueDateText = person.issueDate
    ? formatDateToText(person.issueDate)
    : "";
  const passportText = person.passport
    ? formatPassportText(person.passport)
    : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="flex items-center text-lg font-semibold text-gray-900">
          {titleIcon ? (
            <FontAwesomeIcon icon={titleIcon} className="mr-2 text-blue-600" />
          ) : null}
          {title}
        </h3>
        <button
          type="button"
          onClick={() => setIsFreeTextOpen(true)}
          className={buttonClass}
        >
          Вставить паспортные данные текстом
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Field label={`ФИО${requiredMark}`}>
          <TextInput
            value={person.fullName}
            onChange={(value) => change("fullName", value)}
          />
        </Field>

        <Field label={`Пол${requiredMark}`}>
          <SelectInput
            value={person.gender}
            onChange={(value) => change("gender", value)}
          >
            <option value="">Не выбран</option>
            <option value="male">Мужской</option>
            <option value="female">Женский</option>
          </SelectInput>
        </Field>

        <Field label={`Дата рождения${requiredMark}`} hint={birthDateText}>
          <TextInput
            value={person.birthDate}
            onChange={(value) => change("birthDate", formatDateInput(value))}
            placeholder="ДД.ММ.ГГГГ"
          />
        </Field>

        <Field label={`Место рождения${requiredMark}`}>
          <TextInput
            value={person.birthPlace}
            onChange={(value) => change("birthPlace", value)}
          />
        </Field>

        <Field
          label={`Паспорт серия и номер${requiredMark}`}
          hint={passportText}
        >
          <TextInput
            value={person.passport}
            onChange={(value) => change("passport", formatPassportInput(value))}
            placeholder="0000 000000"
          />
        </Field>

        <Field label={`Кем выдан${requiredMark}`}>
          <TextInput
            value={person.passportIssued}
            onChange={(value) => change("passportIssued", value)}
          />
        </Field>

        <Field label={`Дата выдачи${requiredMark}`} hint={issueDateText}>
          <TextInput
            value={person.issueDate}
            onChange={(value) => change("issueDate", formatDateInput(value))}
            placeholder="ДД.ММ.ГГГГ"
          />
        </Field>

        <Field label={`Код подразделения${requiredMark}`}>
          <TextInput
            value={person.departmentCode}
            onChange={(value) =>
              change("departmentCode", formatDepartmentCodeInput(value))
            }
            placeholder="000-000"
          />
        </Field>

        {showRegistrationType && (
          <Field label="Тип регистрации">
            <SelectInput
              value={person.registrationType}
              onChange={(value) => change("registrationType", value)}
            >
              <option value="">Обычная регистрация</option>
              <option value="previous">Ранее зарегистрирован</option>
              <option value="temporary">Временная регистрация</option>
              <option value="none">Без регистрации</option>
            </SelectInput>
          </Field>
        )}

        {person.registrationType !== "none" && (
          <Field label={`Адрес регистрации${requiredMark}`}>
            <TextArea
              value={person.registration}
              onChange={(value) => change("registration", value)}
            />
          </Field>
        )}

        {showContactFields && (
          <>
            <Field label="Телефон">
              <TextInput
                value={person.phone}
                onChange={(value) => change("phone", formatPhone(value))}
              />
            </Field>

            <Field label="Email">
              <TextInput
                type="email"
                value={person.email}
                onChange={(value) => change("email", value)}
              />
            </Field>
          </>
        )}
      </div>

      <FreeTextImportModal
        open={isFreeTextOpen}
        title={freeTextTitle}
        onClose={() => setIsFreeTextOpen(false)}
        onApply={applyFreeText}
      />
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faFileContract,
  faHome,
} from "@fortawesome/free-solid-svg-icons";
import FreeTextImportModal from "../components/common/FreeTextImportModal";
import { extractEGRNDataFromPdf } from "../utils/extractEGRNDataFromPdf";
import { extractEGRNFromZip } from "../utils/extractEGRNFromZip";
import { parseFreeTextPerson } from "../utils/freeTextParser";
import {
  hydrateShareSaleNoticeForm,
  initialShareSaleNoticeForm,
  SHARE_SALE_NOTICE_STORAGE_KEY,
} from "../utils/shareSaleNotice/initialState";
import { normalizeEgrnForShareSaleNotice } from "../utils/shareSaleNotice/normalizeEgrnForShareSaleNotice";

const steps = [
  "Источник данных",
  "Объект и право",
  "Продавец",
  "Условия продажи",
  "Сособственники и адреса",
  "Проверка и формирование пакета",
];

const PILL = {
  base: "inline-flex items-center justify-center h-11 px-5 rounded-full text-sm font-medium transition-colors focus:outline-none focus:ring-2",
  primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-400",
  subtle: "bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-300",
  danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-400",
};
const cardClass = "bg-white rounded-xl shadow-md p-6";
const inputClass =
  "w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";

const loadDraft = () => {
  try {
    const raw = localStorage.getItem(SHARE_SALE_NOTICE_STORAGE_KEY);
    return raw
      ? hydrateShareSaleNoticeForm(JSON.parse(raw))
      : initialShareSaleNoticeForm;
  } catch {
    return initialShareSaleNoticeForm;
  }
};

const Field = ({ label, value, onChange, placeholder = "", type = "text" }) => (
  <label className="block">
    <span className={labelClass}>{label}</span>
    <input
      type={type}
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={inputClass}
    />
  </label>
);

const TextAreaField = ({ label, value, onChange, placeholder = "" }) => (
  <label className="block">
    <span className={labelClass}>{label}</span>
    <textarea
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={3}
      className={inputClass}
    />
  </label>
);

const SummaryRow = ({ label, value }) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 py-2 border-b border-gray-100 last:border-0">
    <dt className="text-sm font-medium text-gray-500">{label}</dt>
    <dd className="sm:col-span-2 text-sm text-gray-900 whitespace-pre-line">
      {value || "—"}
    </dd>
  </div>
);

const ownerLabel = (owner, index) =>
  `${index + 1}. ${owner.fullName || "Правообладатель без ФИО"}${owner.share ? `, доля ${owner.share}` : ""}`;

const getOwnerShare = (owner = {}) =>
  owner.share || owner.rights?.map((right) => right.share).find(Boolean) || "";

const mapOwnerToSeller = (owner = {}, index = null) => {
  const share = getOwnerShare(owner);
  return {
    source: "egrn",
    ownerIndex: index,
    fullName: owner.fullName || owner.name || "",
    gender: owner.gender || "",
    birthDate: owner.birthDate || "",
    birthPlace: owner.birthPlace || "",
    passport: [owner.passport?.series, owner.passport?.number]
      .filter(Boolean)
      .join(" "),
    passportIssued: owner.passport?.issuedBy || "",
    issueDate: owner.passport?.issueDate || "",
    departmentCode: owner.passport?.deptCode || "",
    registration: owner.registration || owner.address || "",
    phone: owner.phone || "",
    email: owner.email || "",
    egrnShare: share,
    saleShare: share,
  };
};

const ShareSaleNoticeWizard = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState(loadDraft);
  const [parsedEgrn, setParsedEgrn] = useState(formData.egrn.parsed || null);
  const [message, setMessage] = useState("");
  const [isPassportModalOpen, setIsPassportModalOpen] = useState(false);
  const hydratedRef = useRef(false);
  const currentStep = formData.ui.currentStep || 0;

  const owners = useMemo(
    () => parsedEgrn?.owners || formData.egrn.parsed?.owners || [],
    [parsedEgrn, formData.egrn.parsed],
  );

  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return undefined;
    }
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(
          SHARE_SALE_NOTICE_STORAGE_KEY,
          JSON.stringify(formData),
        );
      } catch {
        // localStorage может быть недоступен в приватном режиме.
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [formData]);

  const updateUi = (patch) =>
    setFormData((prev) => ({ ...prev, ui: { ...prev.ui, ...patch } }));
  const updateObject = (key, value) =>
    setFormData((prev) => ({
      ...prev,
      object: { ...prev.object, [key]: value },
    }));
  const updateSeller = (key, value) =>
    setFormData((prev) => ({
      ...prev,
      seller: { ...prev.seller, [key]: value },
    }));
  const updateSaleTerms = (key, value) =>
    setFormData((prev) => ({
      ...prev,
      saleTerms: { ...prev.saleTerms, [key]: value },
    }));

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const lowerName = file.name.toLowerCase();

    setMessage("");
    setFormData((prev) => ({
      ...prev,
      ui: {
        ...prev.ui,
        sourceMode: "egrn",
        parseStatus: "parsing",
        parseWarnings: [],
      },
      egrn: {
        ...prev.egrn,
        fileName: file.name,
        fileType: file.type,
        source: lowerName.endsWith(".zip")
          ? "zip"
          : lowerName.endsWith(".pdf")
            ? "pdf"
            : "",
      },
    }));

    try {
      let parsed;
      if (lowerName.endsWith(".zip")) {
        parsed = await extractEGRNFromZip(file);
      } else if (lowerName.endsWith(".pdf")) {
        parsed = await extractEGRNDataFromPdf(file);
      } else {
        throw new Error("Поддерживаются только файлы .zip и .pdf");
      }

      const normalized = normalizeEgrnForShareSaleNotice(parsed);
      setParsedEgrn(normalized);
      setFormData((prev) => ({
        ...prev,
        ui: {
          ...prev.ui,
          parseStatus: "parsed",
          parseWarnings: [...(parsed?.warnings || []), ...normalized.warnings],
        },
        egrn: { ...prev.egrn, raw: parsed, parsed: normalized, applied: false },
      }));
    } catch (error) {
      setParsedEgrn(null);
      setFormData((prev) => ({
        ...prev,
        ui: {
          ...prev.ui,
          parseStatus: "error",
          parseWarnings: [error.message || "Не удалось прочитать выписку"],
        },
      }));
    } finally {
      event.target.value = "";
    }
  };

  const applyEgrnData = (sellerIndex = null) => {
    const normalized = parsedEgrn || formData.egrn.parsed;
    if (!normalized) return;
    const selectedIndex =
      sellerIndex !== null
        ? Number(sellerIndex)
        : normalized.suggestedSeller?.ownerIndex;
    const sellerOwner =
      selectedIndex !== null && selectedIndex !== undefined
        ? owners[selectedIndex]
        : null;
    const seller = sellerOwner
      ? normalized.suggestedSeller?.ownerIndex === selectedIndex
        ? normalized.suggestedSeller
        : mapOwnerToSeller(sellerOwner, selectedIndex)
      : normalized.suggestedSeller;

    setFormData((prev) => ({
      ...prev,
      object: { ...prev.object, ...normalized.object },
      seller: seller ? { ...prev.seller, ...seller } : prev.seller,
      coOwners: normalized.coOwners.filter(
        (owner) => owner.ownerIndex !== selectedIndex,
      ),
      saleTerms: {
        ...prev.saleTerms,
        place: prev.saleTerms.place || normalized.object.city,
      },
      ui: { ...prev.ui, parseStatus: "applied" },
      egrn: { ...prev.egrn, parsed: normalized, applied: true },
    }));
    setMessage(
      "Данные ЕГРН применены к мастеру. Проверьте продавца и адреса сособственников.",
    );
  };

  const clearDraft = () => {
    try {
      localStorage.removeItem(SHARE_SALE_NOTICE_STORAGE_KEY);
    } catch {
      // localStorage может быть недоступен в приватном режиме.
    }
    setParsedEgrn(null);
    setFormData({
      ...initialShareSaleNoticeForm,
      ui: { ...initialShareSaleNoticeForm.ui, clearDraftRequested: true },
    });
    setMessage("Черновик очищен.");
  };

  const applyPassportText = (rawText) => {
    const parsed = parseFreeTextPerson(rawText || "");
    setFormData((prev) => ({
      ...prev,
      seller: {
        ...prev.seller,
        source: "manual",
        fullName: parsed.fullName || prev.seller.fullName,
        gender: parsed.gender || prev.seller.gender,
        birthDate: parsed.birthDate || prev.seller.birthDate,
        birthPlace: parsed.birthPlace || prev.seller.birthPlace,
        passport: parsed.passport || prev.seller.passport,
        passportIssued: parsed.passportIssued || prev.seller.passportIssued,
        issueDate: parsed.issueDate || prev.seller.issueDate,
        departmentCode: parsed.departmentCode || prev.seller.departmentCode,
        registration: parsed.registration || prev.seller.registration,
        phone: parsed.phone || prev.seller.phone,
        email: parsed.email || prev.seller.email,
      },
    }));
    setIsPassportModalOpen(false);
    setMessage("Паспортные данные продавца заполнены из текста.");
  };

  const updateCoOwner = (index, key, value) => {
    setFormData((prev) => ({
      ...prev,
      coOwners: prev.coOwners.map((owner, ownerIndex) =>
        ownerIndex === index ? { ...owner, [key]: value } : owner,
      ),
    }));
  };

  const goBack = () => {
    if (currentStep === 0) {
      navigate("/other-documents");
      return;
    }
    updateUi({ currentStep: currentStep - 1 });
  };

  const goNext = () => {
    if (currentStep >= steps.length - 1) {
      setMessage(
        "Формирование пакета будет добавлено следующим пакетом работ. Черновик данных уже сохранён.",
      );
      return;
    }
    updateUi({ currentStep: currentStep + 1 });
    setMessage("");
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <Link
            to="/other-documents"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors mb-4"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="mr-2" />
            Назад к прочим документам
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            Уведомление о продаже доли
          </h1>
          <p className="text-gray-600 mt-2">
            Мастер подготовки уведомлений сособственникам, описи вложения ф.
            107, уведомления о вручении и инструкции по отправке.
          </p>
        </div>
        <Link to="/" className={`${PILL.base} ${PILL.subtle}`}>
          <FontAwesomeIcon icon={faHome} className="mr-2" />
          На главную
        </Link>
      </div>

      <div className="flex justify-between mb-8 border-b overflow-x-auto">
        {steps.map((stepName, index) => (
          <button
            key={stepName}
            type="button"
            onClick={() => updateUi({ currentStep: index })}
            className={`pb-2 px-4 whitespace-nowrap relative ${
              currentStep === index
                ? "text-blue-600 font-medium border-b-2 border-blue-600"
                : "text-gray-600"
            }`}
          >
            <FontAwesomeIcon icon={faFileContract} className="mr-2" />
            <span className="hidden sm:inline">Шаг {index + 1}. </span>
            {stepName}
          </button>
        ))}
      </div>

      {currentStep === 0 && (
        <div className={`${cardClass} space-y-6`}>
          <h2 className="text-xl font-semibold text-gray-900">
            Шаг 1. Источник данных
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => updateUi({ sourceMode: "egrn" })}
              className={`rounded-xl border p-5 text-left transition-colors ${formData.ui.sourceMode === "egrn" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:bg-gray-50"}`}
            >
              <div className="font-semibold text-gray-900">
                Загрузить выписку ЕГРН
              </div>
              <div className="text-sm text-gray-600 mt-2">
                PDF или ZIP с выпиской. Мастер заполнит объект,
                правообладателей, доли и предложит продавца.
              </div>
            </button>
            <button
              type="button"
              onClick={() =>
                updateUi({ sourceMode: "manual", parseStatus: "idle" })
              }
              className={`rounded-xl border p-5 text-left transition-colors ${formData.ui.sourceMode === "manual" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:bg-gray-50"}`}
            >
              <div className="font-semibold text-gray-900">
                Заполнить вручную
              </div>
              <div className="text-sm text-gray-600 mt-2">
                Введите объект, продавца и сособственников самостоятельно.
              </div>
            </button>
          </div>

          {formData.ui.sourceMode === "egrn" && (
            <div className="space-y-4">
              <input
                type="file"
                accept=".pdf,.zip,application/pdf,application/zip"
                onChange={handleFileChange}
                className={inputClass}
              />
              {formData.egrn.fileName && (
                <p className="text-sm text-gray-600">
                  Файл: {formData.egrn.fileName}
                </p>
              )}
              {formData.ui.parseStatus === "parsing" && (
                <p className="text-blue-700">Выписка обрабатывается…</p>
              )}
              {formData.ui.parseStatus === "error" && (
                <p className="text-red-700">Не удалось обработать выписку.</p>
              )}
              {formData.ui.parseWarnings.length > 0 && (
                <div className="rounded-lg bg-yellow-50 text-yellow-800 p-4 space-y-1">
                  {formData.ui.parseWarnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              )}
              {parsedEgrn && (
                <div className="rounded-xl border border-gray-200 p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">
                    Найдено в ЕГРН
                  </h3>
                  <dl>
                    <SummaryRow
                      label="Объект"
                      value={parsedEgrn.object.address}
                    />
                    <SummaryRow
                      label="Кадастровый номер"
                      value={parsedEgrn.object.cadastralNumber}
                    />
                    <SummaryRow
                      label="Тип права"
                      value={parsedEgrn.rights.ownershipType}
                    />
                    <SummaryRow
                      label="Получатель выписки"
                      value={parsedEgrn.recipientOwnerMatch.recipientName}
                    />
                    <SummaryRow
                      label="Предложенный продавец"
                      value={
                        parsedEgrn.suggestedSeller?.fullName ||
                        "Совпадение с получателем выписки не найдено"
                      }
                    />
                  </dl>
                  {owners.length > 0 && (
                    <label className="block mt-4">
                      <span className={labelClass}>
                        Выбрать продавца вручную, если автоматическое совпадение
                        неверно
                      </span>
                      <select
                        value={
                          formData.seller.ownerIndex ??
                          parsedEgrn.suggestedSeller?.ownerIndex ??
                          ""
                        }
                        onChange={(event) => applyEgrnData(event.target.value)}
                        className={inputClass}
                      >
                        <option value="">Не выбран</option>
                        {owners.map((owner, index) => (
                          <option
                            key={`${owner.fullName}-${index}`}
                            value={index}
                          >
                            {ownerLabel(owner, index)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={() => applyEgrnData()}
                    className={`${PILL.base} ${PILL.primary} mt-4`}
                  >
                    Применить данные ЕГРН
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {currentStep === 1 && (
        <div className={`${cardClass} space-y-6`}>
          <h2 className="text-xl font-semibold text-gray-900">
            Шаг 2. Объект и право
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <TextAreaField
              label="Адрес объекта"
              value={formData.object.address}
              onChange={(value) => updateObject("address", value)}
            />
            <Field
              label="Кадастровый номер"
              value={formData.object.cadastralNumber}
              onChange={(value) => updateObject("cadastralNumber", value)}
            />
            <Field
              label="Вид объекта"
              value={formData.object.objectKindFromEgrn}
              onChange={(value) => updateObject("objectKindFromEgrn", value)}
              placeholder="Квартира, комната, жилой дом…"
            />
            <Field
              label="Площадь (необязательно)"
              value={formData.object.area}
              onChange={(value) => updateObject("area", value)}
            />
            <Field
              label="Этаж (необязательно)"
              value={formData.object.floor}
              onChange={(value) => updateObject("floor", value)}
            />
            <Field
              label="Город составления"
              value={formData.object.city}
              onChange={(value) => updateObject("city", value)}
            />
          </div>
          {formData.egrn.parsed?.rights?.ownershipType && (
            <SummaryRow
              label="Тип права по ЕГРН"
              value={formData.egrn.parsed.rights.ownershipType}
            />
          )}
        </div>
      )}

      {currentStep === 2 && (
        <div className={`${cardClass} space-y-6`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-xl font-semibold text-gray-900">
              Шаг 3. Продавец
            </h2>
            <button
              type="button"
              onClick={() => setIsPassportModalOpen(true)}
              className={`${PILL.base} ${PILL.subtle}`}
            >
              Вставить паспортные данные текстом
            </button>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Field
              label="ФИО"
              value={formData.seller.fullName}
              onChange={(value) => updateSeller("fullName", value)}
            />
            <Field
              label="Пол"
              value={formData.seller.gender}
              onChange={(value) => updateSeller("gender", value)}
              placeholder="мужской / женский"
            />
            <Field
              label="Дата рождения"
              value={formData.seller.birthDate}
              onChange={(value) => updateSeller("birthDate", value)}
              placeholder="ДД.ММ.ГГГГ"
            />
            <Field
              label="Место рождения"
              value={formData.seller.birthPlace}
              onChange={(value) => updateSeller("birthPlace", value)}
            />
            <Field
              label="Паспорт серия и номер"
              value={formData.seller.passport}
              onChange={(value) => updateSeller("passport", value)}
            />
            <Field
              label="Кем выдан"
              value={formData.seller.passportIssued}
              onChange={(value) => updateSeller("passportIssued", value)}
            />
            <Field
              label="Дата выдачи"
              value={formData.seller.issueDate}
              onChange={(value) => updateSeller("issueDate", value)}
              placeholder="ДД.ММ.ГГГГ"
            />
            <Field
              label="Код подразделения"
              value={formData.seller.departmentCode}
              onChange={(value) => updateSeller("departmentCode", value)}
            />
            <TextAreaField
              label="Адрес регистрации"
              value={formData.seller.registration}
              onChange={(value) => updateSeller("registration", value)}
            />
            <Field
              label="Телефон (необязательно)"
              value={formData.seller.phone}
              onChange={(value) => updateSeller("phone", value)}
            />
            <Field
              label="Email (необязательно)"
              value={formData.seller.email}
              onChange={(value) => updateSeller("email", value)}
            />
            <Field
              label="Доля по ЕГРН / доля в праве"
              value={formData.seller.egrnShare}
              onChange={(value) => updateSeller("egrnShare", value)}
              placeholder="например, 1/2"
            />
            <Field
              label="Продаваемая доля"
              value={formData.seller.saleShare}
              onChange={(value) => updateSeller("saleShare", value)}
              placeholder="например, 1/2"
            />
          </div>
        </div>
      )}

      {currentStep === 3 && (
        <div className={`${cardClass} space-y-6`}>
          <h2 className="text-xl font-semibold text-gray-900">
            Шаг 4. Условия продажи
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Field
              label="Место составления"
              value={formData.saleTerms.place}
              onChange={(value) => updateSaleTerms("place", value)}
            />
            <Field
              label="Дата уведомления"
              value={formData.saleTerms.date}
              onChange={(value) => updateSaleTerms("date", value)}
              placeholder="ДД.ММ.ГГГГ"
            />
            <Field
              label="Цена продажи"
              value={formData.saleTerms.price}
              onChange={(value) => updateSaleTerms("price", value)}
            />
            <Field
              label="Цена прописью"
              value={formData.saleTerms.priceWords}
              onChange={(value) => updateSaleTerms("priceWords", value)}
            />
          </div>
          <label className="inline-flex items-center gap-3 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={formData.saleTerms.noInstallmentClause}
              onChange={(event) =>
                updateSaleTerms("noInstallmentClause", event.target.checked)
              }
            />
            Добавить условие об отсутствии рассрочки платежа
          </label>
        </div>
      )}

      {currentStep === 4 && (
        <div className={`${cardClass} space-y-6`}>
          <h2 className="text-xl font-semibold text-gray-900">
            Шаг 5. Сособственники и адреса
          </h2>
          {formData.coOwners.length === 0 && (
            <p className="text-gray-600">
              Сособственники пока не добавлены. При загрузке ЕГРН они будут
              заполнены автоматически, кроме выбранного продавца.
            </p>
          )}
          {formData.coOwners.map((owner, index) => (
            <div
              key={`${owner.fullName}-${index}`}
              className="rounded-xl border border-gray-200 p-4 space-y-4"
            >
              <h3 className="font-semibold text-gray-900">
                Сособственник {index + 1}
              </h3>
              <div className="grid md:grid-cols-2 gap-4">
                <Field
                  label="ФИО"
                  value={owner.fullName}
                  onChange={(value) => updateCoOwner(index, "fullName", value)}
                />
                <Field
                  label="Доля"
                  value={owner.share}
                  onChange={(value) => updateCoOwner(index, "share", value)}
                />
                <TextAreaField
                  label="Адрес для уведомления"
                  value={owner.noticeAddress}
                  onChange={(value) =>
                    updateCoOwner(index, "noticeAddress", value)
                  }
                />
                <TextAreaField
                  label="Адрес регистрации"
                  value={owner.registration}
                  onChange={(value) =>
                    updateCoOwner(index, "registration", value)
                  }
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setFormData((prev) => ({
                ...prev,
                coOwners: [
                  ...prev.coOwners,
                  {
                    source: "manual",
                    fullName: "",
                    share: "",
                    registration: "",
                    noticeAddress: "",
                  },
                ],
              }))
            }
            className={`${PILL.base} ${PILL.subtle}`}
          >
            Добавить сособственника вручную
          </button>
        </div>
      )}

      {currentStep === 5 && (
        <div className={`${cardClass} space-y-6`}>
          <h2 className="text-xl font-semibold text-gray-900">
            Шаг 6. Проверка и формирование пакета
          </h2>
          <p className="text-gray-600">
            Каркас проверки готов. Формирование пакета документов будет
            добавлено следующим этапом.
          </p>
          <dl>
            <SummaryRow label="Объект" value={formData.object.address} />
            <SummaryRow
              label="Кадастровый номер"
              value={formData.object.cadastralNumber}
            />
            <SummaryRow label="Продавец" value={formData.seller.fullName} />
            <SummaryRow
              label="Продаваемая доля"
              value={formData.seller.saleShare}
            />
            <SummaryRow label="Цена" value={formData.saleTerms.price} />
            <SummaryRow
              label="Сособственников"
              value={String(formData.coOwners.length)}
            />
          </dl>
        </div>
      )}

      {message && (
        <div className="mt-6 rounded-lg bg-yellow-50 text-yellow-800 p-4">
          {message}
        </div>
      )}

      <div className="mt-8 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
        <button
          type="button"
          onClick={goBack}
          className={`${PILL.base} ${PILL.subtle}`}
        >
          <i className="mr-2">‹</i>
          Назад
        </button>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={clearDraft}
            className={`${PILL.base} ${PILL.danger}`}
          >
            Очистить черновик
          </button>
          <button
            type="button"
            onClick={goNext}
            className={`${PILL.base} ${PILL.primary}`}
          >
            Далее
            <i className="ml-2">›</i>
          </button>
        </div>
      </div>

      <FreeTextImportModal
        open={isPassportModalOpen}
        title="Вставить паспортные данные продавца"
        onClose={() => setIsPassportModalOpen(false)}
        onApply={applyPassportText}
      />
    </div>
  );
};

export default ShareSaleNoticeWizard;

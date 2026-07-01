import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faCheckCircle,
  faEnvelope,
  faFileSignature,
  faHome,
  faRubleSign,
  faUpload,
  faUserTie,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import PersonPassportFields from "../components/common/PersonPassportFields";
import { extractEGRNDataFromPdf } from "../utils/extractEGRNDataFromPdf";
import { extractEGRNFromZip } from "../utils/extractEGRNFromZip";
import { amountRu } from "../utils/formatters";
import { formatDateInput } from "../utils/inputMasks";
import {
  createCoOwnerDeliveryPayload,
  createDeliveryAddresses,
  hydrateShareSaleNoticeForm,
  initialShareSaleNoticeForm,
  SHARE_SALE_NOTICE_STORAGE_KEY,
  updateObjectAddressDeliveryAddresses,
} from "../utils/shareSaleNotice/initialState";
import { normalizeEgrnForShareSaleNotice } from "../utils/shareSaleNotice/normalizeEgrnForShareSaleNotice";

const steps = [
  "Источник данных",
  "Объект, продавец и условия продажи",
  "Сособственники и адреса",
  "Проверка и формирование пакета",
];

const stepIcons = [faUpload, faFileSignature, faUsers, faCheckCircle];

const PILL = {
  base: "inline-flex items-center justify-center h-11 px-5 rounded-full text-sm font-medium transition-colors focus:outline-none focus:ring-2",
  primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-400",
  subtle: "bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-300",
  danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-400",
};
const cardClass = "bg-white rounded-xl shadow-md p-6";
const blockClass = "bg-white rounded-xl shadow-md p-6 space-y-4";
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

const Field = ({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
  readOnly = false,
}) => (
  <label className="block">
    <span className={labelClass}>{label}</span>
    <input
      type={type}
      value={value || ""}
      onChange={(event) => onChange?.(event.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      className={inputClass}
    />
  </label>
);

const TextAreaField = ({ label, value, onChange, placeholder = "" }) => (
  <label className="block">
    <span className={labelClass}>{label}</span>
    <textarea
      value={value || ""}
      onChange={(event) => onChange?.(event.target.value)}
      placeholder={placeholder}
      rows={3}
      className={inputClass}
    />
  </label>
);

const SectionTitle = ({ icon, children, hint = "" }) => (
  <div>
    <h3 className="flex items-center text-lg font-semibold text-gray-900">
      <FontAwesomeIcon icon={icon} className="mr-2 text-blue-600" />
      {children}
    </h3>
    {hint ? <p className="mt-1 text-sm text-gray-600">{hint}</p> : null}
  </div>
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
    registrationType: owner.registrationType || "",
    phone: owner.phone || "",
    email: owner.email || "",
    egrnShare: share,
    saleShare: share,
  };
};

const getSelectedDeliveryCount = (coOwners = []) =>
  coOwners.reduce(
    (total, owner) =>
      total +
      (owner.deliveryAddresses || []).filter(
        (address) => address.selected && String(address.address || "").trim(),
      ).length,
    0,
  );

const ensureCoOwnerDeliveryAddresses = (coOwner = {}, objectAddress = "") => ({
  ...coOwner,
  ...(!Array.isArray(coOwner.deliveryAddresses)
    ? createCoOwnerDeliveryPayload(objectAddress)
    : {
        deliveryAddresses: createDeliveryAddresses(
          objectAddress,
          coOwner.deliveryAddresses,
        ),
        noticeAddress:
          createDeliveryAddresses(objectAddress, coOwner.deliveryAddresses)[0]
            ?.address || objectAddress,
      }),
});

const ShareSaleNoticeWizard = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState(loadDraft);
  const [parsedEgrn, setParsedEgrn] = useState(formData.egrn.parsed || null);
  const [message, setMessage] = useState("");
  const hydratedRef = useRef(false);
  const currentStep = formData.ui.currentStep || 0;

  const owners = useMemo(
    () => parsedEgrn?.owners || formData.egrn.parsed?.owners || [],
    [parsedEgrn, formData.egrn.parsed],
  );
  const postageCount = useMemo(
    () => getSelectedDeliveryCount(formData.coOwners),
    [formData.coOwners],
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
      coOwners:
        key === "address"
          ? prev.coOwners.map((coOwner) => ({
              ...coOwner,
              noticeAddress: value,
              deliveryAddresses: updateObjectAddressDeliveryAddresses(
                coOwner.deliveryAddresses,
                value,
              ),
            }))
          : prev.coOwners,
    }));

  const updateSeller = (key, value) =>
    setFormData((prev) => ({
      ...prev,
      seller: { ...prev.seller, [key]: value },
    }));

  const updateSaleTerms = (key, value) =>
    setFormData((prev) => {
      const saleTerms = { ...prev.saleTerms, [key]: value };
      if (key === "price") {
        saleTerms.priceWords = amountRu(value);
      }
      if (key === "date") {
        saleTerms.date = formatDateInput(value);
      }
      return { ...prev, saleTerms };
    });

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
      coOwners: normalized.coOwners
        .filter((owner) => owner.ownerIndex !== selectedIndex)
        .map((owner) =>
          ensureCoOwnerDeliveryAddresses(owner, normalized.object.address),
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

  const updateCoOwner = (index, key, value) => {
    setFormData((prev) => ({
      ...prev,
      coOwners: prev.coOwners.map((owner, ownerIndex) =>
        ownerIndex === index ? { ...owner, [key]: value } : owner,
      ),
    }));
  };

  const updateCoOwnerDeliveryAddress = (coOwnerIndex, addressIndex, patch) => {
    setFormData((prev) => ({
      ...prev,
      coOwners: prev.coOwners.map((owner, ownerIndex) => {
        if (ownerIndex !== coOwnerIndex) return owner;
        const deliveryAddresses = createDeliveryAddresses(
          prev.object.address,
          owner.deliveryAddresses,
        ).map((address, currentAddressIndex) =>
          currentAddressIndex === addressIndex
            ? {
                ...address,
                ...patch,
                touched: patch.address !== undefined ? true : address.touched,
              }
            : address,
        );
        return {
          ...owner,
          noticeAddress: deliveryAddresses[0]?.address || prev.object.address,
          deliveryAddresses,
        };
      }),
    }));
  };

  const addManualCoOwner = () => {
    setFormData((prev) => ({
      ...prev,
      coOwners: [
        ...prev.coOwners,
        {
          source: "manual",
          fullName: "",
          share: "",
          registration: "",
          ...createCoOwnerDeliveryPayload(prev.object.address),
        },
      ],
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {steps.map((stepName, index) => {
          const isActive = currentStep === index;
          return (
            <button
              key={stepName}
              type="button"
              onClick={() => updateUi({ currentStep: index })}
              className={`rounded-xl border p-4 text-left transition-colors ${
                isActive
                  ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isActive
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  <FontAwesomeIcon icon={stepIcons[index]} />
                </span>
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-wide">
                    Шаг {index + 1}
                  </span>
                  <span className="block text-sm font-medium leading-snug mt-1">
                    {stepName}
                  </span>
                </span>
              </div>
            </button>
          );
        })}
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
            Шаг 2. Объект, продавец и условия продажи
          </h2>

          <section className={blockClass}>
            <SectionTitle
              icon={faHome}
              hint="Проверьте объект, вид права и долю, которая будет продаваться."
            >
              Объект и право
            </SectionTitle>
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
                label="Площадь"
                value={formData.object.area}
                onChange={(value) => updateObject("area", value)}
              />
              <Field
                label="Этаж"
                value={formData.object.floor}
                onChange={(value) => updateObject("floor", value)}
              />
              <Field
                label="Тип права по ЕГРН"
                value={formData.egrn.parsed?.rights?.ownershipType || ""}
                placeholder="Заполнится из ЕГРН"
                readOnly
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
          </section>

          <section className={blockClass}>
            <PersonPassportFields
              title="Продавец"
              titleIcon={faUserTie}
              person={formData.seller}
              onChange={(field, value) => updateSeller(field, value)}
              freeTextTitle="Вставьте текст с паспортными данными продавца"
            />
          </section>

          <section className={blockClass}>
            <SectionTitle
              icon={faRubleSign}
              hint="Укажите место, дату и цену продажи доли."
            >
              Условия продажи
            </SectionTitle>
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
              <TextAreaField
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
              Добавить условие: без отсрочки, снижения цены и рассрочки платежа
            </label>
          </section>
        </div>
      )}

      {currentStep === 2 && (
        <div className={`${cardClass} space-y-6`}>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Шаг 3. Сособственники и адреса
            </h2>
            <p className="text-sm text-gray-600 mt-2">
              Выберите адреса, по которым нужно направить извещение каждому
              сособственнику. Один выбранный адрес = одно почтовое отправление.
              По умолчанию выбран адрес места нахождения имущества.
            </p>
          </div>
          {formData.coOwners.length === 0 && (
            <p className="text-gray-600">
              Сособственники пока не добавлены. При загрузке ЕГРН они будут
              заполнены автоматически, кроме выбранного продавца.
            </p>
          )}
          {formData.coOwners.map((owner, index) => {
            const deliveryAddresses = createDeliveryAddresses(
              formData.object.address,
              owner.deliveryAddresses,
            );
            return (
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
                    onChange={(value) =>
                      updateCoOwner(index, "fullName", value)
                    }
                  />
                  <Field
                    label="Доля"
                    value={owner.share}
                    onChange={(value) => updateCoOwner(index, "share", value)}
                  />
                </div>

                <div>
                  <h4 className="flex items-center text-sm font-semibold text-gray-800 mb-3">
                    <FontAwesomeIcon
                      icon={faEnvelope}
                      className="mr-2 text-blue-600"
                    />
                    Адреса направления извещения
                  </h4>
                  <div className="grid md:grid-cols-2 gap-4">
                    {deliveryAddresses.map((address, addressIndex) => (
                      <div
                        key={address.type}
                        className="rounded-lg bg-gray-50 border border-gray-200 p-4 space-y-3"
                      >
                        <label className="inline-flex items-center gap-3 text-sm font-medium text-gray-700">
                          <input
                            type="checkbox"
                            checked={address.selected}
                            onChange={(event) =>
                              updateCoOwnerDeliveryAddress(
                                index,
                                addressIndex,
                                {
                                  selected: event.target.checked,
                                },
                              )
                            }
                          />
                          {address.label}
                        </label>
                        <TextAreaField
                          label={
                            address.type === "object_address"
                              ? "Адрес места нахождения имущества"
                              : "Адрес регистрации / места жительства / места пребывания"
                          }
                          value={address.address}
                          onChange={(value) =>
                            updateCoOwnerDeliveryAddress(index, addressIndex, {
                              address: value,
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={addManualCoOwner}
            className={`${PILL.base} ${PILL.subtle}`}
          >
            Добавить сособственника вручную
          </button>
        </div>
      )}

      {currentStep === 3 && (
        <div className={`${cardClass} space-y-6`}>
          <h2 className="text-xl font-semibold text-gray-900">
            Шаг 4. Проверка и формирование пакета
          </h2>
          <p className="text-gray-600">
            Формирование пакета документов будет добавлено следующим этапом.
          </p>
          <dl>
            <SummaryRow label="Объект" value={formData.object.address} />
            <SummaryRow
              label="Кадастровый номер"
              value={formData.object.cadastralNumber}
            />
            <SummaryRow label="Продавец" value={formData.seller.fullName} />
            <SummaryRow
              label="Доля по ЕГРН / доля в праве"
              value={formData.seller.egrnShare}
            />
            <SummaryRow
              label="Продаваемая доля"
              value={formData.seller.saleShare}
            />
            <SummaryRow label="Цена" value={formData.saleTerms.price} />
            <SummaryRow
              label="Цена прописью"
              value={formData.saleTerms.priceWords}
            />
            <SummaryRow
              label="Сособственников"
              value={String(formData.coOwners.length)}
            />
            <SummaryRow
              label="Почтовых отправлений"
              value={String(postageCount)}
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
    </div>
  );
};

export default ShareSaleNoticeWizard;

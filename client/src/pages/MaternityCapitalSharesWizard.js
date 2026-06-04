import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faFileContract,
  faHome,
} from "@fortawesome/free-solid-svg-icons";
import MaternityObjectRightsSection from "../components/maternityCapitalShares/MaternityObjectRightsSection";
import ParticipantsSection from "../components/maternityCapitalShares/ParticipantsSection";
import MaternityCapitalAndSharesSection from "../components/maternityCapitalShares/MaternityCapitalAndSharesSection";
import {
  hydrateMaternityCapitalSharesForm,
  initialMaternityCapitalSharesForm,
  MATERNITY_CAPITAL_SHARES_STORAGE_KEY,
} from "../utils/maternityCapitalShares/initialState";
import { validateParticipantsStep } from "../utils/maternityCapitalShares/participantsStep";
import { validateMaternityCapitalAndSharesStep } from "../utils/maternityCapitalShares/maternityCapitalAndSharesStep";

const PILL = {
  base: "inline-flex items-center justify-center h-11 px-5 rounded-full text-sm font-medium transition-colors focus:outline-none focus:ring-2",
  primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-400",
  subtle: "bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-300",
  danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-400",
};

const steps = [
  "Объект, право собственности и ЕГРН",
  "Участники",
  "Материнский капитал и расчёт долей",
];

const loadDraft = () => {
  try {
    const raw = localStorage.getItem(MATERNITY_CAPITAL_SHARES_STORAGE_KEY);
    return raw
      ? hydrateMaternityCapitalSharesForm(JSON.parse(raw))
      : initialMaternityCapitalSharesForm;
  } catch {
    return initialMaternityCapitalSharesForm;
  }
};

const isObjectStepReady = (formData) => {
  if (!formData.ui.sourceMode) return false;
  if (
    formData.ui.sourceMode === "egrn" &&
    formData.ui.parseStatus === "error" &&
    !formData.egrn.applied
  ) {
    return false;
  }

  const hasMinimumObject = !!(
    formData.object.address.trim() &&
    formData.object.cadastralNumber.trim() &&
    String(formData.object.area || "").trim()
  );
  const unsupportedHouse = [
    "house_with_land",
    "house_with_land_share",
  ].includes(formData.acquisition.type);

  return hasMinimumObject && !unsupportedHouse;
};

const MaternityCapitalSharesWizard = () => {
  const navigate = useNavigate();
  const [isAuthed, setIsAuthed] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [formData, setFormData] = useState(loadDraft);
  const [parsedEgrn, setParsedEgrn] = useState(formData.egrn.parsed || null);
  const [validationMessage, setValidationMessage] = useState("");
  const hydratedRef = useRef(false);

  const currentStep = formData.ui.currentStep || 0;
  const participantsValidation = useMemo(
    () => validateParticipantsStep(formData.participantsStep),
    [formData.participantsStep],
  );
  const maternitySharesValidation = useMemo(
    () => validateMaternityCapitalAndSharesStep(formData),
    [formData],
  );
  const canContinue = useMemo(() => {
    if (currentStep === 0) return isObjectStepReady(formData);
    if (currentStep === 1) return participantsValidation.isValid;
    if (currentStep === 2) return maternitySharesValidation.isValid;
    return true;
  }, [
    currentStep,
    formData,
    participantsValidation.isValid,
    maternitySharesValidation.isValid,
  ]);

  useEffect(() => {
    let mounted = true;
    fetch("/api/me", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!mounted) return;
        setIsAuthed(!!(data && data.user && data.user.id));
      })
      .catch(() => {
        if (mounted) setIsAuthed(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (isAuthed === null) return;
    if (isAuthed === false && !localStorage.getItem("consent_id")) {
      setAccessDenied(true);
      window.alert(
        "Чтобы продолжить, подтвердите согласие на обработку персональных данных.",
      );
      navigate("/other-documents");
    }
  }, [isAuthed, navigate]);

  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return undefined;
    }

    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(
          MATERNITY_CAPITAL_SHARES_STORAGE_KEY,
          JSON.stringify(formData),
        );
      } catch {
        // localStorage может быть недоступен в приватном режиме.
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [formData]);

  const applyEgrnData = () => {
    if (!parsedEgrn) return;
    setFormData((prev) => ({
      ...prev,
      ui: { ...prev.ui, parseStatus: "applied" },
      object: {
        ...prev.object,
        ...parsedEgrn.object,
        purchasePrice: prev.object.purchasePrice,
        purchasedShare: prev.object.purchasedShare,
        legalShare: prev.object.legalShare,
        roomNumber: prev.object.roomNumber,
        roomArea: prev.object.roomArea,
        livingArea: prev.object.livingArea,
      },
      acquisition: {
        ...prev.acquisition,
        suggestedType: parsedEgrn.suggestion.suggestedType,
        confidence: parsedEgrn.suggestion.confidence,
        reason: parsedEgrn.suggestion.reason,
        alternatives: parsedEgrn.suggestion.alternatives,
        type:
          parsedEgrn.suggestion.confidence === "high"
            ? parsedEgrn.suggestion.suggestedType
            : prev.acquisition.type,
        confirmedByUser: false,
      },
      rights: parsedEgrn.rights,
      encumbrance: parsedEgrn.encumbrance,
      recipientOwnerMatch: parsedEgrn.recipientOwnerMatch,
      distributionBase: parsedEgrn.distributionBaseDraft,
      egrn: { ...prev.egrn, parsed: parsedEgrn, applied: true },
    }));
  };

  const rejectEgrnData = () => {
    setParsedEgrn(null);
    setFormData((prev) => ({
      ...prev,
      ui: {
        ...prev.ui,
        sourceMode: "manual",
        parseStatus: "idle",
        parseWarnings: [],
      },
      egrn: { ...initialMaternityCapitalSharesForm.egrn },
    }));
  };

  const clearDraft = () => {
    try {
      localStorage.removeItem(MATERNITY_CAPITAL_SHARES_STORAGE_KEY);
    } catch {
      // localStorage может быть недоступен в приватном режиме.
    }
    setParsedEgrn(null);
    setFormData(initialMaternityCapitalSharesForm);
    setValidationMessage("Черновик очищен.");
  };

  const goNext = () => {
    if (!canContinue) {
      if (currentStep === 0) {
        setValidationMessage(
          "Заполните источник данных, адрес, кадастровый номер и площадь. Дом с участком пока недоступен в этом мастере.",
        );
        return;
      }
      if (currentStep === 1) {
        setValidationMessage(
          "Исправьте блокирующие ошибки пакета 3 перед переходом к материнскому капиталу.",
        );
        return;
      }
      setValidationMessage(maternitySharesValidation.errors.join(" "));
      return;
    }

    if (currentStep === 0) {
      setFormData((prev) => ({
        ...prev,
        participantsStep: {
          ...prev.participantsStep,
          agreementDate:
            prev.participantsStep.agreementDate ||
            prev.agreement.date ||
            new Date().toISOString().slice(0, 10),
        },
        ui: { ...prev.ui, currentStep: 1 },
      }));
      setValidationMessage("");
      return;
    }

    if (currentStep === 1) {
      setFormData((prev) => ({
        ...prev,
        ui: { ...prev.ui, currentStep: 2 },
      }));
      setValidationMessage("");
      return;
    }

    if (currentStep === 2) {
      setValidationMessage(
        maternitySharesValidation.isValid
          ? "Пакет 4 заполнен. Генерация итогового документа будет подключена следующим этапом."
          : maternitySharesValidation.errors.join(" "),
      );
    }
  };

  const goBack = () => {
    if (currentStep === 0) {
      navigate("/other-documents");
      return;
    }
    setFormData((prev) => ({
      ...prev,
      ui: { ...prev.ui, currentStep: currentStep - 1 },
    }));
  };

  if (isAuthed === null) {
    return <div className="py-10 text-center text-gray-500">Загрузка…</div>;
  }

  if (accessDenied) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-yellow-50 text-yellow-800 rounded-xl p-6">
          Для продолжения нужно подтвердить согласие на обработку персональных
          данных.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
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
            Соглашение о выделении долей по материнскому капиталу
          </h1>
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
            onClick={() => {
              if (
                index === 0 ||
                (index === 1 && isObjectStepReady(formData)) ||
                (index === 2 &&
                  isObjectStepReady(formData) &&
                  participantsValidation.isValid)
              ) {
                setFormData((prev) => ({
                  ...prev,
                  ui: { ...prev.ui, currentStep: index },
                }));
              }
            }}
            className={`pb-2 px-4 whitespace-nowrap relative ${
              currentStep === index
                ? "text-blue-600 font-medium border-b-2 border-blue-600"
                : "text-gray-600"
            } ${(index === 1 && !isObjectStepReady(formData)) || (index === 2 && (!isObjectStepReady(formData) || !participantsValidation.isValid)) ? "cursor-not-allowed opacity-60" : ""}`}
            disabled={
              (index === 1 && !isObjectStepReady(formData)) ||
              (index === 2 &&
                (!isObjectStepReady(formData) ||
                  !participantsValidation.isValid))
            }
          >
            <FontAwesomeIcon icon={faFileContract} className="mr-2" />
            {stepName}
          </button>
        ))}
      </div>

      {currentStep === 0 && (
        <MaternityObjectRightsSection
          formData={formData}
          setFormData={setFormData}
          parsedEgrn={parsedEgrn}
          setParsedEgrn={setParsedEgrn}
          onApplyEgrn={applyEgrnData}
          onRejectEgrn={rejectEgrnData}
        />
      )}

      {currentStep === 1 && (
        <ParticipantsSection formData={formData} setFormData={setFormData} />
      )}

      {currentStep === 2 && (
        <MaternityCapitalAndSharesSection
          formData={formData}
          setFormData={setFormData}
        />
      )}

      {validationMessage && (
        <div className="mt-6 rounded-lg bg-yellow-50 text-yellow-800 p-4">
          {validationMessage}
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

export default MaternityCapitalSharesWizard;
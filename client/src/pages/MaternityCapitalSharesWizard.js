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
import {
  buildEgrnParticipantCandidates,
  getFullName,
} from "../utils/maternityCapitalShares/participantsStep";
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

const sameNormalized = (left = "", right = "") =>
  String(left || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase() ===
  String(right || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  const passportKey = (participant = {}) => {
    const document = participant.document || {};
    const key = `${document.series || ""}${document.number || ""}`.replace(
      /\D/g,
      "",
  );
    return key.length >= 6 ? key : "";
  };

const mergeEgrnParticipants = (existing = [], candidates = []) => {
  const result = [...existing];
  candidates.forEach((candidate) => {
    const candidateName = getFullName(candidate);
    const candidatePassport = passportKey(candidate);
    const duplicate = result.some((participant) => {
      const sameOwnerIndex =
        participant.source?.egrnOwnerIndex !== null &&
        participant.source?.egrnOwnerIndex !== undefined &&
        participant.source?.egrnOwnerIndex === candidate.source?.egrnOwnerIndex;
      const sameNameAndBirthDate =
        candidateName &&
        sameNormalized(getFullName(participant), candidateName) &&
        participant.birthDate &&
        candidate.birthDate &&
        participant.birthDate === candidate.birthDate;
      const sameNameAndPassport =
        candidateName &&
        candidatePassport &&
        sameNormalized(getFullName(participant), candidateName) &&
        passportKey(participant) === candidatePassport;
      return sameOwnerIndex || sameNameAndBirthDate || sameNameAndPassport;
    });
    if (!duplicate) result.push(candidate);
  });
  return result;
};

const MaternityCapitalSharesWizard = () => {
  const navigate = useNavigate();
  const [isAuthed, setIsAuthed] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [formData, setFormData] = useState(loadDraft);
  const [parsedEgrn, setParsedEgrn] = useState(formData.egrn.parsed || null);
  const [validationMessage, setValidationMessage] = useState("");
  const [generationErrors, setGenerationErrors] = useState([]);
  const [generating, setGenerating] = useState(false);
  const hydratedRef = useRef(false);

  const currentStep = formData.ui.currentStep || 0;
  const maternitySharesValidation = useMemo(
    () => validateMaternityCapitalAndSharesStep(formData),
    [formData],  
  );
  
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
    setFormData((prev) => {
      const agreementDate =
        prev.agreement.date || new Date().toLocaleDateString("ru-RU");
      const candidates = buildEgrnParticipantCandidates(
        parsedEgrn.rights?.ownerBlocks || [],
        agreementDate,
      );
      const participants = mergeEgrnParticipants(
        prev.participantsStep?.participants || prev.participants || [],
        candidates,
      );
      return {
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
        participantsStep: {
          ...prev.participantsStep,
          agreementDate,
          participants,
        },
        participants,
        egrn: { ...prev.egrn, parsed: parsedEgrn, applied: true },
      };
    });
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


  const getGenerationErrors = () => {
    const errors = [...(maternitySharesValidation.errors || [])];
    if (!String(formData.maternityCapital?.certificateSeries || '').trim()) {
      errors.push('Не указана серия сертификата на материнский капитал.');
    }
    if (!String(formData.maternityCapital?.certificateNumber || '').trim()) {
      errors.push('Не указан номер сертификата на материнский капитал.');
    }
    return Array.from(new Set(errors));
  };

  const handleGenerateAgreement = async () => {
    const errors = getGenerationErrors();
    setGenerationErrors(errors);
    if (errors.length) {
      setValidationMessage('Документ не создан: исправьте критичные ошибки в блоке “Проверка готовности соглашения”.');
      return;
    }

    if ((maternitySharesValidation.warnings || []).length) {
      const confirmed = window.confirm(
        'В соглашении есть предупреждения. Проверьте их перед формированием документа.\n\nЯ проверил предупреждения и хочу сформировать соглашение.',
      );
      if (!confirmed) return;
    }

    setGenerating(true);
    try {
      const preparedFormData = {
        ...formData,
        documentType: 'maternity_capital_shares',
      };
      const serialized = JSON.stringify(preparedFormData);
      try {
        sessionStorage.setItem('maternityCapitalSharesFormData', serialized);
        localStorage.setItem('maternityCapitalSharesFormData', serialized);
        localStorage.setItem(MATERNITY_CAPITAL_SHARES_STORAGE_KEY, serialized);
      } catch {
        // Хранилище может быть недоступно, но серверная форма всё равно будет сохранена ниже.
      }

      const title = preparedFormData.object?.address
        ? `Соглашение о выделении долей: ${preparedFormData.object.address}`
        : 'Соглашение о выделении долей по материнскому капиталу';

      const createRes = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: 'maternity_capital_shares',
          title,
          status: 'draft',
          html: '',
        }),
      });
      const created = await createRes.json().catch(() => ({}));
      if (!createRes.ok || !created?.id) {
        throw new Error(created?.error || 'Не удалось создать документ');
      }

      await fetch(`/api/documents/${encodeURIComponent(created.id)}/form`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ json: preparedFormData, consentId: localStorage.getItem('consent_id') || null }),
      });

      navigate(`/document-editor?docId=${encodeURIComponent(created.id)}&docType=maternity_capital_shares`);
    } catch (error) {
      console.error('Maternity capital shares generation failed:', error);
      setValidationMessage(error?.message || 'Не удалось сформировать соглашение.');
    } finally {
      setGenerating(false);
    }
  };

  const goNext = () => {
    if (currentStep < steps.length - 1) {
      setFormData((prev) => ({
        ...prev,
        ui: { ...prev.ui, currentStep: currentStep + 1 },
      }));
      setValidationMessage("");
      return;
    }

    setValidationMessage(
      maternitySharesValidation.isValid
        ? "Пакет 4 заполнен. Нажмите “Сформировать соглашение”."
        : "Проверьте блок “Проверка готовности соглашения” на финальной вкладке.",
    );
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
              setFormData((prev) => ({
                ...prev,
                ui: { ...prev.ui, currentStep: index },
              }));
            }}
            className={`pb-2 px-4 whitespace-nowrap relative ${
              currentStep === index
                ? "text-blue-600 font-medium border-b-2 border-blue-600"
                : "text-gray-600"
            }`}
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

      {generationErrors.length > 0 && (
        <div className="mt-6 rounded-lg bg-red-50 text-red-800 p-4">
          <div className="font-semibold mb-2">Критичные ошибки не позволяют сформировать соглашение:</div>
          <ul className="list-disc list-inside space-y-1">
            {generationErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            {steps.map((stepName, index) => (
              <button
                key={stepName}
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, ui: { ...prev.ui, currentStep: index } }))}
                className="text-sm underline text-red-900"
              >
                Перейти: {stepName}
              </button>
            ))}
          </div>
        </div>
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
          {currentStep === steps.length - 1 && (
            <button
              type="button"
              onClick={handleGenerateAgreement}
              disabled={generating}
              className={`${PILL.base} ${PILL.primary} disabled:opacity-60`}
            >
              {generating ? 'Формируем…' : 'Сформировать соглашение'}
            </button>
          )}
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
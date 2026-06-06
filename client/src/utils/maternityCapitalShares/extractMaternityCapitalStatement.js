import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.entry";
import { formatMoneyInput } from "./shareCalculations";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const RU_MONTHS = {
  января: "01",
  февраля: "02",
  марта: "03",
  апреля: "04",
  мая: "05",
  июня: "06",
  июля: "07",
  августа: "08",
  сентября: "09",
  октября: "10",
  ноября: "11",
  декабря: "12",
};

const normalizeText = (value = "") =>
  String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

const normalizeInlineText = (value = "") =>
  normalizeText(value).replace(/\s+/g, " ").trim();

const normalizeDate = (value = "") => {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  let match = text.match(/"?(\d{1,2})"?\s+([а-яё]+)\s+(\d{4})/i);
  if (match && RU_MONTHS[match[2]]) {
    return `${match[1].padStart(2, "0")}.${RU_MONTHS[match[2]]}.${match[3]}`;
  }
  match = text.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (match)
    return `${match[1].padStart(2, "0")}.${match[2].padStart(2, "0")}.${match[3]}`;
  return "";
};

export const normalizeSnils = (value = "") => {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 11);
  if (digits.length !== 11) return "";
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)} ${digits.slice(9)}`;
};

const normalizeMoneyFromMatch = (rubles = "", kopecks = "") => {
  const amount = Number(
    `${String(rubles).replace(/\D/g, "") || "0"}.${String(kopecks).replace(/\D/g, "").padStart(2, "0").slice(0, 2)}`,
  );
  return formatMoneyInput(amount);
};

const extractAmounts = (text = "") => {
  const amountRegex =
    /((?:\d{1,3}(?:[ \u00a0]\d{3})+)|\d+)\s*руб\.?\s*(\d{1,2})\s*коп\.?/gi;
  const amounts = [];
  let match = amountRegex.exec(text);
  while (match) {
    amounts.push({
      index: match.index,
      value: normalizeMoneyFromMatch(match[1], match[2]),
    });
    match = amountRegex.exec(text);
  }

  const pickNear = (labels) => {
    const lower = text.toLowerCase();
    const labelIndex = labels
      .map((label) => lower.indexOf(label))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)[0];
    if (labelIndex === undefined) return "";
    return amounts.find((amount) => amount.index >= labelIndex)?.value || "";
  };

  return {
    assignedAmount: pickNear(["размер материнского", "назначенн"]),
    remainingAmount: pickNear(["оставш"]),
    reservedAmount: pickNear(["зарезерв"]),
    paidAmount: pickNear(["выплачен"]),
    fallbackAmounts: amounts.map((item) => item.value),
  };
};


const OPERATION_TYPE_LABELS = [
  ["certificate_issue", /выдач[аеи]\s+сертификата|сертификат\s+мск/i],
  ["established_amount", /установлени[ея]\s+размера|установлен\s+размер/i],
  ["reserved", /резервировани[ея]\s+средств|зарезерв/i],
  ["paid", /перечислени[ея]\s+средств|направлени[ея]\s+средств|использовани[ея]\s+средств/i],
];

const classifyOperation = (operationName = "") =>
  OPERATION_TYPE_LABELS.find(([, pattern]) => pattern.test(operationName))?.[0] ||
  "other";

const MONEY_PATTERN =
  "((?:(?:\\d{1,3}(?:[ \\u00a0]\\d{3})+)|\\d+)\\s*руб\\.?\\s*\\d{1,2}\\s*коп\\.?|(?:(?:\\d{1,3}(?:[ \\u00a0]\\d{3})+)|\\d+)[,.]\\d{2})";

const normalizeMoney = (value = "") => {
  const text = String(value || "").trim();
  const rubKop = text.match(
    /((?:\d{1,3}(?:[ \u00a0]\d{3})+)|\d+)\s*руб\.?\s*(\d{1,2})\s*коп\.?/i,
  );
  if (rubKop) return normalizeMoneyFromMatch(rubKop[1], rubKop[2]);
  const decimal = text.match(/((?:\d{1,3}(?:[ \u00a0]\d{3})+)|\d+)[,.](\d{2})/);
  if (decimal) return normalizeMoneyFromMatch(decimal[1], decimal[2]);
  return "";
};

const extractOperations = (text = "") => {
  const inline = normalizeInlineText(text);
  const rowRegex = new RegExp(
    `(?:^|\\s)(\\d{1,2})\\s+(\\d{1,2}[./-]\\d{1,2}[./-]\\d{4})\\s+(.{3,180}?)\\s+${MONEY_PATTERN}`,
    "gi",
  );
  const operations = [];
  let match = rowRegex.exec(inline);
  while (match) {
    const operationName = normalizeInlineText(match[3])
      .replace(/^(?:операция|наименование операции)\s*/i, "")
      .trim();
    if (!/итого/i.test(operationName)) {
      operations.push({
        index: Number(match[1]),
        date: normalizeDate(match[2]),
        operationName,
        amount: normalizeMoney(match[4]),
        operationType: classifyOperation(operationName),
      });
    }
    match = rowRegex.exec(inline);
  }
  return operations;
};

const lastOperationOfType = (operations = [], type) =>
  (operations.filter((operation) => operation.operationType === type).slice(-1)[0] ||
    null);

const findTotalAmount = (text = "") => {
  const match = normalizeInlineText(text).match(
    new RegExp(`(?:итого|остаток(?:\\s+средств)?)[^0-9]{0,80}${MONEY_PATTERN}`, "i"),
  );
  return match ? normalizeMoney(match[1]) : "";
};

const extractHolderName = (text = "") => {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const labelIndex = lines.findIndex(
    (line) =>
      /фамилия,?\s+имя,?\s+отчество/i.test(line) && /материнск/i.test(line),
  );
  const isName = (line) =>
    /^[А-ЯЁ][А-ЯЁ\-]+\s+[А-ЯЁ][А-ЯЁ\-]+(?:\s+[А-ЯЁ][А-ЯЁ\-]+)?$/.test(line) &&
    !/СНИЛС|СЕРТИФИКАТ|ФАМИЛИЯ/i.test(line);
  if (labelIndex >= 0) {
    const next = lines.slice(labelIndex + 1, labelIndex + 6).find(isName);
    if (next) return next;
  }
  return lines.find(isName) || "";
};

const extractCertificate = (text = "") => {
  const signatureBlockIndex = text.search(
    /Сертификат\s*:\s*\d{20,}|Издатель\s*:\s*Федеральное казначейство/i,
  );
  const businessText =
    signatureBlockIndex >= 0 ? text.slice(0, signatureBlockIndex) : text;
  const match = businessText.match(
    /((?:МК|МСК)\s*[-–—]?[А-ЯЁA-Z0-9]+(?:\s*[-–—]\s*[А-ЯЁA-Z0-9]+)+)\s+([0-9]{4,})/i,
  );
  if (!match)
    return {
      certificateSeries: "",
      certificateNumber: "",
      certificateFullNumber: "",
    };
  const series = match[1]
    .replace(/\s*[-–—]\s*/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase();
  const number = match[2];
  return {
    certificateSeries: series,
    certificateNumber: number,
    certificateFullNumber: `${series} ${number}`,
  };
};

export function parseMaternityCapitalStatementText(rawText) {
  const text = normalizeText(rawText);
  const inline = normalizeInlineText(text);
  const amounts = extractAmounts(inline);
  const fallback = amounts.fallbackAmounts;
  const operations = extractOperations(text);
  const certificateIssue = lastOperationOfType(operations, "certificate_issue");
  const latestEstablished = lastOperationOfType(operations, "established_amount");
  const reserved = lastOperationOfType(operations, "reserved");
  const paid = lastOperationOfType(operations, "paid");
  const snilsMatch = inline.match(/\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\s*\d{2}\b/);
  const certificate = extractCertificate(inline);
  const parseWarnings = [];

  if (!paid) {
    parseWarnings.push(
      "Не найдена операция перечисления средств. Укажите сумму материнского капитала, использованную на объект, вручную.",
    );
  }
  if (paid && reserved && paid.amount === reserved.amount) {
    parseWarnings.push(
      "В выписке найдены операции резервирования и перечисления средств. Для расчета использована операция перечисления средств.",
    );
  }

  return {
    statementDate: normalizeDate(
      inline.match(
        /по\s+состоянию\s+на\s+("?\d{1,2}"?\s+[а-яё]+\s+\d{4}|\d{1,2}[./-]\d{1,2}[./-]\d{4})/i,
      )?.[1] || "",
    ),
    certificateHolderFullName: extractHolderName(text),
    certificateHolderSnils: normalizeSnils(snilsMatch?.[0] || ""),
    ...certificate,
    assignedAmount: amounts.assignedAmount || certificateIssue?.amount || fallback[0] || "",
    remainingAmount: findTotalAmount(text) || amounts.remainingAmount || "",
    reservedAmount: reserved?.amount || amounts.reservedAmount || "",
    reservedDate: reserved?.date || "",
    paidAmount: paid?.amount || "",
    amountUsed: paid?.amount || "",
    useDate: paid?.date || "",
    latestEstablishedAmount: latestEstablished?.amount || "",
    operations,
    rawText: rawText || "",
    parseWarnings,
  };
}

export async function extractMaternityCapitalStatementFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    fullText += `${content.items.map((item) => item.str).join(" ")}\n`;
  }

  return parseMaternityCapitalStatementText(fullText);
}

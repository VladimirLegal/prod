const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const {
  buildShareSaleNoticeRenderData,
  fullName,
} = require("./shareSaleNotice");

const F107_TEMPLATE_PATH = path.join(
  __dirname,
  "../../templates/docx/f107-inventory-template.docx",
);

function createF107Error(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  error.cause = cause;
  return error;
}

function loadF107TemplateBuffer() {
  if (!fs.existsSync(F107_TEMPLATE_PATH)) {
    throw createF107Error(
      "f107_template_missing",
      "Не найден DOCX-шаблон описи вложения ф.107.",
    );
  }

  return fs.readFileSync(F107_TEMPLATE_PATH);
}

function renderF107DocxFromTemplate({ statementText, senderFullName }) {
  try {
    const zip = new PizZip(loadF107TemplateBuffer());
    const doc = new Docxtemplater(zip, {
      delimiters: { start: "{{", end: "}}" },
      paragraphLoop: true,
      linebreaks: true,
    });

    doc.render({
      STATEMENT_TEXT: String(statementText || ""),
      SENDER_FULL_NAME: String(senderFullName || ""),
    });

    return doc.getZip().generate({ type: "nodebuffer" });
  } catch (error) {
    if (error.code === "f107_template_missing") throw error;
    throw createF107Error(
      "f107_template_render_failed",
      "Не удалось заполнить DOCX-шаблон описи вложения ф.107.",
      error,
    );
  }
}

const transliteration = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function toSafeFilenamePart(value) {
  return String(value || "")
    .toLowerCase()
    .split("")
    .map((character) => transliteration[character] ?? character)
    .join("")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

function buildSafeF107Filename(index, shipment = {}) {
  const recipientName = fullName(shipment.coOwner || {});
  const safeRecipientName = toSafeFilenamePart(recipientName);
  const suffix = safeRecipientName ? `-${safeRecipientName}` : "";
  return `opis-f107-${index}${suffix}.docx`;
}

function buildF107TemplateDocxFiles(formData = {}) {
  const renderData = buildShareSaleNoticeRenderData(formData);
  const senderFullName = fullName(renderData.seller || {});

  return renderData.statements.map((statement, index) => ({
    filename: buildSafeF107Filename(
      statement.shipmentIndex || index + 1,
      statement.shipment,
    ),
    buffer: renderF107DocxFromTemplate({
      statementText: statement.plainText,
      senderFullName,
    }),
  }));
}

module.exports = {
  loadF107TemplateBuffer,
  renderF107DocxFromTemplate,
  buildSafeF107Filename,
  buildF107TemplateDocxFiles,
};

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.entry';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export const extractBankDetailsFromPDF = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let text = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items.map(item => item.str).join(' ');
    text += strings + '\n';
  }

  const data = {};

  const match = (label, regex) => {
    const res = text.match(regex);
    return res ? res[1].trim() : '';
  };

  data.bankRecipient = match('Получатель', /Получатель[:\s]*([^\n]+)/i);
  data.bankAccount = match('Счет', /счет[^\d]*(\d{20})/i);
  data.bankName = match('Банк', /(АО|ПАО|ООО|Банк)\s+«?[А-Яа-яA-Za-z0-9\s.\-«»]+»?/);
  data.bankBik = match('БИК', /БИК[:\s]*([\d]{9})/i);
  data.bankCorrAccount = match('К\/с', /К\/с[:\s]*([\d ]{20,})/i).replace(/\s+/g, '');

  const inn = match('ИНН', /ИНН[:\s]*(\d{10,12})/i);
  const kpp = match('КПП', /КПП[:\s]*(\d{9})/i);
  data.bankInnKpp = inn && kpp ? `${inn}/${kpp}` : '';

  return data;
};

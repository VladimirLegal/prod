const pdfMake = require('pdfmake/build/pdfmake');
const pdfFonts = require('pdfmake/build/vfs_fonts');

// Инициализация шрифтов
pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts;

const generateSimplePDF = (data = {}) => {  // Добавлено значение по умолчанию
  return new Promise((resolve, reject) => {
    try {
      // Защита от отсутствующих данных
      const docType = data.type || "Без названия";
      const property = data.propertyType || "Не указан";
      const owner = data.ownerName || "Не указан";
      
      const docDefinition = {
        content: [
          { text: `Договор ${docType}`, style: 'header' },
          '\n',
          {
            table: {
              widths: ['*'],
              body: [
                [`Тип недвижимости: ${property}`],
                [`Собственник: ${owner}`],
                [`Дата генерации: ${new Date().toLocaleDateString('ru-RU')}`]
              ]
            }
          },
          '\n',
          { 
            text: 'Данный документ сгенерирован автоматически и требует проверки юристом.', 
            style: 'footer'
          }
        ],
        styles: {
          header: {
            fontSize: 20,
            bold: true,
            alignment: 'center'
          },
          footer: {
            fontSize: 10,
            italics: true,
            alignment: 'center'
          }
        },
        defaultStyle: {
          font: 'Roboto'
        }
      };

      const pdfDoc = pdfMake.createPdf(docDefinition);
      
       // Используем getBase64 вместо getBuffer
      pdfDoc.getBase64((data) => {
        resolve(Buffer.from(data, 'base64'));
      });
    } catch (error) {
      console.error('Ошибка в generateSimplePDF:', error);
      reject(error);
    }
  });
};

module.exports = { generateSimplePDF };
// --- BEGIN: HTML -> PDF via Puppeteer ---
// --- BEGIN: HTML -> PDF via Puppeteer (устойчивый запуск на Windows) ---
const puppeteer = require('puppeteer');

async function exportHtmlToPdfBuffer(html) {
  // Тихие флаги для Windows/антивирусов
  const launchOptions = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  };

  // Если есть системный Chrome, Puppeteer может не скачать свой Chromium.
  // Дадим возможность указать путь через переменную окружения.
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    // Гарантируем кодировку и базовые стили печати
    await page.setContent(
      String(html || ''),
      { waitUntil: ['domcontentloaded', 'load', 'networkidle0'] }
    );
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '2cm', right: '1.5cm', bottom: '2cm', left: '3cm' },
    });
    return buffer;
  } finally {
    await browser.close();
  }
}

module.exports.exportHtmlToPdfBuffer = exportHtmlToPdfBuffer;
// --- END: HTML -> PDF via Puppeteer ---

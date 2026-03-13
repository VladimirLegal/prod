const nodemailer = require('nodemailer');

function makeTransport() {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASSWORD,
  } = process.env;

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 465,
    secure: String(SMTP_SECURE) === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
}

async function sendCounterpartyReadyEmail({ to, linkHtml, linkPdf }) {
  const transporter = makeTransport();
  const from = process.env.SMTP_FROM || `"Legal Portal" <${process.env.SMTP_USER}>`;

  await transporter.sendMail({
    from,
    to,
    subject: 'Отчёт проверки контрагента готов',
    text:
`Отчёт готов.

HTML: ${linkHtml}
PDF: ${linkPdf}

Если вы не запускали проверку — проигнорируйте письмо.`,
    html: `
      <p>Отчёт проверки контрагента готов.</p>
      <p><a href="${linkHtml}">Открыть HTML</a></p>
      <p><a href="${linkPdf}">Скачать PDF</a></p>
      <hr />
      <p style="color:#666">Если вы не запускали проверку — проигнорируйте письмо.</p>
    `,
  });
}

module.exports = { sendCounterpartyReadyEmail };
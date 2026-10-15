const nodemailer = require("nodemailer");

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(
  process.env.SMTP_PORT || 587
);

const SMTP_SECURE =
  String(process.env.SMTP_SECURE)
    .toLowerCase() === "true";

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const MAIL_FROM =
  process.env.MAIL_FROM ||
  SMTP_USER;

if (
  !SMTP_HOST ||
  !SMTP_USER ||
  !SMTP_PASS
) {
  console.warn(
    "⚠️ Configuração SMTP incompleta."
  );
}

const transporter =
  nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,

    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

async function sendPasswordResetEmail({
  to,
  name,
  resetUrl,
}) {
  const safeName =
    name || "usuário";

  await transporter.sendMail({
    from: MAIL_FROM,

    to,

    subject:
      "Recuperação de senha - Arcadia ERP",

    text: `
Olá, ${safeName}.

Recebemos uma solicitação para redefinir a senha da sua conta no Arcadia ERP.

Acesse o link abaixo:

${resetUrl}

Este link é válido por 30 minutos.

Se você não solicitou a alteração da senha, ignore este e-mail.
    `.trim(),

    html: `
      <div
        style="
          font-family: Arial, sans-serif;
          max-width: 600px;
          margin: 0 auto;
          color: #1f2937;
        "
      >
        <h2>
          Recuperação de senha
        </h2>

        <p>
          Olá, ${safeName}.
        </p>

        <p>
          Recebemos uma solicitação para
          redefinir a senha da sua conta
          no Arcadia ERP.
        </p>

        <p>
          Clique no botão abaixo:
        </p>

        <p style="margin: 30px 0;">
          <a
            href="${resetUrl}"
            style="
              display: inline-block;
              padding: 12px 20px;
              background: #2563eb;
              color: #ffffff;
              text-decoration: none;
              border-radius: 8px;
              font-weight: bold;
            "
          >
            Redefinir minha senha
          </a>
        </p>

        <p>
          Este link é válido por
          <strong>30 minutos</strong>.
        </p>

        <p>
          Se você não solicitou esta
          alteração, ignore este e-mail.
        </p>

        <hr
          style="
            margin: 30px 0;
            border: 0;
            border-top: 1px solid #e5e7eb;
          "
        />

        <small>
          Arcadia ERP
        </small>
      </div>
    `,
  });
}

module.exports = {
  sendPasswordResetEmail,
};
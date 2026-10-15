require("dotenv").config();

const readline = require("readline");

const {
  sendPasswordResetEmail,
} = require("../services/mailService");

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function testEmail() {
  try {
    console.log(
      "\n=== Arcadia ERP - Teste de E-mail ===\n"
    );

    const email = (
      await ask(
        "E-mail que receberá o teste: "
      )
    ).trim();

    if (!email) {
      throw new Error(
        "Informe um e-mail."
      );
    }

    await sendPasswordResetEmail({
      to: email,

      name: "Usuário de teste",

      resetUrl:
        "http://localhost:3001/reset-password?token=teste",
    });

    console.log(
      "\n✅ E-mail enviado com sucesso!"
    );

    console.log(
      `Destino: ${email}\n`
    );
  } catch (error) {
    console.error(
      "\n❌ Erro ao enviar e-mail:"
    );

    console.error(
      error.message
    );

    process.exitCode = 1;
  }
}

testEmail();
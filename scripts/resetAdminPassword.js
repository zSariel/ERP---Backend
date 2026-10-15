require("dotenv").config();

const readline = require("readline");
const bcrypt = require("bcrypt");

const sequelize = require("../config/database");

const User = require("../models/User");

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

/**
 * Lê a senha escondendo os caracteres.
 */
function askHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;

    if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
      ask(question).then(resolve).catch(reject);

      return;
    }

    process.stdout.write(question);

    let value = "";

    const wasRaw = stdin.isRaw;

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    function cleanup() {
      stdin.removeListener("data", handleKey);

      stdin.setRawMode(Boolean(wasRaw));

      stdin.pause();
    }

    function handleKey(key) {
      /*
       * Ctrl + C
       */
      if (key === "\u0003") {
        cleanup();

        process.stdout.write("\n");

        reject(new Error("Operação cancelada."));

        return;
      }

      /*
       * Enter
       */
      if (key === "\r" || key === "\n") {
        cleanup();

        process.stdout.write("\n");

        resolve(value);

        return;
      }

      /*
       * Backspace
       */
      if (key === "\u007f" || key === "\b") {
        if (value.length > 0) {
          value = value.slice(0, -1);

          process.stdout.write("\b \b");
        }

        return;
      }

      /*
       * Caracteres normais
       */
      if (key >= " ") {
        value += key;

        process.stdout.write("*");
      }
    }

    stdin.on("data", handleKey);
  });
}

async function resetAdminPassword() {
  try {
    console.log("\n=== Arcadia ERP - Redefinir senha de administrador ===\n");

    await sequelize.authenticate();

    console.log("✅ Conexão com o banco realizada.\n");

    const email = (await ask("E-mail do administrador: ")).trim().toLowerCase();

    if (!email) {
      throw new Error("Informe o e-mail do administrador.");
    }

    const admin = await User.findOne({
      where: {
        email,
      },
    });

    if (!admin) {
      throw new Error("Usuário não encontrado.");
    }

    if (admin.role !== "admin") {
      throw new Error("O usuário informado não é administrador.");
    }

    if (!admin.active) {
      throw new Error(
        "Este administrador está desativado. Reative a conta antes de redefinir a senha.",
      );
    }

    const newPassword = await askHidden("Nova senha: ");

    if (!newPassword || newPassword.length < 6) {
      throw new Error("A nova senha deve possuir pelo menos 6 caracteres.");
    }

    const confirmPassword = await askHidden("Confirme a nova senha: ");

    if (newPassword !== confirmPassword) {
      throw new Error("As senhas informadas não são iguais.");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await admin.update({
      password: hashedPassword,
    });

    console.log("\n✅ Senha do administrador redefinida com sucesso.");

    console.log(`Administrador: ${admin.name}`);

    console.log(`E-mail: ${admin.email}\n`);
  } catch (error) {
    console.error("\n❌ Não foi possível redefinir a senha:");

    console.error(`${error.message}\n`);

    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

resetAdminPassword();

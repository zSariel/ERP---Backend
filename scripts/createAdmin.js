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

async function createAdmin() {
  try {
    console.log("\n=== Arcadia ERP - Primeiro Administrador ===\n");

    await sequelize.authenticate();

    console.log("✅ Conexão com o banco realizada.");

    /*
     * Esse comando serve apenas
     * para criar o primeiro admin.
     */
    const adminExists = await User.findOne({
      where: {
        role: "admin",
        active: true,
      },
    });

    if (adminExists) {
      console.log("\n⚠️ Já existe um administrador ativo.");

      console.log(
        "Use o painel de Usuários para criar ou promover outros administradores.\n",
      );

      return;
    }

    const name = (await ask("Nome: ")).trim();

    const email = (await ask("E-mail: ")).trim().toLowerCase();

    const password = await ask("Senha: ");

    if (!name) {
      throw new Error("O nome é obrigatório.");
    }

    if (!email) {
      throw new Error("O e-mail é obrigatório.");
    }

    if (!email.includes("@")) {
      throw new Error("Informe um e-mail válido.");
    }

    if (!password || password.length < 6) {
      throw new Error("A senha deve possuir pelo menos 6 caracteres.");
    }

    const existingUser = await User.findOne({
      where: {
        email,
      },
    });

    if (existingUser) {
      throw new Error("Já existe um usuário cadastrado com esse e-mail.");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "admin",
      active: true,
    });

    console.log("\n✅ Primeiro administrador criado com sucesso!");

    console.log(`ID: ${admin.id}`);

    console.log(`Nome: ${admin.name}`);

    console.log(`E-mail: ${admin.email}`);

    console.log("Permissão: Administrador\n");
  } catch (error) {
    console.error("\n❌ Não foi possível criar o administrador:");

    console.error(error.message);

    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

createAdmin();

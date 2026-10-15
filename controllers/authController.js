const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
<<<<<<< HEAD
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "segredo";

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Preencha todos os campos.",
      });
    }

    const userExists = await User.findOne({
      where: { email },
    });

    if (userExists) {
      return res.status(400).json({
        error: "Este e-mail já está cadastrado.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: passwordHash,
    });

    return res.status(201).json({
      message: "Usuário cadastrado com sucesso!",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });

  } catch (error) {
    console.error("Erro no cadastro:");
    console.error(error);

    return res.status(500).json({
      error: "Erro interno do servidor.",
    });
  }
};

=======
const crypto = require("crypto");

const { Op } = require("sequelize");

const User = require("../models/User");

const { sendPasswordResetEmail } = require("../services/mailService");
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET não está configurado nas variáveis de ambiente.");
}

/**
 * LOGIN
 */
>>>>>>> master
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

<<<<<<< HEAD
    if (!email || !password) {
=======
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    if (!normalizedEmail || !password) {
>>>>>>> master
      return res.status(400).json({
        error: "Preencha todos os campos.",
      });
    }

    const user = await User.findOne({
<<<<<<< HEAD
      where: { email },
    });

    if (!user) {
      return res.status(404).json({
        error: "Usuário não encontrado.",
      });
    }

    const validPassword = await bcrypt.compare(
      password,
      user.password
    );

    if (!validPassword) {
      return res.status(401).json({
        error: "Senha inválida.",
=======
      where: {
        email: normalizedEmail,
      },
    });

    if (!user) {
      return res.status(401).json({
        error: "E-mail ou senha inválidos.",
      });
    }

    if (!user.active) {
      return res.status(403).json({
        error:
          "Este usuário está desativado. Entre em contato com o administrador.",
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({
        error: "E-mail ou senha inválidos.",
>>>>>>> master
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
<<<<<<< HEAD
=======
        role: user.role,
>>>>>>> master
      },
      JWT_SECRET,
      {
        expiresIn: "1d",
<<<<<<< HEAD
      }
=======
      },
>>>>>>> master
    );

    return res.status(200).json({
      message: "Login realizado com sucesso!",
<<<<<<< HEAD
      token,
=======

      token,

>>>>>>> master
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
<<<<<<< HEAD
      },
    });

  } catch (error) {
    console.error("Erro no login:");
    console.error(error);
=======
        role: user.role,
        active: user.active,
      },
    });
  } catch (error) {
    console.error("Erro no login:", error);

    return res.status(500).json({
      error: "Erro interno do servidor.",
    });
  }
};

/**
 * SOLICITAR RECUPERAÇÃO DE SENHA
 */
const forgotPassword = async (req, res) => {
  const genericMessage =
    "Se existir uma conta ativa com este e-mail, as instruções para redefinição de senha serão enviadas.";

  try {
    const { email } = req.body;

    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({
        error: "Informe o e-mail.",
      });
    }

    const user = await User.findOne({
      where: {
        email: normalizedEmail,
        active: true,
      },
    });

    /*
     * Não revelamos se o e-mail
     * existe ou não.
     */
    if (!user) {
      return res.status(200).json({
        message: genericMessage,
      });
    }

    /*
     * Cria token aleatório.
     */
    const resetToken = crypto.randomBytes(32).toString("hex");

    /*
     * Guarda apenas o hash
     * no banco.
     */
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    /*
     * Validade de 30 minutos.
     */
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await user.update({
      password_reset_token: resetTokenHash,

      password_reset_expires_at: expiresAt,
    });

    /*
     * URL do frontend.
     */
    const frontendUrl = String(
      process.env.FRONTEND_URL || "http://localhost:3001",
    ).replace(/\/$/, "");

    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    try {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl,
      });
    } catch (emailError) {
      console.error("Erro ao enviar e-mail de recuperação:", emailError);

      /*
       * Se o e-mail falhar,
       * removemos o token que
       * acabou de ser criado.
       */
      await user.update({
        password_reset_token: null,
        password_reset_expires_at: null,
      });

      /*
       * Mantemos resposta genérica
       * para não revelar se o
       * usuário existe.
       */
      return res.status(200).json({
        message: genericMessage,
      });
    }

    return res.status(200).json({
      message: genericMessage,
    });
  } catch (error) {
    console.error("Erro ao solicitar recuperação de senha:", error);

    return res.status(500).json({
      error: "Erro interno do servidor.",
    });
  }
};
/**
 * REDEFINIR SENHA
 */
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        error: "Token e nova senha são obrigatórios.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "A senha deve possuir pelo menos 6 caracteres.",
      });
    }

    /*
     * O token recebido precisa
     * virar hash para compararmos
     * com o banco.
     */
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      where: {
        password_reset_token: tokenHash,

        password_reset_expires_at: {
          [Op.gt]: new Date(),
        },

        active: true,
      },
    });

    if (!user) {
      return res.status(400).json({
        error: "Token inválido ou expirado.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await user.update({
      password: passwordHash,

      /*
       * Token só pode ser
       * utilizado uma vez.
       */
      password_reset_token: null,
      password_reset_expires_at: null,
    });

    return res.status(200).json({
      message: "Senha redefinida com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao redefinir senha:", error);
>>>>>>> master

    return res.status(500).json({
      error: "Erro interno do servidor.",
    });
  }
};

module.exports = {
<<<<<<< HEAD
  register,
  login,
};
=======
  login,
  forgotPassword,
  resetPassword,
};
>>>>>>> master

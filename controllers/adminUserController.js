const bcrypt = require("bcrypt");
const User = require("../models/User");

/**
 * Criar usuário pelo painel administrativo
 */
const createUser = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role = "user",
    } = req.body;

    const normalizedName =
      String(name || "").trim();

    const normalizedEmail =
      String(email || "")
        .trim()
        .toLowerCase();

    if (!normalizedName) {
      return res.status(400).json({
        error: "O nome é obrigatório.",
      });
    }

    if (!normalizedEmail) {
      return res.status(400).json({
        error: "O e-mail é obrigatório.",
      });
    }

    if (!password) {
      return res.status(400).json({
        error: "A senha é obrigatória.",
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        error:
          "A senha deve possuir pelo menos 6 caracteres.",
      });
    }

    const allowedRoles = [
      "admin",
      "user",
    ];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        error:
          "A permissão deve ser admin ou user.",
      });
    }

    const existingUser =
      await User.findOne({
        where: {
          email: normalizedEmail,
        },
      });

    if (existingUser) {
      return res.status(409).json({
        error:
          "Já existe um usuário cadastrado com este e-mail.",
      });
    }

    const hashedPassword =
      await bcrypt.hash(
        String(password),
        10
      );

    const user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      password: hashedPassword,
      role,
      active: true,
    });

    return res.status(201).json({
      message:
        "Usuário criado com sucesso.",

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        active: user.active,
      },
    });
  } catch (error) {
    console.error(
      "Erro ao criar usuário:",
      error
    );

    if (
      error.name ===
      "SequelizeUniqueConstraintError"
    ) {
      return res.status(409).json({
        error:
          "Já existe um usuário cadastrado com este e-mail.",
      });
    }

    return res.status(500).json({
      error:
        "Erro ao criar usuário.",
    });
  }
};

/**
 * Listar usuários
 */
const listUsers = async (req, res) => {
  try {
    const users =
      await User.findAll({
        attributes: [
          "id",
          "name",
          "email",
          "role",
          "active",
          "created_at",
        ],

        order: [
          ["id", "DESC"],
        ],
      });

    return res.json(users);
  } catch (error) {
    console.error(
      "Erro ao listar usuários:",
      error
    );

    return res.status(500).json({
      error:
        "Erro ao listar usuários.",
    });
  }
};

/**
 * Ativar ou desativar usuário
 */
const updateUserStatus = async (
  req,
  res
) => {
  try {
    const id =
      Number(req.params.id);

    const { active } =
      req.body;

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      return res.status(400).json({
        error:
          "Usuário inválido.",
      });
    }

    if (
      typeof active !== "boolean"
    ) {
      return res.status(400).json({
        error:
          "O campo active deve ser true ou false.",
      });
    }

    const user =
      await User.findByPk(id);

    if (!user) {
      return res.status(404).json({
        error:
          "Usuário não encontrado.",
      });
    }

    /**
     * O administrador não pode
     * desativar a própria conta.
     */
    if (
      Number(req.user.id) ===
        Number(user.id) &&
      active === false
    ) {
      return res.status(400).json({
        error:
          "Você não pode desativar sua própria conta.",
      });
    }

    /**
     * Impede que o sistema fique
     * sem administrador ativo.
     */
    if (
      user.role === "admin" &&
      user.active &&
      active === false
    ) {
      const activeAdmins =
        await User.count({
          where: {
            role: "admin",
            active: true,
          },
        });

      if (activeAdmins <= 1) {
        return res.status(409).json({
          error:
            "O sistema precisa possuir pelo menos um administrador ativo.",
        });
      }
    }

    await user.update({
      active,
    });

    return res.json({
      message: active
        ? "Usuário ativado com sucesso."
        : "Usuário desativado com sucesso.",

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        active: user.active,
      },
    });
  } catch (error) {
    console.error(
      "Erro ao alterar status do usuário:",
      error
    );

    return res.status(500).json({
      error:
        "Erro ao alterar status do usuário.",
    });
  }
};

/**
 * Alterar permissão
 */
const updateUserRole = async (
  req,
  res
) => {
  try {
    const id =
      Number(req.params.id);

    const { role } =
      req.body;

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      return res.status(400).json({
        error:
          "Usuário inválido.",
      });
    }

    const allowedRoles = [
      "admin",
      "user",
    ];

    if (
      !allowedRoles.includes(role)
    ) {
      return res.status(400).json({
        error:
          "A permissão deve ser admin ou user.",
      });
    }

    const user =
      await User.findByPk(id);

    if (!user) {
      return res.status(404).json({
        error:
          "Usuário não encontrado.",
      });
    }

    /**
     * Evita que o administrador
     * remova a própria permissão.
     */
    if (
      Number(req.user.id) ===
        Number(user.id) &&
      role !== "admin"
    ) {
      return res.status(400).json({
        error:
          "Você não pode remover sua própria permissão de administrador.",
      });
    }

    /**
     * Nunca deixar o sistema
     * sem administrador ativo.
     */
    if (
      user.role === "admin" &&
      role === "user"
    ) {
      const activeAdmins =
        await User.count({
          where: {
            role: "admin",
            active: true,
          },
        });

      if (
        user.active &&
        activeAdmins <= 1
      ) {
        return res.status(409).json({
          error:
            "O sistema precisa possuir pelo menos um administrador ativo.",
        });
      }
    }

    await user.update({
      role,
    });

    return res.json({
      message:
        "Permissão atualizada com sucesso.",

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        active: user.active,
      },
    });
  } catch (error) {
    console.error(
      "Erro ao alterar permissão:",
      error
    );

    return res.status(500).json({
      error:
        "Erro ao alterar permissão do usuário.",
    });
  }
};

module.exports = {
  createUser,
  listUsers,
  updateUserStatus,
  updateUserRole,
};
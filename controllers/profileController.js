const bcrypt = require("bcrypt");

const User = require("../models/User");

/**
 * Retorna os dados do usuário logado.
 */
const getProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ["id", "name", "email", "role", "active", "created_at"],
    });

    if (!user) {
      return res.status(404).json({
        error: "Usuário não encontrado.",
      });
    }

    return res.json({
      user,
    });
  } catch (error) {
    console.error("Erro ao buscar perfil:", error);

    return res.status(500).json({
      error: "Não foi possível carregar o perfil.",
    });
  }
};

/**
 * Edita nome e e-mail do usuário logado.
 */
const updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;

    const normalizedName = String(name || "").trim();

    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    if (!normalizedName || !normalizedEmail) {
      return res.status(400).json({
        error: "Nome e e-mail são obrigatórios.",
      });
    }

    const user = await User.findByPk(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: "Usuário não encontrado.",
      });
    }

    /*
     * Se o e-mail mudou,
     * verificamos se outro usuário
     * já está usando.
     */
    if (normalizedEmail !== user.email) {
      const emailExists = await User.findOne({
        where: {
          email: normalizedEmail,
        },
      });

      if (emailExists) {
        return res.status(409).json({
          error: "Este e-mail já está sendo utilizado por outro usuário.",
        });
      }
    }

    await user.update({
      name: normalizedName,
      email: normalizedEmail,
    });

    return res.json({
      message: "Perfil atualizado com sucesso.",

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        active: user.active,
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar perfil:", error);

    return res.status(500).json({
      error: "Não foi possível atualizar o perfil.",
    });
  }
};

/**
 * Alterar senha estando logado.
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: "Senha atual e nova senha são obrigatórias.",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        error: "A nova senha deve possuir pelo menos 6 caracteres.",
      });
    }

    const user = await User.findByPk(req.user.id);

    if (!user) {
      return res.status(404).json({
        error: "Usuário não encontrado.",
      });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.password);

    if (!validPassword) {
      return res.status(401).json({
        error: "A senha atual está incorreta.",
      });
    }

    /*
     * Impede trocar pela mesma senha.
     */
    const samePassword = await bcrypt.compare(newPassword, user.password);

    if (samePassword) {
      return res.status(400).json({
        error: "A nova senha deve ser diferente da senha atual.",
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await user.update({
      password: passwordHash,

      /*
       * Remove eventual recuperação
       * de senha pendente.
       */
      password_reset_token: null,

      password_reset_expires_at: null,
    });

    return res.json({
      message: "Senha alterada com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao alterar senha:", error);

    return res.status(500).json({
      error: "Não foi possível alterar a senha.",
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
};

const jwt = require("jsonwebtoken");

const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET não está configurado nas variáveis de ambiente."
  );
}

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: "Token não enviado.",
      });
    }

    const [scheme, token] = authHeader.split(" ");

    if (
      scheme !== "Bearer" ||
      !token
    ) {
      return res.status(401).json({
        error: "Formato de token inválido.",
      });
    }

    const decoded = jwt.verify(
      token,
      JWT_SECRET
    );

    const user = await User.findByPk(
      decoded.id,
      {
        attributes: [
          "id",
          "name",
          "email",
          "role",
          "active",
        ],
      }
    );

    if (!user) {
      return res.status(401).json({
        error: "Usuário não encontrado.",
      });
    }

    if (!user.active) {
      return res.status(403).json({
        error:
          "Este usuário está desativado.",
      });
    }

    /*
     * Usamos os dados atuais do banco,
     * e não apenas os dados gravados no JWT.
     */
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    return next();
  } catch (error) {
    if (
      error.name === "TokenExpiredError"
    ) {
      return res.status(401).json({
        error:
          "Sua sessão expirou. Faça login novamente.",
      });
    }

    if (
      error.name === "JsonWebTokenError"
    ) {
      return res.status(401).json({
        error: "Token inválido.",
      });
    }

    console.error(
      "Erro no middleware de autenticação:",
      error
    );

    return res.status(500).json({
      error: "Erro interno do servidor.",
    });
  }
}

module.exports = authMiddleware;
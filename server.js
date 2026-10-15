require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

const sequelize = require("./config/database");

/**
 * Models
 */
require("./models/User");
require("./models/Client");
require("./models/Supplier");
require("./models/Category");
require("./models/CostCenter");
require("./models/Receivable");
require("./models/ReceivableInstallment");
require("./models/FinancialAccount");
require("./models/ReceivablePayment");
require("./models/Payable");
require("./models/PayableInstallment");
require("./models/PayablePayment");

/**
 * Routes
 */
const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const adminUserRoutes = require("./routes/adminUserRoutes");

const clientRoutes = require("./routes/clientRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const costCenterRoutes = require("./routes/costCenterRoutes");
const receivableRoutes = require("./routes/receivableRoutes");
const financialAccountRoutes = require("./routes/financialAccountRoutes");
const payableRoutes = require("./routes/payableRoutes");

/**
 * Middlewares
 */
const authMiddleware = require("./middleware/authMiddleware");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";

/**
 * Helpers
 */
function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * CORS
 */
const allowedOrigins = String(
  process.env.FRONTEND_URL || "http://localhost:3001",
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (isProduction && !process.env.FRONTEND_URL) {
  throw new Error("FRONTEND_URL é obrigatório quando NODE_ENV=production.");
}

/**
 * Proxy
 *
 * No Railway podemos usar:
 * TRUST_PROXY=1
 */
if (process.env.TRUST_PROXY) {
  const trustProxyValue = String(process.env.TRUST_PROXY).trim().toLowerCase();

  if (trustProxyValue === "true") {
    app.set("trust proxy", true);
  } else if (trustProxyValue === "false") {
    app.set("trust proxy", false);
  } else {
    const numericTrustProxy = Number(trustProxyValue);

    app.set(
      "trust proxy",
      Number.isInteger(numericTrustProxy)
        ? numericTrustProxy
        : process.env.TRUST_PROXY,
    );
  }
}

/**
 * Segurança
 */
app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  }),
);

/**
 * CORS
 */
app.use(
  cors({
    origin(origin, callback) {
      /**
       * Permite requisições sem Origin,
       * como Postman e outros clientes API.
       */
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      const error = new Error("Origem não permitida pelo CORS.");

      error.status = 403;

      return callback(error);
    },

    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

/**
 * JSON
 */
app.use(
  express.json({
    limit: process.env.JSON_BODY_LIMIT || "1mb",
  }),
);

/**
 * Rate Limit geral
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: parsePositiveInteger(process.env.API_RATE_LIMIT, 600),

  standardHeaders: "draft-8",
  legacyHeaders: false,

  skip: (req) => req.method === "OPTIONS",

  message: {
    error:
      "Muitas requisições em pouco tempo. Aguarde alguns minutos e tente novamente.",
  },
});

/**
 * Rate Limit de autenticação
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: parsePositiveInteger(process.env.AUTH_RATE_LIMIT, 30),

  standardHeaders: "draft-8",
  legacyHeaders: false,

  skip: (req) => req.method === "OPTIONS",

  skipSuccessfulRequests: true,

  message: {
    error:
      "Muitas tentativas de autenticação. Aguarde alguns minutos e tente novamente.",
  },
});

/**
 * Health Check
 */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",

    environment: process.env.NODE_ENV || "development",

    timestamp: new Date().toISOString(),
  });
});

/**
 * Rate limit aplicado à API
 */
app.use(apiLimiter);

/**
 * Rotas de autenticação
 */
app.use("/auth", authLimiter, authRoutes);

/**
 * Perfil do usuário logado
 *
 * O próprio profileRoutes possui
 * authMiddleware.
 */
app.use("/profile", profileRoutes);

/**
 * Administração de usuários
 *
 * O próprio adminUserRoutes já possui:
 *
 * authMiddleware
 * adminMiddleware
 */
app.use("/admin/users", adminUserRoutes);

/**
 * Cadastros e módulo financeiro
 */
app.use("/clients", clientRoutes);

app.use("/suppliers", supplierRoutes);

app.use("/categories", categoryRoutes);

app.use("/cost-centers", costCenterRoutes);

app.use("/financial-accounts", financialAccountRoutes);

app.use("/receivables", receivableRoutes);

app.use("/payables", payableRoutes);

/**
 * Rota principal
 */
app.get("/", (req, res) => {
  res.json({
    message: "Arcadia API online",

    environment: process.env.NODE_ENV || "development",
  });
});

/**
 * Teste de rota protegida
 */
app.get("/dashboard", authMiddleware, (req, res) => {
  res.json({
    message: "Acesso liberado",

    user: req.user,
  });
});

/**
 * Teste do banco
 *
 * Apenas em desenvolvimento.
 */
if (!isProduction) {
  app.get("/db-test", async (req, res) => {
    try {
      await sequelize.authenticate();

      return res.json({
        message: "Banco conectado com sucesso usando Sequelize",
      });
    } catch (error) {
      return res.status(500).json({
        error: "Erro ao conectar no banco",

        details: error.message,
      });
    }
  });
}

/**
 * 404
 */
app.use((req, res) => {
  res.status(404).json({
    error: "Rota não encontrada.",
  });
});

/**
 * Error Handler
 */
app.use((error, req, res, next) => {
  console.error("Erro não tratado:", error);

  const status = Number(error.status || error.statusCode || 500);

  const payload = {
    error:
      status === 500
        ? "Erro interno do servidor."
        : error.message || "Erro na requisição.",
  };

  if (!isProduction && status === 500) {
    payload.details = error.message;
  }

  return res.status(status).json(payload);
});

/**
 * Inicialização
 */
let server;

async function startServer() {
  try {
    await sequelize.authenticate();

    console.log("Banco conectado com Sequelize!");

    console.log(
      "Estrutura do banco controlada por migrations; sync automático desativado.",
    );

    server = app.listen(PORT, () => {
      console.log(
        `Servidor rodando na porta ${PORT} (${process.env.NODE_ENV || "development"})`,
      );
    });
  } catch (error) {
    console.error("Erro ao iniciar o servidor:");

    console.error(error);

    process.exitCode = 1;
  }
}

/**
 * Encerramento seguro
 */
async function shutdown(signal) {
  console.log(`\n${signal} recebido. Encerrando servidor...`);

  if (!server) {
    await sequelize.close().catch(() => {});

    process.exit(0);
  }

  const forceExitTimer = setTimeout(() => {
    console.error("Encerramento forçado após timeout.");

    process.exit(1);
  }, 10000);

  forceExitTimer.unref();

  server.close(async () => {
    try {
      await sequelize.close();

      console.log("Conexões encerradas com segurança.");

      process.exit(0);
    } catch (error) {
      console.error("Erro ao encerrar conexões:", error);

      process.exit(1);
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("SIGINT", () => shutdown("SIGINT"));

/**
 * Inicia o servidor UMA única vez.
 */
startServer();

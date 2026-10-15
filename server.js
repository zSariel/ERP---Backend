require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
<<<<<<< HEAD
const sequelize = require("./config/database");

=======

const sequelize = require("./config/database");

/**
 * Models
 */
require("./models/User");
>>>>>>> master
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

<<<<<<< HEAD
const authRoutes = require("./routes/authRoutes");
=======
/**
 * Routes
 */
const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const adminUserRoutes = require("./routes/adminUserRoutes");

>>>>>>> master
const clientRoutes = require("./routes/clientRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const costCenterRoutes = require("./routes/costCenterRoutes");
<<<<<<< HEAD
const authMiddleware = require("./middleware/authMiddleware");
=======
>>>>>>> master
const receivableRoutes = require("./routes/receivableRoutes");
const financialAccountRoutes = require("./routes/financialAccountRoutes");
const payableRoutes = require("./routes/payableRoutes");

<<<<<<< HEAD
=======
/**
 * Middlewares
 */
const authMiddleware = require("./middleware/authMiddleware");

>>>>>>> master
const app = express();

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";

<<<<<<< HEAD
function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}

const allowedOrigins = String(
  process.env.FRONTEND_URL || "http://localhost:3001"
=======
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
>>>>>>> master
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (isProduction && !process.env.FRONTEND_URL) {
<<<<<<< HEAD
  throw new Error(
    "FRONTEND_URL é obrigatório quando NODE_ENV=production."
  );
}

if (process.env.TRUST_PROXY) {
  const numericTrustProxy = Number(process.env.TRUST_PROXY);

  app.set(
    "trust proxy",
    Number.isInteger(numericTrustProxy)
      ? numericTrustProxy
      : process.env.TRUST_PROXY
  );
}

=======
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
>>>>>>> master
app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
<<<<<<< HEAD
  })
);

app.use(
  cors({
    origin(origin, callback) {
      // Permite ferramentas sem cabeçalho Origin (ex.: testes locais/API clients).
=======
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
>>>>>>> master
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      const error = new Error("Origem não permitida pelo CORS.");
<<<<<<< HEAD
      error.status = 403;
      return callback(error);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(
  express.json({
    limit: process.env.JSON_BODY_LIMIT || "1mb",
  })
);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: parsePositiveInteger(process.env.API_RATE_LIMIT, 600),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
=======

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

>>>>>>> master
  message: {
    error:
      "Muitas requisições em pouco tempo. Aguarde alguns minutos e tente novamente.",
  },
});

<<<<<<< HEAD
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: parsePositiveInteger(process.env.AUTH_RATE_LIMIT, 30),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
  skipSuccessfulRequests: true,
=======
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

>>>>>>> master
  message: {
    error:
      "Muitas tentativas de autenticação. Aguarde alguns minutos e tente novamente.",
  },
});

<<<<<<< HEAD
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    environment: process.env.NODE_ENV || "development",
=======
/**
 * Health Check
 */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",

    environment: process.env.NODE_ENV || "development",

>>>>>>> master
    timestamp: new Date().toISOString(),
  });
});

<<<<<<< HEAD
app.use(apiLimiter);

app.use("/financial-accounts", financialAccountRoutes);
app.use("/auth", authLimiter, authRoutes);
app.use("/clients", clientRoutes);
app.use("/suppliers", supplierRoutes);
app.use("/categories", categoryRoutes);
app.use("/cost-centers", costCenterRoutes);
app.use("/receivables", receivableRoutes);
app.use("/payables", payableRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "Arcadia API online",
=======
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

>>>>>>> master
    environment: process.env.NODE_ENV || "development",
  });
});

<<<<<<< HEAD
app.get("/dashboard", authMiddleware, (req, res) => {
  res.json({
    message: "Acesso liberado",
=======
/**
 * Teste de rota protegida
 */
app.get("/dashboard", authMiddleware, (req, res) => {
  res.json({
    message: "Acesso liberado",

>>>>>>> master
    user: req.user,
  });
});

<<<<<<< HEAD
=======
/**
 * Teste do banco
 *
 * Apenas em desenvolvimento.
 */
>>>>>>> master
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
<<<<<<< HEAD
=======

>>>>>>> master
        details: error.message,
      });
    }
  });
}

<<<<<<< HEAD
=======
/**
 * 404
 */
>>>>>>> master
app.use((req, res) => {
  res.status(404).json({
    error: "Rota não encontrada.",
  });
});

<<<<<<< HEAD
=======
/**
 * Error Handler
 */
>>>>>>> master
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

<<<<<<< HEAD
  res.status(status).json(payload);
});

=======
  return res.status(status).json(payload);
});

/**
 * Inicialização
 */
>>>>>>> master
let server;

async function startServer() {
  try {
    await sequelize.authenticate();
<<<<<<< HEAD
    console.log("✅ Banco conectado com Sequelize!");
    console.log(
      "ℹ️ Estrutura do banco controlada por migrations; sync automático desativado."
=======

    console.log("Banco conectado com Sequelize!");

    console.log(
      "Estrutura do banco controlada por migrations; sync automático desativado.",
>>>>>>> master
    );

    server = app.listen(PORT, () => {
      console.log(
<<<<<<< HEAD
        `🚀 Servidor rodando na porta ${PORT} (${process.env.NODE_ENV || "development"})`
      );
    });
  } catch (error) {
    console.error("❌ Erro ao iniciar o servidor:");
    console.error(error);
=======
        `Servidor rodando na porta ${PORT} (${process.env.NODE_ENV || "development"})`,
      );
    });
  } catch (error) {
    console.error("Erro ao iniciar o servidor:");

    console.error(error);

>>>>>>> master
    process.exitCode = 1;
  }
}

<<<<<<< HEAD
=======
/**
 * Encerramento seguro
 */
>>>>>>> master
async function shutdown(signal) {
  console.log(`\n${signal} recebido. Encerrando servidor...`);

  if (!server) {
    await sequelize.close().catch(() => {});
<<<<<<< HEAD
=======

>>>>>>> master
    process.exit(0);
  }

  const forceExitTimer = setTimeout(() => {
    console.error("Encerramento forçado após timeout.");
<<<<<<< HEAD
=======

>>>>>>> master
    process.exit(1);
  }, 10000);

  forceExitTimer.unref();

  server.close(async () => {
    try {
      await sequelize.close();
<<<<<<< HEAD
      console.log("✅ Conexões encerradas com segurança.");
      process.exit(0);
    } catch (error) {
      console.error("Erro ao encerrar conexões:", error);
=======

      console.log("Conexões encerradas com segurança.");

      process.exit(0);
    } catch (error) {
      console.error("Erro ao encerrar conexões:", error);

>>>>>>> master
      process.exit(1);
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
<<<<<<< HEAD
process.on("SIGINT", () => shutdown("SIGINT"));

=======

process.on("SIGINT", () => shutdown("SIGINT"));

/**
 * Inicia o servidor UMA única vez.
 */
>>>>>>> master
startServer();

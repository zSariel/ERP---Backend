require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const sequelize = require("./config/database");

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

const authRoutes = require("./routes/authRoutes");
const clientRoutes = require("./routes/clientRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const costCenterRoutes = require("./routes/costCenterRoutes");
const authMiddleware = require("./middleware/authMiddleware");
const receivableRoutes = require("./routes/receivableRoutes");
const financialAccountRoutes = require("./routes/financialAccountRoutes");
const payableRoutes = require("./routes/payableRoutes");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}

const allowedOrigins = String(
  process.env.FRONTEND_URL || "http://localhost:3001"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (isProduction && !process.env.FRONTEND_URL) {
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

app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  })
);

app.use(
  cors({
    origin(origin, callback) {
      // Permite ferramentas sem cabeçalho Origin (ex.: testes locais/API clients).
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      const error = new Error("Origem não permitida pelo CORS.");
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
  message: {
    error:
      "Muitas requisições em pouco tempo. Aguarde alguns minutos e tente novamente.",
  },
});

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

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

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
    environment: process.env.NODE_ENV || "development",
  });
});

app.get("/dashboard", authMiddleware, (req, res) => {
  res.json({
    message: "Acesso liberado",
    user: req.user,
  });
});

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

app.use((req, res) => {
  res.status(404).json({
    error: "Rota não encontrada.",
  });
});

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

  res.status(status).json(payload);
});

let server;

async function startServer() {
  try {
    await sequelize.authenticate();
    console.log("✅ Banco conectado com Sequelize!");
    console.log(
      "ℹ️ Estrutura do banco controlada por migrations; sync automático desativado."
    );

    server = app.listen(PORT, () => {
      console.log(
        `🚀 Servidor rodando na porta ${PORT} (${process.env.NODE_ENV || "development"})`
      );
    });
  } catch (error) {
    console.error("❌ Erro ao iniciar o servidor:");
    console.error(error);
    process.exitCode = 1;
  }
}

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
      console.log("✅ Conexões encerradas com segurança.");
      process.exit(0);
    } catch (error) {
      console.error("Erro ao encerrar conexões:", error);
      process.exit(1);
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startServer();

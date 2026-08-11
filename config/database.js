const { Sequelize } = require("sequelize");
require("dotenv").config();

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(
    String(value).trim().toLowerCase()
  );
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}

const sslEnabled = parseBoolean(process.env.DB_SSL, false);
const sslRejectUnauthorized = parseBoolean(
  process.env.DB_SSL_REJECT_UNAUTHORIZED,
  true
);

const dialectOptions = {};

if (sslEnabled) {
  dialectOptions.ssl = {
    rejectUnauthorized: sslRejectUnauthorized,
  };

  if (process.env.DB_SSL_CA) {
    dialectOptions.ssl.ca = process.env.DB_SSL_CA.replace(
      /\\n/g,
      "\n"
    );
  }
}

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || "localhost",
    port: parsePositiveInteger(process.env.DB_PORT, 3306),
    dialect: "mysql",
    logging: parseBoolean(process.env.DB_LOGGING, false)
      ? console.log
      : false,
    dialectOptions,
    pool: {
      max: parsePositiveInteger(process.env.DB_POOL_MAX, 10),
      min: 0,
      acquire: parsePositiveInteger(
        process.env.DB_POOL_ACQUIRE,
        30000
      ),
      idle: parsePositiveInteger(
        process.env.DB_POOL_IDLE,
        10000
      ),
    },
  }
);

module.exports = sequelize;

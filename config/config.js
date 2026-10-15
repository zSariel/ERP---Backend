const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "..", ".env"),
});

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

function getDatabaseConfig() {
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

  return {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST || "127.0.0.1",
    port: parsePositiveInteger(process.env.DB_PORT, 3306),
    dialect: "mysql",
    logging: parseBoolean(process.env.DB_LOGGING, false)
      ? console.log
      : false,
    dialectOptions,
    migrationStorage: "sequelize",
    migrationStorageTableName: "SequelizeMeta",
  };
}

module.exports = {
  development: getDatabaseConfig(),
  test: getDatabaseConfig(),
  production: getDatabaseConfig(),
};

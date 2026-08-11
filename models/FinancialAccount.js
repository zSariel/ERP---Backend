const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const FinancialAccount = sequelize.define(
  "FinancialAccount",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    code: {
      type: DataTypes.STRING(20),
      allowNull: true,
      unique: true,
    },

    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },

    bank: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    agency: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },

    account_number: {
      type: DataTypes.STRING(40),
      allowNull: true,
    },

    account_type: {
      type: DataTypes.ENUM(
        "conta_corrente",
        "conta_poupanca",
        "caixa"
      ),
      allowNull: false,
      defaultValue: "conta_corrente",
    },

    initial_balance: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },

    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "financial_accounts",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

module.exports = FinancialAccount;

const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ReceivableInstallment = require(
  "./ReceivableInstallment"
);

const FinancialAccount = require(
  "./FinancialAccount"
);

const ReceivablePayment = sequelize.define(
  "ReceivablePayment",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    installment_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    financial_account_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },

    received_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    payment_method: {
      type: DataTypes.ENUM("transferencia"),
      allowNull: false,
      defaultValue: "transferencia",
    },

    status: {
      type: DataTypes.ENUM(
        "confirmado",
        "estornado"
      ),
      allowNull: false,
      defaultValue: "confirmado",
    },

    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    reversed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "receivable_payments",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      {
        fields: ["installment_id"],
      },
      {
        fields: ["financial_account_id"],
      },
      {
        fields: ["status"],
      },
    ],
  }
);

ReceivablePayment.belongsTo(
  ReceivableInstallment,
  {
    foreignKey: "installment_id",
    as: "installment",
    onDelete: "CASCADE",
  }
);

ReceivableInstallment.hasMany(
  ReceivablePayment,
  {
    foreignKey: "installment_id",
    as: "payments",
    onDelete: "CASCADE",
  }
);

ReceivablePayment.belongsTo(
  FinancialAccount,
  {
    foreignKey: "financial_account_id",
    as: "financial_account",
    onDelete: "RESTRICT",
  }
);

FinancialAccount.hasMany(
  ReceivablePayment,
  {
    foreignKey: "financial_account_id",
    as: "receivable_payments",
    onDelete: "RESTRICT",
  }
);

module.exports = ReceivablePayment;

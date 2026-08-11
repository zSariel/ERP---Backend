const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const PayableInstallment = require(
  "./PayableInstallment"
);

const FinancialAccount = require(
  "./FinancialAccount"
);

const PayablePayment = sequelize.define(
  "PayablePayment",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    installment_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: PayableInstallment,
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },

    financial_account_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: FinancialAccount,
        key: "id",
      },
    },

    amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },

    paid_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    payment_method: {
      type: DataTypes.ENUM(
        "transferencia",
        "pix",
        "boleto",
        "dinheiro",
        "outro"
      ),
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

    exported: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    exported_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    export_batch: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },
  },
  {
    tableName: "payable_payments",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

PayablePayment.belongsTo(
  PayableInstallment,
  {
    foreignKey: "installment_id",
    as: "installment",
  }
);

PayableInstallment.hasMany(
  PayablePayment,
  {
    foreignKey: "installment_id",
    as: "payments",
    onDelete: "CASCADE",
  }
);

PayablePayment.belongsTo(
  FinancialAccount,
  {
    foreignKey: "financial_account_id",
    as: "financial_account",
  }
);

FinancialAccount.hasMany(
  PayablePayment,
  {
    foreignKey: "financial_account_id",
    as: "payable_payments",
  }
);

module.exports = PayablePayment;
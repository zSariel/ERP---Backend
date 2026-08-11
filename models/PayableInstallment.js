const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Payable = require("./Payable");

const PayableInstallment = sequelize.define(
  "PayableInstallment",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    payable_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Payable,
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },

    installment_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },

    paid_amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },

    due_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    paid_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    status: {
      type: DataTypes.ENUM(
        "pendente",
        "atrasado",
        "parcial",
        "pago",
        "cancelado"
      ),
      allowNull: false,
      defaultValue: "pendente",
    },
  },
  {
    tableName: "payable_installments",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",

    indexes: [
      {
        unique: true,
        fields: [
          "payable_id",
          "installment_number",
        ],
      },
    ],
  }
);

PayableInstallment.belongsTo(Payable, {
  foreignKey: "payable_id",
  as: "payable",
});

Payable.hasMany(PayableInstallment, {
  foreignKey: "payable_id",
  as: "installments",
  onDelete: "CASCADE",
});

module.exports = PayableInstallment;
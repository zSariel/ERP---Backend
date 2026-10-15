const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Receivable = require("./Receivable");

const ReceivableInstallment = sequelize.define(
  "ReceivableInstallment",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    receivable_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    installment_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

<<<<<<< HEAD
=======
    kind: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "parcela",
      validate: {
        isIn: [["entrada", "parcela"]],
      },
    },

>>>>>>> master
    amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },

    received_amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },

    due_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    received_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    status: {
      type: DataTypes.ENUM(
        "pendente",
        "parcial",
        "recebido",
        "atrasado",
<<<<<<< HEAD
        "cancelado"
=======
        "cancelado",
>>>>>>> master
      ),
      allowNull: false,
      defaultValue: "pendente",
    },
  },
  {
    tableName: "receivable_installments",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
<<<<<<< HEAD
  }
=======
  },
>>>>>>> master
);

Receivable.hasMany(ReceivableInstallment, {
  foreignKey: "receivable_id",
  as: "installments",
  onDelete: "CASCADE",
});

ReceivableInstallment.belongsTo(Receivable, {
  foreignKey: "receivable_id",
  as: "receivable",
});

<<<<<<< HEAD
module.exports = ReceivableInstallment;
=======
module.exports = ReceivableInstallment;
>>>>>>> master

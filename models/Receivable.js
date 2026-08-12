const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Project = require("./CostCenter");
const Client = require("./Client");
const Category = require("./Category");

const Receivable = sequelize.define(
  "Receivable",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    code: {
      type: DataTypes.STRING(30),
      allowNull: true,
      unique: true,
    },

    description: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },

    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    client_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    category_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    total_amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },

    installments_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },

    issue_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    first_due_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    status: {
      type: DataTypes.ENUM(
        "pendente",
        "parcial",
        "recebido",
        "cancelado"
      ),
      allowNull: false,
      defaultValue: "pendente",
    },

    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "receivables",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

Receivable.belongsTo(Project, {
  foreignKey: "project_id",
  as: "cost_center",
});

Project.hasMany(Receivable, {
  foreignKey: "project_id",
  as: "receivables",
});

Receivable.belongsTo(Client, {
  foreignKey: "client_id",
  as: "client",
});

Client.hasMany(Receivable, {
  foreignKey: "client_id",
  as: "receivables",
});

Receivable.belongsTo(Category, {
  foreignKey: "category_id",
  as: "category",
});

Category.hasMany(Receivable, {
  foreignKey: "category_id",
  as: "receivables",
});

module.exports = Receivable;
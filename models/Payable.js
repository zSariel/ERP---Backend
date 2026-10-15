const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Supplier = require("./Supplier");
const CostCenter = require("./CostCenter");
const Category = require("./Category");

const Payable = sequelize.define(
  "Payable",
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

    description: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },

    supplier_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: Supplier,
        key: "id",
      },
    },

    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: CostCenter,
        key: "id",
      },
    },

    category_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: Category,
        key: "id",
      },
    },

    document_number: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },

    history_code: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },

    total_amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
    },

    original_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    },

    discount_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    },

    surcharge_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
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

    competence_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    first_due_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    status: {
      type: DataTypes.ENUM("pendente", "parcial", "pago", "cancelado"),
      allowNull: false,
      defaultValue: "pendente",
    },

    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "payables",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
);

Payable.belongsTo(Supplier, {
  foreignKey: "supplier_id",
  as: "supplier",
});

Supplier.hasMany(Payable, {
  foreignKey: "supplier_id",
  as: "payables",
});

Payable.belongsTo(CostCenter, {
  foreignKey: "project_id",
  as: "cost_center",
});

CostCenter.hasMany(Payable, {
  foreignKey: "project_id",
  as: "payables",
});

Payable.belongsTo(Category, {
  foreignKey: "category_id",
  as: "category",
});

Category.hasMany(Payable, {
  foreignKey: "category_id",
  as: "payables",
});

module.exports = Payable;

const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Category = sequelize.define(
  "Category",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },

    type: {
      type: DataTypes.ENUM("receita", "despesa"),
      allowNull: false,
    },

    color: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: "#2563eb",
    },

    icon: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: "tag",
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "categories",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

module.exports = Category;
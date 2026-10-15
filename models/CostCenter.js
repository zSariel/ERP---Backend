const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Client = require("./Client");

const Project = sequelize.define(
  "Project",
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

    reference: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },

    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },

    client_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    cost_center: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },

    status: {
      type: DataTypes.ENUM(
        "planejado",
        "andamento",
        "pausado",
        "concluido",
        "cancelado"
      ),
      allowNull: false,
      defaultValue: "planejado",
    },

    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    contract_value: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      defaultValue: 0,
    },

    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "projects",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

Project.belongsTo(Client, {
  foreignKey: "client_id",
  as: "client",
});

Client.hasMany(Project, {
  foreignKey: "client_id",
  as: "projects",
});

module.exports = Project;
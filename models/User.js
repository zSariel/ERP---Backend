const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const User = sequelize.define(
  "User",
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

    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
    },

    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
<<<<<<< HEAD
  },
  {
    tableName: "users",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
  }
);

module.exports = User;
=======

    role: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "user",

      validate: {
        isIn: [["admin", "user"]],
      },
    },

    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    /**
     * Hash do token usado para
     * recuperação de senha.
     *
     * Nunca armazenamos o token
     * verdadeiro no banco.
     */
    password_reset_token: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },

    /**
     * Data limite para utilização
     * do token de recuperação.
     */
    password_reset_expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "users",

    timestamps: true,

    createdAt: "created_at",

    updatedAt: false,
  },
);

module.exports = User;
>>>>>>> master

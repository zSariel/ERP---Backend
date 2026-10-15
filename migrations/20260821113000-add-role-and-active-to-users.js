"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      "users",
      "role",
      {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "user",
        after: "password",
      }
    );

    await queryInterface.addColumn(
      "users",
      "active",
      {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        after: "role",
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(
      "users",
      "active"
    );

    await queryInterface.removeColumn(
      "users",
      "role"
    );
  },
};
"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("receivable_payments", "payment_method", {
      type: Sequelize.ENUM(
        "transferencia",
        "pix",
        "boleto",
        "dinheiro",
        "outro"
      ),
      allowNull: false,
      defaultValue: "transferencia",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("receivable_payments", "payment_method", {
      type: Sequelize.ENUM("transferencia"),
      allowNull: false,
      defaultValue: "transferencia",
    });
  },
};

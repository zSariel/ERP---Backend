"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn(
        "payables",
        "original_amount",
        {
          type: Sequelize.DECIMAL(15, 2),
          allowNull: false,
          defaultValue: 0,
        },
        { transaction },
      );

      await queryInterface.addColumn(
        "payables",
        "discount_amount",
        {
          type: Sequelize.DECIMAL(15, 2),
          allowNull: false,
          defaultValue: 0,
        },
        { transaction },
      );

      await queryInterface.addColumn(
        "payables",
        "surcharge_amount",
        {
          type: Sequelize.DECIMAL(15, 2),
          allowNull: false,
          defaultValue: 0,
        },
        { transaction },
      );

      await queryInterface.addColumn(
        "payable_installments",
        "kind",
        {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: "parcela",
        },
        { transaction },
      );

      /*
       * Preserva os lançamentos existentes:
       * o valor que já era total passa a ser também
       * o valor original da negociação.
       */
      await queryInterface.sequelize.query(
        `UPDATE payables
         SET original_amount = total_amount
         WHERE original_amount = 0 OR original_amount IS NULL`,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.removeColumn("payable_installments", "kind", {
        transaction,
      });

      await queryInterface.removeColumn("payables", "surcharge_amount", {
        transaction,
      });

      await queryInterface.removeColumn("payables", "discount_amount", {
        transaction,
      });

      await queryInterface.removeColumn("payables", "original_amount", {
        transaction,
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};

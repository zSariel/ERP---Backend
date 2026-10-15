"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn(
        "receivables",
        "original_amount",
        {
          type: Sequelize.DECIMAL(15, 2),
          allowNull: false,
          defaultValue: 0,
        },
        { transaction },
      );

      await queryInterface.addColumn(
        "receivables",
        "discount_amount",
        {
          type: Sequelize.DECIMAL(15, 2),
          allowNull: false,
          defaultValue: 0,
        },
        { transaction },
      );

      await queryInterface.addColumn(
        "receivables",
        "surcharge_amount",
        {
          type: Sequelize.DECIMAL(15, 2),
          allowNull: false,
          defaultValue: 0,
        },
        { transaction },
      );

      await queryInterface.addColumn(
        "receivable_installments",
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
        `UPDATE receivables
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
      await queryInterface.removeColumn("receivable_installments", "kind", {
        transaction,
      });

      await queryInterface.removeColumn("receivables", "surcharge_amount", {
        transaction,
      });

      await queryInterface.removeColumn("receivables", "discount_amount", {
        transaction,
      });

      await queryInterface.removeColumn("receivables", "original_amount", {
        transaction,
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};

"use strict";

/**
 * Baseline inicial do Arcadia ERP.
 *
 * Gerado a partir do schema real do banco controle_financeiro (MySQL 8.0.46)
 * exportado em 11/08/2026.
 *
 * IMPORTANTE:
 * - Em um banco NOVO, execute normalmente com `sequelize-cli db:migrate`.
 * - No banco de desenvolvimento JÁ EXISTENTE, NÃO execute o `up` desta migration.
 *   Marque-a como aplicada na SequelizeMeta usando o arquivo baseline_existing_db.sql.
 * - Índices UNIQUE duplicados criados historicamente por sync({ alter: true }) NÃO
 *   foram reproduzidos. Cada regra de unicidade aparece apenas uma vez.
 */

const tableOptions = {
  engine: "InnoDB",
  charset: "utf8mb4",
  collate: "utf8mb4_0900_ai_ci",
};

module.exports = {
  async up(queryInterface, Sequelize) {
    // Tabelas independentes / base.
    await queryInterface.createTable(
      "users",
      {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        name: {
          type: Sequelize.STRING(100),
          allowNull: false,
        },
        email: {
          type: Sequelize.STRING(150),
          allowNull: false,
          unique: true,
        },
        password: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      },
      tableOptions
    );

    await queryInterface.createTable(
      "clients",
      {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        name: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        document: {
          type: Sequelize.STRING(20),
          allowNull: true,
        },
        phone: {
          type: Sequelize.STRING(20),
          allowNull: true,
        },
        email: {
          type: Sequelize.STRING(150),
          allowNull: true,
        },
        city: {
          type: Sequelize.STRING(100),
          allowNull: true,
        },
        address: {
          type: Sequelize.STRING(200),
          allowNull: true,
        },
        note: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      },
      tableOptions
    );

    await queryInterface.createTable(
      "suppliers",
      {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        name: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        document: {
          type: Sequelize.STRING(20),
          allowNull: true,
        },
        phone: {
          type: Sequelize.STRING(20),
          allowNull: true,
        },
        email: {
          type: Sequelize.STRING(150),
          allowNull: true,
        },
        city: {
          type: Sequelize.STRING(100),
          allowNull: true,
        },
        address: {
          type: Sequelize.STRING(200),
          allowNull: true,
        },
        note: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      },
      tableOptions
    );

    await queryInterface.createTable(
      "categories",
      {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        name: {
          type: Sequelize.STRING(100),
          allowNull: false,
        },
        type: {
          type: Sequelize.ENUM("receita", "despesa"),
          allowNull: false,
        },
        color: {
          type: Sequelize.STRING(20),
          allowNull: true,
          defaultValue: "#2563eb",
        },
        icon: {
          type: Sequelize.STRING(50),
          allowNull: true,
          defaultValue: "tag",
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
      },
      tableOptions
    );

    await queryInterface.createTable(
      "financial_accounts",
      {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        code: {
          type: Sequelize.STRING(20),
          allowNull: true,
          unique: true,
        },
        name: {
          type: Sequelize.STRING(120),
          allowNull: false,
        },
        bank: {
          type: Sequelize.STRING(100),
          allowNull: true,
        },
        agency: {
          type: Sequelize.STRING(30),
          allowNull: true,
        },
        account_number: {
          type: Sequelize.STRING(40),
          allowNull: true,
        },
        account_type: {
          type: Sequelize.ENUM(
            "conta_corrente",
            "conta_poupanca",
            "caixa"
          ),
          allowNull: false,
          defaultValue: "conta_corrente",
        },
        initial_balance: {
          type: Sequelize.DECIMAL(14, 2),
          allowNull: false,
          defaultValue: 0,
        },
        active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        note: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      },
      tableOptions
    );

    // O sistema atual usa project_id como referência ao centro de custo.
    await queryInterface.createTable(
      "projects",
      {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        code: {
          type: Sequelize.STRING(20),
          allowNull: true,
          unique: true,
        },
        reference: {
          type: Sequelize.STRING(80),
          allowNull: true,
        },
        name: {
          type: Sequelize.STRING(150),
          allowNull: false,
        },
        client_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: "clients",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        cost_center: {
          type: Sequelize.STRING(80),
          allowNull: true,
        },
        status: {
          type: Sequelize.ENUM(
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
          type: Sequelize.DATEONLY,
          allowNull: true,
        },
        end_date: {
          type: Sequelize.DATEONLY,
          allowNull: true,
        },
        note: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        contract_value: {
          type: Sequelize.DECIMAL(12, 2),
          allowNull: true,
          defaultValue: 0,
        },
      },
      tableOptions
    );

    await queryInterface.addIndex("projects", ["client_id"], {
      name: "projects_client_id_idx",
    });

    // Mantida por compatibilidade com o schema atual. Ela pode ser avaliada
    // posteriormente para remoção caso seja confirmada como tabela legada.
    await queryInterface.createTable(
      "cost_centers",
      {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        name: {
          type: Sequelize.STRING(150),
          allowNull: false,
        },
        client_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: "clients",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        cost_center: {
          type: Sequelize.STRING(80),
          allowNull: true,
        },
        status: {
          type: Sequelize.ENUM(
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
          type: Sequelize.DATEONLY,
          allowNull: true,
        },
        end_date: {
          type: Sequelize.DATEONLY,
          allowNull: true,
        },
        budget: {
          type: Sequelize.DECIMAL(12, 2),
          allowNull: true,
          defaultValue: 0,
        },
        note: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        code: {
          type: Sequelize.STRING(20),
          allowNull: true,
          unique: true,
        },
        reference: {
          type: Sequelize.STRING(80),
          allowNull: true,
        },
      },
      tableOptions
    );

    await queryInterface.addIndex("cost_centers", ["client_id"], {
      name: "cost_centers_client_id_idx",
    });

    await queryInterface.createTable(
      "receivables",
      {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        code: {
          type: Sequelize.STRING(30),
          allowNull: true,
          unique: true,
        },
        description: {
          type: Sequelize.STRING(200),
          allowNull: false,
        },
        project_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: "projects",
            key: "id",
          },
          onUpdate: "CASCADE",
        },
        client_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: "clients",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        category_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: "categories",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        total_amount: {
          type: Sequelize.DECIMAL(14, 2),
          allowNull: false,
        },
        installments_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
        },
        issue_date: {
          type: Sequelize.DATEONLY,
          allowNull: true,
        },
        first_due_date: {
          type: Sequelize.DATEONLY,
          allowNull: false,
        },
        status: {
          type: Sequelize.ENUM(
            "pendente",
            "parcial",
            "recebido",
            "cancelado"
          ),
          allowNull: false,
          defaultValue: "pendente",
        },
        note: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      },
      tableOptions
    );

    await queryInterface.addIndex("receivables", ["project_id"], {
      name: "receivables_project_id_idx",
    });
    await queryInterface.addIndex("receivables", ["client_id"], {
      name: "receivables_client_id_idx",
    });
    await queryInterface.addIndex("receivables", ["category_id"], {
      name: "receivables_category_id_idx",
    });

    await queryInterface.createTable(
      "receivable_installments",
      {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        receivable_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: "receivables",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        installment_number: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        amount: {
          type: Sequelize.DECIMAL(14, 2),
          allowNull: false,
        },
        received_amount: {
          type: Sequelize.DECIMAL(14, 2),
          allowNull: false,
          defaultValue: 0,
        },
        due_date: {
          type: Sequelize.DATEONLY,
          allowNull: false,
        },
        received_date: {
          type: Sequelize.DATEONLY,
          allowNull: true,
        },
        status: {
          type: Sequelize.ENUM(
            "pendente",
            "parcial",
            "recebido",
            "atrasado",
            "cancelado"
          ),
          allowNull: false,
          defaultValue: "pendente",
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      },
      tableOptions
    );

    await queryInterface.addIndex(
      "receivable_installments",
      ["receivable_id"],
      { name: "receivable_installments_receivable_id_idx" }
    );

    await queryInterface.createTable(
      "receivable_payments",
      {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        installment_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: "receivable_installments",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        financial_account_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: "financial_accounts",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT",
        },
        amount: {
          type: Sequelize.DECIMAL(14, 2),
          allowNull: false,
        },
        received_date: {
          type: Sequelize.DATEONLY,
          allowNull: false,
        },
        payment_method: {
          type: Sequelize.ENUM("transferencia"),
          allowNull: false,
          defaultValue: "transferencia",
        },
        status: {
          type: Sequelize.ENUM("confirmado", "estornado"),
          allowNull: false,
          defaultValue: "confirmado",
        },
        note: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        reversed_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      },
      tableOptions
    );

    await queryInterface.addIndex(
      "receivable_payments",
      ["installment_id"],
      { name: "receivable_payments_installment_id_idx" }
    );
    await queryInterface.addIndex(
      "receivable_payments",
      ["financial_account_id"],
      { name: "receivable_payments_financial_account_id_idx" }
    );
    await queryInterface.addIndex("receivable_payments", ["status"], {
      name: "receivable_payments_status_idx",
    });

    await queryInterface.createTable(
      "payables",
      {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        code: {
          type: Sequelize.STRING(20),
          allowNull: true,
          unique: true,
        },
        description: {
          type: Sequelize.STRING(200),
          allowNull: false,
        },
        supplier_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: "suppliers",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        project_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: "projects",
            key: "id",
          },
          onUpdate: "CASCADE",
        },
        category_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: "categories",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        document_number: {
          type: Sequelize.STRING(60),
          allowNull: true,
        },
        history_code: {
          type: Sequelize.STRING(30),
          allowNull: true,
        },
        total_amount: {
          type: Sequelize.DECIMAL(14, 2),
          allowNull: false,
        },
        installments_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
        },
        issue_date: {
          type: Sequelize.DATEONLY,
          allowNull: true,
        },
        competence_date: {
          type: Sequelize.DATEONLY,
          allowNull: true,
        },
        first_due_date: {
          type: Sequelize.DATEONLY,
          allowNull: false,
        },
        status: {
          type: Sequelize.ENUM(
            "pendente",
            "parcial",
            "pago",
            "cancelado"
          ),
          allowNull: false,
          defaultValue: "pendente",
        },
        note: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      },
      tableOptions
    );

    await queryInterface.addIndex("payables", ["supplier_id"], {
      name: "payables_supplier_id_idx",
    });
    await queryInterface.addIndex("payables", ["project_id"], {
      name: "payables_project_id_idx",
    });
    await queryInterface.addIndex("payables", ["category_id"], {
      name: "payables_category_id_idx",
    });

    await queryInterface.createTable(
      "payable_installments",
      {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        payable_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: "payables",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        installment_number: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        amount: {
          type: Sequelize.DECIMAL(14, 2),
          allowNull: false,
        },
        paid_amount: {
          type: Sequelize.DECIMAL(14, 2),
          allowNull: false,
          defaultValue: 0,
        },
        due_date: {
          type: Sequelize.DATEONLY,
          allowNull: false,
        },
        paid_date: {
          type: Sequelize.DATEONLY,
          allowNull: true,
        },
        status: {
          type: Sequelize.ENUM(
            "pendente",
            "atrasado",
            "parcial",
            "pago",
            "cancelado"
          ),
          allowNull: false,
          defaultValue: "pendente",
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      },
      tableOptions
    );

    await queryInterface.addIndex(
      "payable_installments",
      ["payable_id", "installment_number"],
      {
        name: "payable_installments_payable_id_installment_number",
        unique: true,
      }
    );

    await queryInterface.createTable(
      "payable_payments",
      {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },
        installment_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: "payable_installments",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        financial_account_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: "financial_accounts",
            key: "id",
          },
          onUpdate: "CASCADE",
        },
        amount: {
          type: Sequelize.DECIMAL(14, 2),
          allowNull: false,
        },
        paid_date: {
          type: Sequelize.DATEONLY,
          allowNull: false,
        },
        payment_method: {
          type: Sequelize.ENUM(
            "transferencia",
            "pix",
            "boleto",
            "dinheiro",
            "outro"
          ),
          allowNull: false,
          defaultValue: "transferencia",
        },
        status: {
          type: Sequelize.ENUM("confirmado", "estornado"),
          allowNull: false,
          defaultValue: "confirmado",
        },
        note: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        reversed_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        exported: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        exported_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        export_batch: {
          type: Sequelize.STRING(60),
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      },
      tableOptions
    );

    await queryInterface.addIndex("payable_payments", ["installment_id"], {
      name: "payable_payments_installment_id_idx",
    });
    await queryInterface.addIndex(
      "payable_payments",
      ["financial_account_id"],
      { name: "payable_payments_financial_account_id_idx" }
    );
  },

  async down(queryInterface) {
    // Ordem inversa por causa das chaves estrangeiras.
    await queryInterface.dropTable("payable_payments");
    await queryInterface.dropTable("payable_installments");
    await queryInterface.dropTable("payables");
    await queryInterface.dropTable("receivable_payments");
    await queryInterface.dropTable("receivable_installments");
    await queryInterface.dropTable("receivables");
    await queryInterface.dropTable("cost_centers");
    await queryInterface.dropTable("projects");
    await queryInterface.dropTable("financial_accounts");
    await queryInterface.dropTable("categories");
    await queryInterface.dropTable("suppliers");
    await queryInterface.dropTable("clients");
    await queryInterface.dropTable("users");
  },
};

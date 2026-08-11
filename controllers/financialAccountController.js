const { fn, col } = require("sequelize");

const FinancialAccount = require("../models/FinancialAccount");
const ReceivablePayment = require("../models/ReceivablePayment");
const PayablePayment = require("../models/PayablePayment");

function parseMoney(value) {
  const number = Number(
    String(value ?? 0)
      .trim()
      .replace(",", ".")
  );

  return Number.isFinite(number) ? number : 0;
}

function parseBoolean(value, defaultValue = true) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  return !(
    value === false ||
    value === 0 ||
    value === "0" ||
    value === "false"
  );
}

function generateAccountCode(id) {
  return `CTA-${String(id).padStart(4, "0")}`;
}

/**
 * Soma os recebimentos confirmados
 * agrupados por conta financeira.
 */
async function getReceivedAmountsByAccount() {
  const totals = await ReceivablePayment.findAll({
    attributes: [
      "financial_account_id",
      [
        fn("SUM", col("amount")),
        "received_amount",
      ],
    ],
    where: {
      status: "confirmado",
    },
    group: ["financial_account_id"],
    raw: true,
  });

  return totals.reduce((result, item) => {
    const accountId = Number(
      item.financial_account_id
    );

    result[accountId] = Number(
      item.received_amount || 0
    );

    return result;
  }, {});
}

/**
 * Soma os pagamentos confirmados
 * agrupados por conta financeira.
 */
async function getPaidAmountsByAccount() {
  const totals = await PayablePayment.findAll({
    attributes: [
      "financial_account_id",
      [
        fn("SUM", col("amount")),
        "paid_amount",
      ],
    ],
    where: {
      status: "confirmado",
    },
    group: ["financial_account_id"],
    raw: true,
  });

  return totals.reduce((result, item) => {
    const accountId = Number(
      item.financial_account_id
    );

    result[accountId] = Number(
      item.paid_amount || 0
    );

    return result;
  }, {});
}

/**
 * Busca recebimentos e pagamentos
 * de uma conta específica.
 */
async function getAccountTotals(accountId) {
  const [
    receivedAmount,
    paidAmount,
  ] = await Promise.all([
    ReceivablePayment.sum("amount", {
      where: {
        financial_account_id: accountId,
        status: "confirmado",
      },
    }),

    PayablePayment.sum("amount", {
      where: {
        financial_account_id: accountId,
        status: "confirmado",
      },
    }),
  ]);

  return {
    receivedAmount: Number(
      receivedAmount || 0
    ),

    paidAmount: Number(
      paidAmount || 0
    ),
  };
}

/**
 * Saldo atual:
 * saldo inicial
 * + recebimentos
 * - pagamentos
 */
function buildFinancialData(
  account,
  receivedAmountsByAccount = {},
  paidAmountsByAccount = {}
) {
  const data = account.toJSON
    ? account.toJSON()
    : account;

  const accountId = Number(data.id);

  const initialBalance = Number(
    data.initial_balance || 0
  );

  const receivedAmount = Number(
    receivedAmountsByAccount[accountId] || 0
  );

  const paidAmount = Number(
    paidAmountsByAccount[accountId] || 0
  );

  const currentBalance =
    initialBalance +
    receivedAmount -
    paidAmount;

  return {
    ...data,
    initial_balance: initialBalance,
    received_amount: receivedAmount,
    paid_amount: paidAmount,
    current_balance: currentBalance,
  };
}

/**
 * Criar conta financeira
 */
const createFinancialAccount = async (
  req,
  res
) => {
  try {
    const {
      name,
      bank,
      agency,
      account_number,
      account_type,
      initial_balance,
      active,
      note,
    } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        error:
          "O nome da conta é obrigatório.",
      });
    }

    const account =
      await FinancialAccount.create({
        code: null,

        name: name.trim(),

        bank:
          bank?.trim() || null,

        agency:
          agency?.trim() || null,

        account_number:
          account_number?.trim() || null,

        account_type:
          account_type || "conta_corrente",

        initial_balance:
          parseMoney(initial_balance),

        active:
          parseBoolean(active, true),

        note:
          note?.trim() || null,
      });

    await account.update({
      code: generateAccountCode(account.id),
    });

    return res.status(201).json({
      message:
        "Conta financeira criada com sucesso.",

      account: buildFinancialData(account),
    });
  } catch (error) {
    console.error(
      "Erro ao criar conta financeira:",
      error
    );

    return res.status(500).json({
      error:
        "Erro ao criar conta financeira.",

      details: error.message,
    });
  }
};

/**
 * Listar contas financeiras
 */
const listFinancialAccounts = async (
  req,
  res
) => {
  try {
    const accounts =
      await FinancialAccount.findAll({
        order: [
          ["active", "DESC"],
          ["name", "ASC"],
        ],
      });

    const [
      receivedAmounts,
      paidAmounts,
    ] = await Promise.all([
      getReceivedAmountsByAccount(),
      getPaidAmountsByAccount(),
    ]);

    const result = accounts.map(
      (account) =>
        buildFinancialData(
          account,
          receivedAmounts,
          paidAmounts
        )
    );

    return res.json(result);
  } catch (error) {
    console.error(
      "Erro ao listar contas financeiras:",
      error
    );

    return res.status(500).json({
      error:
        "Erro ao listar contas financeiras.",

      details: error.message,
    });
  }
};

/**
 * Buscar conta financeira pelo ID
 */
const getFinancialAccountById = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const account =
      await FinancialAccount.findByPk(id);

    if (!account) {
      return res.status(404).json({
        error:
          "Conta financeira não encontrada.",
      });
    }

    const {
      receivedAmount,
      paidAmount,
    } = await getAccountTotals(id);

    const result = buildFinancialData(
      account,

      {
        [Number(id)]: receivedAmount,
      },

      {
        [Number(id)]: paidAmount,
      }
    );

    return res.json(result);
  } catch (error) {
    console.error(
      "Erro ao buscar conta financeira:",
      error
    );

    return res.status(500).json({
      error:
        "Erro ao buscar conta financeira.",

      details: error.message,
    });
  }
};

/**
 * Atualizar conta financeira
 */
const updateFinancialAccount = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const account =
      await FinancialAccount.findByPk(id);

    if (!account) {
      return res.status(404).json({
        error:
          "Conta financeira não encontrada.",
      });
    }

    const {
      name,
      bank,
      agency,
      account_number,
      account_type,
      initial_balance,
      active,
      note,
    } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        error:
          "O nome da conta é obrigatório.",
      });
    }

    await account.update({
      name: name.trim(),

      bank:
        bank?.trim() || null,

      agency:
        agency?.trim() || null,

      account_number:
        account_number?.trim() || null,

      account_type:
        account_type ||
        account.account_type,

      initial_balance:
        initial_balance === undefined
          ? account.initial_balance
          : parseMoney(initial_balance),

      active:
        parseBoolean(
          active,
          account.active
        ),

      note:
        note === undefined
          ? account.note
          : note?.trim() || null,
    });

    const {
      receivedAmount,
      paidAmount,
    } = await getAccountTotals(id);

    const accountData =
      buildFinancialData(
        account,

        {
          [Number(id)]: receivedAmount,
        },

        {
          [Number(id)]: paidAmount,
        }
      );

    return res.json({
      message:
        "Conta financeira atualizada com sucesso.",

      account: accountData,
    });
  } catch (error) {
    console.error(
      "Erro ao atualizar conta financeira:",
      error
    );

    return res.status(500).json({
      error:
        "Erro ao atualizar conta financeira.",

      details: error.message,
    });
  }
};

/**
 * Ativar ou desativar conta financeira
 */
const updateFinancialAccountStatus = async (
  req,
  res
) => {
  try {
    const { id } = req.params;
    const { active } = req.body;

    const account =
      await FinancialAccount.findByPk(id);

    if (!account) {
      return res.status(404).json({
        error:
          "Conta financeira não encontrada.",
      });
    }

    await account.update({
      active: parseBoolean(
        active,
        account.active
      ),
    });

    const {
      receivedAmount,
      paidAmount,
    } = await getAccountTotals(id);

    const accountData =
      buildFinancialData(
        account,

        {
          [Number(id)]: receivedAmount,
        },

        {
          [Number(id)]: paidAmount,
        }
      );

    return res.json({
      message: account.active
        ? "Conta financeira ativada com sucesso."
        : "Conta financeira desativada com sucesso.",

      account: accountData,
    });
  } catch (error) {
    console.error(
      "Erro ao alterar status da conta:",
      error
    );

    return res.status(500).json({
      error:
        "Erro ao alterar status da conta financeira.",

      details: error.message,
    });
  }
};

/**
 * Excluir conta financeira
 */
const deleteFinancialAccount = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const account =
      await FinancialAccount.findByPk(id);

    if (!account) {
      return res.status(404).json({
        error:
          "Conta financeira não encontrada.",
      });
    }

    const [
      receivableCount,
      payableCount,
    ] = await Promise.all([
      ReceivablePayment.count({
        where: {
          financial_account_id: id,
        },
      }),

      PayablePayment.count({
        where: {
          financial_account_id: id,
        },
      }),
    ]);

    if (
      receivableCount > 0 ||
      payableCount > 0
    ) {
      return res.status(409).json({
        error:
          "Esta conta possui recebimentos ou pagamentos vinculados. Desative a conta em vez de excluí-la.",
      });
    }

    await account.destroy();

    return res.json({
      message:
        "Conta financeira excluída com sucesso.",
    });
  } catch (error) {
    console.error(
      "Erro ao excluir conta financeira:",
      error
    );

    return res.status(500).json({
      error:
        "Erro ao excluir conta financeira.",

      details: error.message,
    });
  }
};

module.exports = {
  createFinancialAccount,
  listFinancialAccounts,
  getFinancialAccountById,
  updateFinancialAccount,
  updateFinancialAccountStatus,
  deleteFinancialAccount,
};
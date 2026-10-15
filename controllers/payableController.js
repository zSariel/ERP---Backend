const { Op } = require("sequelize");

const sequelize = require("../config/database");

const Payable = require("../models/Payable");
const PayableInstallment = require("../models/PayableInstallment");
const PayablePayment = require("../models/PayablePayment");

const CostCenter = require("../models/CostCenter");
const Supplier = require("../models/Supplier");
const Category = require("../models/Category");
const FinancialAccount = require("../models/FinancialAccount");

/**
 * Adiciona meses a uma data sem causar problemas
 * em vencimentos como dia 29, 30 ou 31.
 */
function addMonthsToDate(dateString, monthsToAdd) {
  const [year, month, day] = dateString.split("-").map(Number);

  const targetDate = new Date(Date.UTC(year, month - 1 + monthsToAdd, 1));

  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth() + 1, 0),
  ).getUTCDate();

  targetDate.setUTCDate(Math.min(day, lastDayOfTargetMonth));

  return targetDate.toISOString().slice(0, 10);
}

/**
 * Gera código automático da conta a pagar.
 * Exemplo: PAG-000001
 */
function generatePayableCode(id) {
  return `PAG-${String(id).padStart(6, "0")}`;
}

/**
 * Converte valores monetários para centavos.
 */
function moneyToCents(value) {
  const normalizedValue = String(value ?? "")
    .trim()
    .replace(",", ".");

  const numericValue = Number(normalizedValue);

  if (!Number.isFinite(numericValue)) {
    return NaN;
  }

  return Math.round(numericValue * 100);
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Gera as parcelas da despesa.
 */
function createInstallmentsData({
  payableId,
  totalAmount,
  installmentsCount,
  firstDueDate,
  status = "pendente",
}) {
  const totalInCents = moneyToCents(totalAmount);

  const baseInstallmentInCents = Math.floor(totalInCents / installmentsCount);

  const remainingCents =
    totalInCents - baseInstallmentInCents * installmentsCount;

  const installments = [];
  const today = getToday();

  for (
    let installmentNumber = 1;
    installmentNumber <= installmentsCount;
    installmentNumber += 1
  ) {
    const isLastInstallment = installmentNumber === installmentsCount;

    const installmentInCents =
      baseInstallmentInCents + (isLastInstallment ? remainingCents : 0);

    const dueDate = addMonthsToDate(firstDueDate, installmentNumber - 1);

    let installmentStatus = status;

    if (status !== "cancelado" && dueDate < today) {
      installmentStatus = "atrasado";
    }

    installments.push({
      payable_id: payableId,
      installment_number: installmentNumber,
      amount: (installmentInCents / 100).toFixed(2),
      paid_amount: 0,
      due_date: dueDate,
      paid_date: null,
      status: installmentStatus,
    });
  }

  return installments;
}

/**
 * Normaliza parcelas personalizadas enviadas pelo frontend.
 *
 * Cada item pode conter:
 * - id: usado na edição de uma parcela já existente
 * - kind: "entrada" ou "parcela"
 * - amount
 * - due_date
 */
function normalizeCustomInstallments(input) {
  if (!Array.isArray(input) || input.length === 0) {
    return {
      error: "Informe pelo menos uma parcela.",
      items: [],
    };
  }

  const seenIds = new Set();
  let entryCount = 0;

  const items = [];

  for (let index = 0; index < input.length; index += 1) {
    const rawItem = input[index] || {};

    const id =
      rawItem.id === undefined || rawItem.id === null || rawItem.id === ""
        ? null
        : Number(rawItem.id);

    if (id !== null && (!Number.isInteger(id) || id <= 0)) {
      return {
        error: `ID inválido na parcela ${index + 1}.`,
        items: [],
      };
    }

    if (id !== null) {
      if (seenIds.has(id)) {
        return {
          error: "A mesma parcela foi enviada mais de uma vez.",
          items: [],
        };
      }

      seenIds.add(id);
    }

    const kind = rawItem.kind === "entrada" ? "entrada" : "parcela";

    if (kind === "entrada") {
      entryCount += 1;
    }

    if (entryCount > 1) {
      return {
        error: "A conta pode possuir apenas uma entrada.",
        items: [],
      };
    }

    const amountInCents = moneyToCents(rawItem.amount);

    if (!Number.isFinite(amountInCents) || amountInCents <= 0) {
      return {
        error: `Informe um valor válido na ${
          kind === "entrada" ? "entrada" : `parcela ${index + 1}`
        }.`,
        items: [],
      };
    }

    const dueDate = String(rawItem.due_date || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return {
        error: `Informe um vencimento válido na ${
          kind === "entrada" ? "entrada" : `parcela ${index + 1}`
        }.`,
        items: [],
      };
    }

    items.push({
      id,
      kind,
      amountInCents,
      due_date: dueDate,
      originalIndex: index,
    });
  }

  /*
   * A agenda é organizada por vencimento.
   * Em datas iguais, a entrada aparece primeiro.
   */
  items.sort((a, b) => {
    const dateComparison = a.due_date.localeCompare(b.due_date);

    if (dateComparison !== 0) {
      return dateComparison;
    }

    if (a.kind !== b.kind) {
      return a.kind === "entrada" ? -1 : 1;
    }

    return a.originalIndex - b.originalIndex;
  });

  return {
    error: null,
    items,
  };
}

function calculateNegotiationAmounts(originalAmountInCents, installments) {
  const scheduledInCents = installments.reduce(
    (total, installment) => total + installment.amountInCents,
    0,
  );

  return {
    scheduledInCents,
    discountInCents: Math.max(originalAmountInCents - scheduledInCents, 0),
    surchargeInCents: Math.max(scheduledInCents - originalAmountInCents, 0),
  };
}

function getInstallmentStatusByValues({
  amountInCents,
  paidInCents,
  dueDate,
  payableStatus,
}) {
  if (payableStatus === "cancelado") {
    return "cancelado";
  }

  if (amountInCents > 0 && paidInCents >= amountInCents) {
    return "pago";
  }

  if (paidInCents > 0) {
    return "parcial";
  }

  if (dueDate < getToday()) {
    return "atrasado";
  }

  return "pendente";
}

async function getInstallmentPaymentHistoryCount(installmentId, transaction) {
  return PayablePayment.count({
    where: {
      installment_id: installmentId,
    },
    transaction,
  });
}

/**
 * Atualiza a grade de parcelas sem apagar histórico financeiro.
 */
async function syncCustomInstallments({
  payable,
  customInstallments,
  transaction,
}) {
  const normalized = normalizeCustomInstallments(customInstallments);

  if (normalized.error) {
    return {
      error: normalized.error,
    };
  }

  const existingInstallments = await PayableInstallment.findAll({
    where: {
      payable_id: payable.id,
    },
    order: [["installment_number", "ASC"]],
    transaction,
  });

  const existingById = new Map(
    existingInstallments.map((installment) => [
      Number(installment.id),
      installment,
    ]),
  );

  const providedExistingIds = new Set(
    normalized.items.filter((item) => item.id).map((item) => Number(item.id)),
  );

  /*
   * Uma parcela omitida da nova grade será removida
   * apenas se nunca teve pagamento.
   */
  for (const existing of existingInstallments) {
    const existingId = Number(existing.id);

    if (providedExistingIds.has(existingId)) {
      continue;
    }

    const historyCount = await getInstallmentPaymentHistoryCount(
      existingId,
      transaction,
    );

    const paidInCents = moneyToCents(existing.paid_amount || 0);

    if (historyCount > 0 || paidInCents > 0) {
      return {
        error:
          "Não é possível remover uma parcela que possui histórico de pagamento.",
      };
    }

    await existing.destroy({
      transaction,
    });
  }

  for (let index = 0; index < normalized.items.length; index += 1) {
    const item = normalized.items[index];

    const installmentNumber = index + 1;

    if (item.id) {
      const existing = existingById.get(Number(item.id));

      if (!existing) {
        return {
          error: "Uma das parcelas informadas não pertence a esta conta.",
        };
      }

      const paidInCents = moneyToCents(existing.paid_amount || 0);

      const currentAmountInCents = moneyToCents(existing.amount);

      const historyCount = await getInstallmentPaymentHistoryCount(
        existing.id,
        transaction,
      );

      const fullyPaid =
        currentAmountInCents > 0 && paidInCents >= currentAmountInCents;

      const currentKind = existing.kind || "parcela";

      const financialDataChanged =
        item.amountInCents !== currentAmountInCents ||
        item.due_date !== existing.due_date ||
        item.kind !== currentKind;

      if (fullyPaid && financialDataChanged) {
        return {
          error:
            "Parcelas já pagas não podem ter valor, vencimento ou tipo alterados.",
        };
      }

      if (item.amountInCents < paidInCents) {
        return {
          error:
            "O novo valor da parcela não pode ser menor que o valor já pago.",
        };
      }

      if (historyCount > 0 && item.kind !== currentKind) {
        return {
          error:
            "Não é possível alterar o tipo de uma parcela que possui histórico de pagamento.",
        };
      }

      const status = getInstallmentStatusByValues({
        amountInCents: item.amountInCents,
        paidInCents,
        dueDate: item.due_date,
        payableStatus: payable.status,
      });

      await existing.update(
        {
          installment_number: installmentNumber,
          kind: item.kind,
          amount: (item.amountInCents / 100).toFixed(2),
          due_date: item.due_date,
          status,
        },
        {
          transaction,
        },
      );

      continue;
    }

    await PayableInstallment.create(
      {
        payable_id: payable.id,
        installment_number: installmentNumber,
        kind: item.kind,
        amount: (item.amountInCents / 100).toFixed(2),
        paid_amount: 0,
        due_date: item.due_date,
        paid_date: null,
        status: getInstallmentStatusByValues({
          amountInCents: item.amountInCents,
          paidInCents: 0,
          dueDate: item.due_date,
          payableStatus: payable.status,
        }),
      },
      {
        transaction,
      },
    );
  }

  return {
    error: null,
    items: normalized.items,
  };
}

/**
 * Relacionamentos retornados nas consultas.
 */
function getPayableIncludes() {
  return [
    {
      model: CostCenter,
      as: "cost_center",
      attributes: ["id", "code", "name"],
    },
    {
      model: Supplier,
      as: "supplier",
      attributes: ["id", "name"],
    },
    {
      model: Category,
      as: "category",
      attributes: ["id", "name", "type"],
    },
    {
      model: PayableInstallment,
      as: "installments",
      include: [
        {
          model: PayablePayment,
          as: "payments",
          include: [
            {
              model: FinancialAccount,
              as: "financial_account",
              attributes: ["id", "code", "name", "bank", "active"],
            },
          ],
        },
      ],
    },
  ];
}

async function rollbackTransaction(transaction) {
  if (transaction && !transaction.finished) {
    await transaction.rollback();
  }
}

/**
 * Calcula os totais da conta a pagar.
 */
function buildPayableData(payable) {
  const data = payable.toJSON ? payable.toJSON() : payable;

  const installments = data.installments || [];

  const paidAmount = installments.reduce(
    (total, installment) => total + Number(installment.paid_amount || 0),
    0,
  );

  const totalAmount = Number(data.total_amount || 0);

  const storedOriginalAmount = Number(data.original_amount || 0);

  const originalAmount =
    storedOriginalAmount > 0
      ? storedOriginalAmount
      : Number(data.total_amount || 0);

  const discountAmount = Number(data.discount_amount || 0);

  const surchargeAmount = Number(data.surcharge_amount || 0);

  const overdueAmount = installments.reduce((total, installment) => {
    if (installment.status === "atrasado" && data.status !== "cancelado") {
      return (
        total +
        Math.max(
          Number(installment.amount || 0) -
            Number(installment.paid_amount || 0),
          0,
        )
      );
    }

    return total;
  }, 0);

  return {
    ...data,
    original_amount: originalAmount,
    discount_amount: discountAmount,
    surcharge_amount: surchargeAmount,
    paid_amount: paidAmount,
    remaining_amount: Math.max(totalAmount - paidAmount, 0),
    overdue_amount: overdueAmount,
    is_overdue: overdueAmount > 0,
  };
}

/**
 * Busca todas as parcelas de uma conta.
 */
async function getPayableInstallments(payableId, transaction) {
  return PayableInstallment.findAll({
    where: {
      payable_id: payableId,
    },
    order: [["installment_number", "ASC"]],
    transaction,
  });
}

/**
 * Conta qualquer histórico de pagamento,
 * incluindo pagamentos estornados.
 */
async function getPaymentHistoryCount(payableId, transaction) {
  const installments = await PayableInstallment.findAll({
    where: {
      payable_id: payableId,
    },
    attributes: ["id"],
    raw: true,
    transaction,
  });

  const installmentIds = installments.map((installment) => installment.id);

  if (installmentIds.length === 0) {
    return 0;
  }

  return PayablePayment.count({
    where: {
      installment_id: {
        [Op.in]: installmentIds,
      },
    },
    transaction,
  });
}

/**
 * Valida centro de custo, fornecedor e categoria.
 */
async function validateRelations({
  costCenterId,
  supplierId,
  categoryId,
  transaction,
}) {
  const costCenter = await CostCenter.findByPk(costCenterId, { transaction });

  if (!costCenter) {
    return {
      status: 404,
      error: "Centro de custo não encontrado.",
    };
  }

  if (supplierId) {
    const supplier = await Supplier.findByPk(supplierId, { transaction });

    if (!supplier) {
      return {
        status: 404,
        error: "Fornecedor não encontrado.",
      };
    }
  }

  if (!categoryId) {
    return {
      status: 400,
      error: "A categoria da despesa é obrigatória.",
    };
  }

  const category = await Category.findByPk(categoryId, { transaction });

  if (!category) {
    return {
      status: 404,
      error: "Categoria não encontrada.",
    };
  }

  if (category.type !== "despesa") {
    return {
      status: 400,
      error: "A categoria selecionada deve ser do tipo despesa.",
    };
  }

  if (category.active === false || category.active === 0) {
    return {
      status: 400,
      error: "A categoria selecionada está inativa.",
    };
  }

  return null;
}

/**
 * Criar conta a pagar.
 */
const createPayable = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      description,
      cost_center_id,
      project_id,
      supplier_id,
      category_id,
      document_number,
      history_code,
      total_amount,
      original_amount,
      installments_count,
      installments: customInstallments,
      issue_date,
      competence_date,
      first_due_date,
      note,
    } = req.body;

    const costCenterId = cost_center_id || project_id;

    if (!description?.trim()) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "A descrição é obrigatória.",
      });
    }

    if (!costCenterId) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "O centro de custo é obrigatório.",
      });
    }

    const relationError = await validateRelations({
      costCenterId,
      supplierId: supplier_id,
      categoryId: category_id,
      transaction,
    });

    if (relationError) {
      await rollbackTransaction(transaction);

      return res.status(relationError.status).json({
        error: relationError.error,
      });
    }

    const hasCustomInstallments =
      Array.isArray(customInstallments) && customInstallments.length > 0;

    let originalInCents;
    let finalInCents;
    let discountInCents = 0;
    let surchargeInCents = 0;
    let installmentsCount;
    let firstDueDate;
    let normalizedCustom = null;

    if (hasCustomInstallments) {
      originalInCents = moneyToCents(original_amount ?? total_amount);

      if (!Number.isFinite(originalInCents) || originalInCents <= 0) {
        await rollbackTransaction(transaction);

        return res.status(400).json({
          error: "O valor original deve ser maior que zero.",
        });
      }

      normalizedCustom = normalizeCustomInstallments(customInstallments);

      if (normalizedCustom.error) {
        await rollbackTransaction(transaction);

        return res.status(400).json({
          error: normalizedCustom.error,
        });
      }

      const negotiation = calculateNegotiationAmounts(
        originalInCents,
        normalizedCustom.items,
      );

      finalInCents = negotiation.scheduledInCents;

      discountInCents = negotiation.discountInCents;

      surchargeInCents = negotiation.surchargeInCents;

      installmentsCount = normalizedCustom.items.length;

      firstDueDate = normalizedCustom.items[0].due_date;
    } else {
      originalInCents = moneyToCents(total_amount);

      if (!Number.isFinite(originalInCents) || originalInCents <= 0) {
        await rollbackTransaction(transaction);

        return res.status(400).json({
          error: "O valor total deve ser maior que zero.",
        });
      }

      installmentsCount = Number(installments_count || 1);

      if (!Number.isInteger(installmentsCount) || installmentsCount < 1) {
        await rollbackTransaction(transaction);

        return res.status(400).json({
          error: "A quantidade de parcelas deve ser pelo menos 1.",
        });
      }

      if (!first_due_date) {
        await rollbackTransaction(transaction);

        return res.status(400).json({
          error: "O primeiro vencimento é obrigatório.",
        });
      }

      finalInCents = originalInCents;

      firstDueDate = first_due_date;
    }

    const payable = await Payable.create(
      {
        code: null,

        description: description.trim(),

        supplier_id: supplier_id ? Number(supplier_id) : null,

        project_id: Number(costCenterId),

        category_id: Number(category_id),

        document_number: document_number?.trim() || null,

        history_code: history_code?.trim() || null,

        original_amount: (originalInCents / 100).toFixed(2),

        discount_amount: (discountInCents / 100).toFixed(2),

        surcharge_amount: (surchargeInCents / 100).toFixed(2),

        /*
         * total_amount continua sendo o valor
         * financeiro FINAL da negociação.
         */
        total_amount: (finalInCents / 100).toFixed(2),

        installments_count: installmentsCount,

        issue_date: issue_date || null,

        competence_date: competence_date || null,

        first_due_date: firstDueDate,

        status: "pendente",

        note: note?.trim() || null,
      },
      {
        transaction,
      },
    );

    const code = generatePayableCode(payable.id);

    await payable.update(
      {
        code,
      },
      {
        transaction,
      },
    );

    if (hasCustomInstallments) {
      const rows = normalizedCustom.items.map((item, index) => ({
        payable_id: payable.id,

        installment_number: index + 1,

        kind: item.kind,

        amount: (item.amountInCents / 100).toFixed(2),

        paid_amount: 0,

        due_date: item.due_date,

        paid_date: null,

        status: getInstallmentStatusByValues({
          amountInCents: item.amountInCents,

          paidInCents: 0,

          dueDate: item.due_date,

          payableStatus: payable.status,
        }),
      }));

      await PayableInstallment.bulkCreate(rows, {
        transaction,
      });
    } else {
      const installments = createInstallmentsData({
        payableId: payable.id,

        totalAmount: finalInCents / 100,

        installmentsCount,

        firstDueDate,
      }).map((installment) => ({
        ...installment,
        kind: "parcela",
      }));

      await PayableInstallment.bulkCreate(installments, {
        transaction,
      });
    }

    await transaction.commit();

    const createdPayable = await Payable.findByPk(payable.id, {
      include: getPayableIncludes(),
    });

    return res.status(201).json({
      message: "Conta a pagar criada com sucesso.",

      payable: buildPayableData(createdPayable),
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error("Erro ao criar conta a pagar:", error);

    return res.status(500).json({
      error: "Erro ao criar conta a pagar.",
      details: error.message,
    });
  }
};

/**
 * Listar contas a pagar.
 */
const listPayables = async (req, res) => {
  try {
    const payables = await Payable.findAll({
      include: getPayableIncludes(),
      order: [
        ["id", "DESC"],
        [
          {
            model: PayableInstallment,
            as: "installments",
          },
          "installment_number",
          "ASC",
        ],
      ],
    });

    const result = payables.map(buildPayableData);

    return res.json(result);
  } catch (error) {
    console.error("Erro ao listar contas a pagar:", error);

    return res.status(500).json({
      error: "Erro ao listar contas a pagar.",
      details: error.message,
    });
  }
};

/**
 * Resumo financeiro das contas a pagar.
 *
 * O total considera o valor FINAL negociado
 * armazenado em total_amount.
 */
const getPayablesSummary = async (req, res) => {
  try {
    const today = getToday();

    const totalAmount =
      Number(
        await Payable.sum("total_amount", {
          where: {
            status: {
              [Op.ne]: "cancelado",
            },
          },
        }),
      ) || 0;

    const paidAmount =
      Number(
        await PayableInstallment.sum("paid_amount", {
          where: {
            status: {
              [Op.ne]: "cancelado",
            },
          },
        }),
      ) || 0;

    const remainingAmount = Math.max(totalAmount - paidAmount, 0);

    const overdueInstallments = await PayableInstallment.count({
      where: {
        due_date: {
          [Op.lt]: today,
        },

        status: {
          [Op.notIn]: ["pago", "cancelado"],
        },

        paid_amount: {
          [Op.lt]: sequelize.col("amount"),
        },
      },
    });

    return res.json({
      total_amount: totalAmount,

      paid_amount: paidAmount,

      remaining_amount: remainingAmount,

      overdue_installments: overdueInstallments,
    });
  } catch (error) {
    console.error("Erro ao gerar resumo das contas a pagar:", error);

    return res.status(500).json({
      error: "Erro ao gerar resumo das contas a pagar.",
      details: error.message,
    });
  }
};

/**
 * Buscar conta a pagar pelo ID.
 */
const getPayableById = async (req, res) => {
  try {
    const { id } = req.params;

    const payable = await Payable.findByPk(id, {
      include: getPayableIncludes(),
      order: [
        [
          {
            model: PayableInstallment,
            as: "installments",
          },
          "installment_number",
          "ASC",
        ],
      ],
    });

    if (!payable) {
      return res.status(404).json({
        error: "Conta a pagar não encontrada.",
      });
    }

    return res.json(buildPayableData(payable));
  } catch (error) {
    console.error("Erro ao buscar conta a pagar:", error);

    return res.status(500).json({
      error: "Erro ao buscar conta a pagar.",
      details: error.message,
    });
  }
};

/**
 * Editar conta a pagar.
 */
const updatePayable = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;

    const payable = await Payable.findByPk(id, {
      transaction,
    });

    if (!payable) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Conta a pagar não encontrada.",
      });
    }

    const {
      description,
      cost_center_id,
      project_id,
      supplier_id,
      category_id,
      document_number,
      history_code,
      total_amount,
      original_amount,
      installments_count,
      installments: customInstallments,
      issue_date,
      competence_date,
      first_due_date,
      note,
    } = req.body;

    const newDescription =
      description === undefined
        ? payable.description
        : String(description).trim();

    const newCostCenterId =
      cost_center_id !== undefined
        ? cost_center_id
        : project_id !== undefined
          ? project_id
          : payable.project_id;

    const newSupplierId =
      supplier_id === undefined ? payable.supplier_id : supplier_id || null;

    const newCategoryId =
      category_id === undefined ? payable.category_id : category_id;

    const newDocumentNumber =
      document_number === undefined
        ? payable.document_number
        : String(document_number || "").trim() || null;

    const newHistoryCode =
      history_code === undefined
        ? payable.history_code
        : String(history_code || "").trim() || null;

    const newIssueDate =
      issue_date === undefined ? payable.issue_date : issue_date || null;

    const newCompetenceDate =
      competence_date === undefined
        ? payable.competence_date
        : competence_date || null;

    const newNote =
      note === undefined ? payable.note : String(note || "").trim() || null;

    if (!newDescription) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "A descrição é obrigatória.",
      });
    }

    if (!newCostCenterId) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "O centro de custo é obrigatório.",
      });
    }

    if (!newCategoryId) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "A categoria da despesa é obrigatória.",
      });
    }

    const relationError = await validateRelations({
      costCenterId: newCostCenterId,

      supplierId: newSupplierId,

      categoryId: newCategoryId,

      transaction,
    });

    if (relationError) {
      await rollbackTransaction(transaction);

      return res.status(relationError.status).json({
        error: relationError.error,
      });
    }

    const hasCustomInstallments =
      Array.isArray(customInstallments) && customInstallments.length > 0;

    if (hasCustomInstallments) {
      const storedOriginalInCents = moneyToCents(payable.original_amount || 0);

      const currentOriginalInCents =
        Number.isFinite(storedOriginalInCents) && storedOriginalInCents > 0
          ? storedOriginalInCents
          : moneyToCents(payable.total_amount);

      const originalInCents =
        original_amount === undefined
          ? currentOriginalInCents
          : moneyToCents(original_amount);

      if (!Number.isFinite(originalInCents) || originalInCents <= 0) {
        await rollbackTransaction(transaction);

        return res.status(400).json({
          error: "O valor original deve ser maior que zero.",
        });
      }

      const normalized = normalizeCustomInstallments(customInstallments);

      if (normalized.error) {
        await rollbackTransaction(transaction);

        return res.status(400).json({
          error: normalized.error,
        });
      }

      const syncResult = await syncCustomInstallments({
        payable,

        customInstallments: normalized.items.map((item) => ({
          id: item.id,
          kind: item.kind,
          amount: item.amountInCents / 100,
          due_date: item.due_date,
        })),

        transaction,
      });

      if (syncResult.error) {
        await rollbackTransaction(transaction);

        return res.status(409).json({
          error: syncResult.error,
        });
      }

      const negotiation = calculateNegotiationAmounts(
        originalInCents,
        normalized.items,
      );

      if (negotiation.scheduledInCents <= 0) {
        await rollbackTransaction(transaction);

        return res.status(400).json({
          error: "O valor final da negociação deve ser maior que zero.",
        });
      }

      const firstDueDate = normalized.items[0].due_date;

      await payable.update(
        {
          description: newDescription,

          supplier_id: newSupplierId ? Number(newSupplierId) : null,

          project_id: Number(newCostCenterId),

          category_id: Number(newCategoryId),

          document_number: newDocumentNumber,

          history_code: newHistoryCode,

          original_amount: (originalInCents / 100).toFixed(2),

          discount_amount: (negotiation.discountInCents / 100).toFixed(2),

          surcharge_amount: (negotiation.surchargeInCents / 100).toFixed(2),

          total_amount: (negotiation.scheduledInCents / 100).toFixed(2),

          installments_count: normalized.items.length,

          issue_date: newIssueDate,

          competence_date: newCompetenceDate,

          first_due_date: firstDueDate,

          note: newNote,
        },
        {
          transaction,
        },
      );

      await recalculatePayableStatus(payable.id, transaction);

      await transaction.commit();

      const updatedPayable = await Payable.findByPk(id, {
        include: getPayableIncludes(),
      });

      return res.json({
        message: "Conta a pagar e parcelas atualizadas com sucesso.",

        payable: buildPayableData(updatedPayable),
      });
    }

    /*
     * Compatibilidade com o modo automático antigo.
     */
    const newTotalInCents =
      total_amount === undefined
        ? moneyToCents(payable.total_amount)
        : moneyToCents(total_amount);

    const newInstallmentsCount =
      installments_count === undefined
        ? Number(payable.installments_count)
        : Number(installments_count);

    const newFirstDueDate =
      first_due_date === undefined ? payable.first_due_date : first_due_date;

    if (!Number.isFinite(newTotalInCents) || newTotalInCents <= 0) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "O valor total deve ser maior que zero.",
      });
    }

    if (!Number.isInteger(newInstallmentsCount) || newInstallmentsCount < 1) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "A quantidade de parcelas deve ser pelo menos 1.",
      });
    }

    if (!newFirstDueDate) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "O primeiro vencimento é obrigatório.",
      });
    }

    const installments = await getPayableInstallments(id, transaction);

    const currentTotalInCents = moneyToCents(payable.total_amount);

    const financialDataChanged =
      newTotalInCents !== currentTotalInCents ||
      newInstallmentsCount !== Number(payable.installments_count) ||
      newFirstDueDate !== payable.first_due_date;

    const paymentHistoryCount = await getPaymentHistoryCount(id, transaction);

    if (financialDataChanged && paymentHistoryCount > 0) {
      await rollbackTransaction(transaction);

      return res.status(409).json({
        error:
          "Para editar uma conta que já possui histórico financeiro, envie a grade de parcelas personalizada.",
      });
    }

    await payable.update(
      {
        description: newDescription,

        supplier_id: newSupplierId ? Number(newSupplierId) : null,

        project_id: Number(newCostCenterId),

        category_id: Number(newCategoryId),

        document_number: newDocumentNumber,

        history_code: newHistoryCode,

        original_amount: (newTotalInCents / 100).toFixed(2),

        discount_amount: "0.00",

        surcharge_amount: "0.00",

        total_amount: (newTotalInCents / 100).toFixed(2),

        installments_count: newInstallmentsCount,

        issue_date: newIssueDate,

        competence_date: newCompetenceDate,

        first_due_date: newFirstDueDate,

        note: newNote,
      },
      {
        transaction,
      },
    );

    if (financialDataChanged) {
      await PayableInstallment.destroy({
        where: {
          payable_id: id,
        },
        transaction,
      });

      const newInstallments = createInstallmentsData({
        payableId: payable.id,

        totalAmount: newTotalInCents / 100,

        installmentsCount: newInstallmentsCount,

        firstDueDate: newFirstDueDate,

        status: payable.status === "cancelado" ? "cancelado" : "pendente",
      }).map((installment) => ({
        ...installment,
        kind: "parcela",
      }));

      await PayableInstallment.bulkCreate(newInstallments, {
        transaction,
      });
    }

    await transaction.commit();

    const updatedPayable = await Payable.findByPk(id, {
      include: getPayableIncludes(),
    });

    return res.json({
      message: "Conta a pagar atualizada com sucesso.",

      payable: buildPayableData(updatedPayable),
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error("Erro ao atualizar conta a pagar:", error);

    return res.status(500).json({
      error: "Erro ao atualizar conta a pagar.",
      details: error.message,
    });
  }
};

/**
 * Cancelar ou reativar conta a pagar.
 */
const updatePayableStatus = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ["pendente", "cancelado"];

    if (!allowedStatuses.includes(status)) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "O status manual deve ser pendente ou cancelado.",
      });
    }

    const payable = await Payable.findByPk(id, {
      transaction,
    });

    if (!payable) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Conta a pagar não encontrada.",
      });
    }

    const installments = await getPayableInstallments(id, transaction);

    const totalPaidInCents = installments.reduce(
      (total, installment) =>
        total + moneyToCents(installment.paid_amount || 0),
      0,
    );

    if (status === "cancelado" && totalPaidInCents > 0) {
      await rollbackTransaction(transaction);

      return res.status(409).json({
        error:
          "Não é possível cancelar uma conta que possui pagamentos confirmados.",
      });
    }

    if (status === "cancelado") {
      await payable.update(
        {
          status: "cancelado",
        },
        { transaction },
      );

      await PayableInstallment.update(
        {
          status: "cancelado",
        },
        {
          where: {
            payable_id: id,
          },
          transaction,
        },
      );
    }

    if (status === "pendente") {
      const today = getToday();

      for (const installment of installments) {
        const amountInCents = moneyToCents(installment.amount);

        const paidInCents = moneyToCents(installment.paid_amount || 0);

        let installmentStatus = "pendente";

        if (paidInCents >= amountInCents) {
          installmentStatus = "pago";
        } else if (paidInCents > 0) {
          installmentStatus = "parcial";
        } else if (installment.due_date < today) {
          installmentStatus = "atrasado";
        }

        await installment.update(
          {
            status: installmentStatus,
          },
          { transaction },
        );
      }

      const totalAmountInCents = moneyToCents(payable.total_amount);

      let payableStatus = "pendente";

      if (totalPaidInCents >= totalAmountInCents) {
        payableStatus = "pago";
      } else if (totalPaidInCents > 0) {
        payableStatus = "parcial";
      }

      await payable.update(
        {
          status: payableStatus,
        },
        { transaction },
      );
    }

    await transaction.commit();

    const updatedPayable = await Payable.findByPk(id, {
      include: getPayableIncludes(),
    });

    return res.json({
      message: "Status atualizado com sucesso.",
      payable: buildPayableData(updatedPayable),
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error("Erro ao atualizar status da conta a pagar:", error);

    return res.status(500).json({
      error: "Erro ao atualizar status da conta a pagar.",
      details: error.message,
    });
  }
};

/**
 * Excluir conta a pagar.
 */
const deletePayable = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;

    const payable = await Payable.findByPk(id, {
      transaction,
    });

    if (!payable) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Conta a pagar não encontrada.",
      });
    }

    const paymentHistoryCount = await getPaymentHistoryCount(id, transaction);

    if (paymentHistoryCount > 0) {
      await rollbackTransaction(transaction);

      return res.status(409).json({
        error:
          "Não é possível excluir uma conta que possui histórico de pagamentos. Cancele a conta para preservar o histórico.",
      });
    }

    await PayableInstallment.destroy({
      where: {
        payable_id: id,
      },
      transaction,
    });

    await payable.destroy({ transaction });

    await transaction.commit();

    return res.json({
      message: "Conta a pagar excluída com sucesso.",
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error("Erro ao excluir conta a pagar:", error);

    return res.status(500).json({
      error: "Erro ao excluir conta a pagar.",
      details: error.message,
    });
  }
};

/**
 * Recalcula uma parcela usando somente
 * pagamentos confirmados.
 */
async function recalculateInstallment(installment, transaction) {
  const payments = await PayablePayment.findAll({
    where: {
      installment_id: installment.id,
      status: "confirmado",
    },
    order: [
      ["paid_date", "ASC"],
      ["id", "ASC"],
    ],
    transaction,
  });

  const paidInCents = payments.reduce(
    (total, payment) => total + moneyToCents(payment.amount),
    0,
  );

  const installmentInCents = moneyToCents(installment.amount);

  let installmentStatus = "pendente";

  if (paidInCents >= installmentInCents) {
    installmentStatus = "pago";
  } else if (paidInCents > 0) {
    installmentStatus = "parcial";
  } else if (installment.due_date < getToday()) {
    installmentStatus = "atrasado";
  }

  const lastPayment =
    payments.length > 0 ? payments[payments.length - 1] : null;

  await installment.update(
    {
      paid_amount: (paidInCents / 100).toFixed(2),
      paid_date: lastPayment ? lastPayment.paid_date : null,
      status: installmentStatus,
    },
    { transaction },
  );

  return paidInCents;
}

/**
 * Recalcula o status geral da conta a pagar.
 */
async function recalculatePayableStatus(payableId, transaction) {
  const payable = await Payable.findByPk(payableId, { transaction });

  if (!payable) {
    return null;
  }

  /*
   * Uma conta cancelada só volta a ficar ativa pela rota
   * específica de reativação. Recalcular pagamentos não deve
   * reativá-la silenciosamente.
   */
  if (payable.status === "cancelado") {
    return payable;
  }

  const installments = await PayableInstallment.findAll({
    where: {
      payable_id: payableId,
    },
    transaction,
  });

  const totalPaidInCents = installments.reduce(
    (total, installment) => total + moneyToCents(installment.paid_amount || 0),
    0,
  );

  const totalAmountInCents = moneyToCents(payable.total_amount);

  let payableStatus = "pendente";

  if (totalPaidInCents >= totalAmountInCents) {
    payableStatus = "pago";
  } else if (totalPaidInCents > 0) {
    payableStatus = "parcial";
  }

  await payable.update(
    {
      status: payableStatus,
    },
    { transaction },
  );

  return payable;
}

/**
 * Registrar pagamento de uma parcela.
 */
const payInstallment = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { installmentId } = req.params;

    const { amount, paid_date, financial_account_id, payment_method, note } =
      req.body;

    const paidInCents = moneyToCents(amount);

    if (!Number.isFinite(paidInCents) || paidInCents <= 0) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "O valor do pagamento deve ser maior que zero.",
      });
    }

    if (!paid_date) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "A data do pagamento é obrigatória.",
      });
    }

    if (!financial_account_id) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "A conta financeira é obrigatória.",
      });
    }

    const allowedPaymentMethods = [
      "transferencia",
      "pix",
      "boleto",
      "dinheiro",
      "outro",
    ];

    const selectedPaymentMethod = payment_method || "transferencia";

    if (!allowedPaymentMethods.includes(selectedPaymentMethod)) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "Forma de pagamento inválida.",
      });
    }

    const installment = await PayableInstallment.findByPk(installmentId, {
      transaction,
    });

    if (!installment) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Parcela não encontrada.",
      });
    }

    const payable = await Payable.findByPk(installment.payable_id, {
      transaction,
    });

    if (!payable) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Conta a pagar não encontrada.",
      });
    }

    if (payable.status === "cancelado") {
      await rollbackTransaction(transaction);

      return res.status(409).json({
        error: "Não é possível pagar uma conta cancelada.",
      });
    }

    const financialAccount = await FinancialAccount.findByPk(
      financial_account_id,
      { transaction },
    );

    if (!financialAccount) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Conta financeira não encontrada.",
      });
    }

    if (financialAccount.active === false || financialAccount.active === 0) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "A conta financeira selecionada está inativa.",
      });
    }

    const confirmedPayments = await PayablePayment.findAll({
      where: {
        installment_id: installment.id,
        status: "confirmado",
      },
      transaction,
    });

    const alreadyPaidInCents = confirmedPayments.reduce(
      (total, payment) => total + moneyToCents(payment.amount),
      0,
    );

    const installmentInCents = moneyToCents(installment.amount);

    const remainingInCents = installmentInCents - alreadyPaidInCents;

    if (remainingInCents <= 0) {
      await rollbackTransaction(transaction);

      return res.status(409).json({
        error: "Esta parcela já está totalmente paga.",
      });
    }

    if (paidInCents > remainingInCents) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: `O valor ultrapassa o saldo da parcela. Saldo disponível: R$ ${(
          remainingInCents / 100
        )
          .toFixed(2)
          .replace(".", ",")}.`,
      });
    }

    const payment = await PayablePayment.create(
      {
        installment_id: installment.id,
        financial_account_id: Number(financial_account_id),
        amount: (paidInCents / 100).toFixed(2),
        paid_date,
        payment_method: selectedPaymentMethod,
        status: "confirmado",
        note: typeof note === "string" && note.trim() ? note.trim() : null,
        reversed_at: null,
        exported: false,
        exported_at: null,
        export_batch: null,
      },
      { transaction },
    );

    await recalculateInstallment(installment, transaction);

    await recalculatePayableStatus(payable.id, transaction);

    await transaction.commit();

    const updatedPayable = await Payable.findByPk(payable.id, {
      include: getPayableIncludes(),
    });

    return res.json({
      message: "Pagamento registrado com sucesso.",
      payment,
      payable: buildPayableData(updatedPayable),
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error("Erro ao registrar pagamento:", error);

    return res.status(500).json({
      error: "Erro ao registrar pagamento.",
      details: error.message,
    });
  }
};

/**
 * Estornar um pagamento específico.
 */
const reversePayablePayment = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { paymentId } = req.params;

    const payment = await PayablePayment.findByPk(paymentId, { transaction });

    if (!payment) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Pagamento não encontrado.",
      });
    }

    if (payment.status === "estornado") {
      await rollbackTransaction(transaction);

      return res.status(409).json({
        error: "Este pagamento já foi estornado.",
      });
    }

    const installment = await PayableInstallment.findByPk(
      payment.installment_id,
      { transaction },
    );

    if (!installment) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Parcela não encontrada.",
      });
    }

    await payment.update(
      {
        status: "estornado",
        reversed_at: new Date(),
      },
      { transaction },
    );

    await recalculateInstallment(installment, transaction);

    await recalculatePayableStatus(installment.payable_id, transaction);

    await transaction.commit();

    const updatedPayable = await Payable.findByPk(installment.payable_id, {
      include: getPayableIncludes(),
    });

    return res.json({
      message: "Pagamento estornado com sucesso.",
      payable: buildPayableData(updatedPayable),
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error("Erro ao estornar pagamento:", error);

    return res.status(500).json({
      error: "Erro ao estornar pagamento.",
      details: error.message,
    });
  }
};

module.exports = {
  createPayable,
  listPayables,
  getPayablesSummary,
  getPayableById,
  updatePayable,
  updatePayableStatus,
  deletePayable,
  payInstallment,
  reversePayablePayment,
};

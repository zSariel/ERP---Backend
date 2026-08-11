const { Op } = require("sequelize");

const sequelize = require("../config/database");

const Payable = require("../models/Payable");
const PayableInstallment = require(
  "../models/PayableInstallment"
);
const PayablePayment = require(
  "../models/PayablePayment"
);

const CostCenter = require("../models/CostCenter");
const Supplier = require("../models/Supplier");
const Category = require("../models/Category");
const FinancialAccount = require("../models/FinancialAccount");

/**
 * Adiciona meses a uma data sem causar problemas
 * em vencimentos como dia 29, 30 ou 31.
 */
function addMonthsToDate(dateString, monthsToAdd) {
  const [year, month, day] = dateString
    .split("-")
    .map(Number);

  const targetDate = new Date(
    Date.UTC(year, month - 1 + monthsToAdd, 1)
  );

  const lastDayOfTargetMonth = new Date(
    Date.UTC(
      targetDate.getUTCFullYear(),
      targetDate.getUTCMonth() + 1,
      0
    )
  ).getUTCDate();

  targetDate.setUTCDate(
    Math.min(day, lastDayOfTargetMonth)
  );

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

  const baseInstallmentInCents = Math.floor(
    totalInCents / installmentsCount
  );

  const remainingCents =
    totalInCents -
    baseInstallmentInCents * installmentsCount;

  const installments = [];
  const today = getToday();

  for (
    let installmentNumber = 1;
    installmentNumber <= installmentsCount;
    installmentNumber += 1
  ) {
    const isLastInstallment =
      installmentNumber === installmentsCount;

    const installmentInCents =
      baseInstallmentInCents +
      (isLastInstallment ? remainingCents : 0);

    const dueDate = addMonthsToDate(
      firstDueDate,
      installmentNumber - 1
    );

    let installmentStatus = status;

    if (
      status !== "cancelado" &&
      dueDate < today
    ) {
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
              attributes: [
                "id",
                "code",
                "name",
                "bank",
                "active",
              ],
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
  const data = payable.toJSON
    ? payable.toJSON()
    : payable;

  const installments = data.installments || [];

  const paidAmount = installments.reduce(
    (total, installment) =>
      total + Number(installment.paid_amount || 0),
    0
  );

  const totalAmount = Number(data.total_amount || 0);

  const overdueAmount = installments.reduce(
    (total, installment) => {
      if (
        installment.status === "atrasado" &&
        data.status !== "cancelado"
      ) {
        return (
          total +
          Math.max(
            Number(installment.amount || 0) -
              Number(installment.paid_amount || 0),
            0
          )
        );
      }

      return total;
    },
    0
  );

  return {
    ...data,
    paid_amount: paidAmount,
    remaining_amount: Math.max(
      totalAmount - paidAmount,
      0
    ),
    overdue_amount: overdueAmount,
    is_overdue: overdueAmount > 0,
  };
}

/**
 * Busca todas as parcelas de uma conta.
 */
async function getPayableInstallments(
  payableId,
  transaction
) {
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
async function getPaymentHistoryCount(
  payableId,
  transaction
) {
  const installments = await PayableInstallment.findAll({
    where: {
      payable_id: payableId,
    },
    attributes: ["id"],
    raw: true,
    transaction,
  });

  const installmentIds = installments.map(
    (installment) => installment.id
  );

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
  const costCenter = await CostCenter.findByPk(
    costCenterId,
    { transaction }
  );

  if (!costCenter) {
    return {
      status: 404,
      error: "Centro de custo não encontrado.",
    };
  }

  if (supplierId) {
    const supplier = await Supplier.findByPk(
      supplierId,
      { transaction }
    );

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

  const category = await Category.findByPk(
    categoryId,
    { transaction }
  );

  if (!category) {
    return {
      status: 404,
      error: "Categoria não encontrada.",
    };
  }

  if (category.type !== "despesa") {
    return {
      status: 400,
      error:
        "A categoria selecionada deve ser do tipo despesa.",
    };
  }

  if (
    category.active === false ||
    category.active === 0
  ) {
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
      installments_count,
      issue_date,
      competence_date,
      first_due_date,
      note,
    } = req.body;

    const costCenterId =
      cost_center_id || project_id;

    const installmentsCount = Number(
      installments_count || 1
    );

    const totalInCents = moneyToCents(total_amount);

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

    if (
      !Number.isFinite(totalInCents) ||
      totalInCents <= 0
    ) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "O valor total deve ser maior que zero.",
      });
    }

    if (
      !Number.isInteger(installmentsCount) ||
      installmentsCount < 1
    ) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error:
          "A quantidade de parcelas deve ser pelo menos 1.",
      });
    }

    if (!first_due_date) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "O primeiro vencimento é obrigatório.",
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

      return res
        .status(relationError.status)
        .json({
          error: relationError.error,
        });
    }

    const payable = await Payable.create(
      {
        code: null,
        description: description.trim(),
        supplier_id: supplier_id
          ? Number(supplier_id)
          : null,
        project_id: Number(costCenterId),
        category_id: Number(category_id),
        document_number:
          document_number?.trim() || null,
        history_code:
          history_code?.trim() || null,
        total_amount: (
          totalInCents / 100
        ).toFixed(2),
        installments_count: installmentsCount,
        issue_date: issue_date || null,
        competence_date:
          competence_date || null,
        first_due_date,
        status: "pendente",
        note: note?.trim() || null,
      },
      { transaction }
    );

    const code = generatePayableCode(payable.id);

    await payable.update(
      { code },
      { transaction }
    );

    const installments = createInstallmentsData({
      payableId: payable.id,
      totalAmount: totalInCents / 100,
      installmentsCount,
      firstDueDate: first_due_date,
    });

    await PayableInstallment.bulkCreate(
      installments,
      { transaction }
    );

    await transaction.commit();

    const createdPayable = await Payable.findByPk(
      payable.id,
      {
        include: getPayableIncludes(),
      }
    );

    return res.status(201).json({
      message: "Conta a pagar criada com sucesso.",
      payable: buildPayableData(createdPayable),
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error(
      "Erro ao criar conta a pagar:",
      error
    );

    return res.status(500).json({
      error: "Erro ao criar conta a pagar.",
      details: error.message,
    });
  }
};

/**
 * Listar contas a pagar com:
 * - paginação
 * - pesquisa
 * - filtros
 * - vencimentos por parcela
 * - somente vencidas
 */
const listPayables = async (req, res) => {
  try {
    const paginationRequested =
      req.query.page !== undefined ||
      req.query.limit !== undefined;

    // =====================================================
    // MODO ANTIGO
    // Mantém o frontend atual funcionando.
    // =====================================================
    if (!paginationRequested) {
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
    }

    // =====================================================
    // PARÂMETROS
    // =====================================================
    const {
      search,
      status,
      supplier_id,
      category_id,
      cost_center_id,
      due_from,
      due_to,
      overdue_only,
    } = req.query;

    const requestedPage = Number(req.query.page || 1);
    const requestedLimit = Number(req.query.limit || 25);

    const page =
      Number.isInteger(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1;

    const limit =
      Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 25;

    const offset = (page - 1) * limit;

    const overdueOnly = ["true", "1", "yes"].includes(
      String(overdue_only || "")
        .trim()
        .toLowerCase()
    );

    // =====================================================
    // FILTROS DA CONTA
    // =====================================================
    const where = {};

    if (search && String(search).trim()) {
      const searchValue = String(search).trim();

      where[Op.or] = [
        {
          code: {
            [Op.like]: `%${searchValue}%`,
          },
        },
        {
          description: {
            [Op.like]: `%${searchValue}%`,
          },
        },
        {
          document_number: {
            [Op.like]: `%${searchValue}%`,
          },
        },
        {
          history_code: {
            [Op.like]: `%${searchValue}%`,
          },
        },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (supplier_id) {
      where.supplier_id = Number(supplier_id);
    }

    if (category_id) {
      where.category_id = Number(category_id);
    }

    if (cost_center_id) {
      where.project_id = Number(cost_center_id);
    }

    // =====================================================
    // FILTROS DAS PARCELAS
    // =====================================================
    const installmentWhere = {};
    let needsInstallmentFilter = false;

    if (due_from) {
      installmentWhere.due_date = {
        ...(installmentWhere.due_date || {}),
        [Op.gte]: due_from,
      };
      needsInstallmentFilter = true;
    }

    if (due_to) {
      installmentWhere.due_date = {
        ...(installmentWhere.due_date || {}),
        [Op.lte]: due_to,
      };
      needsInstallmentFilter = true;
    }

    if (overdueOnly) {
      installmentWhere.due_date = {
        ...(installmentWhere.due_date || {}),
        [Op.lt]: getToday(),
      };

      installmentWhere.status = {
        [Op.notIn]: ["pago", "cancelado"],
      };

      installmentWhere.paid_amount = {
        [Op.lt]: sequelize.col("amount"),
      };

      needsInstallmentFilter = true;
    } else if (needsInstallmentFilter) {
      installmentWhere.status = {
        [Op.ne]: "cancelado",
      };
    }

    // =====================================================
    // CONTAS QUE POSSUEM PARCELAS COMPATÍVEIS
    // =====================================================
    if (needsInstallmentFilter) {
      const installmentRows =
        await PayableInstallment.findAll({
          attributes: ["payable_id"],
          where: installmentWhere,
          group: ["payable_id"],
          raw: true,
        });

      const installmentPayableIds = installmentRows.map(
        (item) => Number(item.payable_id)
      );

      if (installmentPayableIds.length === 0) {
        return res.json({
          data: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
            hasPreviousPage: false,
            hasNextPage: false,
          },
        });
      }

      where.id = {
        [Op.in]: installmentPayableIds,
      };
    }

    // =====================================================
    // TOTAL DE CONTAS COM OS FILTROS
    // =====================================================
    const total = await Payable.count({ where });

    // =====================================================
    // PEGAR SOMENTE OS IDs DA PÁGINA
    // =====================================================
    const payableIds = await Payable.findAll({
      attributes: ["id"],
      where,
      order: [["id", "DESC"]],
      limit,
      offset,
      raw: true,
    });

    const ids = payableIds.map((item) => Number(item.id));

    // =====================================================
    // BUSCAR DADOS COMPLETOS
    // =====================================================
    let payables = [];

    if (ids.length > 0) {
      payables = await Payable.findAll({
        where: {
          id: {
            [Op.in]: ids,
          },
        },
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
    }

    const data = payables.map(buildPayableData);
    const totalPages =
      total === 0 ? 0 : Math.ceil(total / limit);

    return res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages,
      },
    });
  } catch (error) {
    console.error(
      "Erro ao listar contas a pagar:",
      error
    );

    return res.status(500).json({
      error: "Erro ao listar contas a pagar.",
      details: error.message,
    });
  }
};

/**
 * Resumo financeiro das contas a pagar.
 *
 * GET /payables/summary
 *
 * Retorna os totais de todas as contas,
 * independentemente da paginação da tabela.
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
        })
      ) || 0;

    const paidAmount =
      Number(
        await PayableInstallment.sum(
          "paid_amount",
          {
            where: {
              status: {
                [Op.ne]: "cancelado",
              },
            },
          }
        )
      ) || 0;

    const remainingAmount = Math.max(
      totalAmount - paidAmount,
      0
    );

    const overdueInstallments =
      await PayableInstallment.count({
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
    console.error(
      "Erro ao gerar resumo das contas a pagar:",
      error
    );

    return res.status(500).json({
      error:
        "Erro ao gerar resumo das contas a pagar.",
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
    console.error(
      "Erro ao buscar conta a pagar:",
      error
    );

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
      installments_count,
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
      supplier_id === undefined
        ? payable.supplier_id
        : supplier_id || null;

    const newCategoryId =
      category_id === undefined
        ? payable.category_id
        : category_id;

    const newDocumentNumber =
      document_number === undefined
        ? payable.document_number
        : String(document_number).trim() || null;

    const newHistoryCode =
      history_code === undefined
        ? payable.history_code
        : String(history_code).trim() || null;

    const newTotalInCents =
      total_amount === undefined
        ? moneyToCents(payable.total_amount)
        : moneyToCents(total_amount);

    const newInstallmentsCount =
      installments_count === undefined
        ? Number(payable.installments_count)
        : Number(installments_count);

    const newIssueDate =
      issue_date === undefined
        ? payable.issue_date
        : issue_date || null;

    const newCompetenceDate =
      competence_date === undefined
        ? payable.competence_date
        : competence_date || null;

    const newFirstDueDate =
      first_due_date === undefined
        ? payable.first_due_date
        : first_due_date;

    const newNote =
      note === undefined
        ? payable.note
        : String(note).trim() || null;

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

    if (
      !Number.isFinite(newTotalInCents) ||
      newTotalInCents <= 0
    ) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "O valor total deve ser maior que zero.",
      });
    }

    if (
      !Number.isInteger(newInstallmentsCount) ||
      newInstallmentsCount < 1
    ) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error:
          "A quantidade de parcelas deve ser pelo menos 1.",
      });
    }

    if (!newFirstDueDate) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "O primeiro vencimento é obrigatório.",
      });
    }

    const installments = await getPayableInstallments(
      id,
      transaction
    );

    const totalPaidInCents = installments.reduce(
      (total, installment) =>
        total +
        moneyToCents(installment.paid_amount || 0),
      0
    );

    const currentTotalInCents = moneyToCents(
      payable.total_amount
    );

    const financialDataChanged =
      newTotalInCents !== currentTotalInCents ||
      newInstallmentsCount !==
        Number(payable.installments_count) ||
      newFirstDueDate !== payable.first_due_date;

    const paymentHistoryCount =
      await getPaymentHistoryCount(
        id,
        transaction
      );

    if (
      financialDataChanged &&
      paymentHistoryCount > 0
    ) {
      await rollbackTransaction(transaction);

      return res.status(409).json({
        error:
          "Não é possível alterar valor, parcelas ou vencimento porque esta conta possui histórico de pagamentos.",
      });
    }

    if (
      financialDataChanged &&
      totalPaidInCents > 0
    ) {
      await rollbackTransaction(transaction);

      return res.status(409).json({
        error:
          "Não é possível alterar valor, parcelas ou vencimento depois de registrar pagamentos.",
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

      return res
        .status(relationError.status)
        .json({
          error: relationError.error,
        });
    }

    await payable.update(
      {
        description: newDescription,
        supplier_id: newSupplierId
          ? Number(newSupplierId)
          : null,
        project_id: Number(newCostCenterId),
        category_id: Number(newCategoryId),
        document_number: newDocumentNumber,
        history_code: newHistoryCode,
        total_amount: (
          newTotalInCents / 100
        ).toFixed(2),
        installments_count:
          newInstallmentsCount,
        issue_date: newIssueDate,
        competence_date: newCompetenceDate,
        first_due_date: newFirstDueDate,
        note: newNote,
      },
      { transaction }
    );

    if (financialDataChanged) {
      await PayableInstallment.destroy({
        where: {
          payable_id: id,
        },
        transaction,
      });

      const installmentStatus =
        payable.status === "cancelado"
          ? "cancelado"
          : "pendente";

      const newInstallments =
        createInstallmentsData({
          payableId: payable.id,
          totalAmount: newTotalInCents / 100,
          installmentsCount:
            newInstallmentsCount,
          firstDueDate: newFirstDueDate,
          status: installmentStatus,
        });

      await PayableInstallment.bulkCreate(
        newInstallments,
        { transaction }
      );
    }

    await transaction.commit();

    const updatedPayable = await Payable.findByPk(
      id,
      {
        include: getPayableIncludes(),
      }
    );

    return res.json({
      message:
        "Conta a pagar atualizada com sucesso.",
      payable: buildPayableData(updatedPayable),
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error(
      "Erro ao atualizar conta a pagar:",
      error
    );

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

    const allowedStatuses = [
      "pendente",
      "cancelado",
    ];

    if (!allowedStatuses.includes(status)) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error:
          "O status manual deve ser pendente ou cancelado.",
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

    const installments = await getPayableInstallments(
      id,
      transaction
    );

    const totalPaidInCents = installments.reduce(
      (total, installment) =>
        total +
        moneyToCents(installment.paid_amount || 0),
      0
    );

    if (
      status === "cancelado" &&
      totalPaidInCents > 0
    ) {
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
        { transaction }
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
        }
      );
    }

    if (status === "pendente") {
      const today = getToday();

      for (const installment of installments) {
        const amountInCents = moneyToCents(
          installment.amount
        );

        const paidInCents = moneyToCents(
          installment.paid_amount || 0
        );

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
          { transaction }
        );
      }

      const totalAmountInCents = moneyToCents(
        payable.total_amount
      );

      let payableStatus = "pendente";

      if (
        totalPaidInCents >= totalAmountInCents
      ) {
        payableStatus = "pago";
      } else if (totalPaidInCents > 0) {
        payableStatus = "parcial";
      }

      await payable.update(
        {
          status: payableStatus,
        },
        { transaction }
      );
    }

    await transaction.commit();

    const updatedPayable = await Payable.findByPk(
      id,
      {
        include: getPayableIncludes(),
      }
    );

    return res.json({
      message: "Status atualizado com sucesso.",
      payable: buildPayableData(updatedPayable),
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error(
      "Erro ao atualizar status da conta a pagar:",
      error
    );

    return res.status(500).json({
      error:
        "Erro ao atualizar status da conta a pagar.",
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

    const paymentHistoryCount =
      await getPaymentHistoryCount(
        id,
        transaction
      );

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
      message:
        "Conta a pagar excluída com sucesso.",
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error(
      "Erro ao excluir conta a pagar:",
      error
    );

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
async function recalculateInstallment(
  installment,
  transaction
) {
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
    (total, payment) =>
      total + moneyToCents(payment.amount),
    0
  );

  const installmentInCents = moneyToCents(
    installment.amount
  );

  let installmentStatus = "pendente";

  if (paidInCents >= installmentInCents) {
    installmentStatus = "pago";
  } else if (paidInCents > 0) {
    installmentStatus = "parcial";
  } else if (installment.due_date < getToday()) {
    installmentStatus = "atrasado";
  }

  const lastPayment =
    payments.length > 0
      ? payments[payments.length - 1]
      : null;

  await installment.update(
    {
      paid_amount: (paidInCents / 100).toFixed(2),
      paid_date: lastPayment
        ? lastPayment.paid_date
        : null,
      status: installmentStatus,
    },
    { transaction }
  );

  return paidInCents;
}

/**
 * Recalcula o status geral da conta a pagar.
 */
async function recalculatePayableStatus(
  payableId,
  transaction
) {
  const payable = await Payable.findByPk(
    payableId,
    { transaction }
  );

  if (!payable) {
    return null;
  }

  const installments =
    await PayableInstallment.findAll({
      where: {
        payable_id: payableId,
      },
      transaction,
    });

  const totalPaidInCents = installments.reduce(
    (total, installment) =>
      total +
      moneyToCents(installment.paid_amount || 0),
    0
  );

  const totalAmountInCents = moneyToCents(
    payable.total_amount
  );

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
    { transaction }
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

    const {
      amount,
      paid_date,
      financial_account_id,
      payment_method,
      note,
    } = req.body;

    const paidInCents = moneyToCents(amount);

    if (
      !Number.isFinite(paidInCents) ||
      paidInCents <= 0
    ) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error:
          "O valor do pagamento deve ser maior que zero.",
      });
    }

    if (!paid_date) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error:
          "A data do pagamento é obrigatória.",
      });
    }

    if (!financial_account_id) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error:
          "A conta financeira é obrigatória.",
      });
    }

    const allowedPaymentMethods = [
      "transferencia",
      "pix",
      "boleto",
      "dinheiro",
      "outro",
    ];

    const selectedPaymentMethod =
      payment_method || "transferencia";

    if (
      !allowedPaymentMethods.includes(
        selectedPaymentMethod
      )
    ) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "Forma de pagamento inválida.",
      });
    }

    const installment =
      await PayableInstallment.findByPk(
        installmentId,
        { transaction }
      );

    if (!installment) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Parcela não encontrada.",
      });
    }

    const payable = await Payable.findByPk(
      installment.payable_id,
      { transaction }
    );

    if (!payable) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Conta a pagar não encontrada.",
      });
    }

    if (payable.status === "cancelado") {
      await rollbackTransaction(transaction);

      return res.status(409).json({
        error:
          "Não é possível pagar uma conta cancelada.",
      });
    }

    const financialAccount =
      await FinancialAccount.findByPk(
        financial_account_id,
        { transaction }
      );

    if (!financialAccount) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Conta financeira não encontrada.",
      });
    }

    if (
      financialAccount.active === false ||
      financialAccount.active === 0
    ) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error:
          "A conta financeira selecionada está inativa.",
      });
    }

    const confirmedPayments =
      await PayablePayment.findAll({
        where: {
          installment_id: installment.id,
          status: "confirmado",
        },
        transaction,
      });

    const alreadyPaidInCents =
      confirmedPayments.reduce(
        (total, payment) =>
          total + moneyToCents(payment.amount),
        0
      );

    const installmentInCents = moneyToCents(
      installment.amount
    );

    const remainingInCents =
      installmentInCents - alreadyPaidInCents;

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
        financial_account_id: Number(
          financial_account_id
        ),
        amount: (paidInCents / 100).toFixed(2),
        paid_date,
        payment_method:
          selectedPaymentMethod,
        status: "confirmado",
        note:
          typeof note === "string" &&
          note.trim()
            ? note.trim()
            : null,
        reversed_at: null,
        exported: false,
        exported_at: null,
        export_batch: null,
      },
      { transaction }
    );

    await recalculateInstallment(
      installment,
      transaction
    );

    await recalculatePayableStatus(
      payable.id,
      transaction
    );

    await transaction.commit();

    const updatedPayable =
      await Payable.findByPk(payable.id, {
        include: getPayableIncludes(),
      });

    return res.json({
      message:
        "Pagamento registrado com sucesso.",
      payment,
      payable: buildPayableData(
        updatedPayable
      ),
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error(
      "Erro ao registrar pagamento:",
      error
    );

    return res.status(500).json({
      error: "Erro ao registrar pagamento.",
      details: error.message,
    });
  }
};

/**
 * Estornar um pagamento específico.
 */
const reversePayablePayment = async (
  req,
  res
) => {
  const transaction = await sequelize.transaction();

  try {
    const { paymentId } = req.params;

    const payment = await PayablePayment.findByPk(
      paymentId,
      { transaction }
    );

    if (!payment) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Pagamento não encontrado.",
      });
    }

    if (payment.status === "estornado") {
      await rollbackTransaction(transaction);

      return res.status(409).json({
        error:
          "Este pagamento já foi estornado.",
      });
    }

    const installment =
      await PayableInstallment.findByPk(
        payment.installment_id,
        { transaction }
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
      { transaction }
    );

    await recalculateInstallment(
      installment,
      transaction
    );

    await recalculatePayableStatus(
      installment.payable_id,
      transaction
    );

    await transaction.commit();

    const updatedPayable =
      await Payable.findByPk(
        installment.payable_id,
        {
          include: getPayableIncludes(),
        }
      );

    return res.json({
      message:
        "Pagamento estornado com sucesso.",
      payable: buildPayableData(
        updatedPayable
      ),
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error(
      "Erro ao estornar pagamento:",
      error
    );

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
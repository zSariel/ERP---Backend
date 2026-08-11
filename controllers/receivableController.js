const sequelize = require("../config/database");
const { Op } = require("sequelize");

const Receivable = require("../models/Receivable");
const ReceivableInstallment = require("../models/ReceivableInstallment");
const ReceivablePayment = require("../models/ReceivablePayment");
const FinancialAccount = require("../models/FinancialAccount");
const CostCenter = require("../models/CostCenter");
const Client = require("../models/Client");
const Category = require("../models/Category");

function addMonthsToDate(dateString, monthsToAdd) {
  const [year, month, day] = dateString.split("-").map(Number);

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

function generateReceivableCode(id) {
  return `REC-${String(id).padStart(6, "0")}`;
}

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

function createInstallmentsData({
  receivableId,
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

    installments.push({
      receivable_id: receivableId,
      installment_number: installmentNumber,
      amount: (installmentInCents / 100).toFixed(2),
      received_amount: 0,
      due_date: addMonthsToDate(
        firstDueDate,
        installmentNumber - 1
      ),
      received_date: null,
      status,
    });
  }

  return installments;
}

function getReceivableIncludes() {
  return [
    {
      model: CostCenter,
      as: "cost_center",
    },
    {
      model: Client,
      as: "client",
    },
    {
      model: Category,
      as: "category",
    },
    {
      model: ReceivableInstallment,
      as: "installments",
      include: [
        {
          model: ReceivablePayment,
          as: "payments",
          required: false,
          include: [
            {
              model: FinancialAccount,
              as: "financial_account",
              attributes: [
                "id",
                "code",
                "name",
                "bank",
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


function normalizeIds(ids) {
  if (!Array.isArray(ids)) {
    return [];
  }

  return [
    ...new Set(
      ids
        .map((id) => Number(id))
        .filter(
          (id) => Number.isInteger(id) && id > 0
        )
    ),
  ];
}

function getInstallmentStatus(installment, today) {
  const amountInCents = moneyToCents(
    installment.amount
  );

  const receivedInCents = moneyToCents(
    installment.received_amount
  );

  if (receivedInCents >= amountInCents) {
    return "recebido";
  }

  if (receivedInCents > 0) {
    return "parcial";
  }

  if (installment.due_date < today) {
    return "atrasado";
  }

  return "pendente";
}

function getReceivableStatus(
  receivable,
  installments
) {
  const totalReceivedInCents = installments.reduce(
    (total, installment) =>
      total +
      moneyToCents(
        installment.received_amount || 0
      ),
    0
  );

  const totalAmountInCents = moneyToCents(
    receivable.total_amount
  );

  if (
    totalAmountInCents > 0 &&
    totalReceivedInCents >= totalAmountInCents
  ) {
    return "recebido";
  }

  if (totalReceivedInCents > 0) {
    return "parcial";
  }

  return "pendente";
}

function groupInstallmentsByReceivable(
  installments
) {
  return installments.reduce(
    (groups, installment) => {
      const key = Number(
        installment.receivable_id
      );

      if (!groups[key]) {
        groups[key] = [];
      }

      groups[key].push(installment);

      return groups;
    },
    {}
  );
}

async function findReceivablesForBulk(
  ids,
  transaction
) {
  const receivables = await Receivable.findAll({
    where: {
      id: {
        [Op.in]: ids,
      },
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (receivables.length !== ids.length) {
    const foundIds = new Set(
      receivables.map((item) => Number(item.id))
    );

    const missingIds = ids.filter(
      (id) => !foundIds.has(id)
    );

    const error = new Error(
      `Contas não encontradas: ${missingIds.join(
        ", "
      )}.`
    );

    error.statusCode = 404;
    throw error;
  }

  const installments =
    await ReceivableInstallment.findAll({
      where: {
        receivable_id: {
          [Op.in]: ids,
        },
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

  return {
    receivables,
    installments,
    installmentsByReceivable:
      groupInstallmentsByReceivable(
        installments
      ),
  };
}


/**
 * Criar conta a receber
 */
const createReceivable = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      description,
      cost_center_id,
      project_id,
      client_id,
      category_id,
      total_amount,
      installments_count,
      issue_date,
      first_due_date,
      note,
    } = req.body;

    const costCenterId = cost_center_id || project_id;
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

    const costCenter = await CostCenter.findByPk(
      costCenterId,
      { transaction }
    );

    if (!costCenter) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Centro de custo não encontrado.",
      });
    }

    if (client_id) {
      const client = await Client.findByPk(client_id, {
        transaction,
      });

      if (!client) {
        await rollbackTransaction(transaction);

        return res.status(404).json({
          error: "Cliente não encontrado.",
        });
      }
    }

    if (category_id) {
      const category = await Category.findByPk(
        category_id,
        { transaction }
      );

      if (!category) {
        await rollbackTransaction(transaction);

        return res.status(404).json({
          error: "Categoria não encontrada.",
        });
      }

      if (category.type !== "receita") {
        await rollbackTransaction(transaction);

        return res.status(400).json({
          error:
            "A categoria selecionada deve ser do tipo receita.",
        });
      }

      if (
        category.active === false ||
        category.active === 0
      ) {
        await rollbackTransaction(transaction);

        return res.status(400).json({
          error: "A categoria selecionada está inativa.",
        });
      }
    }

    const receivable = await Receivable.create(
      {
        code: null,
        description: description.trim(),
        project_id: Number(costCenterId),
        client_id: client_id
          ? Number(client_id)
          : null,
        category_id: category_id
          ? Number(category_id)
          : null,
        total_amount: (totalInCents / 100).toFixed(2),
        installments_count: installmentsCount,
        issue_date: issue_date || null,
        first_due_date,
        status: "pendente",
        note: note?.trim() || null,
      },
      { transaction }
    );

    const code = generateReceivableCode(receivable.id);

    await receivable.update(
      { code },
      { transaction }
    );

    const installments = createInstallmentsData({
      receivableId: receivable.id,
      totalAmount: totalInCents / 100,
      installmentsCount,
      firstDueDate: first_due_date,
    });

    await ReceivableInstallment.bulkCreate(
      installments,
      { transaction }
    );

    await transaction.commit();

    const createdReceivable =
      await Receivable.findByPk(receivable.id, {
        include: getReceivableIncludes(),
      });

    return res.status(201).json({
      message: "Conta a receber criada com sucesso.",
      receivable: createdReceivable,
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error(
      "Erro ao criar conta a receber:",
      error
    );

    return res.status(500).json({
      error: "Erro ao criar conta a receber.",
      details: error.message,
    });
  }
};

/**
 * Listar contas a receber.
 *
 * Sem parâmetros:
 * GET /receivables
 *
 * Mantém temporariamente o formato antigo.
 *
 * Com paginação:
 * GET /receivables?page=1&limit=25
 */
const listReceivables = async (req, res) => {
  try {
    const paginationRequested =
      req.query.page !== undefined ||
      req.query.limit !== undefined;

    const listIncludes = [
      {
        model: CostCenter,
        as: "cost_center",
        attributes: ["id", "code", "name"],
      },
      {
        model: Client,
        as: "client",
        attributes: ["id", "name"],
      },
      {
        model: Category,
        as: "category",
        attributes: ["id", "name", "type"],
      },
      {
        model: ReceivableInstallment,
        as: "installments",
        include: [
          {
            model: ReceivablePayment,
            as: "payments",
            required: false,
            include: [
              {
                model: FinancialAccount,
                as: "financial_account",
                attributes: [
                  "id",
                  "code",
                  "name",
                  "bank",
                ],
              },
            ],
          },
        ],
      },
    ];

    function buildReceivableData(receivable) {
      const data = receivable.toJSON
        ? receivable.toJSON()
        : receivable;

      const receivedAmount = (
        data.installments || []
      ).reduce(
        (total, installment) =>
          total +
          Number(
            installment.received_amount || 0
          ),
        0
      );

      const totalAmount = Number(
        data.total_amount || 0
      );

      return {
        ...data,
        received_amount: receivedAmount,
        remaining_amount: Math.max(
          totalAmount - receivedAmount,
          0
        ),
      };
    }

    // =====================================================
    // MODO ANTIGO
    // Mantém compatibilidade enquanto o frontend antigo
    // ainda chama GET /receivables sem paginação.
    // =====================================================

    if (!paginationRequested) {
      const receivables = await Receivable.findAll({
        include: listIncludes,
        order: [
          ["id", "DESC"],
          [
            {
              model: ReceivableInstallment,
              as: "installments",
            },
            "installment_number",
            "ASC",
          ],
        ],
      });

      return res.json(
        receivables.map(buildReceivableData)
      );
    }

    // =====================================================
    // PAGINAÇÃO
    // =====================================================

    const requestedPage = Number(
      req.query.page || 1
    );

    const requestedLimit = Number(
      req.query.limit || 25
    );

    const page =
      Number.isInteger(requestedPage) &&
      requestedPage > 0
        ? requestedPage
        : 1;

    const limit =
      Number.isInteger(requestedLimit) &&
      requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 25;

    const offset = (page - 1) * limit;

    // =====================================================
    // FILTROS DA CONTA
    // =====================================================

    const where = {};

    const search = String(
      req.query.search || ""
    ).trim();

    if (req.query.status) {
      where.status = req.query.status;
    }

    if (req.query.cost_center_id) {
      where.project_id = Number(
        req.query.cost_center_id
      );
    }

    if (req.query.client_id) {
      where.client_id = Number(
        req.query.client_id
      );
    }

    if (req.query.category_id) {
      where.category_id = Number(
        req.query.category_id
      );
    }

    // =====================================================
    // PESQUISA
    // Código/descrição + nomes relacionados.
    // Fazemos buscas auxiliares para manter a paginação
    // por IDs sem duplicação causada pelos JOINs.
    // =====================================================

    if (search) {
      const likeSearch = `%${search}%`;

      const [
        matchingCostCenters,
        matchingClients,
        matchingCategories,
      ] = await Promise.all([
        CostCenter.findAll({
          attributes: ["id"],
          where: {
            [Op.or]: [
              { code: { [Op.like]: likeSearch } },
              { name: { [Op.like]: likeSearch } },
            ],
          },
          raw: true,
        }),
        Client.findAll({
          attributes: ["id"],
          where: {
            name: { [Op.like]: likeSearch },
          },
          raw: true,
        }),
        Category.findAll({
          attributes: ["id"],
          where: {
            name: { [Op.like]: likeSearch },
          },
          raw: true,
        }),
      ]);

      const costCenterIds = matchingCostCenters.map(
        (item) => Number(item.id)
      );

      const clientIds = matchingClients.map(
        (item) => Number(item.id)
      );

      const categoryIds = matchingCategories.map(
        (item) => Number(item.id)
      );

      const searchConditions = [
        {
          code: {
            [Op.like]: likeSearch,
          },
        },
        {
          description: {
            [Op.like]: likeSearch,
          },
        },
      ];

      if (costCenterIds.length > 0) {
        searchConditions.push({
          project_id: {
            [Op.in]: costCenterIds,
          },
        });
      }

      if (clientIds.length > 0) {
        searchConditions.push({
          client_id: {
            [Op.in]: clientIds,
          },
        });
      }

      if (categoryIds.length > 0) {
        searchConditions.push({
          category_id: {
            [Op.in]: categoryIds,
          },
        });
      }

      where[Op.or] = searchConditions;
    }

    // =====================================================
    // FILTROS DE VENCIMENTO / SOMENTE VENCIDAS
    // =====================================================

    const dueFrom = String(
      req.query.due_from || ""
    ).trim();

    const dueTo = String(
      req.query.due_to || ""
    ).trim();

    const overdueOnly = [
      true,
      "true",
      1,
      "1",
    ].includes(req.query.overdue_only);

    if (dueFrom || dueTo || overdueOnly) {
      const installmentWhere = {};

      if (dueFrom || dueTo) {
        installmentWhere.due_date = {};

        if (dueFrom) {
          installmentWhere.due_date[Op.gte] = dueFrom;
        }

        if (dueTo) {
          installmentWhere.due_date[Op.lte] = dueTo;
        }

        installmentWhere.status = {
          [Op.ne]: "cancelado",
        };
      }

      if (overdueOnly) {
        const today = new Date()
          .toISOString()
          .slice(0, 10);

        installmentWhere.due_date = {
          ...(installmentWhere.due_date || {}),
          [Op.lt]: today,
        };

        installmentWhere.status = {
          [Op.notIn]: [
            "recebido",
            "cancelado",
          ],
        };

        installmentWhere.received_amount = {
          [Op.lt]: sequelize.col("amount"),
        };
      }

      const matchingInstallments =
        await ReceivableInstallment.findAll({
          attributes: ["receivable_id"],
          where: installmentWhere,
          group: ["receivable_id"],
          raw: true,
        });

      const matchingReceivableIds =
        matchingInstallments.map(
          (item) => Number(item.receivable_id)
        );

      where.id = {
        [Op.in]: matchingReceivableIds,
      };
    }

    // =====================================================
    // TOTAL FILTRADO
    // =====================================================

    const total = await Receivable.count({
      where,
    });

    // =====================================================
    // BUSCA SOMENTE OS IDs DA PÁGINA
    // =====================================================

    const receivableIds = await Receivable.findAll({
      attributes: ["id"],
      where,
      order: [["id", "DESC"]],
      limit,
      offset,
      raw: true,
    });

    const ids = receivableIds.map(
      (item) => Number(item.id)
    );

    // =====================================================
    // BUSCA OS DADOS COMPLETOS DA PÁGINA
    // =====================================================

    let receivables = [];

    if (ids.length > 0) {
      receivables = await Receivable.findAll({
        where: {
          id: {
            [Op.in]: ids,
          },
        },
        include: listIncludes,
        order: [
          ["id", "DESC"],
          [
            {
              model: ReceivableInstallment,
              as: "installments",
            },
            "installment_number",
            "ASC",
          ],
        ],
      });
    }

    const data = receivables.map(
      buildReceivableData
    );

    const totalPages =
      total === 0
        ? 0
        : Math.ceil(total / limit);

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
      "Erro ao listar contas a receber:",
      error
    );

    return res.status(500).json({
      error: "Erro ao listar contas a receber.",
      details: error.message,
    });
  }
};

/**
 * Resumo financeiro das contas a receber.
 *
 * GET /receivables/summary
 *
 * Retorna os totais gerais independentemente da paginação.
 */
const getReceivablesSummary = async (req, res) => {
  try {
    const today = new Date()
      .toISOString()
      .slice(0, 10);

    // =====================================================
    // VALOR TOTAL LANÇADO
    // Ignora contas canceladas.
    // =====================================================

    const totalAmount =
      Number(
        await Receivable.sum("total_amount", {
          where: {
            status: {
              [Op.ne]: "cancelado",
            },
          },
        })
      ) || 0;

    // =====================================================
    // VALOR TOTAL RECEBIDO
    // Parcelas canceladas não entram no cálculo.
    // =====================================================

    const receivedAmount =
      Number(
        await ReceivableInstallment.sum(
          "received_amount",
          {
            where: {
              status: {
                [Op.ne]: "cancelado",
              },
            },
          }
        )
      ) || 0;

    // =====================================================
    // SALDO TOTAL A RECEBER
    // =====================================================

    const remainingAmount = Math.max(
      totalAmount - receivedAmount,
      0
    );

    // =====================================================
    // QUANTIDADE DE PARCELAS VENCIDAS
    // =====================================================

    const overdueInstallments =
      await ReceivableInstallment.count({
        where: {
          due_date: {
            [Op.lt]: today,
          },
          status: {
            [Op.notIn]: [
              "recebido",
              "cancelado",
            ],
          },
          received_amount: {
            [Op.lt]: sequelize.col("amount"),
          },
        },
      });

    return res.json({
      total_amount: totalAmount,
      received_amount: receivedAmount,
      remaining_amount: remainingAmount,
      overdue_installments:
        overdueInstallments,
    });
  } catch (error) {
    console.error(
      "Erro ao gerar resumo das contas a receber:",
      error
    );

    return res.status(500).json({
      error:
        "Erro ao gerar resumo das contas a receber.",
      details: error.message,
    });
  }
};

/**
 * Buscar conta pelo ID
 */
const getReceivableById = async (req, res) => {
  try {
    const { id } = req.params;

    const receivable = await Receivable.findByPk(id, {
      include: getReceivableIncludes(),
      order: [
        [
          {
            model: ReceivableInstallment,
            as: "installments",
          },
          "installment_number",
          "ASC",
        ],
      ],
    });

    if (!receivable) {
      return res.status(404).json({
        error: "Conta a receber não encontrada.",
      });
    }

    return res.json(receivable);
  } catch (error) {
    console.error(
      "Erro ao buscar conta a receber:",
      error
    );

    return res.status(500).json({
      error: "Erro ao buscar conta a receber.",
      details: error.message,
    });
  }
};

/**
 * Editar conta a receber
 */
const updateReceivable = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;

    const receivable = await Receivable.findByPk(id, {
      transaction,
    });

    if (!receivable) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Conta a receber não encontrada.",
      });
    }

    const {
      description,
      cost_center_id,
      project_id,
      client_id,
      category_id,
      total_amount,
      installments_count,
      issue_date,
      first_due_date,
      note,
    } = req.body;

    const newDescription =
      description === undefined
        ? receivable.description
        : String(description).trim();

    const newCostCenterId =
      cost_center_id !== undefined
        ? cost_center_id
        : project_id !== undefined
          ? project_id
          : receivable.project_id;

    const newClientId =
      client_id === undefined
        ? receivable.client_id
        : client_id || null;

    const newCategoryId =
      category_id === undefined
        ? receivable.category_id
        : category_id || null;

    const newTotalInCents =
      total_amount === undefined
        ? moneyToCents(receivable.total_amount)
        : moneyToCents(total_amount);

    const newInstallmentsCount =
      installments_count === undefined
        ? Number(receivable.installments_count)
        : Number(installments_count);

    const newIssueDate =
      issue_date === undefined
        ? receivable.issue_date
        : issue_date || null;

    const newFirstDueDate =
      first_due_date === undefined
        ? receivable.first_due_date
        : first_due_date;

    const newNote =
      note === undefined
        ? receivable.note
        : note?.trim() || null;

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

    const currentTotalInCents = moneyToCents(
      receivable.total_amount
    );

    const financialDataChanged =
      newTotalInCents !== currentTotalInCents ||
      newInstallmentsCount !==
        Number(receivable.installments_count) ||
      newFirstDueDate !== receivable.first_due_date;

    const totalReceived =
      Number(
        await ReceivableInstallment.sum(
          "received_amount",
          {
            where: {
              receivable_id: id,
            },
            transaction,
          }
        )
      ) || 0;

    if (financialDataChanged && totalReceived > 0) {
      await rollbackTransaction(transaction);

      return res.status(409).json({
        error:
          "Não é possível alterar o valor, as parcelas ou o vencimento depois de registrar recebimentos.",
      });
    }

    const costCenter = await CostCenter.findByPk(
      newCostCenterId,
      { transaction }
    );

    if (!costCenter) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Centro de custo não encontrado.",
      });
    }

    if (newClientId) {
      const client = await Client.findByPk(
        newClientId,
        { transaction }
      );

      if (!client) {
        await rollbackTransaction(transaction);

        return res.status(404).json({
          error: "Cliente não encontrado.",
        });
      }
    }

    if (newCategoryId) {
      const category = await Category.findByPk(
        newCategoryId,
        { transaction }
      );

      if (!category) {
        await rollbackTransaction(transaction);

        return res.status(404).json({
          error: "Categoria não encontrada.",
        });
      }

      if (category.type !== "receita") {
        await rollbackTransaction(transaction);

        return res.status(400).json({
          error:
            "A categoria selecionada deve ser do tipo receita.",
        });
      }

      if (
        category.active === false ||
        category.active === 0
      ) {
        await rollbackTransaction(transaction);

        return res.status(400).json({
          error: "A categoria selecionada está inativa.",
        });
      }
    }

    await receivable.update(
      {
        description: newDescription,
        project_id: Number(newCostCenterId),
        client_id: newClientId
          ? Number(newClientId)
          : null,
        category_id: newCategoryId
          ? Number(newCategoryId)
          : null,
        total_amount: (
          newTotalInCents / 100
        ).toFixed(2),
        installments_count: newInstallmentsCount,
        issue_date: newIssueDate,
        first_due_date: newFirstDueDate,
        note: newNote,
      },
      { transaction }
    );

    if (financialDataChanged) {
      await ReceivableInstallment.destroy({
        where: {
          receivable_id: id,
        },
        transaction,
      });

      const installmentStatus =
        receivable.status === "cancelado"
          ? "cancelado"
          : "pendente";

      const installments = createInstallmentsData({
        receivableId: receivable.id,
        totalAmount: newTotalInCents / 100,
        installmentsCount: newInstallmentsCount,
        firstDueDate: newFirstDueDate,
        status: installmentStatus,
      });

      await ReceivableInstallment.bulkCreate(
        installments,
        { transaction }
      );
    }

    await transaction.commit();

    const updatedReceivable =
      await Receivable.findByPk(id, {
        include: getReceivableIncludes(),
      });

    return res.json({
      message:
        "Conta a receber atualizada com sucesso.",
      receivable: updatedReceivable,
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error(
      "Erro ao atualizar conta a receber:",
      error
    );

    return res.status(500).json({
      error: "Erro ao atualizar conta a receber.",
      details: error.message,
    });
  }
};

/**
 * Cancelar ou reativar conta
 */
const updateReceivableStatus = async (req, res) => {
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

    const receivable = await Receivable.findByPk(id, {
      transaction,
    });

    if (!receivable) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Conta a receber não encontrada.",
      });
    }

    const installments =
      await ReceivableInstallment.findAll({
        where: {
          receivable_id: id,
        },
        transaction,
      });

    const totalReceived = installments.reduce(
      (total, installment) =>
        total +
        Number(installment.received_amount || 0),
      0
    );

    if (status === "cancelado" && totalReceived > 0) {
      await rollbackTransaction(transaction);

      return res.status(409).json({
        error:
          "Não é possível cancelar uma conta que já possui recebimentos.",
      });
    }

    if (status === "cancelado") {
      await receivable.update(
        {
          status: "cancelado",
        },
        { transaction }
      );

      await ReceivableInstallment.update(
        {
          status: "cancelado",
        },
        {
          where: {
            receivable_id: id,
          },
          transaction,
        }
      );
    }

    if (status === "pendente") {
      const today = new Date()
        .toISOString()
        .slice(0, 10);

      for (const installment of installments) {
        const amount = Number(
          installment.amount || 0
        );

        const receivedAmount = Number(
          installment.received_amount || 0
        );

        let installmentStatus = "pendente";

        if (receivedAmount >= amount) {
          installmentStatus = "recebido";
        } else if (receivedAmount > 0) {
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

      const totalAmount = Number(
        receivable.total_amount || 0
      );

      let receivableStatus = "pendente";

      if (totalReceived >= totalAmount) {
        receivableStatus = "recebido";
      } else if (totalReceived > 0) {
        receivableStatus = "parcial";
      }

      await receivable.update(
        {
          status: receivableStatus,
        },
        { transaction }
      );
    }

    await transaction.commit();

    const updatedReceivable =
      await Receivable.findByPk(id, {
        include: getReceivableIncludes(),
      });

    return res.json({
      message: "Status atualizado com sucesso.",
      receivable: updatedReceivable,
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error(
      "Erro ao atualizar status:",
      error
    );

    return res.status(500).json({
      error: "Erro ao atualizar status.",
      details: error.message,
    });
  }
};

/**
 * Excluir conta
 */
const deleteReceivable = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;

    const receivable = await Receivable.findByPk(id, {
      transaction,
    });

    if (!receivable) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Conta a receber não encontrada.",
      });
    }

    const totalReceived =
      Number(
        await ReceivableInstallment.sum(
          "received_amount",
          {
            where: {
              receivable_id: id,
            },
            transaction,
          }
        )
      ) || 0;

    if (totalReceived > 0) {
      await rollbackTransaction(transaction);

      return res.status(409).json({
        error:
          "Não é possível excluir uma conta que já possui recebimentos.",
      });
    }

    await ReceivableInstallment.destroy({
      where: {
        receivable_id: id,
      },
      transaction,
    });

    await receivable.destroy({ transaction });

    await transaction.commit();

    return res.json({
      message:
        "Conta a receber excluída com sucesso.",
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error(
      "Erro ao excluir conta a receber:",
      error
    );

    return res.status(500).json({
      error: "Erro ao excluir conta a receber.",
      details: error.message,
    });
  }
};

const receiveInstallment = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { installmentId } = req.params;
    const {
      amount,
      received_date,
      financial_account_id,
      note,
    } = req.body;

    const receivedInCents = moneyToCents(amount);

    if (
      !Number.isFinite(receivedInCents) ||
      receivedInCents <= 0
    ) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "O valor recebido deve ser maior que zero.",
      });
    }

    if (!received_date) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "A data do recebimento é obrigatória.",
      });
    }

    if (!financial_account_id) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error:
          "Selecione a conta financeira de destino.",
      });
    }

    const financialAccount =
      await FinancialAccount.findByPk(
        financial_account_id,
        {
          transaction,
        }
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

      return res.status(409).json({
        error:
          "A conta financeira selecionada está inativa.",
      });
    }

    const installment =
      await ReceivableInstallment.findByPk(
        installmentId,
        {
          transaction,
        }
      );

    if (!installment) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Parcela não encontrada.",
      });
    }

    const receivable = await Receivable.findByPk(
      installment.receivable_id,
      {
        transaction,
      }
    );

    if (!receivable) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Conta a receber não encontrada.",
      });
    }

    if (receivable.status === "cancelado") {
      await rollbackTransaction(transaction);

      return res.status(409).json({
        error:
          "Não é possível receber uma conta cancelada.",
      });
    }

    const installmentInCents = moneyToCents(
      installment.amount
    );

    const alreadyReceivedInCents = moneyToCents(
      installment.received_amount
    );

    const newReceivedInCents =
      alreadyReceivedInCents + receivedInCents;

    if (newReceivedInCents > installmentInCents) {
      await rollbackTransaction(transaction);

      const remainingInCents =
        installmentInCents -
        alreadyReceivedInCents;

      return res.status(400).json({
        error: `O valor ultrapassa o saldo da parcela. Saldo disponível: R$ ${(
          remainingInCents / 100
        )
          .toFixed(2)
          .replace(".", ",")}.`,
      });
    }

    await ReceivablePayment.create(
      {
        installment_id: installment.id,
        financial_account_id: Number(
          financial_account_id
        ),
        amount: (
          receivedInCents / 100
        ).toFixed(2),
        received_date,
        payment_method: "transferencia",
        status: "confirmado",
        note: note?.trim() || null,
      },
      {
        transaction,
      }
    );

    const installmentStatus =
      newReceivedInCents >= installmentInCents
        ? "recebido"
        : "parcial";

    await installment.update(
      {
        received_amount: (
          newReceivedInCents / 100
        ).toFixed(2),
        received_date,
        status: installmentStatus,
      },
      {
        transaction,
      }
    );

    const installments =
      await ReceivableInstallment.findAll({
        where: {
          receivable_id: receivable.id,
        },
        transaction,
      });

    const totalReceivedInCents = installments.reduce(
      (total, currentInstallment) =>
        total +
        moneyToCents(
          currentInstallment.received_amount
        ),
      0
    );

    const receivableTotalInCents = moneyToCents(
      receivable.total_amount
    );

    let receivableStatus = "pendente";

    if (
      totalReceivedInCents >=
      receivableTotalInCents
    ) {
      receivableStatus = "recebido";
    } else if (totalReceivedInCents > 0) {
      receivableStatus = "parcial";
    }

    await receivable.update(
      {
        status: receivableStatus,
      },
      {
        transaction,
      }
    );

    await transaction.commit();

    const updatedReceivable =
      await Receivable.findByPk(receivable.id, {
        include: getReceivableIncludes(),
      });

    return res.json({
      message: "Recebimento registrado com sucesso.",
      receivable: updatedReceivable,
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error(
      "Erro ao registrar recebimento:",
      error
    );

    return res.status(500).json({
      error: "Erro ao registrar recebimento.",
      details: error.message,
    });
  }
};

const reverseInstallmentReceipt = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { installmentId } = req.params;

    const installment =
      await ReceivableInstallment.findByPk(
        installmentId,
        { transaction }
      );

    if (!installment) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Parcela não encontrada.",
      });
    }

    const currentReceived = Number(
      installment.received_amount || 0
    );

    if (currentReceived <= 0) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error: "Esta parcela não possui recebimento para estornar.",
      });
    }

    const receivable = await Receivable.findByPk(
      installment.receivable_id,
      { transaction }
    );

    if (!receivable) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Conta a receber não encontrada.",
      });
    }

    const today = new Date()
      .toISOString()
      .slice(0, 10);

    const installmentStatus =
      installment.due_date < today
        ? "atrasado"
        : "pendente";

    await ReceivablePayment.update(
      {
        status: "estornado",
        reversed_at: new Date(),
      },
      {
        where: {
          installment_id: installment.id,
          status: "confirmado",
        },
        transaction,
      }
    );

    await installment.update(
      {
        received_amount: 0,
        received_date: null,
        status: installmentStatus,
      },
      { transaction }
    );

    const installments =
      await ReceivableInstallment.findAll({
        where: {
          receivable_id: receivable.id,
        },
        transaction,
      });

    const totalReceived = installments.reduce(
      (total, currentInstallment) =>
        total +
        Number(
          currentInstallment.received_amount || 0
        ),
      0
    );

    const totalAmount = Number(
      receivable.total_amount || 0
    );

    let receivableStatus = "pendente";

    if (totalReceived >= totalAmount) {
      receivableStatus = "recebido";
    } else if (totalReceived > 0) {
      receivableStatus = "parcial";
    }

    await receivable.update(
      {
        status: receivableStatus,
      },
      { transaction }
    );

    await transaction.commit();

    const updatedReceivable =
      await Receivable.findByPk(receivable.id, {
        include: getReceivableIncludes(),
      });

    return res.json({
      message: "Recebimento estornado com sucesso.",
      receivable: updatedReceivable,
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error(
      "Erro ao estornar recebimento:",
      error
    );

    return res.status(500).json({
      error: "Erro ao estornar recebimento.",
      details: error.message,
    });
  }
};


/**
 * Cancelar ou reativar várias contas.
 */
const bulkUpdateReceivableStatus = async (
  req,
  res
) => {
  const transaction = await sequelize.transaction();

  try {
    const ids = normalizeIds(req.body.ids);
    const { status } = req.body;

    if (ids.length === 0) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error:
          "Selecione pelo menos uma conta a receber.",
      });
    }

    if (
      !["pendente", "cancelado"].includes(
        status
      )
    ) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error:
          "O status em lote deve ser pendente ou cancelado.",
      });
    }

    const {
      receivables,
      installments,
      installmentsByReceivable,
    } = await findReceivablesForBulk(
      ids,
      transaction
    );

    if (status === "cancelado") {
      const blockedReceivables =
        receivables.filter((receivable) => {
          const currentInstallments =
            installmentsByReceivable[
              receivable.id
            ] || [];

          return currentInstallments.some(
            (installment) =>
              moneyToCents(
                installment.received_amount || 0
              ) > 0
          );
        });

      if (blockedReceivables.length > 0) {
        await rollbackTransaction(transaction);

        return res.status(409).json({
          error:
            "Não é possível cancelar contas que possuem recebimentos.",
          blocked: blockedReceivables.map(
            (item) => ({
              id: item.id,
              code: item.code,
            })
          ),
        });
      }

      await Receivable.update(
        {
          status: "cancelado",
        },
        {
          where: {
            id: {
              [Op.in]: ids,
            },
          },
          transaction,
        }
      );

      await ReceivableInstallment.update(
        {
          status: "cancelado",
        },
        {
          where: {
            receivable_id: {
              [Op.in]: ids,
            },
          },
          transaction,
        }
      );
    } else {
      const today = new Date()
        .toISOString()
        .slice(0, 10);

      for (const receivable of receivables) {
        const currentInstallments =
          installmentsByReceivable[
            receivable.id
          ] || [];

        for (const installment of currentInstallments) {
          await installment.update(
            {
              status: getInstallmentStatus(
                installment,
                today
              ),
            },
            {
              transaction,
            }
          );
        }

        await receivable.update(
          {
            status: getReceivableStatus(
              receivable,
              currentInstallments
            ),
          },
          {
            transaction,
          }
        );
      }
    }

    await transaction.commit();

    return res.json({
      message:
        status === "cancelado"
          ? `${ids.length} conta(s) cancelada(s) com sucesso.`
          : `${ids.length} conta(s) reativada(s) com sucesso.`,
      affected_count: ids.length,
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error(
      "Erro ao atualizar contas em lote:",
      error
    );

    return res
      .status(error.statusCode || 500)
      .json({
        error:
          error.statusCode === 404
            ? error.message
            : "Erro ao atualizar contas em lote.",
        details: error.message,
      });
  }
};

/**
 * Receber o saldo restante de várias contas.
 */
const bulkReceiveReceivables = async (
  req,
  res
) => {
  const transaction = await sequelize.transaction();

  try {
    const ids = normalizeIds(req.body.ids);
    const {
      received_date,
      financial_account_id,
      note,
    } = req.body;

    if (ids.length === 0) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error:
          "Selecione pelo menos uma conta a receber.",
      });
    }

    if (
      !received_date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(
        received_date
      )
    ) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error:
          "Informe uma data de recebimento válida.",
      });
    }

    if (!financial_account_id) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error:
          "Selecione a conta financeira de destino.",
      });
    }

    const financialAccount =
      await FinancialAccount.findByPk(
        financial_account_id,
        {
          transaction,
        }
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

      return res.status(409).json({
        error:
          "A conta financeira selecionada está inativa.",
      });
    }

    const {
      receivables,
      installmentsByReceivable,
    } = await findReceivablesForBulk(
      ids,
      transaction
    );

    const cancelledReceivables =
      receivables.filter(
        (item) => item.status === "cancelado"
      );

    if (cancelledReceivables.length > 0) {
      await rollbackTransaction(transaction);

      return res.status(409).json({
        error:
          "Reative as contas canceladas antes de registrar o recebimento.",
        blocked: cancelledReceivables.map(
          (item) => ({
            id: item.id,
            code: item.code,
          })
        ),
      });
    }

    let totalReceivedInCents = 0;
    let affectedInstallments = 0;
    let affectedReceivables = 0;

    for (const receivable of receivables) {
      const currentInstallments =
        installmentsByReceivable[
          receivable.id
        ] || [];

      let receivableChanged = false;

      for (const installment of currentInstallments) {
        const amountInCents = moneyToCents(
          installment.amount
        );

        const receivedInCents = moneyToCents(
          installment.received_amount || 0
        );

        const remainingInCents = Math.max(
          amountInCents - receivedInCents,
          0
        );

        if (remainingInCents <= 0) {
          continue;
        }

        await ReceivablePayment.create(
          {
            installment_id: installment.id,
            financial_account_id: Number(
              financial_account_id
            ),
            amount: (
              remainingInCents / 100
            ).toFixed(2),
            received_date,
            payment_method: "transferencia",
            status: "confirmado",
            note: note?.trim() || null,
          },
          {
            transaction,
          }
        );

        await installment.update(
          {
            received_amount: (
              amountInCents / 100
            ).toFixed(2),
            received_date,
            status: "recebido",
          },
          {
            transaction,
          }
        );

        totalReceivedInCents +=
          remainingInCents;

        affectedInstallments += 1;
        receivableChanged = true;
      }

      if (receivableChanged) {
        await receivable.update(
          {
            status: "recebido",
          },
          {
            transaction,
          }
        );

        affectedReceivables += 1;
      }
    }

    await transaction.commit();

    return res.json({
      message:
        "Recebimentos em lote registrados com sucesso.",
      affected_receivables:
        affectedReceivables,
      affected_installments:
        affectedInstallments,
      received_amount: (
        totalReceivedInCents / 100
      ).toFixed(2),
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error(
      "Erro ao receber contas em lote:",
      error
    );

    return res
      .status(error.statusCode || 500)
      .json({
        error:
          error.statusCode === 404
            ? error.message
            : "Erro ao receber contas em lote.",
        details: error.message,
      });
  }
};

/**
 * Excluir várias contas e suas parcelas.
 */
const bulkDeleteReceivables = async (
  req,
  res
) => {
  const transaction = await sequelize.transaction();

  try {
    const ids = normalizeIds(req.body.ids);

    if (ids.length === 0) {
      await rollbackTransaction(transaction);

      return res.status(400).json({
        error:
          "Selecione pelo menos uma conta a receber.",
      });
    }

    const {
      receivables,
      installmentsByReceivable,
    } = await findReceivablesForBulk(
      ids,
      transaction
    );

    const blockedReceivables =
      receivables.filter((receivable) => {
        const currentInstallments =
          installmentsByReceivable[
            receivable.id
          ] || [];

        return currentInstallments.some(
          (installment) =>
            moneyToCents(
              installment.received_amount || 0
            ) > 0
        );
      });

    if (blockedReceivables.length > 0) {
      await rollbackTransaction(transaction);

      return res.status(409).json({
        error:
          "Estorne os recebimentos antes de excluir as contas selecionadas.",
        blocked: blockedReceivables.map(
          (item) => ({
            id: item.id,
            code: item.code,
          })
        ),
      });
    }

    await ReceivableInstallment.destroy({
      where: {
        receivable_id: {
          [Op.in]: ids,
        },
      },
      transaction,
    });

    await Receivable.destroy({
      where: {
        id: {
          [Op.in]: ids,
        },
      },
      transaction,
    });

    await transaction.commit();

    return res.json({
      message: `${ids.length} conta(s) e suas parcelas foram excluídas.`,
      deleted_count: ids.length,
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error(
      "Erro ao excluir contas em lote:",
      error
    );

    return res
      .status(error.statusCode || 500)
      .json({
        error:
          error.statusCode === 404
            ? error.message
            : "Erro ao excluir contas em lote.",
        details: error.message,
      });
  }
};

const reverseReceivablePayment = async (
  req,
  res
) => {
  const transaction = await sequelize.transaction();

  try {
    const { paymentId } = req.params;

    const payment = await ReceivablePayment.findByPk(
      paymentId,
      {
        transaction,
      }
    );

    if (!payment) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Recebimento não encontrado.",
      });
    }

    if (payment.status !== "confirmado") {
      await rollbackTransaction(transaction);

      return res.status(409).json({
        error: "Este recebimento já foi estornado.",
      });
    }

    const installment =
      await ReceivableInstallment.findByPk(
        payment.installment_id,
        {
          transaction,
        }
      );

    if (!installment) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Parcela não encontrada.",
      });
    }

    const receivable = await Receivable.findByPk(
      installment.receivable_id,
      {
        transaction,
      }
    );

    if (!receivable) {
      await rollbackTransaction(transaction);

      return res.status(404).json({
        error: "Conta a receber não encontrada.",
      });
    }

    /*
     * Mantemos o registro para preservar o histórico.
     * Apenas alteramos seu status.
     */
    await payment.update(
      {
        status: "estornado",
        reversed_at: new Date(),
      },
      {
        transaction,
      }
    );

    /*
     * Recalcula o recebido da parcela considerando
     * somente movimentações ainda confirmadas.
     */
    const confirmedAmount =
      Number(
        await ReceivablePayment.sum("amount", {
          where: {
            installment_id: installment.id,
            status: "confirmado",
          },
          transaction,
        })
      ) || 0;

    const lastConfirmedPayment =
      await ReceivablePayment.findOne({
        where: {
          installment_id: installment.id,
          status: "confirmado",
        },
        order: [
          ["received_date", "DESC"],
          ["id", "DESC"],
        ],
        transaction,
      });

    const installmentAmount = Number(
      installment.amount || 0
    );

    const today = new Date()
      .toISOString()
      .slice(0, 10);

    let installmentStatus = "pendente";

    if (confirmedAmount >= installmentAmount) {
      installmentStatus = "recebido";
    } else if (confirmedAmount > 0) {
      installmentStatus = "parcial";
    } else if (installment.due_date < today) {
      installmentStatus = "atrasado";
    }

    await installment.update(
      {
        received_amount: confirmedAmount.toFixed(2),

        received_date:
          lastConfirmedPayment?.received_date || null,

        status: installmentStatus,
      },
      {
        transaction,
      }
    );

    /*
     * Recalcula o status geral da conta a receber.
     */
    const installments =
      await ReceivableInstallment.findAll({
        where: {
          receivable_id: receivable.id,
        },
        transaction,
      });

    const totalReceived = installments.reduce(
      (total, currentInstallment) =>
        total +
        Number(
          currentInstallment.received_amount || 0
        ),
      0
    );

    const totalAmount = Number(
      receivable.total_amount || 0
    );

    let receivableStatus = "pendente";

    if (totalReceived >= totalAmount) {
      receivableStatus = "recebido";
    } else if (totalReceived > 0) {
      receivableStatus = "parcial";
    }

    await receivable.update(
      {
        status: receivableStatus,
      },
      {
        transaction,
      }
    );

    await transaction.commit();

    const updatedReceivable =
      await Receivable.findByPk(receivable.id, {
        include: getReceivableIncludes(),
      });

    return res.json({
      message:
        "Recebimento estornado com sucesso.",

      receivable: updatedReceivable,
    });
  } catch (error) {
    await rollbackTransaction(transaction);

    console.error(
      "Erro ao estornar recebimento:",
      error
    );

    return res.status(500).json({
      error: "Erro ao estornar recebimento.",
      details: error.message,
    });
  }
};

module.exports = {
  createReceivable,
  listReceivables,
  getReceivablesSummary,
  getReceivableById,
  updateReceivable,
  updateReceivableStatus,
  receiveInstallment,
  deleteReceivable,
  reverseInstallmentReceipt,
  reverseReceivablePayment,

  // Ações em lote
  bulkUpdateReceivableStatus,
  bulkReceiveReceivables,
  bulkDeleteReceivables,
};
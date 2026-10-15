const sequelize = require("../config/database");
const { Op } = require("sequelize");

const Receivable = require("../models/Receivable");
const ReceivableInstallment = require("../models/ReceivableInstallment");
const ReceivablePayment = require("../models/ReceivablePayment");
const FinancialAccount = require("../models/FinancialAccount");
const CostCenter = require("../models/CostCenter");
const Client = require("../models/Client");
const Category = require("../models/Category");

const { addMonthsToDate, moneyToCents } = require("../utils/financial");
const { generateReceivableCode } = require("../utils/codeGenerator");

class ApiError extends Error {
  constructor(statusCode, message, blocked = undefined) {
    super(message);
    this.statusCode = statusCode;
    if (blocked) {
      this.blocked = blocked;
    }
  }
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

async function rollbackTransaction(transaction) {
  if (transaction && !transaction.finished) {
    await transaction.rollback();
  }
}

function normalizeIds(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
}

function getReceivableIncludes() {
  return [
    { model: CostCenter, as: "cost_center", attributes: ["id", "code", "name"] },
    { model: Client, as: "client", attributes: ["id", "name"] },
    { model: Category, as: "category", attributes: ["id", "name", "type"] },
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
              attributes: ["id", "code", "name", "bank", "active"],
            },
          ],
        },
      ],
    },
  ];
}

/**
 * Normaliza parcelas personalizadas da negociação enviadas pelo frontend.
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
        error: `Informe um valor válido na ${kind === "entrada" ? "entrada" : `parcela ${index + 1}`}.`,
        items: [],
      };
    }

    const dueDate = String(rawItem.due_date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return {
        error: `Informe um vencimento válido na ${kind === "entrada" ? "entrada" : `parcela ${index + 1}`}.`,
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

/**
 * Calcula desconto e acréscimo com base no valor original e nas parcelas programadas.
 */
function calculateNegotiationAmounts(originalAmountInCents, installments) {
  const scheduledInCents = installments.reduce(
    (total, installment) => total + installment.amountInCents,
    0
  );

  return {
    scheduledInCents,
    discountInCents: Math.max(originalAmountInCents - scheduledInCents, 0),
    surchargeInCents: Math.max(scheduledInCents - originalAmountInCents, 0),
  };
}

function getInstallmentStatusByValues({
  amountInCents,
  receivedInCents,
  dueDate,
  receivableStatus,
}) {
  if (receivableStatus === "cancelado") {
    return "cancelado";
  }

  if (amountInCents > 0 && receivedInCents >= amountInCents) {
    return "recebido";
  }

  if (receivedInCents > 0) {
    return "parcial";
  }

  if (dueDate < getToday()) {
    return "atrasado";
  }

  return "pendente";
}

async function getInstallmentReceiptHistoryCount(installmentId, transaction) {
  return ReceivablePayment.count({
    where: {
      installment_id: installmentId,
    },
    transaction,
  });
}

function createInstallmentsData({
  receivableId,
  totalAmount,
  installmentsCount,
  firstDueDate,
  status = "pendente",
}) {
  const totalInCents = moneyToCents(totalAmount);
  const baseInstallmentInCents = Math.floor(totalInCents / installmentsCount);
  const remainingCents = totalInCents - baseInstallmentInCents * installmentsCount;
  const installments = [];
  const today = getToday();

  for (let installmentNumber = 1; installmentNumber <= installmentsCount; installmentNumber += 1) {
    const isLastInstallment = installmentNumber === installmentsCount;
    const installmentInCents = baseInstallmentInCents + (isLastInstallment ? remainingCents : 0);
    const dueDate = addMonthsToDate(firstDueDate, installmentNumber - 1);
    let installmentStatus = status;

    if (status !== "cancelado" && dueDate < today) {
      installmentStatus = "atrasado";
    }

    installments.push({
      receivable_id: receivableId,
      installment_number: installmentNumber,
      kind: "parcela",
      amount: (installmentInCents / 100).toFixed(2),
      received_amount: 0,
      due_date: dueDate,
      received_date: null,
      status: installmentStatus,
    });
  }
  return installments;
}

function buildReceivableData(receivable) {
  const data = receivable.toJSON ? receivable.toJSON() : receivable;
  const installments = data.installments || [];

  const receivedAmount = installments.reduce(
    (total, installment) => total + Number(installment.received_amount || 0),
    0
  );

  const totalAmount = Number(data.total_amount || 0);
  const storedOriginalAmount = Number(data.original_amount || 0);
  const originalAmount = storedOriginalAmount > 0 ? storedOriginalAmount : totalAmount;
  const discountAmount = Number(data.discount_amount || 0);
  const surchargeAmount = Number(data.surcharge_amount || 0);

  const overdueAmount = installments.reduce((total, installment) => {
    if (installment.status === "atrasado" && data.status !== "cancelado") {
      return (
        total +
        Math.max(
          Number(installment.amount || 0) - Number(installment.received_amount || 0),
          0
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
    received_amount: receivedAmount,
    remaining_amount: Math.max(totalAmount - receivedAmount, 0),
    overdue_amount: overdueAmount,
    is_overdue: overdueAmount > 0,
  };
}

/**
 * Sincroniza a grade de parcelas na edição sem apagar histórico financeiro.
 */
async function syncCustomInstallments({
  receivable,
  customInstallments,
  transaction,
}) {
  const normalized = normalizeCustomInstallments(customInstallments);

  if (normalized.error) {
    return {
      error: normalized.error,
    };
  }

  const existingInstallments = await ReceivableInstallment.findAll({
    where: {
      receivable_id: receivable.id,
    },
    order: [["installment_number", "ASC"]],
    transaction,
  });

  const existingById = new Map(
    existingInstallments.map((installment) => [Number(installment.id), installment])
  );

  const providedExistingIds = new Set(
    normalized.items.filter((item) => item.id).map((item) => Number(item.id))
  );

  for (const existing of existingInstallments) {
    const existingId = Number(existing.id);

    if (providedExistingIds.has(existingId)) {
      continue;
    }

    const historyCount = await getInstallmentReceiptHistoryCount(existingId, transaction);
    const receivedInCents = moneyToCents(existing.received_amount || 0);

    if (historyCount > 0 || receivedInCents > 0) {
      return {
        error: "Não é possível remover uma parcela que possui histórico de recebimento.",
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

      const receivedInCents = moneyToCents(existing.received_amount || 0);
      const currentAmountInCents = moneyToCents(existing.amount);
      const historyCount = await getInstallmentReceiptHistoryCount(existing.id, transaction);
      const fullyReceived = currentAmountInCents > 0 && receivedInCents >= currentAmountInCents;
      const currentKind = existing.kind || "parcela";

      const financialDataChanged =
        item.amountInCents !== currentAmountInCents ||
        item.due_date !== existing.due_date ||
        item.kind !== currentKind;

      if (fullyReceived && financialDataChanged) {
        return {
          error: "Parcelas já recebidas não podem ter valor, vencimento ou tipo alterados.",
        };
      }

      if (item.amountInCents < receivedInCents) {
        return {
          error: "O novo valor da parcela não pode ser menor que o valor já recebido.",
        };
      }

      if (historyCount > 0 && item.kind !== currentKind) {
        return {
          error: "Não é possível alterar o tipo de uma parcela que possui histórico de recebimento.",
        };
      }

      const status = getInstallmentStatusByValues({
        amountInCents: item.amountInCents,
        receivedInCents,
        dueDate: item.due_date,
        receivableStatus: receivable.status,
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
        }
      );

      continue;
    }

    await ReceivableInstallment.create(
      {
        receivable_id: receivable.id,
        installment_number: installmentNumber,
        kind: item.kind,
        amount: (item.amountInCents / 100).toFixed(2),
        received_amount: 0,
        due_date: item.due_date,
        received_date: null,
        status: getInstallmentStatusByValues({
          amountInCents: item.amountInCents,
          receivedInCents: 0,
          dueDate: item.due_date,
          receivableStatus: receivable.status,
        }),
      },
      {
        transaction,
      }
    );
  }

  return {
    error: null,
    items: normalized.items,
  };
}

/**
 * Recalcula o status geral da conta a receber.
 */
async function recalculateReceivableStatus(receivableId, transaction) {
  const receivable = await Receivable.findByPk(receivableId, { transaction });
  if (!receivable) return null;

  if (receivable.status === "cancelado") {
    return receivable;
  }

  const installments = await ReceivableInstallment.findAll({
    where: { receivable_id: receivableId },
    transaction,
  });

  const totalReceivedInCents = installments.reduce(
    (total, current) => total + moneyToCents(current.received_amount || 0),
    0
  );

  const totalAmountInCents = moneyToCents(receivable.total_amount);

  let receivableStatus = "pendente";
  if (totalAmountInCents > 0 && totalReceivedInCents >= totalAmountInCents) {
    receivableStatus = "recebido";
  } else if (totalReceivedInCents > 0) {
    receivableStatus = "parcial";
  }

  await receivable.update({ status: receivableStatus }, { transaction });
  return receivable;
}

function getInstallmentStatus(installment, today) {
  const amountInCents = moneyToCents(installment.amount);
  const receivedInCents = moneyToCents(installment.received_amount);

  if (receivedInCents >= amountInCents) return "recebido";
  if (receivedInCents > 0) return "parcial";
  if (installment.due_date < today) return "atrasado";
  return "pendente";
}

function getReceivableStatus(receivable, installments) {
  const totalReceivedInCents = installments.reduce(
    (total, installment) => total + moneyToCents(installment.received_amount || 0),
    0
  );
  const totalAmountInCents = moneyToCents(receivable.total_amount);

  if (totalAmountInCents > 0 && totalReceivedInCents >= totalAmountInCents) return "recebido";
  if (totalReceivedInCents > 0) return "parcial";
  return "pendente";
}

function groupInstallmentsByReceivable(installments) {
  return installments.reduce((groups, installment) => {
    const key = Number(installment.receivable_id);
    if (!groups[key]) groups[key] = [];
    groups[key].push(installment);
    return groups;
  }, {});
}

async function findReceivablesForBulk(ids, transaction) {
  const receivables = await Receivable.findAll({
    where: { id: { [Op.in]: ids } },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (receivables.length !== ids.length) {
    const foundIds = new Set(receivables.map((item) => Number(item.id)));
    const missingIds = ids.filter((id) => !foundIds.has(id));
    throw new ApiError(404, `Contas não encontradas: ${missingIds.join(", ")}.`);
  }

  const installments = await ReceivableInstallment.findAll({
    where: { receivable_id: { [Op.in]: ids } },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  return {
    receivables,
    installments,
    installmentsByReceivable: groupInstallmentsByReceivable(installments),
  };
}

/**
 * Criar conta a receber com suporte a valor original, negociação e parcelas/entrada.
 */
async function createReceivable(data) {
  const transaction = await sequelize.transaction();
  try {
    const {
      description,
      cost_center_id,
      project_id,
      client_id,
      category_id,
      total_amount,
      original_amount,
      installments_count,
      installments: customInstallments,
      issue_date,
      first_due_date,
      note,
    } = data;

    const costCenterId = cost_center_id || project_id;

    if (!description?.trim()) throw new ApiError(400, "A descrição é obrigatória.");
    if (!costCenterId) throw new ApiError(400, "O centro de custo é obrigatório.");

    const costCenter = await CostCenter.findByPk(costCenterId, { transaction });
    if (!costCenter) throw new ApiError(404, "Centro de custo não encontrado.");

    if (client_id) {
      const client = await Client.findByPk(client_id, { transaction });
      if (!client) throw new ApiError(404, "Cliente não encontrado.");
    }

    if (category_id) {
      const category = await Category.findByPk(category_id, { transaction });
      if (!category) throw new ApiError(404, "Categoria não encontrada.");
      if (category.type !== "receita") throw new ApiError(400, "A categoria selecionada deve ser do tipo receita.");
      if (category.active === false || category.active === 0) throw new ApiError(400, "A categoria selecionada está inativa.");
    }

    const hasCustomInstallments = Array.isArray(customInstallments) && customInstallments.length > 0;

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
        throw new ApiError(400, "O valor original deve ser maior que zero.");
      }

      normalizedCustom = normalizeCustomInstallments(customInstallments);
      if (normalizedCustom.error) {
        throw new ApiError(400, normalizedCustom.error);
      }

      const negotiation = calculateNegotiationAmounts(originalInCents, normalizedCustom.items);
      finalInCents = negotiation.scheduledInCents;
      discountInCents = negotiation.discountInCents;
      surchargeInCents = negotiation.surchargeInCents;
      installmentsCount = normalizedCustom.items.length;
      firstDueDate = normalizedCustom.items[0].due_date;
    } else {
      originalInCents = moneyToCents(total_amount);
      if (!Number.isFinite(originalInCents) || originalInCents <= 0) {
        throw new ApiError(400, "O valor total deve ser maior que zero.");
      }

      installmentsCount = Number(installments_count || 1);
      if (!Number.isInteger(installmentsCount) || installmentsCount < 1) {
        throw new ApiError(400, "A quantidade de parcelas deve ser pelo menos 1.");
      }

      if (!first_due_date) {
        throw new ApiError(400, "O primeiro vencimento é obrigatório.");
      }

      finalInCents = originalInCents;
      firstDueDate = first_due_date;
    }

    const receivable = await Receivable.create(
      {
        code: null,
        description: description.trim(),
        project_id: Number(costCenterId),
        client_id: client_id ? Number(client_id) : null,
        category_id: category_id ? Number(category_id) : null,
        original_amount: (originalInCents / 100).toFixed(2),
        discount_amount: (discountInCents / 100).toFixed(2),
        surcharge_amount: (surchargeInCents / 100).toFixed(2),
        total_amount: (finalInCents / 100).toFixed(2),
        installments_count: installmentsCount,
        issue_date: issue_date || null,
        first_due_date: firstDueDate,
        status: "pendente",
        note: note?.trim() || null,
      },
      { transaction }
    );

    const code = generateReceivableCode(receivable.id);
    await receivable.update({ code }, { transaction });

    if (hasCustomInstallments) {
      const rows = normalizedCustom.items.map((item, index) => ({
        receivable_id: receivable.id,
        installment_number: index + 1,
        kind: item.kind,
        amount: (item.amountInCents / 100).toFixed(2),
        received_amount: 0,
        due_date: item.due_date,
        received_date: null,
        status: getInstallmentStatusByValues({
          amountInCents: item.amountInCents,
          receivedInCents: 0,
          dueDate: item.due_date,
          receivableStatus: receivable.status,
        }),
      }));
      await ReceivableInstallment.bulkCreate(rows, { transaction });
    } else {
      const installments = createInstallmentsData({
        receivableId: receivable.id,
        totalAmount: finalInCents / 100,
        installmentsCount,
        firstDueDate,
      });
      await ReceivableInstallment.bulkCreate(installments, { transaction });
    }

    await transaction.commit();

    const created = await Receivable.findByPk(receivable.id, { include: getReceivableIncludes() });
    return buildReceivableData(created);
  } catch (error) {
    await rollbackTransaction(transaction);
    throw error;
  }
}

/**
 * Listagem com suporte a filtros ou paginação.
 */
async function listReceivables(query = {}) {
  const paginationRequested = query.page !== undefined || query.limit !== undefined;
  const listIncludes = getReceivableIncludes();

  if (!paginationRequested) {
    const receivables = await Receivable.findAll({
      include: listIncludes,
      order: [
        ["id", "DESC"],
        [{ model: ReceivableInstallment, as: "installments" }, "installment_number", "ASC"],
      ],
    });
    return receivables.map(buildReceivableData);
  }

  const requestedPage = Number(query.page || 1);
  const requestedLimit = Number(query.limit || 25);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 25;
  const offset = (page - 1) * limit;
  const where = {};
  const search = String(query.search || "").trim();

  if (query.status) where.status = query.status;
  if (query.cost_center_id) where.project_id = Number(query.cost_center_id);
  if (query.client_id) where.client_id = Number(query.client_id);
  if (query.category_id) where.category_id = Number(query.category_id);

  if (search) {
    const likeSearch = `%${search}%`;
    const [matchingCostCenters, matchingClients, matchingCategories] = await Promise.all([
      CostCenter.findAll({
        attributes: ["id"],
        where: { [Op.or]: [{ code: { [Op.like]: likeSearch } }, { name: { [Op.like]: likeSearch } }] },
        raw: true,
      }),
      Client.findAll({ attributes: ["id"], where: { name: { [Op.like]: likeSearch } }, raw: true }),
      Category.findAll({ attributes: ["id"], where: { name: { [Op.like]: likeSearch } }, raw: true }),
    ]);

    const costCenterIds = matchingCostCenters.map((item) => Number(item.id));
    const clientIds = matchingClients.map((item) => Number(item.id));
    const categoryIds = matchingCategories.map((item) => Number(item.id));

    const searchConditions = [
      { code: { [Op.like]: likeSearch } },
      { description: { [Op.like]: likeSearch } },
    ];
    if (costCenterIds.length > 0) searchConditions.push({ project_id: { [Op.in]: costCenterIds } });
    if (clientIds.length > 0) searchConditions.push({ client_id: { [Op.in]: clientIds } });
    if (categoryIds.length > 0) searchConditions.push({ category_id: { [Op.in]: categoryIds } });
    where[Op.or] = searchConditions;
  }

  const dueFrom = String(query.due_from || "").trim();
  const dueTo = String(query.due_to || "").trim();
  const overdueOnly = [true, "true", 1, "1"].includes(query.overdue_only);

  if (dueFrom || dueTo || overdueOnly) {
    const installmentWhere = {};
    if (dueFrom || dueTo) {
      installmentWhere.due_date = {};
      if (dueFrom) installmentWhere.due_date[Op.gte] = dueFrom;
      if (dueTo) installmentWhere.due_date[Op.lte] = dueTo;
      installmentWhere.status = { [Op.ne]: "cancelado" };
    }

    if (overdueOnly) {
      const today = getToday();
      installmentWhere.due_date = { ...(installmentWhere.due_date || {}), [Op.lt]: today };
      installmentWhere.status = { [Op.notIn]: ["recebido", "cancelado"] };
      installmentWhere.received_amount = { [Op.lt]: sequelize.col("amount") };
    }

    const matchingInstallments = await ReceivableInstallment.findAll({
      attributes: ["receivable_id"],
      where: installmentWhere,
      group: ["receivable_id"],
      raw: true,
    });
    const matchingReceivableIds = matchingInstallments.map((item) => Number(item.receivable_id));
    where.id = { [Op.in]: matchingReceivableIds };
  }

  const total = await Receivable.count({ where });
  const receivableIds = await Receivable.findAll({
    attributes: ["id"],
    where,
    order: [["id", "DESC"]],
    limit,
    offset,
    raw: true,
  });

  const ids = receivableIds.map((item) => Number(item.id));
  let receivables = [];
  if (ids.length > 0) {
    receivables = await Receivable.findAll({
      where: { id: { [Op.in]: ids } },
      include: listIncludes,
      order: [
        ["id", "DESC"],
        [{ model: ReceivableInstallment, as: "installments" }, "installment_number", "ASC"],
      ],
    });
  }

  const data = receivables.map(buildReceivableData);
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
  };
}

async function getReceivablesSummary() {
  const today = getToday();
  const totalAmount = Number(
    await Receivable.sum("total_amount", { where: { status: { [Op.ne]: "cancelado" } } })
  ) || 0;

  const receivedAmount = Number(
    await ReceivableInstallment.sum("received_amount", { where: { status: { [Op.ne]: "cancelado" } } })
  ) || 0;

  const remainingAmount = Math.max(totalAmount - receivedAmount, 0);

  const overdueInstallments = await ReceivableInstallment.count({
    where: {
      due_date: { [Op.lt]: today },
      status: { [Op.notIn]: ["recebido", "cancelado"] },
      received_amount: { [Op.lt]: sequelize.col("amount") },
    },
  });

  return {
    total_amount: totalAmount,
    received_amount: receivedAmount,
    remaining_amount: remainingAmount,
    overdue_installments: overdueInstallments,
  };
}

async function getReceivableById(id) {
  const receivable = await Receivable.findByPk(id, {
    include: getReceivableIncludes(),
    order: [[{ model: ReceivableInstallment, as: "installments" }, "installment_number", "ASC"]],
  });
  if (!receivable) throw new ApiError(404, "Conta a receber não encontrada.");
  return buildReceivableData(receivable);
}

/**
 * Atualizar conta a receber com suporte a negociação e parcelamento customizado.
 */
async function updateReceivable(id, data) {
  const transaction = await sequelize.transaction();
  try {
    const receivable = await Receivable.findByPk(id, { transaction });
    if (!receivable) throw new ApiError(404, "Conta a receber não encontrada.");

    const {
      description,
      cost_center_id,
      project_id,
      client_id,
      category_id,
      total_amount,
      original_amount,
      installments_count,
      installments: customInstallments,
      issue_date,
      first_due_date,
      note,
    } = data;

    const newDescription = description === undefined ? receivable.description : String(description).trim();
    const newCostCenterId = cost_center_id !== undefined ? cost_center_id : (project_id !== undefined ? project_id : receivable.project_id);
    const newClientId = client_id === undefined ? receivable.client_id : (client_id || null);
    const newCategoryId = category_id === undefined ? receivable.category_id : (category_id || null);
    const newIssueDate = issue_date === undefined ? receivable.issue_date : (issue_date || null);
    const newNote = note === undefined ? receivable.note : (note?.trim() || null);

    if (!newDescription) throw new ApiError(400, "A descrição é obrigatória.");
    if (!newCostCenterId) throw new ApiError(400, "O centro de custo é obrigatório.");

    const costCenter = await CostCenter.findByPk(newCostCenterId, { transaction });
    if (!costCenter) throw new ApiError(404, "Centro de custo não encontrado.");

    if (newClientId) {
      const client = await Client.findByPk(newClientId, { transaction });
      if (!client) throw new ApiError(404, "Cliente não encontrado.");
    }

    if (newCategoryId) {
      const category = await Category.findByPk(newCategoryId, { transaction });
      if (!category) throw new ApiError(404, "Categoria não encontrada.");
      if (category.type !== "receita") throw new ApiError(400, "A categoria selecionada deve ser do tipo receita.");
      if (category.active === false || category.active === 0) throw new ApiError(400, "A categoria selecionada está inativa.");
    }

    const hasCustomInstallments = Array.isArray(customInstallments) && customInstallments.length > 0;

    if (hasCustomInstallments) {
      const storedOriginalInCents = moneyToCents(receivable.original_amount || 0);
      const currentOriginalInCents =
        Number.isFinite(storedOriginalInCents) && storedOriginalInCents > 0
          ? storedOriginalInCents
          : moneyToCents(receivable.total_amount);

      const originalInCents =
        original_amount === undefined ? currentOriginalInCents : moneyToCents(original_amount);

      if (!Number.isFinite(originalInCents) || originalInCents <= 0) {
        throw new ApiError(400, "O valor original deve ser maior que zero.");
      }

      const normalized = normalizeCustomInstallments(customInstallments);
      if (normalized.error) {
        throw new ApiError(400, normalized.error);
      }

      const syncResult = await syncCustomInstallments({
        receivable,
        customInstallments: normalized.items.map((item) => ({
          id: item.id,
          kind: item.kind,
          amount: item.amountInCents / 100,
          due_date: item.due_date,
        })),
        transaction,
      });

      if (syncResult.error) {
        throw new ApiError(409, syncResult.error);
      }

      const negotiation = calculateNegotiationAmounts(originalInCents, normalized.items);
      if (negotiation.scheduledInCents <= 0) {
        throw new ApiError(400, "O valor final da negociação deve ser maior que zero.");
      }

      const firstDueDate = normalized.items[0].due_date;

      await receivable.update(
        {
          description: newDescription,
          project_id: Number(newCostCenterId),
          client_id: newClientId ? Number(newClientId) : null,
          category_id: newCategoryId ? Number(newCategoryId) : null,
          original_amount: (originalInCents / 100).toFixed(2),
          discount_amount: (negotiation.discountInCents / 100).toFixed(2),
          surcharge_amount: (negotiation.surchargeInCents / 100).toFixed(2),
          total_amount: (negotiation.scheduledInCents / 100).toFixed(2),
          installments_count: normalized.items.length,
          issue_date: newIssueDate,
          first_due_date: firstDueDate,
          note: newNote,
        },
        { transaction }
      );

      await recalculateReceivableStatus(receivable.id, transaction);
      await transaction.commit();

      const updatedReceivable = await Receivable.findByPk(id, { include: getReceivableIncludes() });
      return buildReceivableData(updatedReceivable);
    }

    // Modo automático legado / fallback
    const newTotalInCents =
      total_amount === undefined ? moneyToCents(receivable.total_amount) : moneyToCents(total_amount);
    const newInstallmentsCount =
      installments_count === undefined ? Number(receivable.installments_count) : Number(installments_count);
    const newFirstDueDate =
      first_due_date === undefined ? receivable.first_due_date : first_due_date;

    if (!Number.isFinite(newTotalInCents) || newTotalInCents <= 0) {
      throw new ApiError(400, "O valor total deve ser maior que zero.");
    }
    if (!Number.isInteger(newInstallmentsCount) || newInstallmentsCount < 1) {
      throw new ApiError(400, "A quantidade de parcelas deve ser pelo menos 1.");
    }
    if (!newFirstDueDate) {
      throw new ApiError(400, "O primeiro vencimento é obrigatório.");
    }

    const currentTotalInCents = moneyToCents(receivable.total_amount);
    const financialDataChanged =
      newTotalInCents !== currentTotalInCents ||
      newInstallmentsCount !== Number(receivable.installments_count) ||
      newFirstDueDate !== receivable.first_due_date;

    const totalReceived =
      Number(await ReceivableInstallment.sum("received_amount", { where: { receivable_id: id }, transaction })) || 0;

    if (financialDataChanged && totalReceived > 0) {
      throw new ApiError(409, "Não é possível alterar o valor, as parcelas ou o vencimento depois de registrar recebimentos.");
    }

    await receivable.update(
      {
        description: newDescription,
        project_id: Number(newCostCenterId),
        client_id: newClientId ? Number(newClientId) : null,
        category_id: newCategoryId ? Number(newCategoryId) : null,
        original_amount: (newTotalInCents / 100).toFixed(2),
        discount_amount: "0.00",
        surcharge_amount: "0.00",
        total_amount: (newTotalInCents / 100).toFixed(2),
        installments_count: newInstallmentsCount,
        issue_date: newIssueDate,
        first_due_date: newFirstDueDate,
        note: newNote,
      },
      { transaction }
    );

    if (financialDataChanged) {
      await ReceivableInstallment.destroy({ where: { receivable_id: id }, transaction });
      const installmentStatus = receivable.status === "cancelado" ? "cancelado" : "pendente";
      const installments = createInstallmentsData({
        receivableId: receivable.id,
        totalAmount: newTotalInCents / 100,
        installmentsCount: newInstallmentsCount,
        firstDueDate: newFirstDueDate,
        status: installmentStatus,
      });
      await ReceivableInstallment.bulkCreate(installments, { transaction });
    }

    await recalculateReceivableStatus(receivable.id, transaction);
    await transaction.commit();

    const updatedReceivable = await Receivable.findByPk(id, { include: getReceivableIncludes() });
    return buildReceivableData(updatedReceivable);
  } catch (error) {
    await rollbackTransaction(transaction);
    throw error;
  }
}

async function updateReceivableStatus(id, status) {
  const transaction = await sequelize.transaction();
  try {
    const allowedStatuses = ["pendente", "cancelado"];
    if (!allowedStatuses.includes(status)) throw new ApiError(400, "O status manual deve ser pendente ou cancelado.");

    const receivable = await Receivable.findByPk(id, { transaction });
    if (!receivable) throw new ApiError(404, "Conta a receber não encontrada.");

    const installments = await ReceivableInstallment.findAll({ where: { receivable_id: id }, transaction });
    const totalReceived = installments.reduce((total, installment) => total + Number(installment.received_amount || 0), 0);

    if (status === "cancelado" && totalReceived > 0) {
      throw new ApiError(409, "Não é possível cancelar uma conta que já possui recebimentos.");
    }

    if (status === "cancelado") {
      await receivable.update({ status: "cancelado" }, { transaction });
      await ReceivableInstallment.update({ status: "cancelado" }, { where: { receivable_id: id }, transaction });
    } else if (status === "pendente") {
      const today = getToday();
      for (const installment of installments) {
        const amount = Number(installment.amount || 0);
        const receivedAmount = Number(installment.received_amount || 0);
        let installmentStatus = "pendente";
        if (receivedAmount >= amount) installmentStatus = "recebido";
        else if (receivedAmount > 0) installmentStatus = "parcial";
        else if (installment.due_date < today) installmentStatus = "atrasado";
        await installment.update({ status: installmentStatus }, { transaction });
      }
      const totalAmount = Number(receivable.total_amount || 0);
      let receivableStatus = "pendente";
      if (totalReceived >= totalAmount) receivableStatus = "recebido";
      else if (totalReceived > 0) receivableStatus = "parcial";
      await receivable.update({ status: receivableStatus }, { transaction });
    }

    await transaction.commit();
    const updated = await Receivable.findByPk(id, { include: getReceivableIncludes() });
    return buildReceivableData(updated);
  } catch (error) {
    await rollbackTransaction(transaction);
    throw error;
  }
}

async function deleteReceivable(id) {
  const transaction = await sequelize.transaction();
  try {
    const receivable = await Receivable.findByPk(id, { transaction });
    if (!receivable) throw new ApiError(404, "Conta a receber não encontrada.");

    const installments = await ReceivableInstallment.findAll({
      where: { receivable_id: id },
      attributes: ["id"],
      raw: true,
      transaction,
    });
    const installmentIds = installments.map((i) => i.id);

    let historyCount = 0;
    if (installmentIds.length > 0) {
      historyCount = await ReceivablePayment.count({
        where: { installment_id: { [Op.in]: installmentIds } },
        transaction,
      });
    }

    const totalReceived = Number(
      await ReceivableInstallment.sum("received_amount", { where: { receivable_id: id }, transaction })
    ) || 0;

    if (historyCount > 0 || totalReceived > 0) {
      throw new ApiError(409, "Esta conta possui histórico de recebimentos e não pode ser excluída.");
    }

    await ReceivableInstallment.destroy({ where: { receivable_id: id }, transaction });
    await receivable.destroy({ transaction });
    await transaction.commit();
  } catch (error) {
    await rollbackTransaction(transaction);
    throw error;
  }
}

async function receiveInstallment(installmentId, data) {
  const transaction = await sequelize.transaction();
  try {
    const { amount, received_date, financial_account_id, payment_method, note } = data;
    const receivedInCents = moneyToCents(amount);

    if (!Number.isFinite(receivedInCents) || receivedInCents <= 0) {
      throw new ApiError(400, "O valor recebido deve ser maior que zero.");
    }
    if (!received_date) {
      throw new ApiError(400, "A data do recebimento é obrigatória.");
    }
    if (!financial_account_id) {
      throw new ApiError(400, "Selecione a conta financeira de destino.");
    }

    const financialAccount = await FinancialAccount.findByPk(financial_account_id, { transaction });
    if (!financialAccount) throw new ApiError(404, "Conta financeira não encontrada.");
    if (financialAccount.active === false || financialAccount.active === 0) {
      throw new ApiError(409, "A conta financeira selecionada está inativa.");
    }

    const installment = await ReceivableInstallment.findByPk(installmentId, { transaction });
    if (!installment) throw new ApiError(404, "Parcela não encontrada.");

    const receivable = await Receivable.findByPk(installment.receivable_id, { transaction });
    if (!receivable) throw new ApiError(404, "Conta a receber não encontrada.");
    if (receivable.status === "cancelado") throw new ApiError(409, "Não é possível receber uma conta cancelada.");

    const installmentInCents = moneyToCents(installment.amount);
    const alreadyReceivedInCents = moneyToCents(installment.received_amount);
    const newReceivedInCents = alreadyReceivedInCents + receivedInCents;

    if (newReceivedInCents > installmentInCents) {
      const remainingInCents = installmentInCents - alreadyReceivedInCents;
      throw new ApiError(400, `O valor ultrapassa o saldo da parcela. Saldo disponível: R$ ${(remainingInCents / 100).toFixed(2).replace(".", ",")}.`);
    }

    await ReceivablePayment.create(
      {
        installment_id: installment.id,
        financial_account_id: Number(financial_account_id),
        amount: (receivedInCents / 100).toFixed(2),
        received_date,
        payment_method: payment_method || "pix",
        status: "confirmado",
        note: note?.trim() || null,
      },
      { transaction }
    );

    const installmentStatus = newReceivedInCents >= installmentInCents ? "recebido" : "parcial";
    await installment.update(
      {
        received_amount: (newReceivedInCents / 100).toFixed(2),
        received_date,
        status: installmentStatus,
      },
      { transaction }
    );

    await recalculateReceivableStatus(receivable.id, transaction);
    await transaction.commit();

    const updated = await Receivable.findByPk(receivable.id, { include: getReceivableIncludes() });
    return buildReceivableData(updated);
  } catch (error) {
    await rollbackTransaction(transaction);
    throw error;
  }
}

async function reverseInstallmentReceipt(installmentId) {
  const transaction = await sequelize.transaction();
  try {
    const installment = await ReceivableInstallment.findByPk(installmentId, { transaction });
    if (!installment) throw new ApiError(404, "Parcela não encontrada.");

    const currentReceived = Number(installment.received_amount || 0);
    if (currentReceived <= 0) throw new ApiError(400, "Esta parcela não possui recebimento para estornar.");

    const receivable = await Receivable.findByPk(installment.receivable_id, { transaction });
    if (!receivable) throw new ApiError(404, "Conta a receber não encontrada.");

    const today = getToday();
    const installmentStatus = installment.due_date < today ? "atrasado" : "pendente";

    await ReceivablePayment.update(
      { status: "estornado", reversed_at: new Date() },
      { where: { installment_id: installment.id, status: "confirmado" }, transaction }
    );

    await installment.update(
      { received_amount: 0, received_date: null, status: installmentStatus },
      { transaction }
    );

    await recalculateReceivableStatus(receivable.id, transaction);
    await transaction.commit();

    const updated = await Receivable.findByPk(receivable.id, { include: getReceivableIncludes() });
    return buildReceivableData(updated);
  } catch (error) {
    await rollbackTransaction(transaction);
    throw error;
  }
}

async function bulkUpdateReceivableStatus(idsRaw, status) {
  const transaction = await sequelize.transaction();
  try {
    const ids = normalizeIds(idsRaw);
    if (ids.length === 0) throw new ApiError(400, "Selecione pelo menos uma conta a receber.");
    if (!["pendente", "cancelado"].includes(status)) throw new ApiError(400, "O status em lote deve ser pendente ou cancelado.");

    const { receivables, installmentsByReceivable } = await findReceivablesForBulk(ids, transaction);

    if (status === "cancelado") {
      const blockedReceivables = receivables.filter((receivable) => {
        const currentInstallments = installmentsByReceivable[receivable.id] || [];
        return currentInstallments.some((installment) => moneyToCents(installment.received_amount || 0) > 0);
      });

      if (blockedReceivables.length > 0) {
        throw new ApiError(409, "Não é possível cancelar contas que possuem recebimentos.", blockedReceivables);
      }

      await Receivable.update({ status: "cancelado" }, { where: { id: { [Op.in]: ids } }, transaction });
      await ReceivableInstallment.update({ status: "cancelado" }, { where: { receivable_id: { [Op.in]: ids } }, transaction });
    } else {
      const today = getToday();
      for (const receivable of receivables) {
        const currentInstallments = installmentsByReceivable[receivable.id] || [];
        for (const installment of currentInstallments) {
          await installment.update({ status: getInstallmentStatus(installment, today) }, { transaction });
        }
        await receivable.update({ status: getReceivableStatus(receivable, currentInstallments) }, { transaction });
      }
    }

    await transaction.commit();
    return { affected_count: ids.length, status };
  } catch (error) {
    await rollbackTransaction(transaction);
    throw error;
  }
}

async function bulkReceiveReceivables(idsRaw, data) {
  const transaction = await sequelize.transaction();
  try {
    const ids = normalizeIds(idsRaw);
    const { received_date, financial_account_id, payment_method, note } = data;

    if (ids.length === 0) throw new ApiError(400, "Selecione pelo menos uma conta a receber.");
    if (!received_date || !/^\d{4}-\d{2}-\d{2}$/.test(received_date)) throw new ApiError(400, "Informe uma data de recebimento válida.");
    if (!financial_account_id) throw new ApiError(400, "Selecione a conta financeira de destino.");

    const financialAccount = await FinancialAccount.findByPk(financial_account_id, { transaction });
    if (!financialAccount) throw new ApiError(404, "Conta financeira não encontrada.");
    if (financialAccount.active === false || financialAccount.active === 0) throw new ApiError(409, "A conta financeira selecionada está inativa.");

    const { receivables, installmentsByReceivable } = await findReceivablesForBulk(ids, transaction);
    const cancelledReceivables = receivables.filter((item) => item.status === "cancelado");

    if (cancelledReceivables.length > 0) {
      throw new ApiError(409, "Reative as contas canceladas antes de registrar o recebimento.", cancelledReceivables);
    }

    let totalReceivedInCents = 0;
    let affectedInstallments = 0;
    let affectedReceivables = 0;

    for (const receivable of receivables) {
      const currentInstallments = installmentsByReceivable[receivable.id] || [];
      let receivableChanged = false;

      for (const installment of currentInstallments) {
        const amountInCents = moneyToCents(installment.amount);
        const receivedInCents = moneyToCents(installment.received_amount || 0);
        const remainingInCents = Math.max(amountInCents - receivedInCents, 0);

        if (remainingInCents <= 0) continue;

        await ReceivablePayment.create({
          installment_id: installment.id,
          financial_account_id: Number(financial_account_id),
          amount: (remainingInCents / 100).toFixed(2),
          received_date,
          payment_method: payment_method || "transferencia",
          status: "confirmado",
          note: note?.trim() || null,
        }, { transaction });

        await installment.update({
          received_amount: (amountInCents / 100).toFixed(2),
          received_date,
          status: "recebido",
        }, { transaction });

        totalReceivedInCents += remainingInCents;
        affectedInstallments += 1;
        receivableChanged = true;
      }

      if (receivableChanged) {
        await receivable.update({ status: "recebido" }, { transaction });
        affectedReceivables += 1;
      }
    }

    await transaction.commit();
    return { affected_receivables: affectedReceivables, affected_installments: affectedInstallments, received_amount: (totalReceivedInCents / 100).toFixed(2) };
  } catch (error) {
    await rollbackTransaction(transaction);
    throw error;
  }
}

async function bulkDeleteReceivables(idsRaw) {
  const transaction = await sequelize.transaction();
  try {
    const ids = normalizeIds(idsRaw);
    if (ids.length === 0) throw new ApiError(400, "Selecione pelo menos uma conta a receber.");

    const { receivables, installmentsByReceivable } = await findReceivablesForBulk(ids, transaction);
    const blockedReceivables = receivables.filter((receivable) => {
      const currentInstallments = installmentsByReceivable[receivable.id] || [];
      return currentInstallments.some((installment) => moneyToCents(installment.received_amount || 0) > 0);
    });

    if (blockedReceivables.length > 0) {
      throw new ApiError(409, "Estorne os recebimentos antes de excluir as contas selecionadas.", blockedReceivables);
    }

    await ReceivableInstallment.destroy({ where: { receivable_id: { [Op.in]: ids } }, transaction });
    await Receivable.destroy({ where: { id: { [Op.in]: ids } }, transaction });

    await transaction.commit();
    return { deleted_count: ids.length };
  } catch (error) {
    await rollbackTransaction(transaction);
    throw error;
  }
}

async function reverseReceivablePayment(paymentId) {
  const transaction = await sequelize.transaction();
  try {
    const payment = await ReceivablePayment.findByPk(paymentId, { transaction });
    if (!payment) throw new ApiError(404, "Recebimento não encontrado.");
    if (payment.status !== "confirmado") throw new ApiError(409, "Este recebimento já foi estornado.");

    const installment = await ReceivableInstallment.findByPk(payment.installment_id, { transaction });
    if (!installment) throw new ApiError(404, "Parcela não encontrada.");

    const receivable = await Receivable.findByPk(installment.receivable_id, { transaction });
    if (!receivable) throw new ApiError(404, "Conta a receber não encontrada.");

    await payment.update({ status: "estornado", reversed_at: new Date() }, { transaction });

    const confirmedAmount = Number(
      await ReceivablePayment.sum("amount", {
        where: { installment_id: installment.id, status: "confirmado" },
        transaction,
      })
    ) || 0;

    const lastConfirmedPayment = await ReceivablePayment.findOne({
      where: { installment_id: installment.id, status: "confirmado" },
      order: [["received_date", "DESC"], ["id", "DESC"]],
      transaction,
    });

    const installmentAmount = Number(installment.amount || 0);
    const today = getToday();
    let installmentStatus = "pendente";

    if (confirmedAmount >= installmentAmount) installmentStatus = "recebido";
    else if (confirmedAmount > 0) installmentStatus = "parcial";
    else if (installment.due_date < today) installmentStatus = "atrasado";

    await installment.update({
      received_amount: confirmedAmount.toFixed(2),
      received_date: lastConfirmedPayment?.received_date || null,
      status: installmentStatus,
    }, { transaction });

    await recalculateReceivableStatus(receivable.id, transaction);
    await transaction.commit();

    const updated = await Receivable.findByPk(receivable.id, { include: getReceivableIncludes() });
    return buildReceivableData(updated);
  } catch (error) {
    await rollbackTransaction(transaction);
    throw error;
  }
}

module.exports = {
  createReceivable,
  listReceivables,
  getReceivablesSummary,
  getReceivableById,
  updateReceivable,
  updateReceivableStatus,
  deleteReceivable,
  receiveInstallment,
  reverseInstallmentReceipt,
  bulkUpdateReceivableStatus,
  bulkReceiveReceivables,
  bulkDeleteReceivables,
  reverseReceivablePayment,
};

const CostCenter = require("../models/CostCenter");
const Client = require("../models/Client");
const Receivable = require("../models/Receivable");
const ReceivableInstallment = require(
  "../models/ReceivableInstallment"
);

async function generateCostCenterCode() {
  const lastCostCenter = await CostCenter.findOne({
    order: [["id", "DESC"]],
  });

  const nextNumber = lastCostCenter
    ? lastCostCenter.id + 1
    : 1;

  return `CC-${String(nextNumber).padStart(4, "0")}`;
}

function parseMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return number;
}

/**
 * Criar centro de custo
 */
const createProject = async (req, res) => {
  try {
    const {
      name,
      reference,
      client_id,
      cost_center,
      status,
      start_date,
      end_date,
      budget,
      note,
    } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        error: "Nome é obrigatório.",
      });
    }

    const budgetValue = parseMoney(budget);

    if (budgetValue < 0) {
      return res.status(400).json({
        error:
          "O valor contratado não pode ser negativo.",
      });
    }

    if (client_id) {
      const client = await Client.findByPk(client_id);

      if (!client) {
        return res.status(404).json({
          error: "Cliente não encontrado.",
        });
      }
    }

    const code = await generateCostCenterCode();

    const costCenterCreated = await CostCenter.create({
      code,
      reference: reference?.trim() || null,
      name: name.trim(),
      client_id: client_id
        ? Number(client_id)
        : null,
      cost_center: cost_center?.trim() || null,
      status: status || "planejado",
      start_date: start_date || null,
      end_date: end_date || null,
      budget: budgetValue,
      note: note?.trim() || null,
    });

    return res.status(201).json(costCenterCreated);
  } catch (error) {
    console.error(
      "Erro ao criar centro de custo:",
      error
    );

    return res.status(500).json({
      error: "Erro ao criar centro de custo.",
      details: error.message,
    });
  }
};

/**
 * Listar centros de custo com valores financeiros
 */
const listProjects = async (req, res) => {
  try {
    const costCenters = await CostCenter.findAll({
      include: [
        {
          model: Client,
          as: "client",
          attributes: ["id", "name"],
        },
        {
          model: Receivable,
          as: "receivables",
          required: false,
          include: [
            {
              model: ReceivableInstallment,
              as: "installments",
              required: false,
            },
          ],
        },
      ],
      order: [["id", "DESC"]],
    });

    const result = costCenters.map((costCenter) => {
      const data = costCenter.toJSON();

      const activeReceivables = (
        data.receivables || []
      ).filter(
        (receivable) =>
          receivable.status !== "cancelado"
      );

      const totalLaunched = activeReceivables.reduce(
        (total, receivable) =>
          total +
          Number(receivable.total_amount || 0),
        0
      );

      const totalReceived = activeReceivables.reduce(
        (receivableTotal, receivable) => {
          const receivedFromInstallments = (
            receivable.installments || []
          ).reduce(
            (installmentTotal, installment) =>
              installmentTotal +
              Number(
                installment.received_amount || 0
              ),
            0
          );

          return (
            receivableTotal +
            receivedFromInstallments
          );
        },
        0
      );

      const totalRemaining = Math.max(
        totalLaunched - totalReceived,
        0
      );

      const contractedValue = Number(
        data.budget || 0
      );

      const contractualBalance = Math.max(
        contractedValue - totalReceived,
        0
      );

      return {
        ...data,

        // Evita mandar todas as parcelas para a tela.
        receivables: undefined,

        total_launched: totalLaunched,
        total_received: totalReceived,
        total_remaining: totalRemaining,
        contractual_balance: contractualBalance,
      };
    });

    return res.json(result);
  } catch (error) {
    console.error(
      "Erro ao listar centros de custo:",
      error
    );

    return res.status(500).json({
      error: "Erro ao listar centros de custo.",
      details: error.message,
    });
  }
};

/**
 * Atualizar centro de custo
 */
const updateProject = async (req, res) => {
  try {
    const { id } = req.params;

    const costCenter = await CostCenter.findByPk(id);

    if (!costCenter) {
      return res.status(404).json({
        error: "Centro de custo não encontrado.",
      });
    }

    const {
      code,
      name,
      reference,
      client_id,
      cost_center,
      status,
      start_date,
      end_date,
      budget,
      note,
    } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        error: "Nome é obrigatório.",
      });
    }

    const budgetValue = parseMoney(budget);

    if (budgetValue < 0) {
      return res.status(400).json({
        error:
          "O valor contratado não pode ser negativo.",
      });
    }

    if (client_id) {
      const client = await Client.findByPk(client_id);

      if (!client) {
        return res.status(404).json({
          error: "Cliente não encontrado.",
        });
      }
    }

    await costCenter.update({
      /*
       * O código não é atualizado.
       * Mesmo que o frontend envie "code",
       * ele é ignorado.
       */
      name: name.trim(),
      reference: reference?.trim() || null,
      client_id: client_id
        ? Number(client_id)
        : null,
      cost_center: cost_center?.trim() || null,
      status: status || "planejado",
      start_date: start_date || null,
      end_date: end_date || null,
      budget: budgetValue,
      note: note?.trim() || null,
    });

    return res.json({
      message:
        "Centro de custo atualizado com sucesso.",
      cost_center: costCenter,
    });
  } catch (error) {
    console.error(
      "Erro ao atualizar centro de custo:",
      error
    );

    return res.status(500).json({
      error: "Erro ao atualizar centro de custo.",
      details: error.message,
    });
  }
};

/**
 * Excluir centro de custo
 */
const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;

    const costCenter = await CostCenter.findByPk(id);

    if (!costCenter) {
      return res.status(404).json({
        error: "Centro de custo não encontrado.",
      });
    }

    const receivablesCount = await Receivable.count({
      where: {
        project_id: id,
      },
    });

    if (receivablesCount > 0) {
      return res.status(409).json({
        error:
          "Este centro de custo possui contas a receber vinculadas e não pode ser excluído.",
      });
    }

    await costCenter.destroy();

    return res.json({
      message:
        "Centro de custo excluído com sucesso.",
    });
  } catch (error) {
    console.error(
      "Erro ao excluir centro de custo:",
      error
    );

    return res.status(500).json({
      error: "Erro ao excluir centro de custo.",
      details: error.message,
    });
  }
};

module.exports = {
  createProject,
  listProjects,
  updateProject,
  deleteProject,
};
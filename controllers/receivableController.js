const receivableService = require("../services/receivableService");

const createReceivable = async (req, res) => {
  try {
    const receivable = await receivableService.createReceivable(req.body);
    return res.status(201).json({
      message: "Conta a receber criada com sucesso.",
      receivable,
    });
  } catch (error) {
    console.error("Erro ao criar conta a receber:", error);
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Erro interno ao criar conta a receber.",
      details: error.message,
    });
  }
};

const listReceivables = async (req, res) => {
  try {
    const data = await receivableService.listReceivables(req.query);
    if (data.pagination) {
      return res.json(data);
    }
    return res.json(data);
  } catch (error) {
    console.error("Erro ao listar contas a receber:", error);
    return res.status(500).json({
      error: "Erro ao listar contas a receber.",
      details: error.message,
    });
  }
};

const getReceivablesSummary = async (req, res) => {
  try {
    const summary = await receivableService.getReceivablesSummary();
    return res.json(summary);
  } catch (error) {
    console.error("Erro ao buscar resumo:", error);
    return res.status(500).json({
      error: "Erro ao buscar resumo das contas.",
      details: error.message,
    });
  }
};

const getReceivableById = async (req, res) => {
  try {
    const { id } = req.params;
    const receivable = await receivableService.getReceivableById(id);
    return res.json(receivable);
  } catch (error) {
    console.error("Erro ao buscar conta a receber por ID:", error);
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Erro ao buscar conta a receber.",
      details: error.message,
    });
  }
};

const updateReceivable = async (req, res) => {
  try {
    const { id } = req.params;
    const receivable = await receivableService.updateReceivable(id, req.body);
    return res.json({
      message: "Conta a receber atualizada com sucesso.",
      receivable,
    });
  } catch (error) {
    console.error("Erro ao atualizar conta a receber:", error);
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Erro ao atualizar conta a receber.",
      details: error.message,
    });
  }
};

const updateReceivableStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const receivable = await receivableService.updateReceivableStatus(id, status);
    return res.json({
      message: status === "cancelado"
          ? "Conta a receber cancelada com sucesso."
          : "Conta a receber reativada com sucesso.",
      receivable,
    });
  } catch (error) {
    console.error("Erro ao atualizar status da conta:", error);
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Erro ao atualizar status da conta.",
      details: error.message,
    });
  }
};

const receiveInstallment = async (req, res) => {
  try {
    const { installmentId } = req.params;
    const receivable = await receivableService.receiveInstallment(installmentId, req.body);
    return res.json({
      message: "Recebimento registrado com sucesso.",
      receivable,
    });
  } catch (error) {
    console.error("Erro ao registrar recebimento:", error);
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Erro ao registrar recebimento.",
      details: error.message,
    });
  }
};

const deleteReceivable = async (req, res) => {
  try {
    const { id } = req.params;
    await receivableService.deleteReceivable(id);
    return res.json({ message: "Conta a receber excluída com sucesso." });
  } catch (error) {
    console.error("Erro ao excluir conta a receber:", error);
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Erro ao excluir conta a receber.",
      details: error.message,
    });
  }
};

const reverseInstallmentReceipt = async (req, res) => {
  try {
    const { installmentId } = req.params;
    const receivable = await receivableService.reverseInstallmentReceipt(installmentId);
    return res.json({
      message: "Recebimento estornado com sucesso.",
      receivable,
    });
  } catch (error) {
    console.error("Erro ao estornar recebimento:", error);
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Erro ao estornar recebimento.",
      details: error.message,
    });
  }
};

const reverseReceivablePayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const receivable = await receivableService.reverseReceivablePayment(paymentId);
    return res.json({
      message: "Recebimento estornado com sucesso.",
      receivable,
    });
  } catch (error) {
    console.error("Erro ao estornar recebimento:", error);
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Erro ao estornar recebimento.",
      details: error.message,
    });
  }
};

const bulkUpdateReceivableStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const result = await receivableService.bulkUpdateReceivableStatus(req.body.ids, status);
    return res.json({
      message: status === "cancelado"
          ? `${result.affected_count} conta(s) cancelada(s) com sucesso.`
          : `${result.affected_count} conta(s) reativada(s) com sucesso.`,
      affected_count: result.affected_count,
    });
  } catch (error) {
    console.error("Erro ao atualizar contas em lote:", error);
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Erro ao atualizar contas em lote.",
      details: error.message,
      blocked: error.blocked,
    });
  }
};

const bulkReceiveReceivables = async (req, res) => {
  try {
    const result = await receivableService.bulkReceiveReceivables(req.body.ids, req.body);
    return res.json({
      message: "Recebimentos em lote registrados com sucesso.",
      affected_receivables: result.affected_receivables,
      affected_installments: result.affected_installments,
      received_amount: result.received_amount,
    });
  } catch (error) {
    console.error("Erro ao receber contas em lote:", error);
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Erro ao receber contas em lote.",
      details: error.message,
      blocked: error.blocked,
    });
  }
};

const bulkDeleteReceivables = async (req, res) => {
  try {
    const result = await receivableService.bulkDeleteReceivables(req.body.ids);
    return res.json({
      message: `${result.deleted_count} conta(s) e suas parcelas foram excluídas.`,
      deleted_count: result.deleted_count,
    });
  } catch (error) {
    console.error("Erro ao excluir contas em lote:", error);
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Erro ao excluir contas em lote.",
      details: error.message,
      blocked: error.blocked,
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
  bulkUpdateReceivableStatus,
  bulkReceiveReceivables,
  bulkDeleteReceivables,
};
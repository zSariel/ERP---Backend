const express = require("express");

const receivableController = require(
  "../controllers/receivableController"
);

const authMiddleware = require(
  "../middleware/authMiddleware"
);

const router = express.Router();

// Todas as rotas de contas a receber exigem autenticação.
router.use(authMiddleware);

// Listagem e resumo precisam ficar antes de /:id.
router.get(
  "/",
  receivableController.listReceivables
);

router.get(
  "/summary",
  receivableController.getReceivablesSummary
);

router.post(
  "/",
  receivableController.createReceivable
);

// Rotas específicas e em lote precisam ficar antes das rotas com /:id.
router.patch(
  "/payments/:paymentId/reverse",
  receivableController.reverseReceivablePayment
);

router.patch(
  "/bulk/status",
  receivableController.bulkUpdateReceivableStatus
);

router.post(
  "/bulk/receive",
  receivableController.bulkReceiveReceivables
);

router.delete(
  "/bulk",
  receivableController.bulkDeleteReceivables
);

router.patch(
  "/installments/:installmentId/receive",
  receivableController.receiveInstallment
);

router.patch(
  "/installments/:installmentId/reverse",
  receivableController.reverseInstallmentReceipt
);

router.patch(
  "/:id/status",
  receivableController.updateReceivableStatus
);

router.get(
  "/:id",
  receivableController.getReceivableById
);

router.put(
  "/:id",
  receivableController.updateReceivable
);

router.delete(
  "/:id",
  receivableController.deleteReceivable
);

module.exports = router;

const express = require("express");

const financialAccountController = require(
  "../controllers/financialAccountController"
);

const authMiddleware = require(
  "../middleware/authMiddleware"
);

const router = express.Router();

router.get(
  "/",
  authMiddleware,
  financialAccountController.listFinancialAccounts
);

router.post(
  "/",
  authMiddleware,
  financialAccountController.createFinancialAccount
);

router.patch(
  "/:id/status",
  authMiddleware,
  financialAccountController.updateFinancialAccountStatus
);

router.get(
  "/:id",
  authMiddleware,
  financialAccountController.getFinancialAccountById
);

router.put(
  "/:id",
  authMiddleware,
  financialAccountController.updateFinancialAccount
);

router.delete(
  "/:id",
  authMiddleware,
  financialAccountController.deleteFinancialAccount
);

module.exports = router;

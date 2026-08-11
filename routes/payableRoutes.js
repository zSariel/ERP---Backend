const express = require("express");

const {
  createPayable,
  listPayables,
  getPayablesSummary,
  getPayableById,
  updatePayable,
  updatePayableStatus,
  deletePayable,
  payInstallment,
  reversePayablePayment,
} = require("../controllers/payableController");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/", listPayables);
router.get("/summary", getPayablesSummary);

router.post("/", createPayable);

router.patch("/payments/:paymentId/reverse",reversePayablePayment);
router.patch("/installments/:installmentId/pay",payInstallment);
router.patch("/:id/status",updatePayableStatus);

router.get("/:id", getPayableById);
router.put("/:id", updatePayable);
router.delete("/:id", deletePayable);

module.exports = router;
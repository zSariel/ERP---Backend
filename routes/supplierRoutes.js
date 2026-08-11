const express = require("express");
const supplierController = require("../controllers/supplierController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", authMiddleware, supplierController.createSupplier);
router.get("/", authMiddleware, supplierController.listSuppliers);
router.put("/:id", authMiddleware, supplierController.updateSupplier);
router.delete("/:id", authMiddleware, supplierController.deleteSupplier);

module.exports = router;
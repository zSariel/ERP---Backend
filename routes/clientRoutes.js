const express = require("express");
const clientController = require("../controllers/clientController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", authMiddleware, clientController.createClient);
router.get("/", authMiddleware, clientController.listClients);
router.put("/:id", authMiddleware, clientController.updateClient);
router.delete("/:id", authMiddleware, clientController.deleteClient);

module.exports = router;
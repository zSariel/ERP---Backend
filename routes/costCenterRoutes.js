const express = require("express");
const costCenterController = require(
  "../controllers/costCenterController"
);
const authMiddleware = require(
  "../middleware/authMiddleware"
);

const router = express.Router();

router.get(
  "/",
  authMiddleware,
  costCenterController.listProjects
);

router.post(
  "/",
  authMiddleware,
  costCenterController.createProject
);

router.put(
  "/:id",
  authMiddleware,
  costCenterController.updateProject
);

router.delete(
  "/:id",
  authMiddleware,
  costCenterController.deleteProject
);

module.exports = router;
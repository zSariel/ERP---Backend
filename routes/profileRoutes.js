const express = require("express");

const authMiddleware = require("../middleware/authMiddleware");

const {
  getProfile,
  updateProfile,
  changePassword,
} = require("../controllers/profileController");

const router = express.Router();

/*
 * Todas as rotas de perfil
 * exigem usuário autenticado.
 */
router.use(authMiddleware);

router.get("/", getProfile);

router.patch("/", updateProfile);

router.patch("/password", changePassword);

module.exports = router;

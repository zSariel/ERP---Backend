const express = require("express");

const authMiddleware = require("../middleware/authMiddleware");

const adminMiddleware = require("../middleware/adminMiddleware");

const {
  createUser,
  listUsers,
  updateUserStatus,
  updateUserRole,
} = require("../controllers/adminUserController");

const router = express.Router();

/**
 * Todas as rotas abaixo:
 *
 * 1. precisam de login
 * 2. precisam ser admin
 */
router.use(authMiddleware);
router.use(adminMiddleware);

/**
 * POST /admin/users
 *
 * Criar novo usuário
 */
router.post("/", createUser);

/**
 * GET /admin/users
 *
 * Listar usuários
 */
router.get("/", listUsers);

/**
 * PATCH /admin/users/:id/status
 *
 * Ativar ou desativar usuário
 */
router.patch("/:id/status", updateUserStatus);

/**
 * PATCH /admin/users/:id/role
 *
 * Alterar permissão
 */
router.patch("/:id/role", updateUserRole);

module.exports = router;

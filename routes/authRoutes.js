const express = require("express");
<<<<<<< HEAD
=======

>>>>>>> master
const authController = require("../controllers/authController");

const router = express.Router();

<<<<<<< HEAD
router.post("/register", authController.register);
router.post("/login", authController.login);

module.exports = router;
=======
router.post("/login", authController.login);

router.post("/forgot-password", authController.forgotPassword);

router.post("/reset-password", authController.resetPassword);

module.exports = router;
>>>>>>> master

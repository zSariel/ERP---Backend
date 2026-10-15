function adminMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: "Usuário não autenticado.",
    });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({
      error:
        "Você não possui permissão para acessar este recurso.",
    });
  }

  return next();
}

module.exports = adminMiddleware;
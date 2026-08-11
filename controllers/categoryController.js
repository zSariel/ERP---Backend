const Category = require("../models/Category");

const createCategory = async (req, res) => {
  try {
    const { name, type, color, icon, description, active } = req.body;

    if (!name || !type) {
      return res.status(400).json({
        error: "Nome e tipo são obrigatórios.",
      });
    }

    if (!["receita", "despesa"].includes(type)) {
      return res.status(400).json({
        error: "Tipo deve ser receita ou despesa.",
      });
    }

    const category = await Category.create({
      name,
      type,
      color,
      icon,
      description,
      active,
    });

    return res.status(201).json(category);
  } catch (error) {
    console.error("Erro ao criar categoria:", error);
    return res.status(500).json({
      error: "Erro ao criar categoria.",
    });
  }
};

const listCategories = async (req, res) => {
  try {
    const categories = await Category.findAll({
      order: [["id", "DESC"]],
    });

    return res.json(categories);
  } catch (error) {
    console.error("Erro ao listar categorias:", error);
    return res.status(500).json({
      error: "Erro ao listar categorias.",
    });
  }
};

const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await Category.findByPk(id);

    if (!category) {
      return res.status(404).json({
        error: "Categoria não encontrada.",
      });
    }

    await category.update(req.body);

    return res.json(category);
  } catch (error) {
    console.error("Erro ao atualizar categoria:", error);
    return res.status(500).json({
      error: "Erro ao atualizar categoria.",
    });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await Category.findByPk(id);

    if (!category) {
      return res.status(404).json({
        error: "Categoria não encontrada.",
      });
    }

    await category.destroy();

    return res.json({
      message: "Categoria excluída com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao excluir categoria:", error);
    return res.status(500).json({
      error: "Erro ao excluir categoria.",
    });
  }
};

module.exports = {
  createCategory,
  listCategories,
  updateCategory,
  deleteCategory,
};
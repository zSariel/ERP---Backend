const Supplier = require("../models/Supplier");

const createSupplier = async (req, res) => {
  try {
    const { name, document, phone, email, city, address, note } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Nome é obrigatório." });
    }

    const supplier = await Supplier.create({
      name,
      document,
      phone,
      email,
      city,
      address,
      note,
    });

    return res.status(201).json(supplier);
  } catch (error) {
    console.error("Erro ao criar fornecedor:", error);
    return res.status(500).json({ error: "Erro ao criar fornecedor." });
  }
};

const listSuppliers = async (req, res) => {
  try {
    const suppliers = await Supplier.findAll({
      order: [["id", "DESC"]],
    });

    return res.json(suppliers);
  } catch (error) {
    console.error("Erro ao listar fornecedores:", error);
    return res.status(500).json({ error: "Erro ao listar fornecedores." });
  }
};

const updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;

    const supplier = await Supplier.findByPk(id);

    if (!supplier) {
      return res.status(404).json({ error: "Fornecedor não encontrado." });
    }

    await supplier.update(req.body);

    return res.json(supplier);
  } catch (error) {
    console.error("Erro ao atualizar fornecedor:", error);
    return res.status(500).json({ error: "Erro ao atualizar fornecedor." });
  }
};

const deleteSupplier = async (req, res) => {
  try {
    const { id } = req.params;

    const supplier = await Supplier.findByPk(id);

    if (!supplier) {
      return res.status(404).json({ error: "Fornecedor não encontrado." });
    }

    await supplier.destroy();

    return res.json({ message: "Fornecedor excluído com sucesso." });
  } catch (error) {
    console.error("Erro ao excluir fornecedor:", error);
    return res.status(500).json({ error: "Erro ao excluir fornecedor." });
  }
};

module.exports = {
  createSupplier,
  listSuppliers,
  updateSupplier,
  deleteSupplier,
};
const Client = require("../models/Client");

const createClient = async (req, res) => {
  try {
    const { name, document, phone, email, city, address, note } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Nome é obrigatório." });
    }

    const client = await Client.create({
      name,
      document,
      phone,
      email,
      city,
      address,
      note,
    });

    return res.status(201).json(client);
  } catch (error) {
    console.error("Erro ao criar cliente:", error);
    return res.status(500).json({ error: "Erro ao criar cliente." });
  }
};

const listClients = async (req, res) => {
  try {
    const clients = await Client.findAll({
      order: [["id", "DESC"]],
    });

    return res.json(clients);
  } catch (error) {
    console.error("Erro ao listar clientes:", error);
    return res.status(500).json({ error: "Erro ao listar clientes." });
  }
};

const updateClient = async (req, res) => {
  try {
    const { id } = req.params;

    const client = await Client.findByPk(id);

    if (!client) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    await client.update(req.body);

    return res.json(client);
  } catch (error) {
    console.error("Erro ao atualizar cliente:", error);
    return res.status(500).json({ error: "Erro ao atualizar cliente." });
  }
};

const deleteClient = async (req, res) => {
  try {
    const { id } = req.params;

    const client = await Client.findByPk(id);

    if (!client) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    await client.destroy();

    return res.json({ message: "Cliente excluído com sucesso." });
  } catch (error) {
    console.error("Erro ao excluir cliente:", error);
    return res.status(500).json({ error: "Erro ao excluir cliente." });
  }
};

module.exports = {
  createClient,
  listClients,
  updateClient,
  deleteClient,
};
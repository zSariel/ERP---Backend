-- Arcadia ERP - baseline do banco de desenvolvimento já existente.
--
-- Execute SOMENTE no banco local controle_financeiro que já possui as tabelas.
-- Este comando NÃO cria, altera ou apaga tabelas. Ele apenas informa ao
-- Sequelize CLI que a migration inicial corresponde ao schema já existente.

INSERT IGNORE INTO `sequelizemeta` (`name`)
VALUES ('20260811180000-initial-arcadia-schema.js');

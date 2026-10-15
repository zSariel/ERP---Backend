function generateReceivableCode(id) {
  return `REC-${String(id).padStart(6, "0")}`;
}

module.exports = {
  generateReceivableCode,
};

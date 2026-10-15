function addMonthsToDate(dateString, monthsToAdd) {
  const [year, month, day] = dateString.split("-").map(Number);

  const targetDate = new Date(
    Date.UTC(year, month - 1 + monthsToAdd, 1)
  );

  const lastDayOfTargetMonth = new Date(
    Date.UTC(
      targetDate.getUTCFullYear(),
      targetDate.getUTCMonth() + 1,
      0
    )
  ).getUTCDate();

  targetDate.setUTCDate(
    Math.min(day, lastDayOfTargetMonth)
  );

  return targetDate.toISOString().slice(0, 10);
}

function moneyToCents(value) {
  const normalizedValue = String(value ?? "")
    .trim()
    .replace(",", ".");

  const numericValue = Number(normalizedValue);

  if (!Number.isFinite(numericValue)) {
    return NaN;
  }

  return Math.round(numericValue * 100);
}

module.exports = {
  addMonthsToDate,
  moneyToCents,
};

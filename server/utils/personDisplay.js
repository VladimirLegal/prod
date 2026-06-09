function splitPassportSeriesNumber(passport) {
  const digits = String(passport || '').replace(/\D/g, '');
  if (digits.length >= 10) {
    return { series: digits.slice(0, 4), number: digits.slice(4, 10) };
  }
  return { series: '', number: '' };
}

module.exports = {
  splitPassportSeriesNumber,
};
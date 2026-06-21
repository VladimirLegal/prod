const MAX_DECIMAL_DENOMINATOR = 1000000;

const gcd = (a, b) => {
  let x = Math.abs(Number(a) || 0);
  let y = Math.abs(Number(b) || 0);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
};

export const simplifyFraction = (fraction) => {
  if (
    !fraction ||
    !Number.isFinite(fraction.n) ||
    !Number.isFinite(fraction.d) ||
    fraction.d === 0
  ) {
    return null;
  }
  const sign = fraction.d < 0 ? -1 : 1;
  const n = Math.trunc(fraction.n) * sign;
  const d = Math.abs(Math.trunc(fraction.d));
  const divisor = gcd(n, d);
  return { n: n / divisor, d: d / divisor };
};

export const parseFraction = (value) => {
  if (
    value &&
    typeof value === "object" &&
    value.n !== undefined &&
    value.d !== undefined
  ) {
    return simplifyFraction({ n: Number(value.n), d: Number(value.d) });
  }
  const text = String(value || "").trim();
  if (!text) return null;

  const slashMatch = text.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (slashMatch) {
    return simplifyFraction({
      n: Number(slashMatch[1]),
      d: Number(slashMatch[2]),
    });
  }

  const decimal = Number(text.replace(",", "."));
  if (Number.isFinite(decimal)) return decimalToFraction(decimal);
  return null;
};

export const createFraction = (n, d, { simplify = false } = {}) => {
  const numerator = Number(n);
  const denominator = Number(d);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  const fraction = { n: Math.trunc(numerator), d: Math.trunc(denominator) };
  return simplify ? simplifyFraction(fraction) : fraction;
};

export const formatRawFraction = (fraction) => {
  if (!fraction || !Number.isFinite(fraction.n) || !Number.isFinite(fraction.d) || fraction.d === 0) return "";
  const sign = fraction.d < 0 ? -1 : 1;
  const n = Math.trunc(fraction.n) * sign;
  const d = Math.abs(Math.trunc(fraction.d));
  if (d === 1) return String(n);
  return `${n}/${d}`;
};

export const formatFraction = (fraction) => {
  const simplified = simplifyFraction(fraction);
  return formatRawFraction(simplified);
};

export const moneyToKopecks = (value) => Math.round(parseMoney(value) * 100);

export const moneyRatioToFraction = (amount, total) => {
  const amountKopecks = moneyToKopecks(amount);
  const totalKopecks = moneyToKopecks(total);
  if (!amountKopecks || !totalKopecks) return null;
  return simplifyFraction({ n: amountKopecks, d: totalKopecks });
};

export const multiplyFractions = (a, b) => {
  const left = parseFraction(a);
  const right = parseFraction(b);
  if (!left || !right) return null;
  return simplifyFraction({ n: left.n * right.n, d: left.d * right.d });
};

export const divideFractionByNumber = (fraction, number) => {
  const parsed = parseFraction(fraction);
  const divisor = Number(number);
  if (!parsed || !Number.isFinite(divisor) || divisor === 0) return null;
  return simplifyFraction({ n: parsed.n, d: parsed.d * divisor });
};

export const sumFractions = (fractions = []) => {
  const parsed = fractions.map(parseFraction).filter(Boolean);
  if (!parsed.length) return null;
  return simplifyFraction(
    parsed.reduce(
      (acc, fraction) => ({
        n: acc.n * fraction.d + fraction.n * acc.d,
        d: acc.d * fraction.d,
      }),
      { n: 0, d: 1 },
    ),
  );
};

export const compareFractions = (a, b) => {
  const left = parseFraction(a);
  const right = parseFraction(b);
  if (!left || !right) return null;
  const diff = left.n * right.d - right.n * left.d;
  if (diff === 0) return 0;
  return diff > 0 ? 1 : -1;
};

export function decimalToFraction(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const sign = number < 0 ? -1 : 1;
  const absolute = Math.abs(number);
  const text = String(absolute);
  if (!text.includes("."))
    return simplifyFraction({ n: sign * absolute, d: 1 });
  const decimals = Math.min(text.split(".")[1].length, 6);
  const denominator = Math.min(10 ** decimals, MAX_DECIMAL_DENOMINATOR);
  return simplifyFraction({
    n: sign * Math.round(absolute * denominator),
    d: denominator,
  });
}

export const fractionToDecimal = (fraction) => {
  const parsed = parseFraction(fraction);
  if (!parsed) return 0;
  return parsed.n / parsed.d;
};

export const subtractFractions = (a, b) => {
  const left = parseFraction(a);
  const right = parseFraction(b);
  if (!left || !right) return null;
  return simplifyFraction({
    n: left.n * right.d - right.n * left.d,
    d: left.d * right.d,
  });
};

export const ceilDecimalToStep = (value, step) => {
  const number = Number(value);
  const size = Number(step);
  if (!Number.isFinite(number) || !Number.isFinite(size) || size <= 0) return 0;
  return Math.ceil((number - Number.EPSILON) / size) * size;
};

export const ceilSquareMeters = (value, decimals = 2) => {
  const factor = 10 ** Number(decimals || 0);
  return Math.ceil((Number(value) || 0) * factor - Number.EPSILON) / factor;
};

export const ceilPercent = (value, decimals = 0) => {
  const factor = 10 ** Number(decimals || 0);
  return (
    Math.ceil((Number(value) || 0) * 100 * factor - Number.EPSILON) / factor
  );
};

export const ceilFractionToReadableFraction = (fraction) => {
  const decimal = fractionToDecimal(fraction);
  if (!decimal) return null;

  const denominators = [
    100, 200, 250, 500, 1000, 1250, 2000, 2500, 5000, 10000,
  ];

  let best = null;

  for (const denominator of denominators) {
    const numerator = Math.ceil(decimal * denominator - Number.EPSILON);
    const candidate = simplifyFraction({ n: numerator, d: denominator });
    if (!candidate) continue;

    const candidateDecimal = fractionToDecimal(candidate);

    // Не допускаем округление вниз.
    if (candidateDecimal + 1e-12 < decimal) continue;

    const excess = candidateDecimal - decimal;

    if (
      !best ||
      excess < best.excess - 1e-12 ||
      (Math.abs(excess - best.excess) <= 1e-12 &&
        candidate.d < best.fraction.d)
    ) {
      best = {
        fraction: candidate,
        excess,
      };
    }
  }

  return (
    best?.fraction ||
    simplifyFraction({
      n: Math.ceil(decimal * 10000 - Number.EPSILON),
      d: 10000,
    })
  );
};

export const parseMoney = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value || "")
    .replace(/\s+/g, "")
    .replace(/руб\.?/gi, "")
    .replace(/коп\.?/gi, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatMoneyInput = (value) => {
  const amount = parseMoney(value);
  return amount
    .toLocaleString("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    .replace(/\u00a0/g, " ");
};

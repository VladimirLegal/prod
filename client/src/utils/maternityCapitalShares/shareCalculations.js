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

export const formatFraction = (fraction) => {
  const simplified = simplifyFraction(fraction);
  if (!simplified) return "";
  if (simplified.d === 1) return String(simplified.n);
  return `${simplified.n}/${simplified.d}`;
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

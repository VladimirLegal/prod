export const getFullName = (person = {}) =>
  [person.lastName, person.firstName, person.middleName]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ") ||
  person.fullNameRaw ||
  "";

export const splitFullName = (fullName = "") => {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  return {
    lastName: parts[0] || "",
    firstName: parts[1] || "",
    middleName: parts.slice(2).join(" "),
  };
};

export const splitPassport = (passport = "") => {
  const digits = String(passport).replace(/\D/g, "");
  return {
    series: digits.slice(0, 4),
    number: digits.slice(4, 10),
  };
};

import petrovich from "petrovich";

export const splitFio = (fullName = "") => {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  const [last = "", first = "", middle = ""] = parts;
  return { last, first, middle };
};

export const joinFio = ({ last = "", first = "", middle = "" } = {}) =>
  [last, first, middle].filter(Boolean).join(" ").trim();

export const declineGenitive = (fullName = "", gender = "") => {
  if (!fullName) return "";
  try {
    const person = splitFio(fullName);
    if (gender) person.gender = gender;
    const declined = petrovich(person, "genitive");
    return joinFio(declined);
  } catch {
    return fullName;
  }
};

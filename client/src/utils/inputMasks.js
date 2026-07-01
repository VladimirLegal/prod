export const formatDateInput = (value = "") => {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  return [dd, mm, yyyy].filter(Boolean).join(".");
};

export const formatPassportInput = (value = "") => {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 10);

  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)} ${digits.slice(4, 10)}`;
};

export const formatDepartmentCodeInput = (value = "") => {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 6);

  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}`;
};

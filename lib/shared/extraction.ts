export type FieldDataType = "text" | "number" | "date" | "email";
export type SchemaField = { key: string; label: string; dataType?: FieldDataType };

export function normalizeKey(value: string) {
  return value.replace(/Đ/g, "D").replace(/đ/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function countMissingFields(rows: Array<Record<string, unknown>>, fields: SchemaField[]) {
  return rows.reduce((sum, row) => sum + fields.filter((field) => !String(row[field.key] ?? "").trim()).length, 0);
}

export function inferFieldType(values: unknown[]): FieldDataType {
  const samples = values.map((value) => String(value ?? "").trim()).filter(Boolean).slice(0, 20);
  if (!samples.length) return "text";
  if (samples.every((value) => /^\S+@\S+\.\S+$/.test(value))) return "email";
  if (samples.every((value) => !Number.isNaN(Number(value.replace(/[$€£¥,%\s]/g, "").replace(/,/g, ""))))) return "number";
  if (samples.every((value) => !Number.isNaN(Date.parse(value)) && /[-/.]/.test(value))) return "date";
  return "text";
}

export function isValidFieldValue(value: unknown, field: SchemaField) {
  const text = String(value ?? "").trim();
  if (!text || !field.dataType || field.dataType === "text") return true;
  if (field.dataType === "email") return /^\S+@\S+\.\S+$/.test(text);
  if (field.dataType === "number") return !Number.isNaN(Number(text.replace(/[$€£¥,%\s]/g, "").replace(/,/g, "")));
  if (field.dataType === "date") return !Number.isNaN(Date.parse(text));
  return true;
}

export function countReviewIssues(rows: Array<Record<string, unknown>>, fields: SchemaField[]) {
  return rows.reduce((sum, row) => sum + fields.filter((field) => !String(row[field.key] ?? "").trim() || !isValidFieldValue(row[field.key], field)).length, 0);
}

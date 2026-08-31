import type { ExtractionField } from "./gemini";
import { HttpError } from "./http";

export function parseFields(value: unknown): ExtractionField[] {
  let parsed: unknown;
  try { parsed = typeof value === "string" ? JSON.parse(value) : value; }
  catch { throw new HttpError(400, "fields phải là JSON hợp lệ.", "invalid_fields"); }
  if (!Array.isArray(parsed) || !parsed.length || parsed.length > 200) throw new HttpError(400, "Schema cần từ 1 đến 200 fields.", "invalid_fields");
  const fields = parsed.map((field) => {
    if (!field || typeof field !== "object") throw new HttpError(400, "Field không hợp lệ.", "invalid_fields");
    const key = String((field as Record<string, unknown>).key ?? "").trim();
    const label = String((field as Record<string, unknown>).label ?? "").trim();
    if (!/^[a-zA-Z0-9_]{1,100}$/.test(key) || !label || label.length > 200) throw new HttpError(400, "Field key hoặc label không hợp lệ.", "invalid_fields");
    const dataType = (field as Record<string, unknown>).dataType;
    return { key, label, ...(["text", "number", "date", "email"].includes(String(dataType)) ? { dataType } : {}) } as ExtractionField;
  });
  if (new Set(fields.map((field) => field.key)).size !== fields.length) throw new HttpError(400, "Field key không được trùng nhau.", "duplicate_fields");
  return fields;
}

export function assertSupportedFile(file: File) {
  if (!/\.(pdf|png|jpe?g|webp|xlsx?|csv)$/i.test(file.name)) throw new HttpError(415, `${file.name}: định dạng file chưa được hỗ trợ.`, "unsupported_file");
}

export function assertUuid(value: string, label = "id") {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new HttpError(400, `${label} không hợp lệ.`, "invalid_id");
  return value;
}

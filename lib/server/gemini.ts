import { env } from "./env";
import type { FieldDataType } from "../shared/extraction";

export type ExtractionField = { key: string; label: string; dataType?: FieldDataType };
type GeminiPayload = { error?: { message?: string }; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };

export async function extractWithGemini(input: { buffer: Uint8Array; mimeType: string; fields: ExtractionField[]; apiKey?: string }) {
  const apiKey = input.apiKey || env.geminiApiKey;
  if (!apiKey) throw new Error("Gemini API key chưa được cấu hình trên server.");
  const fieldProperties = Object.fromEntries(input.fields.map((field) => [field.key, {
    type: "object",
    properties: {
      value: { type: ["string", "null"], description: `Extracted ${field.label}; null when not explicitly present.` },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      source_text: { type: ["string", "null"], description: "Shortest exact text span supporting this value." },
      page: { type: ["integer", "null"], description: "1-based page number when available." },
    },
    required: ["value", "confidence", "source_text", "page"],
    additionalProperties: false,
  }]));
  const recordSchema = { type: "object", properties: fieldProperties, required: input.fields.map((field) => field.key), additionalProperties: false };
  const prompt = `Extract every line item/record from this business document into the requested schema.\n\nCritical rules:\n- Never infer or guess a missing business value. Return null.\n- Return one record per line item. If the document has only document-level data, return one record.\n- Repeat explicitly present document-level values for each line item.\n- Preserve original meaning and currency.\n- confidence measures whether the value is explicitly supported by the source.\n- source_text must be a short exact span from the document.\n\nFields:\n${input.fields.map((field) => `- ${field.key}: ${field.label}`).join("\n")}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: input.mimeType, data: Buffer.from(input.buffer).toString("base64") } }] }],
      generationConfig: { responseFormat: { text: { mimeType: "application/json", schema: { type: "object", properties: { records: { type: "array", items: recordSchema } }, required: ["records"], additionalProperties: false } } } },
    }),
  });
  const payload = await response.json() as GeminiPayload;
  if (!response.ok) throw new Error(payload.error?.message || "Gemini API từ chối yêu cầu.");
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
  if (!text) throw new Error("Gemini không trả về dữ liệu có cấu trúc.");
  return JSON.parse(text) as { records: Array<Record<string, { value: string | null; confidence: number; source_text: string | null; page: number | null }>> };
}

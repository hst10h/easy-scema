import { NextResponse } from "next/server";

type Field = { key: string; label: string };
type GeminiPayload = {
  error?: { message?: string };
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunk, bytes.length)));
  }
  return btoa(binary);
}

export async function POST(request: Request) {
  const apiKey = request.headers.get("x-gemini-api-key")?.trim() || process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Gemini API key chưa được cấu hình trên server." }, { status: 503 });

  try {
    const form = await request.formData();
    const file = form.get("file");
    const fields = JSON.parse(String(form.get("fields") ?? "[]")) as Field[];
    if (!(file instanceof File) || !fields.length) return NextResponse.json({ error: "File hoặc schema không hợp lệ." }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "MVP hiện giới hạn 20 MB mỗi file." }, { status: 413 });

    const fieldProperties = Object.fromEntries(fields.map((field) => [field.key, {
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
    const recordSchema = { type: "object", properties: fieldProperties, required: fields.map((field) => field.key), additionalProperties: false };
    const prompt = `Extract every line item/record from this business document into the requested schema.\n\nCritical rules:\n- Never infer or guess a missing business value. Return null.\n- Return one record per line item. If the document has only document-level data, return one record.\n- Repeat document-level values (supplier, currency, quote number, etc.) for each line item when explicitly present.\n- Preserve original meaning and currency.\n- confidence measures whether the value is explicitly supported by the source.\n- source_text must be a short exact span from the document.\n\nFields:\n${fields.map((field) => `- ${field.key}: ${field.label}`).join("\n")}`;
    const geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: file.type || "application/octet-stream", data: toBase64(await file.arrayBuffer()) } }] }],
        generationConfig: { responseFormat: { text: { mimeType: "application/json", schema: { type: "object", properties: { records: { type: "array", items: recordSchema } }, required: ["records"], additionalProperties: false } } } },
      }),
    });
    const payload = await geminiResponse.json() as GeminiPayload;
    if (!geminiResponse.ok) throw new Error(payload?.error?.message || "Gemini API từ chối yêu cầu.");
    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
    if (!text) throw new Error("Gemini không trả về dữ liệu có cấu trúc.");
    return NextResponse.json(JSON.parse(text));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể trích xuất tài liệu." }, { status: 500 });
  }
}

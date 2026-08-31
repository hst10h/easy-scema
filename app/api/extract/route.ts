import { NextResponse } from "next/server";
import { env } from "@/lib/server/env";
import { extractWithGemini } from "@/lib/server/gemini";
import { clientIp, HttpError, jsonError } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { assertSupportedFile, parseFields } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    if (env.redisUrl) await rateLimit(`extract:${clientIp(request) ?? "unknown"}`, 20, 60);
    const apiKey = request.headers.get("x-gemini-api-key")?.trim() || env.geminiApiKey;
    if (!apiKey) throw new HttpError(503, "Gemini API key chưa được cấu hình trên server.", "gemini_not_configured");
    const form = await request.formData();
    const file = form.get("file");
    const fields = parseFields(form.get("fields"));
    if (!(file instanceof File)) throw new HttpError(400, "File không hợp lệ.", "invalid_extraction");
    assertSupportedFile(file);
    if (file.size > env.maxFileSizeMb * 1024 * 1024) throw new HttpError(413, `Giới hạn ${env.maxFileSizeMb} MB mỗi file.`, "file_too_large");
    const result = await extractWithGemini({ buffer: new Uint8Array(await file.arrayBuffer()), mimeType: file.type || "application/octet-stream", fields, apiKey });
    return NextResponse.json(result);
  } catch (error) { return jsonError(error); }
}

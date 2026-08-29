import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const apiKey = request.headers.get("x-gemini-api-key")?.trim();
  if (!apiKey) return NextResponse.json({ error: "Chưa nhập Gemini API key." }, { status: 400 });
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash", {
      headers: { "x-goog-api-key": apiKey },
    });
    const payload = await response.json() as { error?: { message?: string }; name?: string };
    if (!response.ok) return NextResponse.json({ error: payload.error?.message || "API key không hợp lệ." }, { status: response.status });
    return NextResponse.json({ ok: true, model: payload.name });
  } catch {
    return NextResponse.json({ error: "Không thể kết nối tới Gemini." }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { isIP } from "node:net";
import { logger } from "./logger";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = "request_error") {
    super(message);
  }
}

export function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  logger.error({ error }, "Unhandled API error");
  return NextResponse.json({ error: "Lỗi máy chủ. Vui lòng thử lại.", code: "internal_error" }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<T> {
  try { return await request.json() as T; }
  catch { throw new HttpError(400, "JSON không hợp lệ.", "invalid_json"); }
}

export function clientIp(request: Request) {
  const value = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "";
  return isIP(value) ? value : null;
}

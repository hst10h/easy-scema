import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  delete process.env.AUTH_SECRET;
  vi.resetModules();
});

describe("signed browser sessions", () => {
  it("round-trips a valid HttpOnly session cookie", async () => {
    process.env.AUTH_SECRET = "test-secret-that-is-longer-than-thirty-two-characters";
    const auth = await import("./auth");
    const session = {
      userId: "00000000-0000-0000-0000-000000000001",
      email: "owner@example.com",
      name: "Owner",
      workspaceId: "00000000-0000-0000-0000-000000000002",
      workspaceName: "Acme",
      role: "owner" as const,
      plan: "free" as const,
    };
    const token = await auth.createSessionToken(session);
    const cookie = auth.sessionCookie(token);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    const decoded = await auth.sessionFromRequest(new Request("http://localhost", { headers: { cookie } }));
    expect(decoded).toMatchObject(session);
  });

  it("rejects a tampered token", async () => {
    process.env.AUTH_SECRET = "test-secret-that-is-longer-than-thirty-two-characters";
    const auth = await import("./auth");
    const request = new Request("http://localhost", { headers: { cookie: `${auth.SESSION_COOKIE}=invalid.token.value` } });
    expect(await auth.sessionFromRequest(request)).toBeNull();
  });
});

import postgres from "postgres";
import { env } from "./env";

const globalDatabase = globalThis as typeof globalThis & { structflowSql?: ReturnType<typeof postgres> };

export function db() {
  if (!env.databaseUrl) throw new Error("DATABASE_URL is not configured");
  if (!globalDatabase.structflowSql) {
    globalDatabase.structflowSql = postgres(env.databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }
  return globalDatabase.structflowSql;
}

export function serverModeAvailable() {
  return Boolean(env.databaseUrl && env.authSecret);
}

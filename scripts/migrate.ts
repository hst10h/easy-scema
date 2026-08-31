import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sql = postgres(databaseUrl, { max: 1 });
const directory = resolve(process.cwd(), "db/migrations");

try {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const appliedRows = await sql<{ filename: string }[]>`SELECT filename FROM schema_migrations`;
  const applied = new Set(appliedRows.map((row) => row.filename));
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const source = await readFile(resolve(directory, file), "utf8");
    await sql.begin(async (transaction) => {
      await transaction.unsafe(source);
      await transaction`INSERT INTO schema_migrations (filename) VALUES (${file}) ON CONFLICT DO NOTHING`;
    });
    process.stdout.write(`Applied ${file}\n`);
  }
} finally {
  await sql.end();
}

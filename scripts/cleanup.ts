import { db } from "../lib/server/db";
import { env } from "../lib/server/env";
import { deleteSource } from "../lib/server/storage";

const sql = db();
const jobs = await sql<{ id: string }[]>`
  SELECT id FROM jobs WHERE created_at < now() - (${env.dataRetentionDays}::text || ' days')::interval
`;
let deletedJobs = 0;
let deletedFiles = 0;

for (const job of jobs) {
  const files = await sql<{ storage_key: string }[]>`SELECT storage_key FROM job_files WHERE job_id = ${job.id}`;
  const results = await Promise.allSettled(files.map((file) => deleteSource(file.storage_key)));
  if (results.some((result) => result.status === "rejected")) {
    process.stderr.write(`Retained job ${job.id}: one or more source files could not be deleted.\n`);
    continue;
  }
  await sql`DELETE FROM jobs WHERE id = ${job.id}`;
  deletedJobs += 1;
  deletedFiles += files.length;
}

process.stdout.write(`Deleted ${deletedJobs} jobs and ${deletedFiles} source files.\n`);
await sql.end();

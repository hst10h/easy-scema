import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env";

export const EXTRACTION_QUEUE = "structflow-extractions";
const globalQueue = globalThis as typeof globalThis & { structflowQueue?: Queue; structflowRedis?: IORedis };

export function redisConnection() {
  if (!env.redisUrl) throw new Error("REDIS_URL is not configured");
  if (!globalQueue.structflowRedis) globalQueue.structflowRedis = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
  return globalQueue.structflowRedis;
}

export function extractionQueue() {
  if (!globalQueue.structflowQueue) globalQueue.structflowQueue = new Queue(EXTRACTION_QUEUE, { connection: redisConnection() });
  return globalQueue.structflowQueue;
}

export async function enqueueExtraction(jobId: string) {
  return extractionQueue().add("extract", { jobId }, { jobId, attempts: 3, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: 1000, removeOnFail: 5000 });
}

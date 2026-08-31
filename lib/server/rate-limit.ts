import { redisConnection } from "./queue";
import { HttpError } from "./http";

export async function rateLimit(key: string, limit = 60, windowSeconds = 60) {
  const redis = redisConnection();
  const bucket = `rate:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
  const count = await redis.incr(bucket);
  if (count === 1) await redis.expire(bucket, windowSeconds + 1);
  if (count > limit) throw new HttpError(429, "Bạn thao tác quá nhanh. Vui lòng thử lại sau.", "rate_limited");
}

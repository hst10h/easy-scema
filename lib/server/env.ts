
function optional(name: string) {
  return process.env[name]?.trim() || undefined;
}

function integer(name: string, fallback: number) {
  const value = Number(optional(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const env = {
  appUrl: optional("APP_URL") ?? "http://localhost:5173",
  databaseUrl: optional("DATABASE_URL"),
  redisUrl: optional("REDIS_URL"),
  authSecret: optional("AUTH_SECRET"),
  geminiApiKey: optional("GEMINI_API_KEY"),
  geminiModel: optional("GEMINI_MODEL") ?? "gemini-3.7-flash",
  s3Endpoint: optional("S3_ENDPOINT"),
  s3Region: optional("S3_REGION") ?? "us-east-1",
  s3Bucket: optional("S3_BUCKET") ?? "structflow",
  s3AccessKey: optional("S3_ACCESS_KEY"),
  s3SecretKey: optional("S3_SECRET_KEY"),
  s3ForcePathStyle: optional("S3_FORCE_PATH_STYLE") !== "false",
  stripeSecretKey: optional("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: optional("STRIPE_WEBHOOK_SECRET"),
  stripePricePro: optional("STRIPE_PRICE_PRO"),
  googleServiceAccountJson: optional("GOOGLE_SERVICE_ACCOUNT_JSON"),
  freeMonthlyPages: integer("FREE_MONTHLY_PAGES", 50),
  maxFileSizeMb: integer("MAX_FILE_SIZE_MB", 20),
  dataRetentionDays: integer("DATA_RETENTION_DAYS", 30),
  workerConcurrency: integer("WORKER_CONCURRENCY", 3),
  logLevel: optional("LOG_LEVEL") ?? "info",
  secureCookies: optional("NODE_ENV") === "production",
};

export function requireServerConfig() {
  if (!env.databaseUrl || !env.authSecret) throw new Error("Server mode requires DATABASE_URL and AUTH_SECRET");
}

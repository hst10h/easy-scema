# Deployment

## Required services

- Node.js 22+
- PostgreSQL 15+
- Redis 7+
- S3-compatible object storage
- One web process and at least one worker process

## Release sequence

1. Build the same immutable image for web and worker.
2. Run `npm run db:migrate` once.
3. Start the web process with `npm start`.
4. Start workers with `npm run worker`.
5. Check `/api/health`.
6. Configure the Stripe webhook if billing is enabled.
7. Schedule `npm run data:cleanup` daily.

Migrations are append-only SQL files in `db/migrations`. The migration runner records applied filenames in `schema_migrations` and executes each new file in a transaction.

## Scaling

- Web processes are stateless and can scale horizontally.
- Worker concurrency defaults to three jobs per process. Scale worker replicas based on Gemini quota and memory.
- PostgreSQL remains the source of truth; Redis queue data can be rebuilt for queued Jobs if necessary.
- Put a CDN/reverse proxy in front of the app and enforce HTTPS.

## Backups

- Daily PostgreSQL backup with point-in-time recovery.
- S3 versioning or lifecycle backup matching the retention policy.
- Redis persistence is useful but is not a replacement for PostgreSQL backups.

## Production checklist

- Replace every development password from `.env.example`.
- Use a 32+ byte random `AUTH_SECRET`.
- Restrict database, Redis and object storage to private networking.
- Configure S3 bucket encryption and lifecycle policies.
- Configure Gemini and Stripe quotas/alerts.
- Send structured logs to the platform log collector.
- Alert on `/api/health`, failed jobs and credit anomalies.

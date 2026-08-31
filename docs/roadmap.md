# Roadmap status

| Milestone | Implementation | Activation requirement |
|---|---|---|
| Local extraction MVP | Complete | Gemini key entered in Settings |
| Browser persistence | Complete | None |
| Mobile navigation | Complete | None |
| PostgreSQL persistence | Complete | `DATABASE_URL` and migration |
| Authentication and roles | Complete | `AUTH_SECRET` |
| Team workspaces and invitations | Complete | Server mode |
| Object storage | Complete | S3-compatible credentials |
| Background queue and retry | Complete | Redis plus worker process |
| Page-based credits | Complete | Worker and database |
| Stripe subscriptions | Complete | Stripe keys, price and webhook |
| Workspace API keys | Complete | Server mode |
| Outbound webhooks | Complete | HTTPS customer endpoint |
| Google Sheets export | Complete | Service-account JSON |
| Audit log and retention | Complete | Daily cleanup schedule |
| Health checks and structured logs | Complete | Monitoring/log collector |
| Docker self-hosting | Complete | Docker host |
| CI and production dependency audit | Complete | GitHub Actions enabled |

## Launch operations

The remaining launch work is infrastructure activation rather than application implementation:

1. Provision production PostgreSQL, Redis and S3.
2. Generate secrets and configure Gemini.
3. Run migrations and start web/worker replicas.
4. Configure domain, HTTPS, backups and monitoring.
5. Optionally connect Stripe and Google service accounts.
6. Run a representative document accuracy benchmark before accepting customer data.

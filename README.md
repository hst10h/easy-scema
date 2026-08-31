# StructFlow

StructFlow biến PDF, ảnh scan, CSV và Excel không đồng nhất thành bảng dữ liệu đúng schema người dùng cung cấp. Sản phẩm ưu tiên khả năng kiểm chứng: field không có bằng chứng được để trống, còn giá trị trích xuất giữ confidence, trang và đoạn text nguồn.

## Trạng thái

Repo hỗ trợ hai chế độ:

- **Local mode:** chạy ngay với một tiến trình web; Gemini key ở `sessionStorage`, Jobs/Templates ở `localStorage`.
- **Server mode:** PostgreSQL, Redis/BullMQ, S3-compatible storage, authentication, workspace, background worker, credits, Stripe hooks, API keys, webhooks và audit log.

## Tính năng

- Đọc schema từ header của XLSX, XLS hoặc CSV.
- Upload tối đa 100 PDF, ảnh hoặc spreadsheet mỗi job.
- Gemini structured extraction với no-hallucination rule.
- Queue, retry, progress và trạng thái theo từng file.
- Review trực tiếp, source reference và confidence.
- Export XLSX, CSV hoặc Google Sheets.
- Templates và Jobs có persistence.
- Email/password auth với HttpOnly signed session.
- Workspace, roles, invitations và audit log.
- Stripe Checkout/Customer Portal và monthly credits.
- REST API bằng workspace API key.
- Signed outbound webhooks cho job completed/failed.
- Health check, structured logging, retention cleanup và CI.
- Mobile navigation.

## Chạy nhanh ở local mode

```bash
git clone https://github.com/hst10h/easy-scema.git
cd easy-scema
npm install
npm run dev
```

Mở `http://localhost:5173`, vào **Settings**, nhập Gemini API key và chọn **Test connection**. Không cần database.

## Chạy full stack

Yêu cầu Docker và Docker Compose:

```bash
cp .env.example .env
```

Sửa tối thiểu:

```env
AUTH_SECRET=a-random-secret-with-at-least-32-characters
GEMINI_API_KEY=your-server-side-gemini-key
```

Sau đó:

```bash
docker compose up --build
```

Các địa chỉ mặc định:

- StructFlow: `http://localhost:5173`
- MinIO API: `http://localhost:9000`
- MinIO console: `http://localhost:9001`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

Migration được chạy tự động trước app và worker.

## Chạy từng dịch vụ không dùng Docker

```bash
npm install
npm run db:migrate
npm run dev
```

Ở terminal khác:

```bash
npm run worker
```

PostgreSQL, Redis và S3-compatible storage phải hoạt động theo `.env`.

## REST API

Tạo workspace API key trong **Settings**. Secret chỉ hiển thị một lần.

Tạo extraction:

```bash
curl -X POST http://localhost:5173/api/v1/extractions \
  -H "Authorization: Bearer sf_live_your_key" \
  -F 'templateName=Supplier quotation' \
  -F 'fields=[{"key":"sku","label":"SKU"},{"key":"price","label":"Price"}]' \
  -F 'files=@quotation.pdf'
```

Theo dõi kết quả:

```bash
curl http://localhost:5173/api/v1/extractions/JOB_ID \
  -H "Authorization: Bearer sf_live_your_key"
```

## Webhooks

Payload:

```json
{
  "id": "event-id",
  "event": "job.completed",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "data": {
    "jobId": "uuid",
    "status": "needs_review",
    "rowCount": 12,
    "warningCount": 2
  }
}
```

Header `x-structflow-signature` chứa `sha256=<hex HMAC>` của raw JSON body với webhook secret.

## Stripe

Cấu hình:

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO=price_...
```

Webhook endpoint:

```text
POST /api/billing/webhook
```

Theo dõi các sự kiện `customer.subscription.created`, `customer.subscription.updated` và `customer.subscription.deleted`.

## Google Sheets

Tạo service account, chia sẻ spreadsheet cho email của service account, sau đó đặt JSON credential trên một dòng:

```env
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

## Vận hành

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:coverage
npm run build
npm run data:cleanup
```

`data:cleanup` xóa Jobs và file nguồn cũ hơn `DATA_RETENTION_DAYS`. Nên chạy mỗi ngày bằng cron hoặc scheduler.

Health endpoint:

```text
GET /api/health
```

## Cấu trúc chính

```text
app/page.tsx                         UI local và server mode
app/api/auth/                        Authentication
app/api/jobs/                        Job management
app/api/templates/                   Template management
app/api/v1/                          Public REST API
app/api/billing/                     Stripe endpoints
app/api/integrations/                Google Sheets
db/migrations/                       PostgreSQL schema
lib/server/                          Auth, database, Gemini, queue, S3
lib/shared/                          Logic dùng chung và unit tests
worker/index.ts                      BullMQ extraction worker
scripts/migrate.ts                   Migration runner
scripts/cleanup.ts                   Retention cleanup
docker-compose.yml                   Full local stack
```

## Bảo mật

- Không commit `.env` hoặc API key thật.
- Production phải dùng HTTPS và secret ngẫu nhiên.
- Session cookie là HttpOnly, SameSite=Lax và Secure trong production.
- Password dùng bcrypt cost 12.
- Workspace API keys chỉ lưu SHA-256 hash.
- File được ghi S3 với server-side encryption flag.
- Download file dùng signed URL hết hạn sau 5 phút.
- Webhook production chỉ nhận HTTPS URL.
- Log redact password, token, secret và authorization header.

Xem thêm [roadmap status](docs/roadmap.md), [kiến trúc](docs/architecture.md), [deployment](docs/deployment.md) và [security](docs/security.md).

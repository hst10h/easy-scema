# Security model

## Authentication and authorization

- Passwords are hashed with bcrypt cost 12.
- Sessions are signed HS256 JWTs stored in HttpOnly cookies.
- Every database query for user data includes the active workspace ID.
- Mutations enforce role checks: owner, admin, member or viewer.
- Workspace API keys are shown once and stored only as SHA-256 hashes.

## Files and extraction

- File count and size are validated before upload.
- Storage keys include workspace and job IDs.
- Source downloads use five-minute signed URLs.
- Gemini receives source bytes and the target schema. Missing values must be null.
- The database stores only short evidence spans, not hidden model reasoning.

## Integrations

- Stripe webhook events require signature verification.
- Outbound webhook payloads use HMAC-SHA256 signatures.
- Production webhook destinations must use HTTPS.
- Google credentials remain server-side.

## Remaining hardening before public launch

- Add email verification, password reset and optional MFA.
- Add CSRF tokens for high-risk browser mutations if cross-site embedding is introduced.
- Add malware scanning before worker processing.
- Add SSRF egress rules in infrastructure in addition to URL validation.
- Add per-workspace concurrency and cost limits.
- Commission dependency and penetration testing.

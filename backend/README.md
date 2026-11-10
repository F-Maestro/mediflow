# MediFlow backend

Node.js 24 + Express 5 API, PostgreSQL persistence, OTP authentication, role-based staff access, queue/wait calculations, triage readings, appointments, payment intents, WhatsApp message adapters, and privacy-aware audit records.

## Start locally

1. Install Node.js 24 LTS.
2. Start PostgreSQL 16 or newer. Docker Compose is provided in this folder (`docker compose up -d db`); alternatively use a PostgreSQL host in Kenya and its TLS connection string.
3. Copy `.env.example` to `.env`. Run `npm run secrets` and paste its three generated values into the matching `SESSION_PEPPER`, `OTP_HMAC_KEY`, and `DATA_ENCRYPTION_KEY` entries; development mock providers can stay enabled.
4. Run `npm install` in `backend/`, then `npm run migrate`, then `npm run dev`.
5. Check `http://localhost:4000/health/ready`.

The development OTP provider prints codes to the backend console. Patients can sign in with a phone OTP or a passphrase; registration verifies the phone and creates a passphrase. Existing accounts can set or reset a passphrase using a phone OTP. Staff sign in with a passphrase followed by a phone OTP; provision staff with `npm run staff:create -- --phone +2547... --name "Admin Name" --role admin`, then use “Set or reset passphrase” on the staff login page. Mock M-Pesa and console OTP never contact live providers; mock providers are rejected in production.

## API v1 (initial)

- `POST /api/v1/auth/otp/request`, `POST /api/v1/auth/otp/verify`, `POST /api/v1/auth/register`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`
- `POST /api/v1/auth/password/login`, `POST /api/v1/auth/password/reset`
- `GET/POST /api/v1/appointments`, `POST /api/v1/appointments/:id/cancel`
- `GET/POST /api/v1/visits`, `GET /api/v1/visits/:id`, `GET /api/v1/visits/:id/vitals`
- Staff queue, visit progression, triage-vitals entry, consultation, laboratory, results review, pharmacy and checkout routes are role-gated.
- `POST /api/v1/payments/stk-push`, `GET /api/v1/payments/:id`, and the Daraja callback endpoint.
- Authenticated patient support messages and verified WhatsApp webhook endpoints.
- Staff-only aggregate operational analytics. No patient names or clinical note text appear in analytics.

See `ARCHITECTURE.md` for calculation rules, provider setup, deployment gates, and the information still needed from the hospital.

## Important

This is a development backend until connected to an approved database host, real provider credentials, TLS callback URLs, and the hospital's approved privacy/retention/access policies. Do not load real patient records into a development or mock environment. The web and mobile clients are connected to this API through the shared client in `frontend/packages/shared/src/api.ts`; local end-to-end validation and production readiness work remain.

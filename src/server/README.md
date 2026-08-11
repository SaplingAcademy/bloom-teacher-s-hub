# src/server/

Server-side code for Bloom Teacher's Hub.

## Convention

Everything in this directory runs **only on the server** — never in the browser.

Use this directory for:

- **Authentication** — session validation, sign-in, sign-up, OAuth
- **Database queries** — Supabase admin operations
- **External API calls** — OpenAI, Stripe, Mercado Pago, etc.
- **Sensitive logic** — credit checks, plan enforcement, rate limiting

## Security Rules

1. **Secrets stay here.** Environment variables like `SUPABASE_SERVICE_ROLE_KEY` are only accessed from files in this directory.
2. **Never import from `src/server/` in client components.** Use TanStack Start server functions (`createServerFn`) to expose safe interfaces.
3. **Validate everything.** Never trust data coming from the frontend — re-validate inputs, derive user identity from the session, not from request payloads.

## File Structure

```
src/server/
├── README.md       ← This file
├── auth.ts         ← Authentication server functions
└── (future)        ← db.ts, ai.ts, payments.ts, etc.
```

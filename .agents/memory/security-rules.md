---
type: project
created: 2026-07-13
updated: 2026-07-13
---

# Security Rules — Bloom Teacher's Hub

> MANDATORY for every feature implementation. No exceptions. No temporary shortcuts.

## Pre-Implementation Analysis (Rule 13)

Before writing any code, present:

- Which files will be modified
- What runs on the frontend vs backend
- What data is sent and received
- What permissions are required
- What security risks exist

## Secrets & Credentials (Rules 1, 2, 9, 11)

- Never expose secret keys, private tokens, passwords, service role keys, or credentials in frontend, repo, or public variables.
- All secrets must live exclusively in server-side environment variables.
- Never use NEXT*PUBLIC*, VITE\_, or equivalent prefixes for secrets.
- Supabase service role key / secret key: server-only, only when truly necessary.
- Never log passwords, tokens, keys, sensitive content, full payment data, or unnecessary personal data.

## Backend-Only Operations (Rules 3, 10)

These must happen exclusively on the backend (Server Actions, Route Handlers, API routes, Edge Functions):

- Calls to OpenAI, Anthropic, Stripe, Mercado Pago, and other paid services.
- Administrative operations, plan changes, credit grants, payment processing, permission changes.

## Input Validation & Trust (Rules 4, 5)

- Never trust frontend-sent data. Validate and sanitize all inputs again on the backend.
- Never trust user_id, teacher_id, role, plan, credits, price, or permission from the frontend.
- Determine these from the authenticated session and database on the server.

## Authentication & Authorization (Rule 6)

Every protected action must verify on the server:

1. User is authenticated
2. User has authorization
3. Resource belongs to them
4. Their plan allows the action
5. They have available limits or credits

## Row Level Security — Supabase (Rules 7, 8)

- Enable RLS on ALL tables exposed by Supabase.
- Create separate, explicit policies for SELECT, INSERT, UPDATE, and DELETE.
- Default: each teacher can only access records associated with their own auth.uid().
- No teacher can view or modify another teacher's data.

## Rate Limiting (Rule 12)

- Apply request rate limits on functions that use AI or generate costs.

## Post-Implementation Audit (Rule 14)

After implementation, present a summary audit confirming:

- Where each secret is stored
- What auth/authz checks were implemented
- What RLS policies were created
- How cross-teacher access was prevented
- How the feature can be tested safely

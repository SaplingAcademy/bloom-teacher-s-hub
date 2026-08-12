# Connect Bloom to Existing Supabase Backend

## Goal
Wire this Lovable project to the existing Supabase project that the codebase already references, without creating a new Supabase project, modifying any tables, schemas, RLS policies, auth providers, Edge Functions, or existing data.

## Current State
- The codebase already uses Supabase (`src/lib/supabase.ts`, `src/hooks/use-auth.ts`, `src/routes/auth.tsx`).
- Runtime errors show `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are missing from the environment.
- The project has no active Supabase connector (no connections listed via `standard_connectors--list_connections`).
- Lovable supports an external Supabase integration via OAuth in Project Settings → Integrations, which securely injects the required keys without exposing them in chat.

## Connection Method
OAuth via Project Settings → Supabase Integration (chosen by user). This is the only way to connect an existing Supabase project without creating a new one through Lovable Cloud.

## Plan Steps

1. **User completes the OAuth connection**
   - Go to **Project Settings → Integrations → Supabase** in the Lovable UI.
   - Select the existing Supabase project and authorize access.
   - Lovable will automatically retrieve and inject the required keys as environment variables (URL, anon/publishable key, and service role key for server functions).

2. **Verify environment variables are injected**
   - After OAuth success, confirm the following variables are available via `secrets--fetch_secrets` or Lovable Cloud settings:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`)
     - `SUPABASE_URL`
     - `SUPABASE_PUBLISHABLE_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY`
   - These must match the existing Supabase project the user wants to reuse.

3. **Verify the runtime connection without changing the database**
   - Re-run the dev server / build and confirm the missing-environment-variable error is gone.
   - Confirm the auth page loads and the Supabase client initializes correctly.
   - No migrations, schema changes, or data operations will be performed.

4. **Audit / safety check**
   - Confirm that the only files modified are the plan file and any environment/secrets metadata handled by Lovable.
   - Confirm that no database tables, RLS policies, auth settings, or Edge Functions are touched.

## Out of Scope
- Creating a new Supabase project.
- Running any migrations or SQL schema changes.
- Changing RLS policies, auth providers, or Edge Functions.
- Modifying existing data in the connected Supabase project.
- Refactoring the auth flow or UI beyond making it functional with the connected backend.

## Testing Success Criteria
- `src/lib/supabase.ts` resolves successfully with real Supabase credentials.
- The `/auth` route renders without the missing-env error.
- No 401/403 from initial config indicates the keys are valid and the project is reachable.

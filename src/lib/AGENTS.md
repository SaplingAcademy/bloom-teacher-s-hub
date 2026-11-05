# CRM inactivity

- Rule E calculations live in pure `lead-inactivity.ts`; Today and attention consume read-only `lead-inactivity-data.ts` candidates so both use persisted settings and the same contact reference.
- `inactive-lead-automation.ts` runs only at authenticated queue load/refresh boundaries, throttled in memory; durable activation/cycle ownership lives in the existing automation event ledger, never browser storage or settings defaults, avoiding retroactive backlog tasks and concurrent duplicates.
- Each settings revision gets a first-observed activation boundary; old inactive leads remain visible but only cycles becoming inactive after that boundary may create tasks. Event claims are insert-only or failed-status compare-and-set; do not steal processing events without an atomic database task constraint, because a paused tab may still own them.

# Lead conversion

- `lead-conversion.ts` copies the shared profile draft literally and supplies explicit NULL RPC arguments; shared catalog selectors change only teacher selections, never historical IDs or labels.
- Keep conversion writes inside the existing RPC and respect its already-converted guard before schedule recreation; conversion history reads union lead-targeted activity with conversion-only activity linked through the owner-scoped canonical lead event, deduplicating by activity ID without backfill.
- Manual history SQL patches only the installed RPC activity target, failing closed on an unfamiliar definition; never replace the live function with an older repository definition.
# Roles & plans

- Library metadata uses stable IDs in `library-catalog.ts`; template content stays in `library-templates.server.ts` and is returned only after `assert_library_resource_access` validates the actual session/plan. Every open/copy/generation reauthorizes; copies inherit the canonical source ID. Admin classifications use only the role-checking `set_library_resource_access` RPC; no content is duplicated in the database, and other resource tables/policies stay unchanged.

- Roles (`user_roles`) and plans (`teacher_subscriptions`) are independent, server-authoritative tables; `plans.ts` holds only pure presentation/pre-flight rules and the UI never protects admin or paid features by itself.
- The free-plan limit (5 active students; Active/Trial count, Inactive/Paused/Archived do not) is enforced by the `students` trigger with a per-teacher advisory lock; frontend checks are convenience only and must stay fail-open on read errors so the database decides.
- The admin panel (`admin.ts`, `/admin`) reads and changes plans only through the `list_admin_teachers`/`set_teacher_plan` SECURITY DEFINER RPCs, which re-verify `has_role(auth.uid(), 'super_admin')`; the sidebar item is display-only, never the protection, and downgrade-to-free is blocked above 5 active students in the database.
- Premium features are gated only through `PLAN_FEATURES`/`canAccessFeature` in `plans.ts` + `useFeatureAccess` (fail-closed on unknown plan; super_admin bypasses); locked UI reuses `PremiumGate.tsx`, which renders blurred neutral placeholders and never loads or fabricates premium data.

# Academy

- `academy-access.ts` keeps publication separate from existing plan entitlement; `/academy` loads an uncached, user-scoped server authorization result before rendering internal state, preventing a Pro plan or sidebar bypass from exposing development content.
- Academy calls attach the existing external session bearer locally, then `academy-access.server.ts` revalidates identity and `has_role` without service-role access or client-asserted roles; future internal operations and content tables/storage must enforce the same publication/role rule before exposure.
- The internal Academy home (`AcademyHome.tsx` + pure `academy-catalog.ts`) renders only for the server-authorized construction state; the five official category IDs are stable, and future actions (player, progress, certificates) must remain absent or disabled, never fake.
- Academy content (`academy-content.ts` types/helpers, `academy-admin.ts` CRUD, `AcademyManage.tsx`) uses the session client only: RLS on `academy_courses/modules/lessons/videos` (super_admin all-ops) is the real boundary. The home queries only `status='published'` rows; drafts live exclusively in the management view. YouTube input is normalized to the 11-char ID via `extractYoutubeId` before saving; teacher-facing UI never renders YouTube URLs. Covers upload to the public `academy-covers` bucket whose storage policies restrict writes to super_admin.
- Learning pages (`/academy/course|lesson|video/$id`, `components/bloom/academy/*`) reuse `AcademyGate` (same server authorization as `/academy`) and read only published rows; progress lives in own-user, super_admin-gated `academy_lesson_progress`/`academy_course_progress`/`academy_video_progress` (row presence = completed, upserts keyed by PK). Pure math/navigation stays in `academy-learning.ts`; navigation never marks completion.

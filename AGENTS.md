<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Financial model
- Normalize package billing through `src/lib/billing-domain.ts`; new records use `lesson_duration_minutes` and `contract_duration_months`, while old fields are read-only legacy fallbacks.
- Never infer commercial choices for new packages or agreements; lesson minutes, fixed contract months, and installment count must come from the teacher.
- PeriodPicker reuses month/year/current ledger filters; financial calculations stay independent.

## Attendance priorities
- Custom Calendar mutations use owner/type-scoped writes in custom-calendar-events.ts, never lesson rescheduling or lesson-plan APIs; this isolates personal bookings from academic history. Their successful mutations invalidate teacher-scoped Growth data; capacity continues to read the same calendar_events intervals.
- Calendar header/grid reuse one selector and both forms: grid captures date/time, header clears context; exclude event descendants to preserve details and drag-click guards.
- Today count/agenda share a teacher/date-scoped calendar_events read, ordered by start_time; always refetch on remount and keep invalidation callbacks stable to avoid loops.
- Lesson slot prefills are derived in scheduling-context.ts using the existing form duration; this keeps date/time context separate from persistence and recurring scheduling rules.
- Unapplied schema SQL lives in docs/migrations for manual production application, never managed migration tools.
- Growth capacity counts and visible time slots come from the same capacity-engine result using canonical teacher availability and date-specific bookings; this prevents conflicting availability displays.
- Class lifecycle mutations are centralized in `class-lifecycle.ts`; fail-closed history checks select delete versus idempotent archival, with no historical or financial deletes during archival.
- Archived classes retain schedule IDs but cannot project/generate new occurrences or be edited; student class history includes ended memberships and their participation dates.
- Days off are read and saved exclusively through `public.teacher_time_off`; read failures propagate and failed saves return failure, never browser-storage success, so scheduling uses persisted dates only.
- Class/group weekly schedule forms use a 1–7 quantity picker and ID-preserving `class_schedules` persistence; Calendar projection receives all saved slots with their class schedule IDs so editing does not replace retained schedule identities.
- Homework status controls in Calendar and individual/class Lesson Plans read and patch only `lesson_plans.homework_posted` by teacher and event ID, with mount/focus and successful-mutation refreshes; this avoids duplicate status and unrelated occurrence/attendance writes.
- Week-view drag gestures only resolve a date/time target; manual and drag moves share `useRescheduleConfirmation` and `rescheduleOccurrence`, then read back saved events. Confirmations pass occurrence-scoped warning reasons to the existing atomic RPC path; locked statuses are never bypassed.
- Today priorities use teacher-scoped reads, canonical attendance flags, existing task/CRM fields and independent failures; reason dictionaries are nested for `t()`, avoiding invalid joins and raw keys.
- Student academic period lives in students.course_start_date/course_end_date; lesson plans prefill from it and never from billing dates (student_packages, invoices) — keeps academic and financial periods separate.
- Browser storage is per-account: personal data uses `src/lib/user-storage.ts` (keys suffixed with user id, purge on logout/account switch, never `localStorage.clear()`); cached data never feeds Supabase writes — prevents cross-teacher contamination.
- Teacher profile lives only in `public.profiles` (name, avatar, locale, timezone); the frontend only reads/updates it and never creates the row or infers the name — single source of truth, created by the database on signup.
- UI text goes through `t()`; inline pt/en ternaries are forbidden and onboarding/package/class strings live in `src/lib/i18n-ui.ts` — adding a language means adding one dictionary, not editing components. Language precedence: `profiles.locale` > manual device choice > browser locale (`detectLanguage`).

## Manual lesson scheduling
- Manual multi-student scheduling inserts individual occurrences in one batch, then upserts one plan per returned event ID; no classes or recurring schedules are created, preserving per-student academic identity.
- Retain saved occurrence IDs if plan persistence fails and retry only those plans, never reinsert events; failed writes must not become local calendar success.
- One-time lesson tags use the canonical calendar occurrence's `lesson_tags` text array, following Bloom's existing entity-tag representation; built-in values are stable and translated only for display, and custom labels remain teacher-entered.
- Optional lesson-tag SQL stays in docs/migrations for manual application; untagged scheduling omits the column.

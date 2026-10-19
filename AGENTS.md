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

## Attendance priorities
- Custom Calendar mutations use owner/type-scoped writes in custom-calendar-events.ts, never lesson rescheduling or lesson-plan APIs; this isolates personal bookings from academic history. Their successful mutations invalidate teacher-scoped Growth data; capacity continues to read the same calendar_events intervals.
- Calendar empty-cell creation passes date/time defaults into the existing custom-event dialog; event-marked descendants are excluded so details and drag-click suppression remain isolated.
- Calendar header scheduling selects between the existing lesson and custom-event dialogs; empty-cell shortcuts bypass this selector to avoid duplicating forms or scheduling logic.
- Unapplied custom-event schema SQL lives in docs/migrations for manual production application; this avoids applying production changes through managed migration tools.
- Growth capacity counts and visible time slots come from the same capacity-engine result using canonical teacher availability and date-specific bookings; this prevents conflicting availability displays.
- Class lifecycle mutations are centralized in `class-lifecycle.ts`; fail-closed history checks select delete versus idempotent archival, with no historical or financial deletes during archival.
- Archived classes retain schedule IDs but cannot project/generate new occurrences or be edited; student class history includes ended memberships and their participation dates.
- Days off are read and saved exclusively through `public.teacher_time_off`; read failures propagate and failed saves return failure, never browser-storage success, so scheduling uses persisted dates only.
- Class/group weekly schedule forms use a 1–7 quantity picker and ID-preserving `class_schedules` persistence; Calendar projection receives all saved slots with their class schedule IDs so editing does not replace retained schedule identities.
- Homework status controls in Calendar and individual/class Lesson Plans read and patch only `lesson_plans.homework_posted` by teacher and event ID, with mount/focus and successful-mutation refreshes; this avoids duplicate status and unrelated occurrence/attendance writes.
- Week-view drag gestures only resolve a date/time target; manual and drag moves share `useRescheduleConfirmation` and `rescheduleOccurrence`, then read back saved events. Confirmations pass occurrence-scoped warning reasons to the existing atomic RPC path; locked statuses are never bypassed.
- Derive attendance priorities from lesson-plan `calendar_events` plus `attendance_records`; never persist duplicate tasks, and escalate unresolved records after five calendar days.
- Student academic period lives in students.course_start_date/course_end_date; lesson plans prefill from it and never from billing dates (student_packages, invoices) — keeps academic and financial periods separate.
- Browser storage is per-account: personal data uses `src/lib/user-storage.ts` (keys suffixed with user id, purge on logout/account switch, never `localStorage.clear()`); cached data never feeds Supabase writes — prevents cross-teacher contamination.
- Teacher profile lives only in `public.profiles` (name, avatar, locale, timezone); the frontend only reads/updates it and never creates the row or infers the name — single source of truth, created by the database on signup.
- UI text goes through `t()`; inline pt/en ternaries are forbidden and onboarding/package/class strings live in `src/lib/i18n-ui.ts` — adding a language means adding one dictionary, not editing components. Language precedence: `profiles.locale` > manual device choice > browser locale (`detectLanguage`).

## Manual lesson scheduling
- Manual multi-student scheduling inserts individual occurrences in one batch, then upserts one plan per returned event ID; no classes or recurring schedules are created, preserving per-student academic identity.
- Retain saved occurrence IDs if plan persistence fails and retry only those plans, never reinsert events; failed writes must not become local calendar success.
- One-time lesson tags use the canonical calendar occurrence's `lesson_tags` text array, following Bloom's existing entity-tag representation; built-in values are stable and translated only for display, and custom labels remain teacher-entered.
- Optional lesson-tag schema SQL stays in docs/migrations for manual production application only; untagged scheduling omits the column until available.

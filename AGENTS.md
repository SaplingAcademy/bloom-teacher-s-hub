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
- Derive attendance priorities from lesson-plan `calendar_events` plus `attendance_records`; never persist duplicate tasks, and escalate unresolved records after five calendar days.
- Student academic period lives in students.course_start_date/course_end_date; lesson plans prefill from it and never from billing dates (student_packages, invoices) — keeps academic and financial periods separate.

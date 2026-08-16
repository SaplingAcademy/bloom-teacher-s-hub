-- Performance-only migration: adds covering indexes for the hottest filters.
-- No schema, RLS, grant or data changes.

create index if not exists idx_payments_teacher_received_at
  on public.payments (teacher_id, received_at desc);

create index if not exists idx_packages_teacher_name
  on public.packages (teacher_id, name);

create index if not exists idx_lesson_plans_event
  on public.lesson_plans (event_id);

create index if not exists idx_attendance_records_event
  on public.attendance_records (event_id);

create index if not exists idx_students_teacher_name
  on public.students (teacher_id, full_name);

create index if not exists idx_leads_teacher_created_at
  on public.leads (teacher_id, created_at desc);

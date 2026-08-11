-- Migration: ALTER calendar_events table to add missing columns, guarded foreign keys, strengthened RLS, and constraints
-- Note: Does NOT drop or recreate table. Preserves existing data.

-- 1. Safely add missing columns to public.calendar_events
alter table public.calendar_events
  add column if not exists teacher_id uuid,
  add column if not exists student_id uuid,
  add column if not exists schedule_id uuid,
  add column if not exists student_name text,
  add column if not exists level text,
  add column if not exists focus text,
  add column if not exists date date,
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists duration integer default 60,
  add column if not exists type text default 'Private',
  add column if not exists delivery_mode text default 'Online',
  add column if not exists location_link text,
  add column if not exists status text default 'Scheduled',
  add column if not exists attendance_recorded boolean default false,
  add column if not exists attendance_status text,
  add column if not exists notes text,
  add column if not exists homework_title text,
  add column if not exists lesson_plan_url text,
  add column if not exists is_recurring boolean default false,
  add column if not exists recurrence_series_id text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- 2. Safely convert text start_time/end_time columns to time type if previously created as text
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'calendar_events'
      and column_name = 'start_time'
      and data_type like 'character%'
  ) then
    alter table public.calendar_events
      alter column start_time type time using start_time::time;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_name = 'calendar_events'
      and column_name = 'end_time'
      and data_type like 'character%'
  ) then
    alter table public.calendar_events
      alter column end_time type time using end_time::time;
  end if;
end $$;

-- 3. Create guarded foreign keys in separate DO blocks
-- 3a. teacher_id -> auth.users(id) ON DELETE CASCADE
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'calendar_events_teacher_id_fkey'
      and table_name = 'calendar_events'
  ) then
    alter table public.calendar_events
      add constraint calendar_events_teacher_id_fkey
      foreign key (teacher_id)
      references auth.users(id)
      on delete cascade;
  end if;
end $$;

-- 3b. student_id -> public.students(id) ON DELETE SET NULL
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'calendar_events_student_id_fkey'
      and table_name = 'calendar_events'
  ) then
    alter table public.calendar_events
      add constraint calendar_events_student_id_fkey
      foreign key (student_id)
      references public.students(id)
      on delete set null;
  end if;
end $$;

-- 3c. schedule_id -> public.student_schedules(id) ON DELETE SET NULL
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'calendar_events_schedule_id_fkey'
      and table_name = 'calendar_events'
  ) then
    alter table public.calendar_events
      add constraint calendar_events_schedule_id_fkey
      foreign key (schedule_id)
      references public.student_schedules(id)
      on delete set null;
  end if;
end $$;

-- 4. Create safe unique occurrence constraint (student_id, schedule_id, date)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'calendar_events_unique_occurrence'
      and table_name = 'calendar_events'
  ) then
    alter table public.calendar_events
      add constraint calendar_events_unique_occurrence
      unique (student_id, schedule_id, date);
  end if;
end $$;

-- 5. Create performance indexes
create index if not exists idx_calendar_events_teacher_date on public.calendar_events (teacher_id, date);
create index if not exists idx_calendar_events_student_date on public.calendar_events (student_id, date);
create index if not exists idx_calendar_events_schedule_id on public.calendar_events (schedule_id);

-- 6. Create / Update trigger for updated_at
create or replace function public.set_updated_at_calendar_events()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_calendar_events_trigger on public.calendar_events;
create trigger set_updated_at_calendar_events_trigger
  before update on public.calendar_events
  for each row
  execute function public.set_updated_at_calendar_events();

-- 7. Strengthen Row Level Security (RLS) & Policies
alter table public.calendar_events enable row level security;

drop policy if exists "Manage own calendar events" on public.calendar_events;
drop policy if exists "Allow teachers SELECT on their calendar events" on public.calendar_events;
drop policy if exists "Allow teachers INSERT on their calendar events" on public.calendar_events;
drop policy if exists "Allow teachers UPDATE on their calendar events" on public.calendar_events;
drop policy if exists "Allow teachers DELETE on their calendar events" on public.calendar_events;

-- SELECT policy: Teacher can only read their own events
create policy "Allow teachers SELECT on their calendar events" on public.calendar_events
  for select to authenticated
  using (teacher_id = auth.uid());

-- INSERT policy: Teacher can only insert events owned by them AND referencing their own student/schedule
create policy "Allow teachers INSERT on their calendar events" on public.calendar_events
  for insert to authenticated
  with check (
    teacher_id = auth.uid()
    and (
      student_id is null
      or exists (
        select 1 from public.students s
        where s.id = calendar_events.student_id
          and s.teacher_id = auth.uid()
      )
    )
    and (
      schedule_id is null
      or exists (
        select 1 from public.student_schedules sch
        join public.students s on s.id = sch.student_id
        where sch.id = calendar_events.schedule_id
          and s.teacher_id = auth.uid()
      )
    )
    and (
      student_id is null or schedule_id is null
      or exists (
        select 1 from public.student_schedules sch
        where sch.id = calendar_events.schedule_id
          and sch.student_id = calendar_events.student_id
      )
    )
  );

-- UPDATE policy: Teacher can only update their own events and maintain valid parent student/schedule ownership
create policy "Allow teachers UPDATE on their calendar events" on public.calendar_events
  for update to authenticated
  using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and (
      student_id is null
      or exists (
        select 1 from public.students s
        where s.id = calendar_events.student_id
          and s.teacher_id = auth.uid()
      )
    )
    and (
      schedule_id is null
      or exists (
        select 1 from public.student_schedules sch
        join public.students s on s.id = sch.student_id
        where sch.id = calendar_events.schedule_id
          and s.teacher_id = auth.uid()
      )
    )
    and (
      student_id is null or schedule_id is null
      or exists (
        select 1 from public.student_schedules sch
        where sch.id = calendar_events.schedule_id
          and sch.student_id = calendar_events.student_id
      )
    )
  );

-- DELETE policy: Teacher can only delete their own events
create policy "Allow teachers DELETE on their calendar events" on public.calendar_events
  for delete to authenticated
  using (teacher_id = auth.uid());

-- 8. Reload PostgREST schema cache
notify pgrst, 'reload schema';

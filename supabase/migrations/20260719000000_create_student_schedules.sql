-- Migration: Create student_schedules table connected to students with RLS and uniqueness constraint

-- 1. Ensure students table exists and has required columns
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'students' and column_name = 'language_studied') then
    alter table public.students add column language_studied text not null default 'English';
  end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'students' and column_name = 'notes') then
    alter table public.students add column notes text;
  end if;
end;
$$;

-- 2. Create student_schedules table
create table if not exists public.student_schedules (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete cascade not null,
  weekday text not null,
  start_time time,
  end_time time,
  created_at timestamptz default now(),
  constraint student_schedules_student_id_weekday_key unique (student_id, weekday)
);

-- 3. Enable RLS
alter table public.student_schedules enable row level security;

-- 4. Create RLS policies validating ownership through parent student record (students.teacher_id)
drop policy if exists "Manage own student schedules" on public.student_schedules;
drop policy if exists "Allow teachers SELECT on their students schedules" on public.student_schedules;
drop policy if exists "Allow teachers INSERT on their students schedules" on public.student_schedules;
drop policy if exists "Allow teachers UPDATE on their students schedules" on public.student_schedules;
drop policy if exists "Allow teachers DELETE on their students schedules" on public.student_schedules;

create policy "Allow teachers SELECT on their students schedules" on public.student_schedules
  for select to authenticated
  using (
    exists (
      select 1 from public.students
      where public.students.id = student_schedules.student_id
        and public.students.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers INSERT on their students schedules" on public.student_schedules
  for insert to authenticated
  with check (
    exists (
      select 1 from public.students
      where public.students.id = student_schedules.student_id
        and public.students.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers UPDATE on their students schedules" on public.student_schedules
  for update to authenticated
  using (
    exists (
      select 1 from public.students
      where public.students.id = student_schedules.student_id
        and public.students.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.students
      where public.students.id = student_schedules.student_id
        and public.students.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers DELETE on their students schedules" on public.student_schedules
  for delete to authenticated
  using (
    exists (
      select 1 from public.students
      where public.students.id = student_schedules.student_id
        and public.students.teacher_id = auth.uid()
    )
  );

-- 5. Create performance index on student_id
create index if not exists idx_student_schedules_student_id on public.student_schedules(student_id);

-- 6. Notify PostgREST to reload schema cache
notify pgrst, 'reload schema';

-- Migration: Create student_lessons table for lesson plan tracking and calendar integration

-- 1. Create student_lessons table
create table if not exists public.student_lessons (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references auth.users(id) on delete cascade not null,
  student_id uuid references public.students(id) on delete cascade not null,
  schedule_id uuid references public.student_schedules(id) on delete set null,
  lesson_number integer not null,
  scheduled_date date not null,
  start_time time not null,
  end_time time not null,
  duration integer default 60 not null,
  content text default '',
  homework text default '',
  attendance_status text check (attendance_status in ('Present', 'Absent', 'Cancelled', 'Rescheduled')),
  completed boolean default false not null,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Create guarded constraints and unique index
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'student_lessons_student_lesson_number_key'
      and table_name = 'student_lessons'
  ) then
    alter table public.student_lessons
      add constraint student_lessons_student_lesson_number_key
      unique (student_id, lesson_number);
  end if;
end $$;

-- 3. Create performance indexes
create index if not exists idx_student_lessons_student_id on public.student_lessons(student_id);
create index if not exists idx_student_lessons_teacher_id on public.student_lessons(teacher_id);
create index if not exists idx_student_lessons_scheduled_date on public.student_lessons(student_id, scheduled_date);
create index if not exists idx_student_lessons_completed on public.student_lessons(student_id, completed);

-- 4. Set updated_at trigger
create or replace function public.set_updated_at_student_lessons()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_student_lessons_trigger on public.student_lessons;
create trigger set_updated_at_student_lessons_trigger
  before update on public.student_lessons
  for each row
  execute function public.set_updated_at_student_lessons();

-- 5. Enable Row Level Security (RLS)
alter table public.student_lessons enable row level security;

-- Drop old policies if existing
drop policy if exists "Allow teachers SELECT on their student lessons" on public.student_lessons;
drop policy if exists "Allow teachers INSERT on their student lessons" on public.student_lessons;
drop policy if exists "Allow teachers UPDATE on their student lessons" on public.student_lessons;
drop policy if exists "Allow teachers DELETE on their student lessons" on public.student_lessons;

-- Create RLS policies enforcing teacher ownership
create policy "Allow teachers SELECT on their student lessons" on public.student_lessons
  for select to authenticated
  using (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.students s
      where s.id = student_lessons.student_id
        and s.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers INSERT on their student lessons" on public.student_lessons
  for insert to authenticated
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.students s
      where s.id = student_lessons.student_id
        and s.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers UPDATE on their student lessons" on public.student_lessons
  for update to authenticated
  using (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.students s
      where s.id = student_lessons.student_id
        and s.teacher_id = auth.uid()
    )
  )
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.students s
      where s.id = student_lessons.student_id
        and s.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers DELETE on their student lessons" on public.student_lessons
  for delete to authenticated
  using (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.students s
      where s.id = student_lessons.student_id
        and s.teacher_id = auth.uid()
    )
  );

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';

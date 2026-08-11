-- Migration: Create public.class_sessions and public.class_attendance tables with RLS

-- 1. Create public.class_sessions table
create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references public.classes(id) on delete cascade not null,
  calendar_event_id uuid references public.calendar_events(id) on delete set null,
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  duration integer default 60 not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  topic text,
  content text,
  homework text,
  materials_url text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Guarded foreign key update if class_sessions table was partially created in a prior run
do $$
begin
  if exists (
    select 1 
    from information_schema.table_constraints tc 
    join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY' 
      and tc.table_name = 'class_sessions' 
      and kcu.column_name = 'teacher_id'
      and ccu.table_name = 'teacher_profiles'
  ) then
    alter table public.class_sessions drop constraint if exists class_sessions_teacher_id_fkey;
    alter table public.class_sessions add constraint class_sessions_teacher_id_fkey foreign key (teacher_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

-- 2. Create public.class_attendance table
create table if not exists public.class_attendance (
  id uuid primary key default gen_random_uuid(),
  class_session_id uuid references public.class_sessions(id) on delete cascade not null,
  student_id uuid references public.students(id) on delete cascade not null,
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  status text not null default 'present' check (status in ('present', 'absent', 'justified', 'makeup', 'cancelled')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint class_attendance_session_student_key unique (class_session_id, student_id)
);

-- Guarded foreign key update if class_attendance table was partially created in a prior run
do $$
begin
  if exists (
    select 1 
    from information_schema.table_constraints tc 
    join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY' 
      and tc.table_name = 'class_attendance' 
      and kcu.column_name = 'teacher_id'
      and ccu.table_name = 'teacher_profiles'
  ) then
    alter table public.class_attendance drop constraint if exists class_attendance_teacher_id_fkey;
    alter table public.class_attendance add constraint class_attendance_teacher_id_fkey foreign key (teacher_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

-- 3. Performance Indexes
create index if not exists idx_class_sessions_class_date on public.class_sessions(class_id, date);
create index if not exists idx_class_sessions_teacher_date on public.class_sessions(teacher_id, date);
create index if not exists idx_class_attendance_session on public.class_attendance(class_session_id);
create index if not exists idx_class_attendance_student on public.class_attendance(student_id);

-- 4. Enable RLS
alter table public.class_sessions enable row level security;
alter table public.class_attendance enable row level security;

-- 5. RLS Policies for public.class_sessions
drop policy if exists "Allow teachers SELECT on their class sessions" on public.class_sessions;
drop policy if exists "Allow teachers INSERT on their class sessions" on public.class_sessions;
drop policy if exists "Allow teachers UPDATE on their class sessions" on public.class_sessions;
drop policy if exists "Allow teachers DELETE on their class sessions" on public.class_sessions;

create policy "Allow teachers SELECT on their class sessions" on public.class_sessions
  for select to authenticated
  using (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.classes c
      where c.id = class_sessions.class_id and c.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers INSERT on their class sessions" on public.class_sessions
  for insert to authenticated
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.classes c
      where c.id = class_sessions.class_id and c.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers UPDATE on their class sessions" on public.class_sessions
  for update to authenticated
  using (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.classes c
      where c.id = class_sessions.class_id and c.teacher_id = auth.uid()
    )
  )
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.classes c
      where c.id = class_sessions.class_id and c.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers DELETE on their class sessions" on public.class_sessions
  for delete to authenticated
  using (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.classes c
      where c.id = class_sessions.class_id and c.teacher_id = auth.uid()
    )
  );

-- 6. RLS Policies for public.class_attendance
drop policy if exists "Allow teachers SELECT on their class attendance" on public.class_attendance;
drop policy if exists "Allow teachers INSERT on their class attendance" on public.class_attendance;
drop policy if exists "Allow teachers UPDATE on their class attendance" on public.class_attendance;
drop policy if exists "Allow teachers DELETE on their class attendance" on public.class_attendance;

create policy "Allow teachers SELECT on their class attendance" on public.class_attendance
  for select to authenticated
  using (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.class_sessions cs
      where cs.id = class_attendance.class_session_id and cs.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers INSERT on their class attendance" on public.class_attendance
  for insert to authenticated
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.class_sessions cs
      where cs.id = class_attendance.class_session_id and cs.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers UPDATE on their class attendance" on public.class_attendance
  for update to authenticated
  using (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.class_sessions cs
      where cs.id = class_attendance.class_session_id and cs.teacher_id = auth.uid()
    )
  )
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.class_sessions cs
      where cs.id = class_attendance.class_session_id and cs.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers DELETE on their class attendance" on public.class_attendance
  for delete to authenticated
  using (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.class_sessions cs
      where cs.id = class_attendance.class_session_id and cs.teacher_id = auth.uid()
    )
  );

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';

-- Migration: Create public.classes and public.class_members tables with RLS and indexes

-- 1. Create public.classes table
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  type text not null check (type in ('pair', 'group')),
  language text not null default 'English',
  level text default 'B1',
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  start_date date not null default current_date,
  package_id uuid references public.packages(id) on delete set null,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Guarded foreign key update if classes table was partially created in a prior run
do $$
begin
  if exists (
    select 1 
    from information_schema.table_constraints tc 
    join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY' 
      and tc.table_name = 'classes' 
      and kcu.column_name = 'teacher_id'
      and ccu.table_name = 'teacher_profiles'
  ) then
    alter table public.classes drop constraint if exists classes_teacher_id_fkey;
    alter table public.classes add constraint classes_teacher_id_fkey foreign key (teacher_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

-- 2. Create public.class_members table
create table if not exists public.class_members (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references public.classes(id) on delete cascade not null,
  student_id uuid references public.students(id) on delete cascade not null,
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  joined_at date not null default current_date,
  left_at date,
  status text not null default 'active' check (status in ('active', 'transferred', 'removed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint class_members_active_unique unique (class_id, student_id)
);

-- Guarded foreign key update if class_members table was partially created in a prior run
do $$
begin
  if exists (
    select 1 
    from information_schema.table_constraints tc 
    join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY' 
      and tc.table_name = 'class_members' 
      and kcu.column_name = 'teacher_id'
      and ccu.table_name = 'teacher_profiles'
  ) then
    alter table public.class_members drop constraint if exists class_members_teacher_id_fkey;
    alter table public.class_members add constraint class_members_teacher_id_fkey foreign key (teacher_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

-- 3. Performance Indexes
create index if not exists idx_classes_teacher_id on public.classes(teacher_id);
create index if not exists idx_classes_status on public.classes(status);
create index if not exists idx_class_members_class_id on public.class_members(class_id);
create index if not exists idx_class_members_student_id on public.class_members(student_id);
create index if not exists idx_class_members_teacher_id on public.class_members(teacher_id);

-- 4. Enable RLS
alter table public.classes enable row level security;
alter table public.class_members enable row level security;

-- 5. RLS Policies for public.classes
drop policy if exists "Allow teachers SELECT on their classes" on public.classes;
drop policy if exists "Allow teachers INSERT on their classes" on public.classes;
drop policy if exists "Allow teachers UPDATE on their classes" on public.classes;
drop policy if exists "Allow teachers DELETE on their classes" on public.classes;

create policy "Allow teachers SELECT on their classes" on public.classes
  for select to authenticated using (teacher_id = auth.uid());

create policy "Allow teachers INSERT on their classes" on public.classes
  for insert to authenticated with check (teacher_id = auth.uid());

create policy "Allow teachers UPDATE on their classes" on public.classes
  for update to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "Allow teachers DELETE on their classes" on public.classes
  for delete to authenticated using (teacher_id = auth.uid());

-- 6. RLS Policies for public.class_members
drop policy if exists "Allow teachers SELECT on their class members" on public.class_members;
drop policy if exists "Allow teachers INSERT on their class members" on public.class_members;
drop policy if exists "Allow teachers UPDATE on their class members" on public.class_members;
drop policy if exists "Allow teachers DELETE on their class members" on public.class_members;

create policy "Allow teachers SELECT on their class members" on public.class_members
  for select to authenticated
  using (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.classes c
      where c.id = class_members.class_id and c.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers INSERT on their class members" on public.class_members
  for insert to authenticated
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.classes c
      where c.id = class_members.class_id and c.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers UPDATE on their class members" on public.class_members
  for update to authenticated
  using (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.classes c
      where c.id = class_members.class_id and c.teacher_id = auth.uid()
    )
  )
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.classes c
      where c.id = class_members.class_id and c.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers DELETE on their class members" on public.class_members
  for delete to authenticated
  using (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.classes c
      where c.id = class_members.class_id and c.teacher_id = auth.uid()
    )
  );

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';

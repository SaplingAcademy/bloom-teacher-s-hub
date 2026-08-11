-- Migration: Create or update public.students table

-- 1. If students table does not exist, create it with all columns
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  full_name text not null,
  email text,
  phone text,
  avatar_url text,
  language_studied text not null default 'English',
  level text default 'A1',
  focus text default 'General',
  type text default 'Private',
  status text default 'Active',
  schedule text,
  group_size integer default 1,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. If it did exist, make sure it has the new columns and correct foreign key references
do $$
begin
  -- Add language_studied column if missing
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'students' and column_name = 'language_studied') then
    alter table public.students add column language_studied text not null default 'English';
  end if;

  -- Add notes column if missing
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'students' and column_name = 'notes') then
    alter table public.students add column notes text;
  end if;

  -- Update teacher_id foreign key constraint if it references teacher_profiles or old table
  if exists (
    select 1 
    from information_schema.table_constraints tc 
    join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY' 
      and tc.table_name = 'students' 
      and kcu.column_name = 'teacher_id'
      and ccu.table_name = 'teacher_profiles'
  ) then
    alter table public.students drop constraint if exists students_teacher_id_fkey;
    alter table public.students add constraint students_teacher_id_fkey foreign key (teacher_id) references public.profiles(id) on delete cascade;
  end if;
end;
$$;

-- 3. Enable RLS
alter table public.students enable row level security;

-- 4. Recreate RLS policies
drop policy if exists "Manage own students" on public.students;
drop policy if exists "Allow SELECT for owner" on public.students;
drop policy if exists "Allow INSERT for owner" on public.students;
drop policy if exists "Allow UPDATE for owner" on public.students;
drop policy if exists "Allow DELETE for owner" on public.students;

create policy "Manage own students" on public.students 
  for all to authenticated 
  using (auth.uid() = teacher_id) 
  with check (auth.uid() = teacher_id);

-- 5. Create index
create index if not exists idx_students_teacher_id on public.students(teacher_id);

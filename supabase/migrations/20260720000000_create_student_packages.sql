-- Migration: Create student_packages table for historical and active package assignments

-- 1. Create student_packages table
create table if not exists public.student_packages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete cascade not null,
  package_id uuid references public.packages(id) on delete restrict not null,
  teacher_id uuid references auth.users(id) on delete cascade not null,
  started_at date not null default current_date,
  ended_at date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Create performance indexes
create index if not exists idx_student_packages_student_id on public.student_packages(student_id);
create index if not exists idx_student_packages_package_id on public.student_packages(package_id);
create index if not exists idx_student_packages_teacher_id on public.student_packages(teacher_id);
create index if not exists idx_student_packages_status on public.student_packages(status);

-- 3. Partial Unique Index to ensure at most one active package assignment per student
create unique index if not exists idx_student_packages_active_student
  on public.student_packages(student_id)
  where status = 'active';

-- 4. Set updated_at trigger
create or replace function public.set_updated_at_student_packages()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_student_packages_trigger on public.student_packages;
create trigger set_updated_at_student_packages_trigger
  before update on public.student_packages
  for each row
  execute function public.set_updated_at_student_packages();

-- 5. Enable Row Level Security (RLS)
alter table public.student_packages enable row level security;

-- Drop old policies if existing
drop policy if exists "Allow teachers SELECT on their student packages" on public.student_packages;
drop policy if exists "Allow teachers INSERT on their student packages" on public.student_packages;
drop policy if exists "Allow teachers UPDATE on their student packages" on public.student_packages;
drop policy if exists "Allow teachers DELETE on their student packages" on public.student_packages;

-- Create RLS policies enforcing teacher ownership on student, package, and assignment record
create policy "Allow teachers SELECT on their student packages" on public.student_packages
  for select to authenticated
  using (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.students s
      where s.id = student_packages.student_id
        and s.teacher_id = auth.uid()
    )
    and exists (
      select 1 from public.packages p
      where p.id = student_packages.package_id
        and p.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers INSERT on their student packages" on public.student_packages
  for insert to authenticated
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.students s
      where s.id = student_packages.student_id
        and s.teacher_id = auth.uid()
    )
    and exists (
      select 1 from public.packages p
      where p.id = student_packages.package_id
        and p.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers UPDATE on their student packages" on public.student_packages
  for update to authenticated
  using (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.students s
      where s.id = student_packages.student_id
        and s.teacher_id = auth.uid()
    )
    and exists (
      select 1 from public.packages p
      where p.id = student_packages.package_id
        and p.teacher_id = auth.uid()
    )
  )
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.students s
      where s.id = student_packages.student_id
        and s.teacher_id = auth.uid()
    )
    and exists (
      select 1 from public.packages p
      where p.id = student_packages.package_id
        and p.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers DELETE on their student packages" on public.student_packages
  for delete to authenticated
  using (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.students s
      where s.id = student_packages.student_id
        and s.teacher_id = auth.uid()
    )
    and exists (
      select 1 from public.packages p
      where p.id = student_packages.package_id
        and p.teacher_id = auth.uid()
    )
  );

-- 6. Reload schema cache
notify pgrst, 'reload schema';

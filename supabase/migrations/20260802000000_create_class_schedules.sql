-- Migration: Create public.class_schedules table with RLS and constraints

create table if not exists public.class_schedules (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references public.classes(id) on delete cascade not null,
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  weekday text not null,
  start_time time not null,
  end_time time not null,
  duration integer default 60 not null,
  delivery_mode text default 'Online' check (delivery_mode in ('Online', 'In person')),
  location_link text,
  created_at timestamptz default now(),
  constraint class_schedules_unique_slot unique (class_id, weekday, start_time)
);

-- Guarded foreign key update if class_schedules table was partially created in a prior run
do $$
begin
  if exists (
    select 1 
    from information_schema.table_constraints tc 
    join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY' 
      and tc.table_name = 'class_schedules' 
      and kcu.column_name = 'teacher_id'
      and ccu.table_name = 'teacher_profiles'
  ) then
    alter table public.class_schedules drop constraint if exists class_schedules_teacher_id_fkey;
    alter table public.class_schedules add constraint class_schedules_teacher_id_fkey foreign key (teacher_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

-- Performance Indexes
create index if not exists idx_class_schedules_class_id on public.class_schedules(class_id);
create index if not exists idx_class_schedules_teacher_id on public.class_schedules(teacher_id);

-- Enable RLS
alter table public.class_schedules enable row level security;

-- RLS Policies
drop policy if exists "Allow teachers SELECT on their class schedules" on public.class_schedules;
drop policy if exists "Allow teachers INSERT on their class schedules" on public.class_schedules;
drop policy if exists "Allow teachers UPDATE on their class schedules" on public.class_schedules;
drop policy if exists "Allow teachers DELETE on their class schedules" on public.class_schedules;

create policy "Allow teachers SELECT on their class schedules" on public.class_schedules
  for select to authenticated
  using (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.classes c
      where c.id = class_schedules.class_id and c.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers INSERT on their class schedules" on public.class_schedules
  for insert to authenticated
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.classes c
      where c.id = class_schedules.class_id and c.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers UPDATE on their class schedules" on public.class_schedules
  for update to authenticated
  using (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.classes c
      where c.id = class_schedules.class_id and c.teacher_id = auth.uid()
    )
  )
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.classes c
      where c.id = class_schedules.class_id and c.teacher_id = auth.uid()
    )
  );

create policy "Allow teachers DELETE on their class schedules" on public.class_schedules
  for delete to authenticated
  using (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.classes c
      where c.id = class_schedules.class_id and c.teacher_id = auth.uid()
    )
  );

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';

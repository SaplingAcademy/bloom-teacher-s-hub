-- Migration: Create teacher_time_off table for non-working days (vacations, holidays, personal time)
-- Date: 2026-08-14

-- 1. Create public.teacher_time_off table
create table if not exists public.teacher_time_off (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references auth.users(id) on delete cascade not null,
  start_date date not null,
  end_date date not null,
  type text not null default 'Férias',
  title text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_time_off_valid_range check (end_date >= start_date)
);

-- Add check constraint for time off categories if not exists
do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage 
    where table_name = 'teacher_time_off' and constraint_name = 'teacher_time_off_type_check'
  ) then
    alter table public.teacher_time_off 
      add constraint teacher_time_off_type_check 
      check (type in ('Feriado', 'Férias', 'Recesso', 'Compromisso pessoal', 'Viagem', 'Outro'));
  end if;
end $$;

-- 2. Add calendar_non_working_setup_seen to settings table
alter table public.settings
  add column if not exists calendar_non_working_setup_seen boolean default false;

-- 3. Create performance indexes
create index if not exists idx_teacher_time_off_teacher_dates on public.teacher_time_off (teacher_id, start_date, end_date);

-- 4. Set updated_at trigger
create or replace function public.set_updated_at_teacher_time_off()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_teacher_time_off_trigger on public.teacher_time_off;
create trigger set_updated_at_teacher_time_off_trigger
  before update on public.teacher_time_off
  for each row
  execute function public.set_updated_at_teacher_time_off();

-- 5. Enable Row Level Security (RLS)
alter table public.teacher_time_off enable row level security;

drop policy if exists "Allow teachers ALL on their time off" on public.teacher_time_off;
create policy "Allow teachers ALL on their time off" on public.teacher_time_off
  for all to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

-- Reload schema cache
notify pgrst, 'reload schema';

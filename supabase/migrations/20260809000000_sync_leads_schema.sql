-- Migration: Single Synchronization Migration for public.leads & Frontend TypeScript Alignment
-- Date: 2026-08-09

-- =========================================================================
-- 1. ENSURE PUBLIC.LEADS HAS ALL COLUMNS AND CORRECT DEFAULTS
-- =========================================================================

alter table public.leads
  add column if not exists full_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists source text,
  add column if not exists stage text default 'Novo contato' not null,
  add column if not exists notes text,
  add column if not exists converted_student_id uuid references public.students(id) on delete set null,
  add column if not exists language_studied text default 'English',
  add column if not exists level text default 'A1',
  add column if not exists focus text default 'General',
  add column if not exists modality text default 'Online',
  add column if not exists package_id uuid,
  add column if not exists potential_value numeric default 0,
  add column if not exists preferred_schedule text,
  add column if not exists last_interaction_at timestamptz,
  add column if not exists trial_scheduled_at timestamptz,
  add column if not exists trial_calendar_event_id uuid references public.calendar_events(id) on delete set null,
  add column if not exists created_at timestamptz default now() not null,
  add column if not exists updated_at timestamptz default now() not null;

-- Set default for stage to 'Novo contato'
alter table public.leads alter column stage set default 'Novo contato';

-- =========================================================================
-- 2. FIX FOREIGN KEY CONSTRAINT FOR PACKAGE_ID (STUDENT_PACKAGES)
-- =========================================================================

-- Drop old invalid constraint if it exists
alter table public.leads drop constraint if exists leads_package_id_fkey;

-- Add correct FK constraint referencing public.student_packages(id)
alter table public.leads
  add constraint leads_package_id_fkey
  foreign key (package_id)
  references public.student_packages(id)
  on delete set null;

-- =========================================================================
-- 3. ADD CHECK CONSTRAINT FOR VALID STAGES (LEGACY & KANBAN PT-BR)
-- =========================================================================

alter table public.leads drop constraint if exists check_valid_lead_stage;

alter table public.leads
  add constraint check_valid_lead_stage
  check (stage in (
    'Novo contato', 'Em conversa', 'Aula experimental agendada', 'Proposta enviada', 'Convertido', 'Perdido',
    'new', 'contacted', 'trial', 'won', 'lost'
  ));

-- =========================================================================
-- 4. STAGE NORMALIZATION TRIGGER & INDEXES
-- =========================================================================

create or replace function public.normalize_lead_stage_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage = 'new' then
    new.stage := 'Novo contato';
  elsif new.stage = 'contacted' then
    new.stage := 'Em conversa';
  elsif new.stage = 'trial' then
    new.stage := 'Aula experimental agendada';
  elsif new.stage = 'won' then
    new.stage := 'Convertido';
  elsif new.stage = 'lost' then
    new.stage := 'Perdido';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_lead_stage on public.leads;

create trigger trg_normalize_lead_stage
  before insert or update of stage on public.leads
  for each row
  execute function public.normalize_lead_stage_trigger();

-- Performance Indexes
create index if not exists idx_leads_teacher_stage on public.leads (teacher_id, stage);
create index if not exists idx_leads_last_interaction on public.leads (teacher_id, last_interaction_at);
create index if not exists idx_leads_converted_student on public.leads (converted_student_id) where converted_student_id is not null;

-- Reload schema
notify pgrst, 'reload schema';

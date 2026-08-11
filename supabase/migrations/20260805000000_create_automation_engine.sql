-- Migration: Bloom Phase 1 Internal Automation Engine Schema & RPCs
-- Date: 2026-08-05
-- Scope: Internal Automations between Leads, Tasks, Calendar, Students, Packages, Finance, Dashboard

-- =========================================================================
-- 1. EXTEND EXISTING TABLES SAFELY WITH REQUIRED FOREIGN KEYS AND COLUMNS
-- =========================================================================

-- 1.1 Extend public.leads
alter table public.leads
  add column if not exists language_studied text default 'English',
  add column if not exists level text default 'A1',
  add column if not exists focus text default 'General',
  add column if not exists modality text default 'Online',
  add column if not exists package_id uuid references public.packages(id) on delete set null,
  add column if not exists potential_value numeric default 0,
  add column if not exists preferred_schedule text,
  add column if not exists last_interaction_at timestamptz,
  add column if not exists trial_scheduled_at timestamptz,
  add column if not exists trial_calendar_event_id uuid references public.calendar_events(id) on delete set null;

-- 1.2 Extend public.tasks
alter table public.tasks
  add column if not exists lead_id uuid references public.leads(id) on delete cascade,
  add column if not exists student_id uuid references public.students(id) on delete cascade,
  add column if not exists automation_event_id uuid;

-- 1.3 Extend public.calendar_events
alter table public.calendar_events
  add column if not exists lead_id uuid references public.leads(id) on delete set null;

-- =========================================================================
-- 2. CREATE AUTOMATION ENGINE TABLES
-- =========================================================================

-- 2.1 Table: public.automation_events
create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  event_type text not null, -- 'lead.created', 'lead.interaction', 'lead.trial_scheduled', 'lead.proposal_recorded', 'lead.inactive', 'lead.converted'
  source_table text not null, -- 'leads', 'tasks', 'calendar_events'
  source_id uuid not null,
  payload jsonb default '{}'::jsonb not null,
  status text not null default 'pending', -- 'pending', 'processing', 'completed', 'failed', 'retrying'
  processing_attempts integer default 0 not null,
  processed_at timestamptz,
  error_message text,
  idempotency_key text unique not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add foreign key constraint back to automation_events in tasks now that table exists
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'tasks_automation_event_id_fkey'
      and table_name = 'tasks'
  ) then
    alter table public.tasks
      add constraint tasks_automation_event_id_fkey
      foreign key (automation_event_id)
      references public.automation_events(id)
      on delete set null;
  end if;
end $$;

-- 2.2 Table: public.automation_activity
create table if not exists public.automation_activity (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  automation_event_id uuid references public.automation_events(id) on delete cascade,
  action_type text not null, -- 'task_created', 'stage_updated', 'calendar_created', 'lead_converted', 'attention_flagged'
  target_table text,
  target_id uuid,
  description text not null,
  created_at timestamptz default now()
);

-- 2.3 Table: public.automation_settings
create table if not exists public.automation_settings (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade unique not null,
  lead_followup_delay_days integer default 1 not null,
  proposal_followup_delay_days integer default 2 not null,
  trial_confirmation_lead_hours integer default 24 not null,
  inactivity_period_days integer default 7 not null,
  auto_stage_transitions_enabled boolean default true not null,
  auto_task_creation_enabled boolean default true not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =========================================================================
-- 3. TRIGGERS FOR UPDATED_AT
-- =========================================================================

drop trigger if exists set_updated_at_automation_events on public.automation_events;
create trigger set_updated_at_automation_events
  before update on public.automation_events
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_automation_settings on public.automation_settings;
create trigger set_updated_at_automation_settings
  before update on public.automation_settings
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

alter table public.automation_events enable row level security;
alter table public.automation_activity enable row level security;
alter table public.automation_settings enable row level security;

-- 4.1 automation_events policies
drop policy if exists "Manage own automation events" on public.automation_events;
create policy "Manage own automation events" on public.automation_events
  for all to authenticated
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- 4.2 automation_activity policies
drop policy if exists "Manage own automation activity" on public.automation_activity;
create policy "Manage own automation activity" on public.automation_activity
  for all to authenticated
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- 4.3 automation_settings policies
drop policy if exists "Manage own automation settings" on public.automation_settings;
create policy "Manage own automation settings" on public.automation_settings
  for all to authenticated
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- =========================================================================
-- 5. INDEXES FOR PERFORMANCE & LOOKUPS
-- =========================================================================

create index if not exists idx_automation_events_teacher_status on public.automation_events(teacher_id, status);
create index if not exists idx_automation_events_idempotency on public.automation_events(idempotency_key);
create index if not exists idx_automation_activity_teacher_created on public.automation_activity(teacher_id, created_at desc);
create index if not exists idx_leads_last_interaction on public.leads(teacher_id, last_interaction_at);
create index if not exists idx_tasks_lead_id on public.tasks(lead_id);
create index if not exists idx_tasks_student_id on public.tasks(student_id);

-- =========================================================================
-- 6. TRANSACTIONAL RPC FOR LEAD-TO-STUDENT CONVERSION (RULE F)
-- =========================================================================

create or replace function public.convert_lead_to_student(
  p_lead_id uuid,
  p_teacher_id uuid,
  p_full_name text,
  p_email text default null,
  p_phone text default null,
  p_language_studied text default 'English',
  p_level text default 'A1',
  p_focus text default 'General',
  p_modality text default 'Online',
  p_package_id uuid default null,
  p_notes text default null,
  p_schedule_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_student_id uuid;
  v_event_id uuid;
  v_idempotency_key text;
begin
  -- Verify teacher authorization
  if auth.uid() is null or auth.uid() <> p_teacher_id then
    return jsonb_build_object('success', false, 'error', 'Unauthorized access');
  end if;

  -- 1. Check if lead exists and belongs to teacher
  select * into v_lead from public.leads
  where id = p_lead_id and teacher_id = p_teacher_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Lead not found or unauthorized');
  end if;

  -- Prevent duplicate conversion
  if v_lead.converted_student_id is not null or v_lead.stage = 'Convertido' or v_lead.stage = 'won' then
    return jsonb_build_object(
      'success', true,
      'already_converted', true,
      'student_id', v_lead.converted_student_id,
      'message', 'Lead was already converted to a student'
    );
  end if;

  v_idempotency_key := 'lead-converted:' || p_lead_id::text;

  -- 2. Create the student record
  insert into public.students (
    teacher_id,
    full_name,
    email,
    phone,
    language_studied,
    level,
    focus,
    type,
    status,
    schedule,
    package_id,
    notes
  ) values (
    p_teacher_id,
    coalesce(p_full_name, v_lead.full_name),
    coalesce(p_email, v_lead.email),
    coalesce(p_phone, v_lead.phone),
    coalesce(p_language_studied, v_lead.language_studied, 'English'),
    coalesce(p_level, v_lead.level, 'A1'),
    coalesce(p_focus, v_lead.focus, 'General'),
    'Private',
    'Active',
    p_schedule_text,
    p_package_id,
    coalesce(p_notes, v_lead.notes)
  )
  returning id into v_student_id;

  -- 3. Associate student package if package_id provided
  if p_package_id is not null then
    insert into public.student_packages (
      student_id,
      package_id,
      teacher_id,
      started_at,
      status
    ) values (
      v_student_id,
      p_package_id,
      p_teacher_id,
      current_date,
      'active'
    ) on conflict do nothing;
  end if;

  -- 4. Mark lead as converted and store converted_student_id
  update public.leads
  set
    stage = 'Convertido',
    converted_student_id = v_student_id,
    updated_at = now()
  where id = p_lead_id;

  -- 5. Close pending lead follow-up tasks
  update public.tasks
  set
    status = 'completed',
    updated_at = now()
  where lead_id = p_lead_id and status = 'pending';

  -- 6. Log automation event and activity record idempotently
  insert into public.automation_events (
    teacher_id,
    event_type,
    source_table,
    source_id,
    payload,
    status,
    processed_at,
    idempotency_key
  ) values (
    p_teacher_id,
    'lead.converted',
    'leads',
    p_lead_id,
    jsonb_build_object(
      'student_id', v_student_id,
      'lead_id', p_lead_id,
      'package_id', p_package_id
    ),
    'completed',
    now(),
    v_idempotency_key
  )
  on conflict (idempotency_key) do update
  set updated_at = now()
  returning id into v_event_id;

  insert into public.automation_activity (
    teacher_id,
    automation_event_id,
    action_type,
    target_table,
    target_id,
    description
  ) values (
    p_teacher_id,
    v_event_id,
    'lead_converted',
    'students',
    v_student_id,
    'Lead ' || v_lead.full_name || ' foi convertido em aluno com sucesso.'
  );

  return jsonb_build_object(
    'success', true,
    'student_id', v_student_id,
    'lead_id', p_lead_id,
    'message', 'Lead converted to student successfully'
  );
exception
  when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;

-- Reload schema cache
notify pgrst, 'reload schema';

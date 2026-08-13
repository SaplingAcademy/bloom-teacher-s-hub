-- ============================================================================
-- Bloom — Lesson Plans e Presença unificados (individual, dupla, turma)
-- PROPOSTA — NÃO EXECUTADA. Revisar antes de aplicar.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 0. Relatório de ambiguidades do backfill (executar ANTES de gravar)
--    Nada é inserido enquanto houver linhas nesta tabela com resolved = false.
-- ---------------------------------------------------------------------------
create table if not exists public.bloom_backfill_conflicts (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id uuid not null,
  teacher_id uuid,
  reason text not null,          -- 'no_event_match' | 'multiple_event_matches' | 'duplicate_session'
  details jsonb not null default '{}',
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, update on public.bloom_backfill_conflicts to authenticated;
grant all on public.bloom_backfill_conflicts to service_role;
alter table public.bloom_backfill_conflicts enable row level security;
create policy "own backfill conflicts" on public.bloom_backfill_conflicts
  for select to authenticated using (teacher_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 1. calendar_events: suporte a ocorrências de turma
-- ---------------------------------------------------------------------------
alter table public.calendar_events
  add column if not exists class_id uuid references public.classes(id) on delete cascade,
  add column if not exists class_schedule_id uuid references public.class_schedules(id) on delete set null;

create unique index if not exists calendar_events_class_occurrence_uidx
  on public.calendar_events (class_id, date, start_time)
  where class_id is not null;

create index if not exists calendar_events_teacher_date_idx
  on public.calendar_events (teacher_id, date);

-- ---------------------------------------------------------------------------
-- 2. lesson_plans — 1:1 com calendar_events (individual, dupla e turma)
-- ---------------------------------------------------------------------------
create table if not exists public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null unique references public.calendar_events(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  lesson_number integer,
  scheduled_date date not null,
  start_time text not null,
  end_time text not null,
  duration integer not null default 60,
  content text default '',
  homework text default '',
  homework_posted boolean,
  notes text default '',
  attachments jsonb not null default '[]'::jsonb,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_plans_subject_ck check (
    (class_id is not null and student_id is null)
    or (class_id is null and student_id is not null)
  )
);

create index if not exists lesson_plans_class_idx   on public.lesson_plans (class_id, lesson_number);
create index if not exists lesson_plans_student_idx on public.lesson_plans (student_id, lesson_number);
create index if not exists lesson_plans_teacher_idx on public.lesson_plans (teacher_id, scheduled_date);

grant select, insert, update, delete on public.lesson_plans to authenticated;
grant all on public.lesson_plans to service_role;

-- ---------------------------------------------------------------------------
-- 3. attendance_records — presença individual por aluno/evento
--    'cancelled' NÃO existe aqui: cancelamento vive em calendar_events.status
-- ---------------------------------------------------------------------------
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null default 'present',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_records_status_ck check (status in ('present','absent','late','excused')),
  constraint attendance_records_event_student_uk unique (event_id, student_id)
);

create index if not exists attendance_records_student_idx on public.attendance_records (student_id);
create index if not exists attendance_records_teacher_idx on public.attendance_records (teacher_id);

grant select, insert, update, delete on public.attendance_records to authenticated;
grant all on public.attendance_records to service_role;

-- ---------------------------------------------------------------------------
-- 4. Funções SECURITY DEFINER (search_path fixo, privilégio mínimo)
-- ---------------------------------------------------------------------------
create or replace function public.bloom_event_belongs_to_teacher(_event_id uuid, _teacher_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.calendar_events e
    where e.id = _event_id and e.teacher_id = _teacher_id
  );
$$;

create or replace function public.bloom_student_in_event(_event_id uuid, _student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.calendar_events e
    left join public.class_members m
      on m.class_id = e.class_id
     and m.status = 'active'
     and m.left_at is null
    where e.id = _event_id
      and (e.student_id = _student_id or m.student_id = _student_id)
  );
$$;

revoke all on function public.bloom_event_belongs_to_teacher(uuid, uuid) from public, anon;
revoke all on function public.bloom_student_in_event(uuid, uuid) from public, anon;
grant execute on function public.bloom_event_belongs_to_teacher(uuid, uuid) to authenticated;
grant execute on function public.bloom_student_in_event(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
alter table public.lesson_plans       enable row level security;
alter table public.attendance_records enable row level security;

create policy "lesson_plans select own" on public.lesson_plans
  for select to authenticated using (teacher_id = auth.uid());
create policy "lesson_plans insert own" on public.lesson_plans
  for insert to authenticated
  with check (teacher_id = auth.uid() and public.bloom_event_belongs_to_teacher(event_id, auth.uid()));
create policy "lesson_plans update own" on public.lesson_plans
  for update to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid() and public.bloom_event_belongs_to_teacher(event_id, auth.uid()));
create policy "lesson_plans delete own" on public.lesson_plans
  for delete to authenticated using (teacher_id = auth.uid());

create policy "attendance select own" on public.attendance_records
  for select to authenticated using (teacher_id = auth.uid());
create policy "attendance insert own" on public.attendance_records
  for insert to authenticated
  with check (
    teacher_id = auth.uid()
    and public.bloom_event_belongs_to_teacher(event_id, auth.uid())
    and public.bloom_student_in_event(event_id, student_id)
  );
create policy "attendance update own" on public.attendance_records
  for update to authenticated
  using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and public.bloom_event_belongs_to_teacher(event_id, auth.uid())
    and public.bloom_student_in_event(event_id, student_id)
  );
create policy "attendance delete own" on public.attendance_records
  for delete to authenticated using (teacher_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. Backfill — individual (student_lessons -> evento -> lesson_plans)
-- ---------------------------------------------------------------------------
-- 6.1 garante evento para cada student_lesson
insert into public.calendar_events (
  teacher_id, student_id, schedule_id, student_name, date, start_time, end_time,
  duration, type, delivery_mode, status, notes, is_recurring
)
select sl.teacher_id, sl.student_id, sl.schedule_id, s.full_name, sl.scheduled_date,
       sl.start_time::text, sl.end_time::text, coalesce(sl.duration,60),
       'Private', 'Online',
       case when sl.attendance_status = 'Cancelled' then 'Cancelled'
            when sl.completed then 'Completed' else 'Scheduled' end,
       coalesce(sl.notes,''), true
from public.student_lessons sl
join public.students s on s.id = sl.student_id
where not exists (
  select 1 from public.calendar_events e
  where e.student_id = sl.student_id and e.date = sl.scheduled_date
    and e.start_time = sl.start_time::text
)
on conflict do nothing;

-- 6.2 lesson_plans a partir de student_lessons
insert into public.lesson_plans (
  teacher_id, event_id, student_id, lesson_number, scheduled_date, start_time, end_time,
  duration, content, homework, homework_posted, notes, attachments, completed
)
select sl.teacher_id, e.id, sl.student_id, sl.lesson_number, sl.scheduled_date,
       sl.start_time::text, sl.end_time::text, coalesce(sl.duration,60),
       coalesce(sl.content,''), coalesce(sl.homework,''), sl.homework_posted,
       coalesce(sl.notes,''), coalesce(sl.attachments,'[]'::jsonb), coalesce(sl.completed,false)
from public.student_lessons sl
join public.calendar_events e
  on e.student_id = sl.student_id and e.date = sl.scheduled_date
 and e.start_time = sl.start_time::text
on conflict (event_id) do nothing;

-- 6.3 presença individual (Cancelled/Rescheduled não viram presença)
insert into public.attendance_records (teacher_id, event_id, student_id, status, notes)
select lp.teacher_id, lp.event_id, lp.student_id,
       case sl.attendance_status when 'Present' then 'present' when 'Absent' then 'absent' end,
       ''
from public.lesson_plans lp
join public.student_lessons sl
  on sl.student_id = lp.student_id and sl.scheduled_date = lp.scheduled_date
where sl.attendance_status in ('Present','Absent')
on conflict (event_id, student_id) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Backfill de turma — DETECÇÃO DE AMBIGUIDADE ANTES DE GRAVAR
-- ---------------------------------------------------------------------------
-- 7.1 sessões duplicadas (mesma turma/data/horário)
insert into public.bloom_backfill_conflicts (source_table, source_id, teacher_id, reason, details)
select 'class_sessions', cs.id, cs.teacher_id, 'duplicate_session',
       jsonb_build_object('class_id', cs.class_id, 'date', cs.date, 'start_time', cs.start_time)
from public.class_sessions cs
where exists (
  select 1 from public.class_sessions o
  where o.class_id = cs.class_id and o.date = cs.date
    and o.start_time = cs.start_time and o.id <> cs.id
);

-- 7.2 sessões sem evento correspondente
insert into public.bloom_backfill_conflicts (source_table, source_id, teacher_id, reason, details)
select 'class_sessions', cs.id, cs.teacher_id, 'no_event_match',
       jsonb_build_object('class_id', cs.class_id, 'date', cs.date, 'start_time', cs.start_time)
from public.class_sessions cs
where not exists (
  select 1 from public.calendar_events e
  where e.class_id = cs.class_id and e.date = cs.date
);

-- 7.3 sessões com mais de um evento candidato
insert into public.bloom_backfill_conflicts (source_table, source_id, teacher_id, reason, details)
select 'class_sessions', cs.id, cs.teacher_id, 'multiple_event_matches',
       jsonb_build_object('class_id', cs.class_id, 'date', cs.date,
                          'candidates', (select count(*) from public.calendar_events e
                                          where e.class_id = cs.class_id and e.date = cs.date))
from public.class_sessions cs
where (select count(*) from public.calendar_events e
        where e.class_id = cs.class_id and e.date = cs.date) > 1;

-- 7.4 migra SOMENTE sessões sem conflito registrado
insert into public.lesson_plans (
  teacher_id, event_id, class_id, scheduled_date, start_time, end_time, duration,
  content, homework, notes, completed
)
select cs.teacher_id, e.id, cs.class_id, cs.date, cs.start_time::text, cs.end_time::text,
       coalesce(cs.duration,60),
       trim(both from coalesce(cs.topic,'') || case when coalesce(cs.content,'') <> ''
            then E'\n' || cs.content else '' end),
       coalesce(cs.homework,''), coalesce(cs.notes,''), cs.status = 'completed'
from public.class_sessions cs
join public.calendar_events e
  on e.class_id = cs.class_id and e.date = cs.date
where not exists (
  select 1 from public.bloom_backfill_conflicts c
  where c.source_table = 'class_sessions' and c.source_id = cs.id and c.resolved = false
)
on conflict (event_id) do nothing;

-- 7.5 presença de turma, só para sessões migradas
insert into public.attendance_records (teacher_id, event_id, student_id, status, notes)
select ca.teacher_id, lp.event_id, ca.student_id,
       case ca.status
         when 'present' then 'present'
         when 'absent' then 'absent'
         when 'justified' then 'excused'
         when 'makeup' then 'excused'
         else 'present' end,
       coalesce(ca.notes,'')
from public.class_attendance ca
join public.class_sessions cs on cs.id = ca.class_session_id
join public.lesson_plans lp on lp.class_id = cs.class_id and lp.scheduled_date = cs.date
where ca.status <> 'cancelled'
on conflict (event_id, student_id) do nothing;

-- 7.6 aulas de turma canceladas passam a viver no evento
update public.calendar_events e
set status = 'Cancelled'
from public.class_sessions cs
where cs.class_id = e.class_id and cs.date = e.date and cs.status = 'cancelled';

commit;

-- ============================================================================
-- Pós-migration (verificação manual, antes de depreciar o legado):
--   select reason, count(*) from public.bloom_backfill_conflicts
--   where resolved = false group by reason;
-- student_lessons / class_sessions / class_attendance permanecem intactas
-- como legado somente-leitura até a validação em produção.
-- ============================================================================

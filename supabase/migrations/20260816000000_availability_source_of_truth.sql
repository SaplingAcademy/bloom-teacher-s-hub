-- Migration: Teacher availability as single source of truth
-- Additive and idempotent. No table dropped, no RLS policy created/altered/removed.
-- Timezone is NOT duplicated: teacher_profiles.timezone remains the single source.

-- =========================================================
-- 0. Conversion helpers (onboarding.answers -> working_availability)
-- =========================================================

create or replace function public.bloom_norm_time(v text)
returns text
language sql
immutable
as $$
  select case
    when v is null then null
    when btrim(v) ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
      then lpad(split_part(btrim(v), ':', 1), 2, '0') || ':' || split_part(btrim(v), ':', 2)
    else null
  end;
$$;

create or replace function public.bloom_avail_pair(obj jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when obj is null or jsonb_typeof(obj) <> 'object' then null
    else (
      select case
        when st is not null and en is not null and st < en
          then jsonb_build_object('startTime', st, 'endTime', en)
        else null
      end
      from (
        select
          public.bloom_norm_time(coalesce(obj->>'startTime', obj->>'start_time')) as st,
          public.bloom_norm_time(coalesce(obj->>'endTime',   obj->>'end_time'))   as en
      ) x
    )
  end;
$$;

create or replace function public.bloom_availability_from_onboarding(answers jsonb)
returns jsonb
language sql
stable
as $$
with cfg as (
  select
    coalesce(answers->'working_days', answers->'workingDays', '[]'::jsonb) as working_days,
    coalesce(
      nullif(coalesce(answers->>'same_availability_all_days', answers->>'sameAvailabilityAllDays'), '')::boolean,
      true
    ) as same_all,
    public.bloom_avail_pair(coalesce(answers->'unified_availability', answers->'unifiedAvailability')) as unified,
    coalesce(answers->'custom_availability', answers->'customAvailability', '{}'::jsonb) as custom
),
days as (
  select d.day_key, d.ord
  from (values
    ('Monday',1),('Tuesday',2),('Wednesday',3),('Thursday',4),
    ('Friday',5),('Saturday',6),('Sunday',7)
  ) as d(day_key, ord)
),
resolved as (
  select
    days.day_key,
    days.ord,
    (select exists (
       select 1 from jsonb_array_elements_text(cfg.working_days) wd
       where lower(btrim(wd)) = lower(days.day_key)
     )) as selected,
    case
      when cfg.same_all then cfg.unified
      else coalesce(public.bloom_avail_pair(cfg.custom->days.day_key), cfg.unified)
    end as pair
  from days cross join cfg
)
select case
  when not exists (select 1 from resolved where selected and pair is not null) then null
  else (
    select jsonb_agg(
      jsonb_build_object(
        'day',       r.day_key,
        'enabled',   (r.selected and r.pair is not null),
        'startTime', case when r.selected and r.pair is not null then r.pair->>'startTime' end,
        'endTime',   case when r.selected and r.pair is not null then r.pair->>'endTime'   end
      )
      order by r.ord
    )
    from resolved r
  )
end;
$$;

-- =========================================================
-- A. settings: base availability (no timezone column here)
-- =========================================================
alter table public.settings
  add column if not exists working_availability jsonb default '[]'::jsonb;

create unique index if not exists settings_teacher_id_unique
  on public.settings (teacher_id);

-- =========================================================
-- B. student_schedules: allow more than one lesson per weekday
-- =========================================================
alter table public.student_schedules
  drop constraint if exists student_schedules_student_id_weekday_key;

alter table public.student_schedules
  add column if not exists duration_minutes integer default 60,
  add column if not exists active boolean default true;

create unique index if not exists student_schedules_unique_slot
  on public.student_schedules (student_id, weekday, start_time);

-- =========================================================
-- C. student_lessons: anchor plan to the real occurrence (max 1 plan per occurrence)
-- =========================================================
alter table public.student_lessons
  add column if not exists event_id uuid references public.calendar_events(id) on delete set null;

create unique index if not exists student_lessons_event_id_unique
  on public.student_lessons (event_id)
  where event_id is not null;

-- =========================================================
-- D. calendar_events: occurrence origin + reschedule lineage
-- =========================================================
alter table public.calendar_events
  add column if not exists origin text default 'recurring';

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='calendar_events'
      and column_name='rescheduled_from_event_id'
  ) then
    alter table public.calendar_events
      add column rescheduled_from_event_id uuid
      references public.calendar_events(id) on delete set null;
  end if;
end $$;

create index if not exists idx_calendar_events_rescheduled_from
  on public.calendar_events (rescheduled_from_event_id);

-- =========================================================
-- E. Backfill (only where nothing is configured and conversion produced a result)
-- =========================================================
update public.settings s
set working_availability = public.bloom_availability_from_onboarding(o.answers)
from public.onboarding o
where o.teacher_id = s.teacher_id
  and coalesce(jsonb_array_length(coalesce(s.working_availability, '[]'::jsonb)), 0) = 0
  and public.bloom_availability_from_onboarding(o.answers) is not null;

insert into public.settings (teacher_id, working_availability)
select o.teacher_id, public.bloom_availability_from_onboarding(o.answers)
from public.onboarding o
where public.bloom_availability_from_onboarding(o.answers) is not null
  and not exists (select 1 from public.settings s where s.teacher_id = o.teacher_id)
on conflict (teacher_id) do nothing;

notify pgrst, 'reload schema';

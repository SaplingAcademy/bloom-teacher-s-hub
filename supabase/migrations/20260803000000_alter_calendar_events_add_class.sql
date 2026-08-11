-- Migration: ALTER public.calendar_events table to support Class/Group events polymorphically

-- 1. Safely add class_id and event_type columns
alter table public.calendar_events
  add column if not exists class_id uuid references public.classes(id) on delete set null,
  add column if not exists event_type text default 'individual';

-- 2. Update existing rows to event_type = 'individual' if null
update public.calendar_events
  set event_type = 'individual'
  where event_type is null;

-- 3. Add constraint for event_type allowed values
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'calendar_events_event_type_check'
      and table_name = 'calendar_events'
  ) then
    alter table public.calendar_events
      add constraint calendar_events_event_type_check
      check (event_type in ('individual', 'class'));
  end if;
end $$;

-- 4. Add safe polymorphic check constraint:
-- An event of type 'individual' must have student_id and NO class_id.
-- An event of type 'class' must have class_id and NO student_id.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'calendar_events_polymorphic_check'
      and table_name = 'calendar_events'
  ) then
    alter table public.calendar_events
      add constraint calendar_events_polymorphic_check
      check (
        (event_type = 'individual' and (student_id is not null or schedule_id is not null) and class_id is null) or
        (event_type = 'class' and class_id is not null and student_id is null)
      );
  end if;
end $$;

-- 5. Create performance index on class_id
create index if not exists idx_calendar_events_class_date on public.calendar_events(class_id, date);

-- 6. Reload PostgREST schema cache
notify pgrst, 'reload schema';

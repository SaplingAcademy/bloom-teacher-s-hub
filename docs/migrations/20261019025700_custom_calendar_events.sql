-- Manual production application only. No records are recreated, updated or deleted.
begin;
set local lock_timeout = '5s';

alter table public.calendar_events
  add column if not exists title text,
  add column if not exists category text;

alter table public.calendar_events
  drop constraint calendar_events_event_type_check,
  add constraint calendar_events_event_type_check
    check (event_type in ('individual', 'class', 'custom')) not valid;

-- Preserve the exact existing individual/class predicate; custom is standalone.
alter table public.calendar_events
  drop constraint calendar_events_polymorphic_check,
  add constraint calendar_events_polymorphic_check check (
    (event_type = 'individual' and (student_id is not null or schedule_id is not null) and class_id is null)
    or (event_type = 'class' and class_id is not null and student_id is null)
    or (event_type = 'custom' and student_id is null and class_id is null
        and schedule_id is null and class_schedule_id is null)
  ) not valid;

alter table public.calendar_events validate constraint calendar_events_event_type_check;
alter table public.calendar_events validate constraint calendar_events_polymorphic_check;

notify pgrst, 'reload schema';
commit;

-- Manual production application ONLY. No rows, historical values, policies or constraints are changed.
-- Reuse Bloom's text[] tag representation on the canonical occurrence, not a second lesson entity.
begin;
alter table public.calendar_events
  add column if not exists lesson_tags text[] not null default '{}';
comment on column public.calendar_events.lesson_tags is
  'One-time lesson tags: conversation, makeup, exam or teacher-entered labels. Display translations never change stored values.';
notify pgrst, 'reload schema';
commit;
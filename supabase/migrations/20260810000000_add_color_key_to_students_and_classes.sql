-- Migration: Add color_key column to public.students and public.classes
-- Date: 2026-08-10

alter table public.students
  add column if not exists color_key text default 'default' not null;

alter table public.classes
  add column if not exists color_key text default 'default' not null;

-- Add Check constraints restricting values strictly to approved Bloom palette tokens
alter table public.students drop constraint if exists check_students_color_key;
alter table public.students
  add constraint check_students_color_key
  check (color_key in ('default', 'moss', 'sage', 'terracotta', 'sand', 'olive'));

alter table public.classes drop constraint if exists check_classes_color_key;
alter table public.classes
  add constraint check_classes_color_key
  check (color_key in ('default', 'moss', 'sage', 'terracotta', 'sand', 'olive'));

notify pgrst, 'reload schema';

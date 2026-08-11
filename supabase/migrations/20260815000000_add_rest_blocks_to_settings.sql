-- Migration: Add rest_blocks column to public.settings table
-- Date: 2026-08-15

alter table public.settings
  add column if not exists rest_blocks jsonb default '[]'::jsonb;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';

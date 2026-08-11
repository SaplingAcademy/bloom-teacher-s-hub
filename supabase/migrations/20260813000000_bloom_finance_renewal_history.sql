-- Migration: Bloom Finance Payment History & Package Renewal Engine
-- Date: 2026-08-13

-- 1. Enhance public.student_packages with snapshot metadata and renewal tracking
alter table public.student_packages
  add column if not exists snapshot_package_name text,
  add column if not exists snapshot_package_price_cents integer,
  add column if not exists change_type text default 'initial',
  add column if not exists renewal_notes text,
  add column if not exists renewed_from_id uuid references public.student_packages(id) on delete set null;

-- Add check constraint for change_type if not exists
do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage 
    where table_name = 'student_packages' and constraint_name = 'student_packages_change_type_check'
  ) then
    alter table public.student_packages add constraint student_packages_change_type_check check (change_type in ('initial', 'renewal', 'upgrade', 'downgrade', 'lateral'));
  end if;
end $$;

-- 2. Enhance public.invoices with direct student_package_id link
alter table public.invoices
  add column if not exists student_package_id uuid references public.student_packages(id) on delete set null;

-- 3. Enhance public.payments with notes field
alter table public.payments
  add column if not exists notes text;

-- 4. Create performance indexes
create index if not exists idx_student_packages_renewed_from on public.student_packages(renewed_from_id);
create index if not exists idx_student_packages_change_type on public.student_packages(change_type);
create index if not exists idx_invoices_student_package_id on public.invoices(student_package_id);

-- Reload schema cache
notify pgrst, 'reload schema';

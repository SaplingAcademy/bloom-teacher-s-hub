-- Migration: Per-Enrollment Installment Agreements & Financial Snapshots
-- Date: 2026-08-12

-- 1. Enhance public.packages with default_installment_count
alter table public.packages
  add column if not exists default_installment_count smallint default 1;

-- 2. Enhance public.student_packages with per-enrollment financial agreement fields
alter table public.student_packages
  add column if not exists total_amount_cents integer,
  add column if not exists installment_count smallint default 1,
  add column if not exists installment_amount_cents integer,
  add column if not exists due_day smallint default 5,
  add column if not exists first_due_date date,
  add column if not exists last_due_date date,
  add column if not exists payment_method text default 'Pix';

-- 3. Enhance public.classes with shared class billing agreement fields
alter table public.classes
  add column if not exists total_amount_cents integer,
  add column if not exists installment_count smallint default 1,
  add column if not exists installment_amount_cents integer,
  add column if not exists first_due_date date,
  add column if not exists last_due_date date;

-- Indexes for performance
create index if not exists idx_student_packages_first_due_date on public.student_packages(first_due_date);
create index if not exists idx_student_packages_installment_count on public.student_packages(installment_count);

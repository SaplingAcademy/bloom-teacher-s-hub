-- Migration: Connect Finance Engine to real Students, Classes, Class Members, Packages, Invoices, Payments, and Expenses
-- Date: 2026-08-11

-- 1. Enhance public.classes table for billing configuration
alter table public.classes 
  add column if not exists billing_mode text default 'per_member',
  add column if not exists billing_amount integer, -- price in cents for shared class billing
  add column if not exists due_day smallint default 5;

-- Add check constraint for classes billing_mode if not exists
do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage 
    where table_name = 'classes' and constraint_name = 'classes_billing_mode_check'
  ) then
    alter table public.classes add constraint classes_billing_mode_check check (billing_mode in ('per_member', 'shared_class'));
  end if;
end $$;

-- 2. Enhance public.students table with default due_day
alter table public.students
  add column if not exists due_day smallint default 5;

-- 3. Enhance public.invoices table for Class Billing, Periods, and Price Snapshots
-- Make student_id nullable to allow class-level invoices
alter table public.invoices alter column student_id drop not null;

alter table public.invoices
  add column if not exists class_id uuid references public.classes(id) on delete cascade,
  add column if not exists billing_period text, -- Format: YYYY-MM
  add column if not exists billing_mode text default 'individual', -- individual, per_member, shared_class
  add column if not exists snapshot_package_name text,
  add column if not exists snapshot_price_cents integer;

-- Ensure an invoice is linked to either a student or a class
do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage 
    where table_name = 'invoices' and constraint_name = 'invoices_target_check'
  ) then
    alter table public.invoices add constraint invoices_target_check check (student_id is not null or class_id is not null);
  end if;
end $$;

-- 4. Create deterministic unique indexes for invoice duplicate prevention
create unique index if not exists idx_invoices_student_period 
  on public.invoices (teacher_id, student_id, billing_period) 
  where student_id is not null and billing_period is not null;

create unique index if not exists idx_invoices_class_period 
  on public.invoices (teacher_id, class_id, billing_period) 
  where class_id is not null and billing_period is not null;

-- Performance indexes
create index if not exists idx_invoices_teacher_id on public.invoices(teacher_id);
create index if not exists idx_invoices_status on public.invoices(status);
create index if not exists idx_payments_teacher_id on public.payments(teacher_id);
create index if not exists idx_payments_invoice_id on public.payments(invoice_id);
create index if not exists idx_expenses_teacher_id on public.expenses(teacher_id);

-- 5. Ensure RLS policies on invoices, payments, and expenses
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;

drop policy if exists "Allow teachers ALL on their invoices" on public.invoices;
create policy "Allow teachers ALL on their invoices" on public.invoices
  for all to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists "Allow teachers ALL on their payments" on public.payments;
create policy "Allow teachers ALL on their payments" on public.payments
  for all to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists "Allow teachers ALL on their expenses" on public.expenses;
create policy "Allow teachers ALL on their expenses" on public.expenses
  for all to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

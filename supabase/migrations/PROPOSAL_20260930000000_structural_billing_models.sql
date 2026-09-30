-- PROPOSAL ONLY — DO NOT EXECUTE WITHOUT EXPLICIT APPROVAL.
-- Additive financial model for future package agreements. No data updates/backfill.

alter table public.packages
  add column if not exists billing_model text,
  add column if not exists billing_duration_type text,
  add column if not exists contract_months smallint;

alter table public.packages
  add constraint packages_billing_model_check
    check (billing_model is null or billing_model in ('monthly', 'installment_total', 'one_time')),
  add constraint packages_billing_duration_type_check
    check (billing_duration_type is null or billing_duration_type in ('fixed', 'continuous')),
  add constraint packages_contract_months_check
    check (contract_months is null or contract_months > 0);

alter table public.student_packages
  add column if not exists billing_model text,
  add column if not exists billing_duration_type text,
  add column if not exists contract_months smallint,
  add column if not exists monthly_amount_cents integer,
  add column if not exists expected_total_cents bigint;

alter table public.student_packages
  alter column installment_count drop not null,
  alter column installment_count drop default;

alter table public.student_packages
  add constraint student_packages_billing_model_check
    check (billing_model is null or billing_model in ('monthly', 'installment_total', 'one_time')),
  add constraint student_packages_billing_duration_type_check
    check (billing_duration_type is null or billing_duration_type in ('fixed', 'continuous')),
  add constraint student_packages_contract_months_check
    check (contract_months is null or contract_months > 0),
  add constraint student_packages_monthly_amount_check
    check (monthly_amount_cents is null or monthly_amount_cents >= 0),
  add constraint student_packages_expected_total_check
    check (expected_total_cents is null or expected_total_cents >= 0);

alter table public.invoices
  add column if not exists charge_kind text,
  add column if not exists sequence_number smallint,
  add column if not exists sequence_count smallint;

alter table public.invoices
  add constraint invoices_charge_kind_check
    check (charge_kind is null or charge_kind in ('monthly_charge', 'installment', 'one_time')),
  add constraint invoices_sequence_number_check
    check (sequence_number is null or sequence_number > 0),
  add constraint invoices_sequence_count_check
    check (sequence_count is null or sequence_count > 0);

create unique index if not exists idx_invoices_agreement_month
  on public.invoices (teacher_id, student_package_id, billing_period)
  where student_package_id is not null and charge_kind = 'monthly_charge';

create unique index if not exists idx_invoices_agreement_installment
  on public.invoices (teacher_id, student_package_id, sequence_number)
  where student_package_id is not null and charge_kind = 'installment';

create unique index if not exists idx_invoices_agreement_one_time
  on public.invoices (teacher_id, student_package_id)
  where student_package_id is not null and charge_kind = 'one_time';

comment on column public.packages.duration is 'Duração da aula em minutos; nunca duração contratual ou quantidade de parcelas';
comment on column public.packages.billing_model is 'Modelo financeiro canônico para novos pacotes';
comment on column public.student_packages.billing_model is 'Snapshot imutável do modelo financeiro no momento da contratação';
comment on column public.invoices.student_package_id is 'Contrato que originou a cobrança';

notify pgrst, 'reload schema';

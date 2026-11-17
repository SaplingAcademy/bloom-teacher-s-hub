-- ============================================================================
-- Comemoração de upgrade de plano — aplicação MANUAL no SQL Editor do Supabase
-- Pré-requisito: 20261105040000_roles_plans_manual.sql e
--                20261105050000_admin_panel_manual.sql já aplicados.
--
-- Por quê: hoje public.teacher_subscriptions guarda só o plano atual (e um
-- updated_at que também muda em "renovações" do mesmo plano). Não há como saber,
-- de forma confiável e igual em todos os dispositivos, que houve um UPGRADE e se
-- a teacher já viu a comemoração. Este script:
--   1. adiciona 3 colunas à tabela existente (sem novo sistema de planos);
--   2. marca o evento de upgrade por TRIGGER, só numa MUDANÇA REAL de um plano
--      inferior para um superior (UPDATE da linha existente) — vale para
--      set_teacher_plan (admin), futura integração de pagamento (service_role)
--      ou ajuste manual; renovação do mesmo plano, downgrade e linhas criadas
--      já num plano (INSERT, ex.: conta criada diretamente como PRO) não marcam;
--   3. cria acknowledge_plan_upgrade(), a única escrita que a teacher pode fazer:
--      marcar como visto o PRÓPRIO evento exibido.
-- Contas que já são PRO hoje ficam com upgraded_at NULL: nenhum pop-up.
-- Não altera RLS, grants existentes, set_teacher_plan, limites ou permissões.
-- ============================================================================
begin;

do $$
begin
  if to_regclass('public.teacher_subscriptions') is null then
    raise exception 'PRECHECK: public.teacher_subscriptions não existe — aplique 20261105040000_roles_plans_manual.sql antes.';
  end if;
end $$;

alter table public.teacher_subscriptions
  add column if not exists upgraded_at timestamptz,
  add column if not exists upgraded_to_plan text,
  add column if not exists upgrade_acknowledged_at timestamptz;

comment on column public.teacher_subscriptions.upgraded_at is
  'Momento do último upgrade (plano subiu de nível). NULL = nenhum upgrade registrado.';
comment on column public.teacher_subscriptions.upgraded_to_plan is
  'Plano recebido no último upgrade (usado no pop-up de comemoração).';
comment on column public.teacher_subscriptions.upgrade_acknowledged_at is
  'Quando a teacher viu o pop-up do último upgrade. NULL com upgraded_at preenchido = pendente.';

create or replace function public.teacher_subscriptions_mark_upgrade()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Nível de cada plano. Ao criar um plano novo, inclua-o aqui (e no CHECK de plan).
  v_new integer := case new.plan when 'free' then 0 when 'pro' then 1 end;
  v_old integer := case old.plan when 'free' then 0 when 'pro' then 1 end;
begin
  -- Só UPDATE (o trigger não roda em INSERT): conta criada já como PRO não é upgrade.
  if v_new is not null and v_old is not null and v_new > v_old then
    new.upgraded_at := now();
    new.upgraded_to_plan := new.plan;
    new.upgrade_acknowledged_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists teacher_subscriptions_mark_upgrade on public.teacher_subscriptions;
create trigger teacher_subscriptions_mark_upgrade
  before update of plan on public.teacher_subscriptions
  for each row execute function public.teacher_subscriptions_mark_upgrade();

-- A teacher marca como visto apenas o evento que recebeu (identificado pelo
-- upgraded_at lido). Um upgrade mais novo, chegado nesse meio-tempo, continua pendente.
create or replace function public.acknowledge_plan_upgrade(p_upgraded_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  update public.teacher_subscriptions
     set upgrade_acknowledged_at = now()
   where teacher_id = auth.uid()
     and upgraded_at = p_upgraded_at
     and upgrade_acknowledged_at is null;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.acknowledge_plan_upgrade(timestamptz) from public, anon, authenticated;
grant execute on function public.acknowledge_plan_upgrade(timestamptz) to authenticated;
revoke all on function public.teacher_subscriptions_mark_upgrade() from public, anon, authenticated;

commit;

-- ----------------------------------------------------------------------------
-- Rollback (somente se necessário; descomente):
-- begin;
-- drop trigger if exists teacher_subscriptions_mark_upgrade on public.teacher_subscriptions;
-- drop function if exists public.teacher_subscriptions_mark_upgrade();
-- drop function if exists public.acknowledge_plan_upgrade(timestamptz);
-- alter table public.teacher_subscriptions
--   drop column if exists upgrade_acknowledged_at,
--   drop column if exists upgraded_to_plan,
--   drop column if exists upgraded_at;
-- commit;

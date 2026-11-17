-- ============================================================================
-- Bloom — Comemoração de upgrade de plano (PREMIUM) — APLICAÇÃO MANUAL
-- ----------------------------------------------------------------------------
-- Executar no SQL Editor do Supabase. Pré-requisitos já aplicados:
--   20261105040000_roles_plans_manual.sql  (teacher_subscriptions, has_role)
--   20261105050000_admin_panel_manual.sql  (set_teacher_plan)
--
-- "PREMIUM" é só o nome comercial exibido; o valor interno continua 'pro'.
-- Nenhum novo sistema de assinaturas: tudo fica em public.teacher_subscriptions.
--
-- O QUE FAZ
--  1. Colunas na tabela existente:
--     - free_since: desde quando a conta está no plano free (tempo EFETIVO no
--       free, não tempo desde o cadastro). Contas free existentes recebem o
--       último updated_at (estimativa conservadora: nunca aumenta o tempo real).
--     - upgraded_at / upgraded_to_plan / upgrade_acknowledged_at: o evento de
--       upgrade e se a teacher já viu a comemoração (uma vez, em qualquer
--       dispositivo).
--     - upgrade_source: 'admin_grant' (painel Admin), 'purchase' (compra
--       confirmada por futura integração de pagamento) ou 'unknown' (qualquer
--       outra alteração; NUNCA tratada como compra).
--     - upgrade_free_seconds / upgrade_student_count: fatos do momento do
--       upgrade (tempo efetivo no free e alunos cadastrados), usados para
--       escolher a mensagem.
--  2. Trigger: registra o evento só numa MUDANÇA REAL de plano inferior para
--     superior (UPDATE). Conta criada já como PRO (INSERT), renovação do mesmo
--     plano, downgrade e atualizações sem troca de plano não geram evento.
--  3. set_teacher_plan: mesmo corpo e mesmas regras; só passa a identificar a
--     origem 'admin_grant' para o trigger.
--  4. apply_plan_purchase: ponto de entrada para a FUTURA integração de
--     pagamento (somente service_role). Não simula pagamento: deve ser chamado
--     apenas após a confirmação do provedor.
--  5. acknowledge_plan_upgrade: a teacher marca como visto o PRÓPRIO evento.
--
-- NÃO ALTERA: RLS e grants da tabela (teacher continua só com SELECT), limite
-- de alunos do free, regra de rebaixamento, permissões ou pagamentos.
-- Contas que já são PRO ficam sem evento: nenhum pop-up.
-- ============================================================================
begin;

-- ----------------------------------------------------------------------------
-- 0. Pré-checagens
-- ----------------------------------------------------------------------------
do $$
declare
  v_src text;
begin
  if to_regclass('public.teacher_subscriptions') is null then
    raise exception 'PRECHECK: public.teacher_subscriptions não existe — aplique 20261105040000_roles_plans_manual.sql antes.';
  end if;
  if to_regprocedure('public.has_role(uuid, public.app_role)') is null then
    raise exception 'PRECHECK: public.has_role(uuid, app_role) não existe.';
  end if;
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'set_teacher_plan'
     and pg_get_function_identity_arguments(p.oid) = '_teacher_id uuid, _plan text';
  if v_src is null then
    raise exception 'PRECHECK: public.set_teacher_plan(uuid, text) não existe — aplique 20261105050000_admin_panel_manual.sql antes.';
  end if;
  if v_src not like '%DOWNGRADE_BLOCKED_ACTIVE_STUDENTS%' or v_src not like '%ADMIN_ONLY%' then
    raise exception 'PRECHECK: set_teacher_plan em produção difere da versão do repositório; revise antes de aplicar.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. Colunas (na tabela existente)
-- ----------------------------------------------------------------------------
alter table public.teacher_subscriptions
  add column if not exists free_since timestamptz,
  add column if not exists upgraded_at timestamptz,
  add column if not exists upgraded_to_plan text,
  add column if not exists upgrade_source text,
  add column if not exists upgrade_free_seconds integer,
  add column if not exists upgrade_student_count integer,
  add column if not exists upgrade_acknowledged_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'teacher_subscriptions_upgrade_source_check') then
    alter table public.teacher_subscriptions
      add constraint teacher_subscriptions_upgrade_source_check
      check (upgrade_source is null or upgrade_source in ('admin_grant', 'purchase', 'unknown'));
  end if;
end $$;

comment on column public.teacher_subscriptions.free_since is
  'Início do período atual no plano free (tempo efetivo no free). NULL fora do free.';
comment on column public.teacher_subscriptions.upgraded_at is
  'Momento do último upgrade (plano subiu de nível). NULL = nenhum upgrade registrado.';
comment on column public.teacher_subscriptions.upgraded_to_plan is
  'Plano recebido no último upgrade (valor interno, ex.: pro).';
comment on column public.teacher_subscriptions.upgrade_source is
  'Origem do último upgrade: admin_grant, purchase ou unknown (nunca tratada como compra).';
comment on column public.teacher_subscriptions.upgrade_free_seconds is
  'Segundos efetivos no plano free imediatamente antes do último upgrade (NULL se desconhecido).';
comment on column public.teacher_subscriptions.upgrade_student_count is
  'Alunos cadastrados pela teacher no momento do último upgrade.';
comment on column public.teacher_subscriptions.upgrade_acknowledged_at is
  'Quando a teacher viu a comemoração do último upgrade. NULL com upgraded_at preenchido = pendente.';

-- Backfill conservador do início do free para contas free existentes (antes do
-- trigger; não toca em plan). updated_at >= início real do free.
update public.teacher_subscriptions
   set free_since = coalesce(updated_at, created_at, now())
 where plan = 'free' and free_since is null;

-- ----------------------------------------------------------------------------
-- 2. Trigger: período no free + evento de upgrade
-- ----------------------------------------------------------------------------
create or replace function public.teacher_subscriptions_track_plan_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Nível de cada plano. Ao criar um plano novo, inclua-o aqui (e no CHECK de plan).
  v_new integer := case new.plan when 'free' then 0 when 'pro' then 1 end;
  v_old integer;
  v_source text;
begin
  if tg_op = 'INSERT' then
    -- Linha criada já num plano: nunca é upgrade. Só marca o início do free.
    if new.plan = 'free' then
      new.free_since := coalesce(new.free_since, now());
    end if;
    return new;
  end if;

  if new.plan is not distinct from old.plan then
    return new; -- renovação / mesmo plano: nenhum evento
  end if;

  v_old := case old.plan when 'free' then 0 when 'pro' then 1 end;

  -- Origem informada pela operação (set_teacher_plan / apply_plan_purchase), válida
  -- só nesta transação; consumida aqui para não vazar para outras linhas.
  v_source := nullif(current_setting('bloom.plan_change_source', true), '');
  perform set_config('bloom.plan_change_source', '', true);

  if v_new is not null and v_old is not null and v_new > v_old then
    new.upgraded_at := now();
    new.upgraded_to_plan := new.plan;
    new.upgrade_source := case when v_source in ('admin_grant', 'purchase') then v_source else 'unknown' end;
    new.upgrade_free_seconds := case
      when old.plan = 'free' and old.free_since is not null
        then greatest(0, floor(extract(epoch from (now() - old.free_since))))::integer
      else null
    end;
    select count(*)::integer into new.upgrade_student_count
      from public.students s where s.teacher_id = new.teacher_id;
    new.upgrade_acknowledged_at := null;
  end if;

  if new.plan = 'free' then
    new.free_since := now();   -- entrou (de novo) no free
  else
    new.free_since := null;    -- saiu do free
  end if;

  return new;
end;
$$;

revoke all on function public.teacher_subscriptions_track_plan_change() from public, anon, authenticated;

drop trigger if exists teacher_subscriptions_track_plan_change on public.teacher_subscriptions;
create trigger teacher_subscriptions_track_plan_change
  before insert or update of plan on public.teacher_subscriptions
  for each row execute function public.teacher_subscriptions_track_plan_change();

-- ----------------------------------------------------------------------------
-- 3. set_teacher_plan (Admin): mesmo corpo e regras; identifica a origem
-- ----------------------------------------------------------------------------
create or replace function public.set_teacher_plan(_teacher_id uuid, _plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_count integer;
begin
  if not public.has_role(auth.uid(), 'super_admin') then
    raise exception 'ADMIN_ONLY: apenas administradores podem alterar planos.'
      using errcode = 'P0001';
  end if;

  if _plan not in ('free', 'pro') then
    raise exception 'INVALID_PLAN: plano deve ser free ou pro.'
      using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = _teacher_id) then
    raise exception 'TEACHER_NOT_FOUND: professor nao encontrado.'
      using errcode = 'P0001';
  end if;

  if _plan = 'free' then
    select count(*) into v_active_count
    from public.students
    where teacher_id = _teacher_id
      and lower(coalesce(status, '')) in ('active', 'trial');

    if v_active_count > 5 then
      raise exception 'DOWNGRADE_BLOCKED_ACTIVE_STUDENTS: este professor tem mais de 5 alunos ativos e nao pode voltar ao plano gratuito agora.'
        using errcode = 'P0001';
    end if;
  end if;

  -- Origem para o trigger de comemoração: concessão administrativa.
  perform set_config('bloom.plan_change_source', 'admin_grant', true);

  insert into public.teacher_subscriptions (teacher_id, plan, updated_at)
  values (_teacher_id, _plan, now())
  on conflict (teacher_id)
  do update set plan = excluded.plan, updated_at = now();

  perform set_config('bloom.plan_change_source', '', true);
end;
$$;

revoke all on function public.set_teacher_plan(uuid, text) from public;
revoke all on function public.set_teacher_plan(uuid, text) from anon;
grant execute on function public.set_teacher_plan(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Compra confirmada (FUTURA integração de pagamento; somente service_role)
-- ----------------------------------------------------------------------------
create or replace function public.apply_plan_purchase(_teacher_id uuid, _plan text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if _plan is null or _plan not in ('pro') then
    raise exception 'INVALID_PLAN: compra deve conceder um plano pago.' using errcode = 'P0001';
  end if;

  perform set_config('bloom.plan_change_source', 'purchase', true);

  update public.teacher_subscriptions
     set plan = _plan, updated_at = now()
   where teacher_id = _teacher_id;
  get diagnostics v_count = row_count;

  perform set_config('bloom.plan_change_source', '', true);

  if v_count = 0 then
    raise exception 'TEACHER_NOT_FOUND: assinatura do professor nao encontrada.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.apply_plan_purchase(uuid, text) from public, anon, authenticated;
grant execute on function public.apply_plan_purchase(uuid, text) to service_role;

-- ----------------------------------------------------------------------------
-- 5. Confirmação de visualização (teacher, só o próprio evento)
-- ----------------------------------------------------------------------------
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

commit;

-- ----------------------------------------------------------------------------
-- Rollback (somente se necessário; descomente). Restaura set_teacher_plan sem a
-- linha de origem reaplicando a seção 2 de 20261105050000_admin_panel_manual.sql.
-- ----------------------------------------------------------------------------
-- begin;
-- drop trigger if exists teacher_subscriptions_track_plan_change on public.teacher_subscriptions;
-- drop function if exists public.teacher_subscriptions_track_plan_change();
-- drop function if exists public.apply_plan_purchase(uuid, text);
-- drop function if exists public.acknowledge_plan_upgrade(timestamptz);
-- alter table public.teacher_subscriptions
--   drop constraint if exists teacher_subscriptions_upgrade_source_check,
--   drop column if exists upgrade_acknowledged_at,
--   drop column if exists upgrade_student_count,
--   drop column if exists upgrade_free_seconds,
--   drop column if exists upgrade_source,
--   drop column if exists upgraded_to_plan,
--   drop column if exists upgraded_at,
--   drop column if exists free_since;
-- commit;

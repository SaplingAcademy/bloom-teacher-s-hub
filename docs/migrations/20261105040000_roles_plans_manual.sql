-- ============================================================================
-- Bloom — Papéis (roles) e Planos (freemium) — APLICAÇÃO MANUAL
-- ----------------------------------------------------------------------------
-- Executar no SQL Editor do Supabase de produção, nesta ordem, em uma única
-- execução (ou na ordem das seções 1 a 7). Nada aqui exclui ou altera dados
-- de alunos, Leads, turmas, tarefas ou aulas.
--
-- Decisões:
--  * Papéis e planos são independentes e vivem em tabelas próprias, fora do
--    alcance de edição pelo próprio usuário (RLS sem INSERT/UPDATE/DELETE
--    para authenticated).
--  * Contas existentes são grandfathered como 'pro' (seção 4) para nunca
--    bloquear o uso atual; contas novas entram como 'free' + papel 'teacher'
--    via trigger em profiles (seção 5).
--  * O limite de 5 alunos ativos do plano free é aplicado por trigger em
--    public.students (seção 6), cobrindo cadastro direto, conversão de Lead
--    (a RPC insere em students), importações e reativações. O lock advisory
--    por professor torna a contagem segura contra operações simultâneas.
--  * Alunos com status 'Active' ou 'Trial' ocupam vaga; 'Inactive', 'Paused'
--    e 'Archived' não contam.
--  * Nenhum e-mail fixo no código: a promoção a super_admin é feita pelos
--    INSERTs comentados da seção 7, preenchidos com os UUIDs reais na hora.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Papéis de usuário
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('super_admin', 'teacher');
  end if;
end;
$$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);

-- user_roles é lido pelo próprio usuário e pela função has_role; escrita
-- somente via service_role (SQL editor / backend privilegiado).
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

drop policy if exists "Users read own roles" on public.user_roles;
create policy "Users read own roles"
  on public.user_roles for select to authenticated
  using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

-- A função só é chamada internamente; não expor como RPC arbitrário.
revoke all on function public.has_role(uuid, public.app_role) from public;
revoke all on function public.has_role(uuid, public.app_role) from anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Planos de assinatura
-- ----------------------------------------------------------------------------
create table if not exists public.teacher_subscriptions (
  teacher_id uuid primary key references public.profiles(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- O professor lê o próprio plano; nunca escreve (sem grant de INSERT/UPDATE/
-- DELETE para authenticated). Mudanças de plano acontecem via service_role
-- (futura integração de pagamentos).
grant select on public.teacher_subscriptions to authenticated;
grant all on public.teacher_subscriptions to service_role;

alter table public.teacher_subscriptions enable row level security;

drop policy if exists "Teachers read own subscription" on public.teacher_subscriptions;
create policy "Teachers read own subscription"
  on public.teacher_subscriptions for select to authenticated
  using (auth.uid() = teacher_id);

create index if not exists idx_user_roles_user_id on public.user_roles(user_id);

-- ----------------------------------------------------------------------------
-- 3. Acesso à Bloom Academy (pro ou super_admin)
-- ----------------------------------------------------------------------------
create or replace function public.can_access_academy(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role(_user_id, 'super_admin')
    or exists (
      select 1
      from public.teacher_subscriptions
      where teacher_id = _user_id
        and plan = 'pro'
    )
$$;

revoke all on function public.can_access_academy(uuid) from public;
revoke all on function public.can_access_academy(uuid) from anon;
grant execute on function public.can_access_academy(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Preservação das contas existentes (grandfathering)
-- ----------------------------------------------------------------------------
-- Todo professor já cadastrado recebe plano 'pro' e papel 'teacher', sem
-- rebaixar ninguém e sem tocar em dados de alunos/Leads/turmas/tarefas/aulas.
insert into public.teacher_subscriptions (teacher_id, plan)
select p.id, 'pro'
from public.profiles p
on conflict (teacher_id) do nothing;

insert into public.user_roles (user_id, role)
select p.id, 'teacher'
from public.profiles p
on conflict (user_id, role) do nothing;

-- ----------------------------------------------------------------------------
-- 5. Novas contas entram como free + teacher
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_profile_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.teacher_subscriptions (teacher_id, plan)
  values (new.id, 'free')
  on conflict (teacher_id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'teacher')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

drop trigger if exists on_profile_created_plan on public.profiles;
create trigger on_profile_created_plan
  after insert on public.profiles
  for each row execute function public.handle_new_profile_plan();

-- ----------------------------------------------------------------------------
-- 6. Limite de 5 alunos ativos no plano free (autoridade no banco)
-- ----------------------------------------------------------------------------
-- Cobre INSERT direto, conversão de Lead (a RPC insere em students),
-- importações e reativações (UPDATE de status). O lock advisory por professor
-- serializa a contagem dentro da transação, impedindo bypass concorrente.
create or replace function public.enforce_free_plan_active_student_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_active_count integer;
  v_becomes_active boolean;
begin
  v_becomes_active := lower(coalesce(new.status, '')) in ('active', 'trial')
    and (tg_op = 'INSERT' or lower(coalesce(old.status, '')) not in ('active', 'trial'));

  if not v_becomes_active then
    return new;
  end if;

  select plan into v_plan
  from public.teacher_subscriptions
  where teacher_id = new.teacher_id;

  -- Sem linha de assinatura: fail-closed como 'free'.
  if coalesce(v_plan, 'free') <> 'free' then
    return new;
  end if;

  -- Serializa verificações concorrentes do mesmo professor nesta transação.
  perform pg_advisory_xact_lock(hashtext(new.teacher_id::text));

  select count(*) into v_active_count
  from public.students
  where teacher_id = new.teacher_id
    and lower(coalesce(status, '')) in ('active', 'trial')
    and (tg_op = 'INSERT' or id <> new.id);

  if v_active_count >= 5 then
    raise exception 'FREE_PLAN_ACTIVE_STUDENT_LIMIT: o plano gratuito permite ate 5 alunos ativos simultaneos.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_free_plan_limit on public.students;
create trigger enforce_free_plan_limit
  before insert or update of status on public.students
  for each row execute function public.enforce_free_plan_active_student_limit();

-- ----------------------------------------------------------------------------
-- 7. Promoção a super_admin (manual, sem e-mails fixos no código)
-- ----------------------------------------------------------------------------
-- Preencher com os UUIDs reais das duas contas (auth.users.id) e descomentar:
--
-- insert into public.user_roles (user_id, role)
-- values ('<UUID_DA_CONTA_1>', 'super_admin')
-- on conflict (user_id, role) do nothing;
--
-- insert into public.user_roles (user_id, role)
-- values ('<UUID_DA_CONTA_2>', 'super_admin')
-- on conflict (user_id, role) do nothing;
--
-- Super admins NÃO ganham acesso automático aos dados privados de outros
-- professores: as policies existentes por teacher_id continuam valendo.
-- ============================================================================

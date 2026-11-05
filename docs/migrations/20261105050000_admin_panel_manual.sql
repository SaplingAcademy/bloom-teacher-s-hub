-- ============================================================================
-- Bloom — Painel Administrativo (super_admin) — APLICAÇÃO MANUAL
-- ----------------------------------------------------------------------------
-- Executar no SQL Editor do Supabase de produção. Pré-requisito: o SQL de
-- papéis e planos (20261105040000_roles_plans_manual.sql) já aplicado, pois
-- este script usa public.user_roles, public.has_role e
-- public.teacher_subscriptions.
--
-- Decisões:
--  * Nenhum dado privado de alunos/Leads é exposto: a listagem retorna apenas
--    nome, e-mail, plano, data de cadastro e a CONTAGEM de alunos ativos.
--  * As duas funções são SECURITY DEFINER e verificam
--    public.has_role(auth.uid(), 'super_admin') antes de qualquer leitura ou
--    escrita — professores comuns recebem erro e nada mais.
--  * Nenhum grant de UPDATE em teacher_subscriptions para authenticated: a
--    mudança de plano acontece exclusivamente por set_teacher_plan.
--  * Rebaixar para 'free' é recusado quando o professor tem mais de 5 alunos
--    ativos (status Active/Trial), alinhado ao trigger do plano free.
--  * Super admins mantêm acesso integral independentemente do plano
--    registrado: can_access_academy já contempla has_role; nada aqui muda
--    as policies RLS existentes por teacher_id.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Listagem de professores para o painel (somente super_admin)
-- ----------------------------------------------------------------------------
create or replace function public.list_admin_teachers()
returns table (
  teacher_id uuid,
  full_name text,
  email text,
  plan text,
  created_at timestamptz,
  active_students integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'super_admin') then
    raise exception 'ADMIN_ONLY: apenas administradores podem listar professores.'
      using errcode = 'P0001';
  end if;

  return query
  select
    p.id as teacher_id,
    p.full_name,
    u.email::text as email,
    coalesce(s.plan, 'free') as plan,
    p.created_at,
    (
      select count(*)::integer
      from public.students st
      where st.teacher_id = p.id
        and lower(coalesce(st.status, '')) in ('active', 'trial')
    ) as active_students
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.teacher_subscriptions s on s.teacher_id = p.id
  order by p.created_at desc nulls last;
end;
$$;

revoke all on function public.list_admin_teachers() from public;
revoke all on function public.list_admin_teachers() from anon;
grant execute on function public.list_admin_teachers() to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Alteração de plano (somente super_admin, com regra de rebaixamento)
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

  insert into public.teacher_subscriptions (teacher_id, plan, updated_at)
  values (_teacher_id, _plan, now())
  on conflict (teacher_id)
  do update set plan = excluded.plan, updated_at = now();
end;
$$;

revoke all on function public.set_teacher_plan(uuid, text) from public;
revoke all on function public.set_teacher_plan(uuid, text) from anon;
grant execute on function public.set_teacher_plan(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Promoção a super_admin (se ainda não foi feita na etapa anterior)
-- ----------------------------------------------------------------------------
-- Preencher com os UUIDs reais das contas (auth.users.id) e descomentar:
--
-- insert into public.user_roles (user_id, role)
-- values ('<UUID_DA_CONTA_1>', 'super_admin')
-- on conflict (user_id, role) do nothing;
--
-- insert into public.user_roles (user_id, role)
-- values ('<UUID_DA_CONTA_2>', 'super_admin')
-- on conflict (user_id, role) do nothing;
-- ============================================================================

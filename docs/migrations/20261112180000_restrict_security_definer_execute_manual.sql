-- =========================================================================================
-- Segurança — P1: restringir EXECUTE de funções SECURITY DEFINER (Security Advisor)
-- Aplicação MANUAL no SQL Editor do Supabase. Não usar ferramentas de migração gerenciadas.
--
-- ESCOPO
--   Somente permissões (GRANT/REVOKE EXECUTE). Não altera definições de funções, tabelas de
--   negócio, dados, triggers nem políticas RLS. Para permitir um rollback exato, guarda antes um
--   snapshot dos privilégios originais em bloom_security_audit.p1_function_acl_snapshot (schema
--   próprio, fora da API: sem acesso para PUBLIC, anon e authenticated).
--
-- O QUE MUDA
--   A) RPCs chamadas pelo app logado (Leads, Comunidade, Perfil):
--        convert_lead_to_student, get_public_teacher_profiles, get_community_leaderboard
--      → sem EXECUTE para PUBLIC e anon; EXECUTE explícito para authenticated e service_role
--        (explícito para não depender do grant herdado de PUBLIC, que é removido).
--   B) Funções usadas exclusivamente por triggers (retornam `trigger`, não são chamadas pelo app):
--        handle_new_user, handle_new_profile_plan, enforce_free_plan_active_student_limit,
--        normalize_lead_stage_trigger, handle_community_comment_reputation,
--        handle_community_comment_reputation_delete, handle_community_water_reputation,
--        handle_community_water_reputation_delete, handle_post_comment_notification,
--        sync_lead_interaction_timestamps
--      → sem EXECUTE para PUBLIC, anon e authenticated.
--      O Postgres verifica EXECUTE da função de trigger apenas ao CRIAR o trigger, não quando ele
--      dispara: cadastro (auth.users → perfil), plano free, limite de alunos, estágio de Leads,
--      reputação/ranking, notificações e timestamps de Leads continuam funcionando.
--
-- O QUE NÃO MUDA (permanecem com authenticated, validação interna confirmada)
--   has_role, can_access_academy, bloom_event_belongs_to_teacher, bloom_student_in_event
--   (usadas em políticas RLS), assert_library_resource_access, activate_due_scheduled_contracts,
--   list_admin_teachers, set_teacher_plan, set_library_resource_access, edit/soft-delete/restore
--   de publicações, water_idea e as demais RPCs do app.
--
-- SEGURANÇA DA EXECUÇÃO
--   Tudo roda em uma transação. Antes de qualquer alteração, a conferência aborta (sem alterar
--   nada) se alguma função listada não existir com a assinatura esperada, se alguma do grupo A
--   não for SECURITY DEFINER, se alguma do grupo B não retornar `trigger` ou se alguma do grupo B
--   não estiver vinculada a ao menos um trigger.
--   O snapshot é gravado uma única vez por função (reexecutar o arquivo não sobrescreve os
--   privilégios originais com os já restringidos). Se já existir um snapshot, ele só é reutilizado
--   quando for compatível: estrutura esperada, exatamente as 13 funções deste arquivo e, para cada
--   uma, privilégios atuais iguais aos originais (P1 ainda não aplicado ou revertido) ou iguais ao
--   resultado esperado do P1 (reexecução). Caso contrário, aborta sem alterar nada.
--   Ao final, antes do commit, confere os privilégios efetivos: anon sem EXECUTE nas 13 funções,
--   authenticated com EXECUTE no grupo A e sem EXECUTE no grupo B; se não, aborta e desfaz tudo
--   (ex.: grants feitos por outro grantor que o REVOKE do usuário atual não remove).
--
-- ROLLBACK
--   Ver a seção "ROLLBACK EXATO" no fim do arquivo: restaura, a partir do snapshot, exatamente os
--   privilégios EXECUTE originais de PUBLIC, anon, authenticated e service_role em cada função.
-- =========================================================================================
begin;

-- -----------------------------------------------------------------------------------------
-- 0. Conferência prévia (aborta a transação se algo não estiver como esperado)
-- -----------------------------------------------------------------------------------------
do $$
declare
  v_fn text;
  v_oid oid;
  v_rpcs text[] := array[
    'public.convert_lead_to_student(uuid, uuid, text, text, text, text, text, text, text, uuid, text, text)',
    'public.get_public_teacher_profiles()',
    'public.get_community_leaderboard(text, integer)'
  ];
  v_triggers text[] := array[
    'public.handle_new_user()',
    'public.handle_new_profile_plan()',
    'public.enforce_free_plan_active_student_limit()',
    'public.normalize_lead_stage_trigger()',
    'public.handle_community_comment_reputation()',
    'public.handle_community_comment_reputation_delete()',
    'public.handle_community_water_reputation()',
    'public.handle_community_water_reputation_delete()',
    'public.handle_post_comment_notification()',
    'public.sync_lead_interaction_timestamps()'
  ];
begin
  foreach v_fn in array v_rpcs loop
    v_oid := to_regprocedure(v_fn);
    if v_oid is null then
      raise exception 'P1 abortado: função % não encontrada com esta assinatura.', v_fn;
    end if;
    if not (select prosecdef from pg_proc where oid = v_oid) then
      raise exception 'P1 abortado: % não é SECURITY DEFINER; revisar antes.', v_fn;
    end if;
  end loop;

  foreach v_fn in array v_triggers loop
    v_oid := to_regprocedure(v_fn);
    if v_oid is null then
      raise exception 'P1 abortado: função % não encontrada com esta assinatura.', v_fn;
    end if;
    if (select prorettype from pg_proc where oid = v_oid) <> 'trigger'::regtype then
      raise exception 'P1 abortado: % não retorna trigger; pode ser chamada pelo app.', v_fn;
    end if;
    if not exists (select 1 from pg_trigger where tgfoid = v_oid and not tgisinternal) then
      raise exception 'P1 abortado: % não está vinculada a nenhum trigger; revisar antes.', v_fn;
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------------------
-- 1. Snapshot dos privilégios originais (para rollback exato)
--    proacl NULL significa "privilégios padrão" (dono + EXECUTE para PUBLIC): grava-se o
--    equivalente explícito via acldefault, para o rollback saber o que restaurar.
-- -----------------------------------------------------------------------------------------
create schema if not exists bloom_security_audit;
revoke all on schema bloom_security_audit from public, anon, authenticated;

create table if not exists bloom_security_audit.p1_function_acl_snapshot (
  function_signature text primary key,
  original_acl aclitem[] not null,
  captured_at timestamptz not null default now()
);
revoke all on bloom_security_audit.p1_function_acl_snapshot from public, anon, authenticated;

-- Conferência de snapshot preexistente (aborta se for incompatível; não reutiliza em silêncio).
-- Compara, por papel (PUBLIC, anon, authenticated, service_role), EXECUTE e WITH GRANT OPTION.
do $$
declare
  v_expected text[] := array[
    'public.convert_lead_to_student(uuid, uuid, text, text, text, text, text, text, text, uuid, text, text)',
    'public.get_public_teacher_profiles()',
    'public.get_community_leaderboard(text, integer)',
    'public.handle_new_user()',
    'public.handle_new_profile_plan()',
    'public.enforce_free_plan_active_student_limit()',
    'public.normalize_lead_stage_trigger()',
    'public.handle_community_comment_reputation()',
    'public.handle_community_comment_reputation_delete()',
    'public.handle_community_water_reputation()',
    'public.handle_community_water_reputation_delete()',
    'public.handle_post_comment_notification()',
    'public.sync_lead_interaction_timestamps()'
  ];
  v_group_a text[] := array[
    'public.convert_lead_to_student(uuid, uuid, text, text, text, text, text, text, text, uuid, text, text)',
    'public.get_public_teacher_profiles()',
    'public.get_community_leaderboard(text, integer)'
  ];
  v_rows int;
  v_matching int;
  s record;
  v_oid oid;
  v_orig text[];
  v_cur text[];
  v_post text[];
begin
  if (select count(*) from information_schema.columns
      where table_schema = 'bloom_security_audit' and table_name = 'p1_function_acl_snapshot'
        and ((column_name = 'function_signature' and data_type = 'text')
          or (column_name = 'original_acl' and udt_name = '_aclitem'))) <> 2 then
    raise exception 'P1 abortado: tabela de snapshot preexistente com estrutura inesperada.';
  end if;

  select count(*), count(*) filter (where function_signature = any (v_expected))
    into v_rows, v_matching
  from bloom_security_audit.p1_function_acl_snapshot;

  if v_rows = 0 then
    return; -- primeira aplicação: o snapshot será gravado a seguir
  end if;
  if v_rows <> v_matching or v_matching <> array_length(v_expected, 1) then
    raise exception 'P1 abortado: snapshot preexistente incompatível (% linhas, % das 13 funções esperadas).',
      v_rows, v_matching;
  end if;

  for s in select function_signature, original_acl from bloom_security_audit.p1_function_acl_snapshot loop
    v_oid := to_regprocedure(s.function_signature);
    if v_oid is null then
      raise exception 'P1 abortado: função do snapshot % não existe.', s.function_signature;
    end if;

    -- privilégios originais (snapshot), por papel: 'papel:tem_grant_option'
    select array(
      select e.r || ':' || bool_or(e.g) from (
        select case when x.grantee = 0 then 'public' else x.grantee::regrole::text end as r, x.is_grantable as g
        from aclexplode(s.original_acl) x
        where x.privilege_type = 'EXECUTE'
          and (x.grantee = 0 or x.grantee in ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole))
      ) e group by e.r order by e.r)
    into v_orig;

    -- privilégios atuais
    select array(
      select e.r || ':' || bool_or(e.g) from (
        select case when x.grantee = 0 then 'public' else x.grantee::regrole::text end as r, x.is_grantable as g
        from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
        where p.oid = v_oid
          and x.privilege_type = 'EXECUTE'
          and (x.grantee = 0 or x.grantee in ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole))
      ) e group by e.r order by e.r)
    into v_cur;

    -- resultado esperado do P1 a partir do original
    select array(
      select e.r || ':' || bool_or(e.g) from (
        select split_part(o, ':', 1) as r, split_part(o, ':', 2)::boolean as g
        from unnest(v_orig) o
        where (s.function_signature = any (v_group_a) and split_part(o, ':', 1) in ('authenticated', 'service_role'))
           or (not (s.function_signature = any (v_group_a)) and split_part(o, ':', 1) = 'service_role')
        union all
        select r, false from unnest(array['authenticated', 'service_role']) r
        where s.function_signature = any (v_group_a)
      ) e group by e.r order by e.r)
    into v_post;

    if v_cur is distinct from v_orig and v_cur is distinct from v_post then
      raise exception 'P1 abortado: snapshot preexistente incompatível com %: original %, atual %, esperado após P1 %.',
        s.function_signature, v_orig, v_cur, v_post;
    end if;
  end loop;
end;
$$;

insert into bloom_security_audit.p1_function_acl_snapshot (function_signature, original_acl)
select 'public.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')',
       coalesce(p.proacl, acldefault('f', p.proowner))
from pg_proc p
where p.oid in (
  'public.convert_lead_to_student(uuid, uuid, text, text, text, text, text, text, text, uuid, text, text)'::regprocedure,
  'public.get_public_teacher_profiles()'::regprocedure,
  'public.get_community_leaderboard(text, integer)'::regprocedure,
  'public.handle_new_user()'::regprocedure,
  'public.handle_new_profile_plan()'::regprocedure,
  'public.enforce_free_plan_active_student_limit()'::regprocedure,
  'public.normalize_lead_stage_trigger()'::regprocedure,
  'public.handle_community_comment_reputation()'::regprocedure,
  'public.handle_community_comment_reputation_delete()'::regprocedure,
  'public.handle_community_water_reputation()'::regprocedure,
  'public.handle_community_water_reputation_delete()'::regprocedure,
  'public.handle_post_comment_notification()'::regprocedure,
  'public.sync_lead_interaction_timestamps()'::regprocedure
)
on conflict (function_signature) do nothing;

-- -----------------------------------------------------------------------------------------
-- A. RPCs do app logado: remover PUBLIC/anon, manter authenticated (explícito) e service_role
-- -----------------------------------------------------------------------------------------
revoke execute on function public.convert_lead_to_student(uuid, uuid, text, text, text, text, text, text, text, uuid, text, text) from public, anon;
grant  execute on function public.convert_lead_to_student(uuid, uuid, text, text, text, text, text, text, text, uuid, text, text) to authenticated, service_role;

revoke execute on function public.get_public_teacher_profiles() from public, anon;
grant  execute on function public.get_public_teacher_profiles() to authenticated, service_role;

revoke execute on function public.get_community_leaderboard(text, integer) from public, anon;
grant  execute on function public.get_community_leaderboard(text, integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------------------
-- B. Funções exclusivas de triggers: sem EXECUTE direto pela API
-- -----------------------------------------------------------------------------------------
revoke execute on function public.handle_new_user()                              from public, anon, authenticated;
revoke execute on function public.handle_new_profile_plan()                      from public, anon, authenticated;
revoke execute on function public.enforce_free_plan_active_student_limit()       from public, anon, authenticated;
revoke execute on function public.normalize_lead_stage_trigger()                 from public, anon, authenticated;
revoke execute on function public.handle_community_comment_reputation()          from public, anon, authenticated;
revoke execute on function public.handle_community_comment_reputation_delete()   from public, anon, authenticated;
revoke execute on function public.handle_community_water_reputation()            from public, anon, authenticated;
revoke execute on function public.handle_community_water_reputation_delete()     from public, anon, authenticated;
revoke execute on function public.handle_post_comment_notification()             from public, anon, authenticated;
revoke execute on function public.sync_lead_interaction_timestamps()             from public, anon, authenticated;

-- -----------------------------------------------------------------------------------------
-- 2. Conferência final dos privilégios efetivos (aborta e desfaz tudo se algo não ficou certo)
-- -----------------------------------------------------------------------------------------
do $$
declare
  s record;
  v_oid oid;
  v_group_a text[] := array[
    'public.convert_lead_to_student(uuid, uuid, text, text, text, text, text, text, text, uuid, text, text)',
    'public.get_public_teacher_profiles()',
    'public.get_community_leaderboard(text, integer)'
  ];
begin
  for s in select function_signature from bloom_security_audit.p1_function_acl_snapshot loop
    v_oid := to_regprocedure(s.function_signature);
    if has_function_privilege('anon', v_oid, 'EXECUTE') then
      raise exception 'P1 abortado: anon ainda executa %.', s.function_signature;
    end if;
    if s.function_signature = any (v_group_a) then
      if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
        raise exception 'P1 abortado: authenticated perdeu EXECUTE em %.', s.function_signature;
      end if;
    elsif has_function_privilege('authenticated', v_oid, 'EXECUTE') then
      raise exception 'P1 abortado: authenticated ainda executa a função de trigger %.', s.function_signature;
    end if;
  end loop;
end;
$$;

commit;

-- =========================================================================================
-- VERIFICAÇÃO PÓS-APLICAÇÃO (somente leitura; executar separadamente)
-- Esperado:
--   - grupo 'A rpc app'      → anon_exec = false, auth_exec = true
--   - grupo 'B trigger'      → anon_exec = false, auth_exec = false, triggers_vinculados >= 1
--   - grupo 'C mantém auth'  → auth_exec = true (sem mudança)
-- =========================================================================================
-- select
--   case
--     when p.proname in ('convert_lead_to_student','get_public_teacher_profiles','get_community_leaderboard')
--       then 'A rpc app'
--     when p.prorettype = 'trigger'::regtype then 'B trigger'
--     else 'C mantém auth'
--   end as grupo,
--   p.proname,
--   pg_get_function_identity_arguments(p.oid) as args,
--   has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_exec,
--   has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
--   (select count(*) from pg_trigger t where t.tgfoid = p.oid and not t.tgisinternal) as triggers_vinculados
-- from pg_proc p
-- where p.pronamespace = 'public'::regnamespace
--   and p.prosecdef
-- order by grupo, p.proname;
--
-- Snapshot gravado (somente leitura): privilégios originais × atuais de cada função
-- select s.function_signature, s.captured_at, s.original_acl,
--        p.proacl as current_acl
-- from bloom_security_audit.p1_function_acl_snapshot s
-- left join pg_proc p on p.oid = to_regprocedure(s.function_signature)
-- order by s.function_signature;

-- =========================================================================================
-- ROLLBACK EXATO (somente se necessário; executar separadamente, sem os "--")
-- Para cada função do snapshot: remove EXECUTE de PUBLIC, anon, authenticated e service_role e
-- concede de volta exatamente o que cada um desses papéis tinha antes (inclusive WITH GRANT
-- OPTION, se havia). O privilégio do dono da função nunca foi alterado e não é tocado.
-- Nada é concedido além do que constava no snapshot.
-- Grant option: o REVOKE simples remove o privilégio e o grant option atuais (mesmo que o atual
-- tenha grant option e o original não); o GRANT seguinte recoloca WITH GRANT OPTION somente onde o
-- original tinha. Se algum desses papéis tiver repassado o privilégio a terceiros, o REVOKE falha
-- ("dependent privileges exist") e nada é revertido; não se usa CASCADE para não afetar terceiros.
-- Ao final, o próprio rollback confere papel a papel (EXECUTE e grant option) e desfaz tudo se o
-- resultado não for idêntico ao snapshot.
-- =========================================================================================
-- begin;
-- do $$
-- declare
--   s record;
--   a record;
--   v_oid oid;
--   v_grantee text;
--   v_orig text[];
--   v_cur text[];
-- begin
--   if not exists (select 1 from bloom_security_audit.p1_function_acl_snapshot) then
--     raise exception 'Rollback abortado: snapshot vazio.';
--   end if;
--   for s in select function_signature, original_acl from bloom_security_audit.p1_function_acl_snapshot loop
--     v_oid := to_regprocedure(s.function_signature);
--     if v_oid is null then
--       raise exception 'Rollback abortado: função % não existe mais.', s.function_signature;
--     end if;
--     execute format('revoke execute on function %s from public, anon, authenticated, service_role', v_oid::regprocedure);
--     for a in
--       select x.grantee, x.is_grantable
--       from aclexplode(s.original_acl) x
--       where x.privilege_type = 'EXECUTE'
--         and (x.grantee = 0 or x.grantee in ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole))
--     loop
--       v_grantee := case when a.grantee = 0 then 'public' else a.grantee::regrole::text end;
--       execute format('grant execute on function %s to %s%s', v_oid::regprocedure, v_grantee,
--                      case when a.is_grantable then ' with grant option' else '' end);
--     end loop;
--   end loop;
--
--   for s in select function_signature, original_acl from bloom_security_audit.p1_function_acl_snapshot loop
--     select array(
--       select e.r || ':' || bool_or(e.g) from (
--         select case when x.grantee = 0 then 'public' else x.grantee::regrole::text end as r, x.is_grantable as g
--         from aclexplode(s.original_acl) x
--         where x.privilege_type = 'EXECUTE'
--           and (x.grantee = 0 or x.grantee in ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole))
--       ) e group by e.r order by e.r)
--     into v_orig;
--     select array(
--       select e.r || ':' || bool_or(e.g) from (
--         select case when x.grantee = 0 then 'public' else x.grantee::regrole::text end as r, x.is_grantable as g
--         from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
--         where p.oid = to_regprocedure(s.function_signature)
--           and x.privilege_type = 'EXECUTE'
--           and (x.grantee = 0 or x.grantee in ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole))
--       ) e group by e.r order by e.r)
--     into v_cur;
--     if v_cur is distinct from v_orig then
--       raise exception 'Rollback abortado: % ficou %, original %.', s.function_signature, v_cur, v_orig;
--     end if;
--   end loop;
-- end;
-- $$;
-- commit;
--
-- Conferência do rollback (somente leitura): deve retornar zero linhas.
-- Compara, para PUBLIC, anon, authenticated e service_role, os privilégios EXECUTE originais
-- (snapshot) com os atuais, nos dois sentidos: nada faltando e nada a mais.
-- with roles(grantee) as (
--   select 0::oid union all
--   select oid from pg_roles where rolname in ('anon', 'authenticated', 'service_role')
-- ),
-- original as (
--   select s.function_signature, x.grantee, x.is_grantable
--   from bloom_security_audit.p1_function_acl_snapshot s
--   cross join lateral aclexplode(s.original_acl) x
--   where x.privilege_type = 'EXECUTE' and x.grantee in (select grantee from roles)
-- ),
-- atual as (
--   select s.function_signature, x.grantee, x.is_grantable
--   from bloom_security_audit.p1_function_acl_snapshot s
--   join pg_proc p on p.oid = to_regprocedure(s.function_signature)
--   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
--   where x.privilege_type = 'EXECUTE' and x.grantee in (select grantee from roles)
-- )
-- (select 'faltando' as diferenca, * from original except select 'faltando', * from atual)
-- union all
-- (select 'a mais', * from atual except select 'a mais', * from original);
--
-- Limpeza do snapshot (opcional, apenas depois de confirmar que o rollback não será necessário)
-- drop schema bloom_security_audit cascade;

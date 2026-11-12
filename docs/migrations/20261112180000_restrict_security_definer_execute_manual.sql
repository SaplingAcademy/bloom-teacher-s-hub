-- =========================================================================================
-- Segurança — P1: restringir EXECUTE de funções SECURITY DEFINER (Security Advisor)
-- Aplicação MANUAL no SQL Editor do Supabase. Não usar ferramentas de migração gerenciadas.
--
-- ESCOPO
--   Somente permissões (GRANT/REVOKE EXECUTE). Não altera definições de funções, tabelas,
--   dados, triggers nem políticas RLS.
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
--   Tudo roda em uma transação. Antes de revogar, o bloco de conferência aborta (sem alterar nada)
--   se alguma função listada não existir com a assinatura esperada, se alguma do grupo B não
--   retornar `trigger`, ou se alguma do grupo B não estiver vinculada a ao menos um trigger.
--
-- ROLLBACK (restaura o estado anterior, se necessário)
--   grant execute on function public.convert_lead_to_student(uuid, uuid, text, text, text, text, text, text, text, uuid, text, text) to public, anon;
--   grant execute on function public.get_public_teacher_profiles() to public, anon;
--   grant execute on function public.get_community_leaderboard(text, integer) to public, anon;
--   grant execute on function public.handle_new_user() to public, anon, authenticated;
--   grant execute on function public.handle_new_profile_plan() to public, anon, authenticated;
--   grant execute on function public.enforce_free_plan_active_student_limit() to public, anon, authenticated;
--   grant execute on function public.normalize_lead_stage_trigger() to public, anon, authenticated;
--   grant execute on function public.handle_community_comment_reputation() to public, anon, authenticated;
--   grant execute on function public.handle_community_comment_reputation_delete() to public, anon, authenticated;
--   grant execute on function public.handle_community_water_reputation() to public, anon, authenticated;
--   grant execute on function public.handle_community_water_reputation_delete() to public, anon, authenticated;
--   grant execute on function public.handle_post_comment_notification() to public, anon, authenticated;
--   grant execute on function public.sync_lead_interaction_timestamps() to public, anon, authenticated;
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

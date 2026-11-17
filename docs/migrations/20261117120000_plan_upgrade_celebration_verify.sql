-- Verificação SOMENTE LEITURA de 20261117120000_plan_upgrade_celebration_manual.sql
-- Todas as linhas da primeira consulta devem retornar ok = true.
select 'colunas (7)' as item,
       count(*) filter (where column_name in ('free_since','upgraded_at','upgraded_to_plan','upgrade_source',
         'upgrade_free_seconds','upgrade_student_count','upgrade_acknowledged_at')) = 7 as ok
  from information_schema.columns
 where table_schema = 'public' and table_name = 'teacher_subscriptions'
union all
select 'check de upgrade_source', exists (
  select 1 from pg_constraint where conname = 'teacher_subscriptions_upgrade_source_check')
union all
select 'trigger de mudança de plano', exists (
  select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'teacher_subscriptions' and t.tgname = 'teacher_subscriptions_track_plan_change' and not t.tgisinternal)
union all
select 'set_teacher_plan identifica admin_grant e mantém as regras', exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'set_teacher_plan'
     and p.prosrc like '%admin_grant%' and p.prosrc like '%DOWNGRADE_BLOCKED_ACTIVE_STUDENTS%' and p.prosrc like '%ADMIN_ONLY%')
union all
select 'authenticated executa set_teacher_plan (validação interna de admin)',
       has_function_privilege('authenticated', 'public.set_teacher_plan(uuid, text)', 'execute')
union all
select 'apply_plan_purchase só para service_role',
       has_function_privilege('service_role', 'public.apply_plan_purchase(uuid, text)', 'execute')
       and not has_function_privilege('authenticated', 'public.apply_plan_purchase(uuid, text)', 'execute')
       and not has_function_privilege('anon', 'public.apply_plan_purchase(uuid, text)', 'execute')
union all
select 'acknowledge_plan_upgrade: authenticated sim, anon não',
       has_function_privilege('authenticated', 'public.acknowledge_plan_upgrade(timestamptz)', 'execute')
       and not has_function_privilege('anon', 'public.acknowledge_plan_upgrade(timestamptz)', 'execute')
union all
select 'teacher continua sem escrita direta na tabela',
       not has_table_privilege('authenticated', 'public.teacher_subscriptions', 'insert')
       and not has_table_privilege('authenticated', 'public.teacher_subscriptions', 'update')
       and not has_table_privilege('authenticated', 'public.teacher_subscriptions', 'delete')
union all
select 'contas free com início do free preenchido',
       not exists (select 1 from public.teacher_subscriptions where plan = 'free' and free_since is null);

-- Resumo (somente leitura). Logo após aplicar: upgrades_registrados = 0 e pendentes = 0.
select count(*) filter (where plan = 'free')                                                as contas_free,
       count(*) filter (where plan = 'pro')                                                 as contas_pro,
       count(*) filter (where upgraded_at is not null)                                      as upgrades_registrados,
       count(*) filter (where upgraded_at is not null and upgrade_acknowledged_at is null)  as pendentes_de_exibicao,
       count(*) filter (where upgrade_source = 'admin_grant')                               as origem_admin,
       count(*) filter (where upgrade_source = 'purchase')                                  as origem_compra,
       count(*) filter (where upgrade_source = 'unknown')                                   as origem_desconhecida
  from public.teacher_subscriptions;

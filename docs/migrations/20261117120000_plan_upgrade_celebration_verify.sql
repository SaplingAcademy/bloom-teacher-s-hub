-- Verificação SOMENTE LEITURA da migração 20261117120000_plan_upgrade_celebration_manual.sql
select 'colunas' as item,
       count(*) filter (where column_name in ('upgraded_at','upgraded_to_plan','upgrade_acknowledged_at')) = 3 as ok
  from information_schema.columns
 where table_schema = 'public' and table_name = 'teacher_subscriptions'
union all
select 'trigger', exists (
  select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'teacher_subscriptions' and t.tgname = 'teacher_subscriptions_mark_upgrade' and not t.tgisinternal)
union all
select 'rpc acknowledge (security definer)', exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'acknowledge_plan_upgrade' and p.prosecdef)
union all
select 'authenticated pode executar acknowledge',
       has_function_privilege('authenticated', 'public.acknowledge_plan_upgrade(timestamptz)', 'execute')
union all
select 'anon NÃO pode executar acknowledge',
       not has_function_privilege('anon', 'public.acknowledge_plan_upgrade(timestamptz)', 'execute')
union all
select 'authenticated continua sem UPDATE na tabela',
       not has_table_privilege('authenticated', 'public.teacher_subscriptions', 'update')
;

-- Resumo (somente leitura): upgrades registrados e pendentes de exibição.
select count(*) filter (where upgraded_at is not null) as upgrades_registrados,
       count(*) filter (where upgraded_at is not null and upgrade_acknowledged_at is null) as pendentes_de_exibicao
  from public.teacher_subscriptions;

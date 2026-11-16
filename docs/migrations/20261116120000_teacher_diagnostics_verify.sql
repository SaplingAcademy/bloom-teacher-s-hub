-- Bloom · Diagnóstico Inicial · verificação pós-migração (SOMENTE LEITURA)
-- Salvar como: bloom_diagnostico_inicial_verificacao. Todas as linhas devem dar OK
-- (as marcadas INFO são apenas informativas).
with fn as (
  select p.oid, p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('get_my_teacher_diagnostic', 'accept_teacher_diagnostic_consent', 'save_teacher_diagnostic_step',
    'complete_teacher_diagnostic', 'list_teacher_diagnostics', 'teacher_diagnostic_clean', 'teacher_diagnostic_missing')
),
checks as (
  select 1 as ord, 'tabela teacher_diagnostics com RLS' as verificacao,
         coalesce((select relrowsecurity::text from pg_class where oid = to_regclass('public.teacher_diagnostics')), 'ausente') as resultado, 'true' as esperado
  union all select 2, 'políticas na tabela (só SELECT da própria linha)',
         (select string_agg(cmd, ',' order by cmd) from pg_policies where schemaname = 'public' and tablename = 'teacher_diagnostics'), 'SELECT'
  union all select 3, 'authenticated: só SELECT (escrita apenas pelas RPCs)',
         (select (has_table_privilege('authenticated', 'public.teacher_diagnostics', 'SELECT')
                  and not has_table_privilege('authenticated', 'public.teacher_diagnostics', 'INSERT, UPDATE, DELETE'))::text), 'true'
  union all select 4, 'anon sem acesso à tabela',
         (select has_table_privilege('anon', 'public.teacher_diagnostics', 'SELECT, INSERT, UPDATE, DELETE')::text), 'false'
  union all select 5, 'funções criadas', (select count(*)::text from fn), '7'
  union all select 6, 'funções com search_path vazio', (select count(*)::text from fn where proconfig @> array['search_path=""']), '7'
  union all select 7, 'funções executáveis por anon', (select count(*)::text from fn where has_function_privilege('anon', oid, 'EXECUTE')), '0'
  union all select 8, 'executáveis por authenticated (só as 5 RPCs)',
         (select string_agg(proname, ',' order by proname) from fn where has_function_privilege('authenticated', oid, 'EXECUTE')),
         'accept_teacher_diagnostic_consent,complete_teacher_diagnostic,get_my_teacher_diagnostic,list_teacher_diagnostics,save_teacher_diagnostic_step'
  union all select 9, 'perfis existentes sem linha (deveriam ser isentos)',
         (select count(*)::text from public.profiles p where not exists (select 1 from public.teacher_diagnostics d where d.teacher_id = p.id)
            and p.created_at < (select min(started_at) from public.teacher_diagnostics where status = 'exempt')), '0'
  union all select 10, 'contas isentas', (select count(*)::text from public.teacher_diagnostics where status = 'exempt'), '(informativo)'
  union all select 11, 'diagnósticos em andamento', (select count(*)::text from public.teacher_diagnostics where status = 'in_progress'), '(informativo)'
  union all select 12, 'diagnósticos concluídos', (select count(*)::text from public.teacher_diagnostics where status = 'completed'), '(informativo)'
  union all select 13, 'concluídos sem aceite ou sem data de conclusão',
         (select count(*)::text from public.teacher_diagnostics where status = 'completed' and (consent_accepted_at is null or completed_at is null)), '0'
)
select ord, verificacao, resultado, esperado,
       case when esperado = '(informativo)' then 'INFO' when resultado = esperado then 'OK' else 'REVISAR' end as status
from checks order by ord;

-- Bloom · Workspace · Responsáveis pelas tarefas · verificação pós-migração (SOMENTE LEITURA)
-- Salvar como: bloom_workspace_responsaveis_tarefas_verificacao. Todas as linhas devem dar OK
-- (as marcadas INFO são apenas informativas).
with fn as (
  select p.oid, p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('set_project_item_assignees', 'create_project_task', 'workspace_item_assignees_replace',
    'workspace_item_assignee_eligible', 'workspace_item_assignees_guard', 'workspace_item_assignees_creator_default',
    'workspace_item_assignees_member_cleanup', 'workspace_item_assignees_type_cleanup', 'workspace_project_items_creator')
),
checks as (
  select 1 as ord, 'tabela workspace_item_assignees com RLS' as verificacao,
         coalesce((select relrowsecurity::text from pg_class where oid = to_regclass('public.workspace_item_assignees')), 'ausente') as resultado, 'true' as esperado
  union all select 2, 'chave primária (item_id, user_id) — sem duplicados',
         (select count(*)::text from pg_constraint where conrelid = to_regclass('public.workspace_item_assignees') and contype = 'p'
            and pg_get_constraintdef(oid) = 'PRIMARY KEY (item_id, user_id)'), '1'
  union all select 3, 'FKs com CASCADE (item, professor) e SET NULL (assigned_by)',
         (select string_agg(confdeltype::text, '' order by confdeltype) from pg_constraint where conrelid = to_regclass('public.workspace_item_assignees') and contype = 'f'), 'ccn'
  union all select 4, 'políticas na tabela (só SELECT)',
         (select string_agg(cmd, ',' order by cmd) from pg_policies where schemaname = 'public' and tablename = 'workspace_item_assignees'), 'SELECT'
  union all select 5, 'authenticated: só SELECT na tabela',
         (select (has_table_privilege('authenticated', 'public.workspace_item_assignees', 'SELECT')
                  and not has_table_privilege('authenticated', 'public.workspace_item_assignees', 'INSERT, UPDATE, DELETE'))::text), 'true'
  union all select 6, 'anon sem acesso à tabela',
         (select has_table_privilege('anon', 'public.workspace_item_assignees', 'SELECT, INSERT, UPDATE, DELETE')::text), 'false'
  union all select 7, 'coluna workspace_project_items.created_by (uuid, opcional)',
         (select data_type || '/' || is_nullable from information_schema.columns where table_schema = 'public'
            and table_name = 'workspace_project_items' and column_name = 'created_by'), 'uuid/YES'
  union all select 8, 'funções criadas', (select count(*)::text from fn), '9'
  union all select 9, 'funções com search_path vazio', (select count(*)::text from fn where proconfig @> array['search_path=""']), '9'
  union all select 10, 'funções executáveis por anon', (select count(*)::text from fn where has_function_privilege('anon', oid, 'EXECUTE')), '0'
  union all select 11, 'executáveis por authenticated (só as 2 RPCs)',
         (select string_agg(proname, ',' order by proname) from fn where has_function_privilege('authenticated', oid, 'EXECUTE')), 'create_project_task,set_project_item_assignees'
  union all select 12, 'triggers novos',
         (select count(*)::text from pg_trigger where not tgisinternal and tgname in ('workspace_project_items_creator', 'workspace_item_assignees_guard',
            'workspace_item_assignees_creator_default', 'workspace_item_assignees_member_cleanup', 'workspace_item_assignees_type_cleanup')), '5'
  union all select 13, 'triggers da Etapa 2 mantidos',
         (select count(*)::text from pg_trigger where not tgisinternal and tgname in ('workspace_projects_guard', 'workspace_project_phases_guard', 'workspace_project_items_guard')), '3'
  union all select 14, 'itens antigos sem created_by (preservados)',
         (select count(*)::text from public.workspace_project_items where created_by is null), '(informativo)'
  union all select 15, 'atribuições registradas', (select count(*)::text from public.workspace_item_assignees), '(informativo)'
  union all select 16, 'atribuições em itens que não são tarefa', (select count(*)::text from public.workspace_item_assignees a
            join public.workspace_project_items i on i.id = a.item_id where i.type <> 'task'), '0'
  union all select 17, 'atribuições de professores não elegíveis', (select count(*)::text from public.workspace_item_assignees a
            join public.workspace_project_items i on i.id = a.item_id join public.workspace_projects p on p.id = i.project_id
            where a.user_id <> p.user_id and not exists (select 1 from public.workspace_project_members m
              where m.project_id = p.id and m.user_id = a.user_id and m.status = 'accepted')), '0'
)
select ord, verificacao, resultado, esperado,
       case when esperado = '(informativo)' then 'INFO' when resultado = esperado then 'OK' else 'REVISAR' end as status
from checks order by ord;

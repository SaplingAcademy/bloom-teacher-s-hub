-- Verificação SOMENTE LEITURA de 20261118120000_workspace_note_connections_manual.sql
-- Todas as linhas devem retornar ok = true.
select 'tabela existe' as item, to_regclass('public.workspace_note_connections') is not null as ok
union all
select 'RLS ativa', coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.workspace_note_connections')), false)
union all
select 'políticas select/insert/delete (3)',
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'workspace_note_connections'
          and policyname in ('workspace_note_connections_select', 'workspace_note_connections_insert', 'workspace_note_connections_delete')) = 3
union all
select 'sem políticas extras',
       not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workspace_note_connections'
          and policyname not in ('workspace_note_connections_select', 'workspace_note_connections_insert', 'workspace_note_connections_delete'))
union all
select 'FKs para workspace_notes com ON DELETE CASCADE (2)',
       (select count(*) from pg_constraint
         where conrelid = to_regclass('public.workspace_note_connections') and contype = 'f'
           and confrelid = 'public.workspace_notes'::regclass and confdeltype = 'c') = 2
union all
select 'check contra conexão com a própria nota', exists (
  select 1 from pg_constraint where conname = 'workspace_note_connections_not_self')
union all
select 'índice único por par', to_regclass('public.workspace_note_connections_pair_key') is not null
union all
select 'authenticated: select/insert/delete, sem update',
       has_table_privilege('authenticated', 'public.workspace_note_connections', 'select')
       and has_table_privilege('authenticated', 'public.workspace_note_connections', 'insert')
       and has_table_privilege('authenticated', 'public.workspace_note_connections', 'delete')
       and not has_table_privilege('authenticated', 'public.workspace_note_connections', 'update')
union all
select 'anon sem acesso', not has_table_privilege('anon', 'public.workspace_note_connections', 'select')
union all
select 'função de dono da nota pessoal (security definer)', exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'workspace_personal_note_owned' and p.prosecdef);

-- Resumo (somente leitura). Logo após aplicar: 0 conexões.
select count(*) as conexoes from public.workspace_note_connections;

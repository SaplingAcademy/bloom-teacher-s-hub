-- Verificação SOMENTE LEITURA de 20261128120000_placement_question_bank_manual.sql
-- Todas as linhas devem retornar ok = true.
select 'tabela placement_bank_items existe' as item,
       to_regclass('public.placement_bank_items') is not null as ok
union all
select 'RLS ativa em placement_bank_items',
       coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.placement_bank_items')), false)
union all
select 'políticas select/insert/update/delete (4), só para authenticated',
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'placement_bank_items'
           and roles = '{authenticated}'
           and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')) = 4
       and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'placement_bank_items') = 4
union all
select 'todas as políticas exigem acesso Pro (placement_access_allowed)',
       not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'placement_bank_items'
          and (coalesce(qual, '') || coalesce(with_check, '')) not like '%placement_access_allowed%')
union all
select 'oficiais não publicadas visíveis só para super_admin',
       (select qual from pg_policies where schemaname = 'public' and tablename = 'placement_bank_items'
          and policyname = 'placement_bank_items_select') like '%published%super_admin%'
union all
select 'oficiais (teacher_id NULL) só editáveis por super_admin',
       not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'placement_bank_items'
          and cmd in ('INSERT', 'UPDATE', 'DELETE')
          and (coalesce(qual, '') || coalesce(with_check, '')) not like '%teacher_id IS NULL%super_admin%')
union all
select 'anon sem nenhum privilégio no banco de questões',
       not exists (select 1 from information_schema.role_table_grants
          where grantee in ('anon', 'PUBLIC') and table_schema = 'public' and table_name = 'placement_bank_items')
union all
select 'anon sem EXECUTE nas funções novas; authenticated executa a importação',
       not exists (select 1 from information_schema.routine_privileges
          where grantee in ('anon', 'PUBLIC') and routine_schema = 'public'
            and routine_name in ('placement_import_bank_items', 'placement_bank_keep_identity'))
       and has_function_privilege('authenticated', 'public.placement_import_bank_items(uuid, uuid[])', 'execute')
union all
select 'importação é SECURITY INVOKER (RLS e triggers existentes continuam valendo)',
       (select not prosecdef from pg_proc where oid = to_regprocedure('public.placement_import_bank_items(uuid, uuid[])'))
union all
select 'mesmas regras de placement_items (tipo por habilidade, gabarito, alternativas, triagem)',
       (select count(*) from pg_constraint where conrelid = to_regclass('public.placement_bank_items') and contype = 'c'
           and conname in ('placement_bank_items_skill_type_check', 'placement_bank_items_answer_key_rule',
                           'placement_bank_items_options_rule', 'placement_bank_items_screening_rule',
                           'placement_bank_items_level_check')) = 5
union all
select 'trigger de dono imutável',
       exists (select 1 from pg_trigger where tgname = 'placement_bank_items_keep_identity'
          and tgrelid = to_regclass('public.placement_bank_items') and not tgisinternal)
union all
select 'placement_items.source_bank_item_id: opcional e sem FK',
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'placement_items'
          and column_name = 'source_bank_item_id' and is_nullable = 'YES' and data_type = 'uuid')
       and not exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
          where c.conrelid = to_regclass('public.placement_items') and c.contype = 'f' and a.attname = 'source_bank_item_id')
union all
select 'índice único: mesma origem uma vez por seção',
       exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'placement_items'
          and indexname = 'placement_items_section_bank_source_key' and indexdef like 'CREATE UNIQUE INDEX%(section_id, source_bank_item_id)%')
union all
select 'Etapa 1 intacta: 12 políticas e 6 triggers do Placement',
       (select count(*) from pg_policies where schemaname = 'public'
          and tablename in ('placement_templates', 'placement_sections', 'placement_items')) = 12
       and (select count(*) from pg_trigger t where not t.tgisinternal and t.tgrelid in (to_regclass('public.placement_templates'),
          to_regclass('public.placement_sections'), to_regclass('public.placement_items'))) = 6;

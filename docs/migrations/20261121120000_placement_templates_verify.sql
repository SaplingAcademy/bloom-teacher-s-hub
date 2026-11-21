-- Verificação SOMENTE LEITURA de 20261121120000_placement_templates_manual.sql
-- Todas as linhas devem retornar ok = true.
select 'tabelas existem (3)' as item,
       (select count(*) from unnest(array['public.placement_templates', 'public.placement_sections', 'public.placement_items']) t
         where to_regclass(t) is not null) = 3 as ok
union all
select 'RLS ativa nas 3 tabelas',
       (select count(*) from pg_class where oid in (to_regclass('public.placement_templates'),
          to_regclass('public.placement_sections'), to_regclass('public.placement_items')) and relrowsecurity) = 3
union all
select 'políticas select/insert/update/delete (12)',
       (select count(*) from pg_policies where schemaname = 'public'
          and tablename in ('placement_templates', 'placement_sections', 'placement_items')) = 12
union all
select 'políticas exigem acesso Pro (placement_access_allowed / template_readable / template_writable)',
       not exists (select 1 from pg_policies where schemaname = 'public'
          and tablename in ('placement_templates', 'placement_sections', 'placement_items')
          and (coalesce(qual, '') || coalesce(with_check, '')) not similar to '%(placement_access_allowed|placement_template_readable|placement_template_writable)%')
union all
select 'políticas só para authenticated',
       not exists (select 1 from pg_policies where schemaname = 'public'
          and tablename in ('placement_templates', 'placement_sections', 'placement_items')
          and roles <> '{authenticated}')
union all
select 'anon sem nenhum privilégio nas tabelas',
       not exists (select 1 from information_schema.role_table_grants
          where grantee = 'anon' and table_schema = 'public'
            and table_name in ('placement_templates', 'placement_sections', 'placement_items'))
union all
select 'anon sem EXECUTE nas funções do Placement',
       not exists (select 1 from information_schema.routine_privileges
          where grantee in ('anon', 'PUBLIC') and routine_schema = 'public' and routine_name like 'placement_%')
union all
select 'regra Pro reutiliza teacher_subscriptions e has_role',
       (select prosrc from pg_proc where oid = to_regprocedure('public.placement_access_allowed()')) like '%teacher_subscriptions%'
       and (select prosrc from pg_proc where oid = to_regprocedure('public.placement_access_allowed()')) like '%has_role%'
union all
select 'FK composta questão → seção (mesmo modelo e habilidade)', exists (
  select 1 from pg_constraint where conname = 'placement_items_section_fk'
     and conrelid = to_regclass('public.placement_items') and contype = 'f')
union all
select 'regras de tipo por habilidade e gabarito', (
  select count(*) from pg_constraint where conrelid = to_regclass('public.placement_items')
     and conname in ('placement_items_skill_type_check', 'placement_items_answer_key_rule',
                     'placement_items_options_rule', 'placement_items_screening_rule')) = 4
union all
select 'padrões não publicados visíveis só para super_admin (política e readable)',
       (select coalesce(qual, '') from pg_policies where schemaname = 'public' and tablename = 'placement_templates'
          and policyname = 'placement_templates_select') like '%published%'
       and (select prosrc from pg_proc where oid = to_regprocedure('public.placement_template_readable(uuid)')) like '%published%'
union all
select 'triggers de versões publicadas congeladas (3)', (
  select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname in ('placement_templates', 'placement_sections', 'placement_items')
     and t.tgname like 'placement_%_protect_published' and not t.tgisinternal) = 3
union all
select 'triggers de identidade (3)', (
  select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname in ('placement_templates', 'placement_sections', 'placement_items')
     and t.tgname like 'placement_%_keep_identity' and not t.tgisinternal) = 3;

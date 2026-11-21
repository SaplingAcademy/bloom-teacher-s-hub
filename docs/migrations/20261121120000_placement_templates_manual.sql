-- ============================================================================
-- Bloom Placement — Etapa 1: modelos, seções e questões — MANUAL
-- ----------------------------------------------------------------------------
-- Executar no SQL Editor do Supabase. Pré-requisitos já aplicados:
--   * public.profiles (id = auth.users.id do professor);
--   * 20261105040000_roles_plans_manual.sql — public.app_role, public.user_roles,
--     public.has_role(uuid, app_role) e public.teacher_subscriptions(plan 'free' | 'pro');
--   * 20261112180000_restrict_security_definer_execute_manual.sql — por isso cada
--     função SECURITY DEFINER abaixo recebe EXECUTE explícito, nunca herdado de PUBLIC.
--
-- O QUE FAZ
--   Cria a estrutura de conteúdo do nivelamento de inglês (sem aplicações,
--   respostas, resultados, RPCs públicas ou buckets — etapas seguintes):
--   * public.placement_templates — modelo de teste. teacher_id NULL = modelo padrão
--     do sistema (somente leitura para professores; mantido por super_admin).
--     Professores editam padrões apenas por cópia (source_template_id registra a origem).
--   * public.placement_sections — uma seção por habilidade do modelo:
--     grammar, vocabulary, reading, listening, speaking, writing.
--   * public.placement_items — questões com nível CEFR (A1–C2), metadados para o
--     motor adaptativo determinístico, gabarito (questões objetivas) e rubrica
--     (Speaking/Writing, correção exclusivamente manual).
--
-- AUTORIZAÇÃO (Placement é exclusivo do plano Pro)
--   Reutiliza o mecanismo existente — nenhuma coluna ou sistema de assinatura novo:
--   acesso = has_role(auth.uid(), 'super_admin') OU teacher_subscriptions.plan = 'pro'
--   (a mesma regra de can_access_academy), encapsulada em public.placement_access_allowed().
--   Toda leitura e escrita das três tabelas exige essa regra na RLS: esconder o menu
--   não basta. Um professor que volta ao Free perde o acesso, mas nada é apagado.
--
-- GABARITOS
--   anon não recebe nenhum privilégio nem política: as tabelas (incluindo answer_key
--   e rubric) são inacessíveis sem login. As futuras RPCs do aluno (link sem login)
--   deverão devolver uma projeção explícita SEM answer_key/rubric e corrigir no banco.
--
-- NÃO ALTERA tabelas, políticas, funções ou dados existentes.
-- ============================================================================
begin;

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'PRECHECK: public.profiles não existe.';
  end if;
  if to_regtype('public.app_role') is null
     or to_regprocedure('public.has_role(uuid, public.app_role)') is null then
    raise exception 'PRECHECK: aplique 20261105040000_roles_plans_manual.sql antes (app_role / has_role).';
  end if;
  if to_regclass('public.teacher_subscriptions') is null
     or (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'teacher_subscriptions'
            and column_name in ('teacher_id', 'plan')) <> 2 then
    raise exception 'PRECHECK: public.teacher_subscriptions(teacher_id, plan) não existe.';
  end if;
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                  where t.typname = 'app_role' and e.enumlabel = 'super_admin') then
    raise exception 'PRECHECK: app_role sem o valor super_admin.';
  end if;
  if to_regclass('public.placement_templates') is not null
     or to_regclass('public.placement_sections') is not null
     or to_regclass('public.placement_items') is not null then
    raise exception 'PRECHECK: tabelas placement_* já existem — revise antes de reaplicar.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Autorização
-- ----------------------------------------------------------------------------

-- Pro ou super_admin, pelo mecanismo existente (teacher_subscriptions + has_role).
create or replace function public.placement_access_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    public.has_role((select auth.uid()), 'super_admin'::public.app_role)
    or exists (
      select 1 from public.teacher_subscriptions s
       where s.teacher_id = (select auth.uid()) and s.plan = 'pro'
    )
  );
$$;

revoke all on function public.placement_access_allowed() from public, anon, authenticated;
grant execute on function public.placement_access_allowed() to authenticated;

-- ----------------------------------------------------------------------------
-- Tabelas
-- ----------------------------------------------------------------------------

create table public.placement_templates (
  id uuid primary key default gen_random_uuid(),
  -- Dono do modelo. NULL = modelo padrão do sistema (somente leitura para professores).
  teacher_id uuid default auth.uid() references public.profiles(id) on delete cascade,
  -- Modelo de origem quando criado por cópia (ex.: cópia editável de um padrão).
  source_template_id uuid references public.placement_templates(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'draft',
  -- Configuração do modelo e do motor adaptativo determinístico, por exemplo:
  -- {"screening": {"items": 8, "start_level": "B1"},
  --  "adaptive": {"promote_at": 0.8, "demote_below": 0.4,
  --               "min_items_per_level": 3, "max_items_per_skill": 12},
  --  "time_limit_minutes": null}
  -- O formato detalhado é validado pela etapa do motor; aqui só o tipo e o tamanho.
  settings jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint placement_templates_title_len check (char_length(btrim(title)) between 1 and 160),
  constraint placement_templates_description_len check (description is null or char_length(description) <= 2000),
  constraint placement_templates_status_check check (status in ('draft', 'published', 'archived')),
  constraint placement_templates_settings_object check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 32768),
  constraint placement_templates_version_check check (version >= 1),
  constraint placement_templates_not_own_source check (source_template_id is null or source_template_id <> id)
);

comment on table public.placement_templates is
  'Bloom Placement: modelos de teste de nivelamento. teacher_id NULL = padrão do sistema (somente leitura; editável por cópia). Exclusivo do plano Pro.';

create index placement_templates_teacher_idx on public.placement_templates (teacher_id, status);
create index placement_templates_system_idx on public.placement_templates (status) where teacher_id is null;
create index placement_templates_source_idx on public.placement_templates (source_template_id) where source_template_id is not null;

create table public.placement_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.placement_templates(id) on delete cascade,
  skill text not null,
  position smallint not null,
  -- Nome exibido opcional (padrão: nome da habilidade) e instruções ao aluno.
  title text,
  instructions text,
  -- Um modelo pode deixar uma habilidade de fora sem apagar suas questões.
  enabled boolean not null default true,
  -- Ajustes por habilidade (ex.: {"min_items": 4, "max_items": 12, "time_limit_seconds": 900}).
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint placement_sections_skill_check
    check (skill in ('grammar', 'vocabulary', 'reading', 'listening', 'speaking', 'writing')),
  constraint placement_sections_position_check check (position between 1 and 6),
  constraint placement_sections_title_len check (title is null or char_length(btrim(title)) between 1 and 120),
  constraint placement_sections_instructions_len check (instructions is null or char_length(instructions) <= 4000),
  constraint placement_sections_settings_object check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 16384),
  -- Uma seção por habilidade em cada modelo.
  constraint placement_sections_template_skill_key unique (template_id, skill),
  constraint placement_sections_template_position_key unique (template_id, position) deferrable initially deferred,
  -- Alvo da FK composta das questões (garante questão no mesmo modelo e habilidade da seção).
  constraint placement_sections_identity_key unique (id, template_id, skill)
);

comment on table public.placement_sections is
  'Bloom Placement: uma seção por habilidade (grammar, vocabulary, reading, listening, speaking, writing) de um modelo.';

create table public.placement_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.placement_templates(id) on delete cascade,
  section_id uuid not null,
  -- Cópia da habilidade da seção (garantida pela FK composta) para as regras abaixo.
  skill text not null,
  position integer not null,
  item_type text not null,
  -- Objetivas: correção automática. Speaking/Writing: exclusivamente manual.
  scoring_mode text generated always as (
    case when item_type in ('open_text', 'oral_response') then 'manual' else 'auto' end
  ) stored,
  -- Metadados pedagógicos do motor adaptativo determinístico.
  level text not null,
  level_rank smallint generated always as (
    case level when 'A1' then 1 when 'A2' then 2 when 'B1' then 3
               when 'B2' then 4 when 'C1' then 5 when 'C2' then 6 end
  ) stored,
  is_screening boolean not null default false,
  points numeric(6, 2) not null default 1,
  estimated_seconds integer,
  tags text[] not null default '{}'::text[],
  -- Conteúdo: enunciado/texto de apoio (prompt), alternativas (options), gabarito
  -- (answer_key, só objetivas), rubrica (rubric, só manuais), mídia privada (media,
  -- referências a arquivos do futuro bucket privado) e metadados livres.
  prompt jsonb not null,
  options jsonb,
  answer_key jsonb,
  rubric jsonb,
  media jsonb,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint placement_items_section_fk foreign key (section_id, template_id, skill)
    references public.placement_sections (id, template_id, skill) on delete cascade,
  constraint placement_items_skill_check
    check (skill in ('grammar', 'vocabulary', 'reading', 'listening', 'speaking', 'writing')),
  constraint placement_items_type_check
    check (item_type in ('single_choice', 'multiple_choice', 'true_false', 'gap_fill',
                         'matching', 'ordering', 'open_text', 'oral_response')),
  -- Speaking só tarefas orais; Writing só texto livre; demais habilidades só objetivas.
  constraint placement_items_skill_type_check check (
    (skill = 'speaking' and item_type = 'oral_response')
    or (skill = 'writing' and item_type = 'open_text')
    or (skill in ('grammar', 'vocabulary', 'reading', 'listening')
        and item_type in ('single_choice', 'multiple_choice', 'true_false', 'gap_fill', 'matching', 'ordering'))
  ),
  constraint placement_items_level_check check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  constraint placement_items_position_check check (position >= 1),
  constraint placement_items_points_check check (points > 0 and points <= 100),
  constraint placement_items_seconds_check check (estimated_seconds is null or estimated_seconds between 5 and 3600),
  constraint placement_items_tags_check check (cardinality(tags) <= 20),
  constraint placement_items_prompt_object check (jsonb_typeof(prompt) = 'object' and pg_column_size(prompt) <= 65536),
  constraint placement_items_options_array check (options is null or (jsonb_typeof(options) = 'array' and pg_column_size(options) <= 32768)),
  constraint placement_items_answer_key_object check (answer_key is null or (jsonb_typeof(answer_key) = 'object' and pg_column_size(answer_key) <= 16384)),
  constraint placement_items_rubric_object check (rubric is null or (jsonb_typeof(rubric) = 'object' and pg_column_size(rubric) <= 16384)),
  constraint placement_items_media_object check (media is null or (jsonb_typeof(media) = 'object' and pg_column_size(media) <= 4096)),
  constraint placement_items_metadata_object check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 16384),
  -- Objetivas exigem gabarito; manuais nunca têm gabarito (só rubrica opcional).
  constraint placement_items_answer_key_rule check (
    case when item_type in ('open_text', 'oral_response') then answer_key is null
         else answer_key is not null and rubric is null end
  ),
  -- Tipos com alternativas exigem ao menos duas.
  constraint placement_items_options_rule check (
    item_type not in ('single_choice', 'multiple_choice', 'matching', 'ordering')
    or (case when jsonb_typeof(options) = 'array' then jsonb_array_length(options) >= 2 else false end)
  ),
  -- Triagem inicial só com questões de correção automática.
  constraint placement_items_screening_rule check (not is_screening or item_type not in ('open_text', 'oral_response')),
  constraint placement_items_section_position_key unique (section_id, position) deferrable initially deferred
);

comment on table public.placement_items is
  'Bloom Placement: questões com nível CEFR e metadados do motor adaptativo. answer_key/rubric nunca expostos a anon; Speaking/Writing com correção exclusivamente manual.';
comment on column public.placement_items.answer_key is
  'Gabarito das questões objetivas. Nunca deve ser devolvido ao aluno: RPCs públicas devem projetar colunas sem answer_key/rubric.';

create index placement_items_template_idx on public.placement_items (template_id);
create index placement_items_engine_idx on public.placement_items (template_id, skill, level_rank) where active;
create index placement_items_screening_idx on public.placement_items (template_id, level_rank) where active and is_screening;

-- ----------------------------------------------------------------------------
-- Integridade: dono e vínculos imutáveis; updated_at
-- ----------------------------------------------------------------------------

create or replace function public.placement_keep_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'placement_templates' then
    if new.teacher_id is distinct from old.teacher_id then
      raise exception 'placement_templates.teacher_id não pode ser alterado' using errcode = '42501';
    end if;
  elsif tg_table_name = 'placement_sections' then
    if new.template_id is distinct from old.template_id or new.skill is distinct from old.skill then
      raise exception 'placement_sections.template_id/skill não podem ser alterados' using errcode = '42501';
    end if;
  elsif tg_table_name = 'placement_items' then
    if new.template_id is distinct from old.template_id or new.section_id is distinct from old.section_id
       or new.skill is distinct from old.skill then
      raise exception 'placement_items.template_id/section_id/skill não podem ser alterados' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.placement_keep_identity() from public, anon, authenticated;

create trigger placement_templates_keep_identity before update on public.placement_templates
  for each row execute function public.placement_keep_identity();
create trigger placement_sections_keep_identity before update on public.placement_sections
  for each row execute function public.placement_keep_identity();
create trigger placement_items_keep_identity before update on public.placement_items
  for each row execute function public.placement_keep_identity();

-- ----------------------------------------------------------------------------
-- Acesso aos modelos (usado pelas políticas de seções e questões)
-- ----------------------------------------------------------------------------

-- Ler: modelos próprios e padrões do sistema, com acesso Pro.
create or replace function public.placement_template_readable(p_template uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.placement_access_allowed() and exists (
    select 1 from public.placement_templates t
     where t.id = p_template
       and (t.teacher_id = (select auth.uid()) or t.teacher_id is null)
  );
$$;

-- Escrever: só modelos próprios (com Pro); padrões do sistema apenas por super_admin.
create or replace function public.placement_template_writable(p_template uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.placement_access_allowed() and exists (
    select 1 from public.placement_templates t
     where t.id = p_template
       and (t.teacher_id = (select auth.uid())
            or (t.teacher_id is null and public.has_role((select auth.uid()), 'super_admin'::public.app_role)))
  );
$$;

revoke all on function public.placement_template_readable(uuid) from public, anon, authenticated;
revoke all on function public.placement_template_writable(uuid) from public, anon, authenticated;
grant execute on function public.placement_template_readable(uuid) to authenticated;
grant execute on function public.placement_template_writable(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RLS e privilégios (anon: nada)
-- ----------------------------------------------------------------------------

alter table public.placement_templates enable row level security;
alter table public.placement_sections enable row level security;
alter table public.placement_items enable row level security;

revoke all on public.placement_templates from public, anon, authenticated;
revoke all on public.placement_sections from public, anon, authenticated;
revoke all on public.placement_items from public, anon, authenticated;
grant select, insert, update, delete on public.placement_templates to authenticated;
grant select, insert, update, delete on public.placement_sections to authenticated;
grant select, insert, update, delete on public.placement_items to authenticated;
grant all on public.placement_templates to service_role;
grant all on public.placement_sections to service_role;
grant all on public.placement_items to service_role;

-- Modelos
create policy placement_templates_select on public.placement_templates
  for select to authenticated
  using (public.placement_access_allowed() and (teacher_id = (select auth.uid()) or teacher_id is null));

create policy placement_templates_insert on public.placement_templates
  for insert to authenticated
  with check (
    public.placement_access_allowed() and (
      teacher_id = (select auth.uid())
      or (teacher_id is null and public.has_role((select auth.uid()), 'super_admin'::public.app_role))
    )
  );

create policy placement_templates_update on public.placement_templates
  for update to authenticated
  using (
    public.placement_access_allowed() and (
      teacher_id = (select auth.uid())
      or (teacher_id is null and public.has_role((select auth.uid()), 'super_admin'::public.app_role))
    )
  )
  with check (
    public.placement_access_allowed() and (
      teacher_id = (select auth.uid())
      or (teacher_id is null and public.has_role((select auth.uid()), 'super_admin'::public.app_role))
    )
  );

create policy placement_templates_delete on public.placement_templates
  for delete to authenticated
  using (
    public.placement_access_allowed() and (
      teacher_id = (select auth.uid())
      or (teacher_id is null and public.has_role((select auth.uid()), 'super_admin'::public.app_role))
    )
  );

-- Seções
create policy placement_sections_select on public.placement_sections
  for select to authenticated using (public.placement_template_readable(template_id));
create policy placement_sections_insert on public.placement_sections
  for insert to authenticated with check (public.placement_template_writable(template_id));
create policy placement_sections_update on public.placement_sections
  for update to authenticated
  using (public.placement_template_writable(template_id))
  with check (public.placement_template_writable(template_id));
create policy placement_sections_delete on public.placement_sections
  for delete to authenticated using (public.placement_template_writable(template_id));

-- Questões
create policy placement_items_select on public.placement_items
  for select to authenticated using (public.placement_template_readable(template_id));
create policy placement_items_insert on public.placement_items
  for insert to authenticated with check (public.placement_template_writable(template_id));
create policy placement_items_update on public.placement_items
  for update to authenticated
  using (public.placement_template_writable(template_id))
  with check (public.placement_template_writable(template_id));
create policy placement_items_delete on public.placement_items
  for delete to authenticated using (public.placement_template_writable(template_id));

commit;

-- ----------------------------------------------------------------------------
-- Rollback (somente se necessário; descomente). Remove apenas a estrutura do
-- Placement criada aqui; nenhuma tabela existente é afetada.
-- ----------------------------------------------------------------------------
-- begin;
-- drop table if exists public.placement_items;
-- drop table if exists public.placement_sections;
-- drop table if exists public.placement_templates;
-- drop function if exists public.placement_template_writable(uuid);
-- drop function if exists public.placement_template_readable(uuid);
-- drop function if exists public.placement_keep_identity();
-- drop function if exists public.placement_access_allowed();
-- commit;

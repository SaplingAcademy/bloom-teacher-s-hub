-- ============================================================================
-- Bloom Placement — Banco de Questões (biblioteca reutilizável) — MANUAL
-- ----------------------------------------------------------------------------
-- Executar no SQL Editor do Supabase, inteiro e de uma vez. Pré-requisitos já aplicados:
--   * 20261105040000_roles_plans_manual.sql (app_role, has_role, teacher_subscriptions);
--   * 20261121120000_placement_templates_manual.sql (placement_templates, placement_sections,
--     placement_items, placement_access_allowed, placement_template_writable, triggers de
--     versões publicadas).
--
-- O QUE FAZ
--   * public.placement_bank_items — questões reutilizáveis, separadas de placement_items:
--       - teacher_id NULL = Banco oficial da Bloom (mantido só por super_admin; professores
--         Pro veem apenas as questões PUBLICADAS e não editam nem excluem);
--       - teacher_id = professor = "Minhas Questões" (visíveis só para o dono).
--     Mesmos formatos de placement_items (prompt, options, answer_key, rubric, media,
--     metadata, tags, nível CEFR, tipos por habilidade) e as mesmas validações, mais
--     assunto (topic), subcompetência (subskill) e status de publicação.
--     source_bank_item_id registra a origem de uma cópia (ex.: questão oficial duplicada
--     para personalização); o original nunca é alterado.
--   * public.placement_items.source_bank_item_id — coluna NOVA e opcional (NULL nas questões
--     existentes e nas criadas manualmente) que registra de qual questão do banco a cópia
--     veio. Sem FK de propósito: excluir uma questão do banco nunca altera nivelamentos
--     (inclusive publicados, que são congelados). Índice único parcial impede importar a
--     mesma questão de origem duas vezes na mesma seção.
--   * public.placement_import_bank_items(section, ids[]) — inclusão em lote ATÔMICA
--     (uma única transação: ou entram todas, ou nenhuma). SECURITY INVOKER: roda com as
--     permissões do professor, portanto a RLS e os triggers existentes (modelo em rascunho,
--     dono do modelo, plano Pro) continuam valendo integralmente.
--
-- AUTORIZAÇÃO: o mesmo mecanismo da Etapa 1 (placement_access_allowed = super_admin ou
--   teacher_subscriptions.plan = 'pro'). anon não recebe privilégio nem política: gabaritos
--   (answer_key) e rubricas são inacessíveis sem login.
--
-- NÃO ALTERA dados existentes, políticas, funções ou permissões de outros módulos.
-- Em placement_items apenas ADICIONA uma coluna opcional e um índice (sem reescrever a
-- tabela e sem disparar triggers); nenhuma política, trigger ou função existente muda.
-- Nenhuma questão é inserida por esta migration.
-- ============================================================================
begin;

do $$
begin
  if to_regclass('public.placement_items') is null
     or to_regclass('public.placement_sections') is null
     or to_regclass('public.placement_templates') is null then
    raise exception 'PRECHECK: aplique 20261121120000_placement_templates_manual.sql antes.';
  end if;
  if to_regprocedure('public.placement_access_allowed()') is null
     or to_regprocedure('public.placement_template_writable(uuid)') is null
     or to_regprocedure('public.has_role(uuid, public.app_role)') is null then
    raise exception 'PRECHECK: funções placement_access_allowed / placement_template_writable / has_role ausentes.';
  end if;
  if to_regclass('public.placement_bank_items') is not null then
    raise exception 'PRECHECK: public.placement_bank_items já existe — revise antes de reaplicar.';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'placement_items'
                and column_name = 'source_bank_item_id') then
    raise exception 'PRECHECK: placement_items.source_bank_item_id já existe — revise antes de reaplicar.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Tabela do banco de questões
-- ----------------------------------------------------------------------------

create table public.placement_bank_items (
  id uuid primary key default gen_random_uuid(),
  -- Dono. NULL = Banco oficial da Bloom (somente super_admin escreve).
  teacher_id uuid default auth.uid() references public.profiles(id) on delete cascade,
  -- Origem quando a questão é uma cópia (ex.: oficial duplicada para personalização).
  source_bank_item_id uuid references public.placement_bank_items(id) on delete set null,
  skill text not null,
  -- Assunto (ex.: "Present simple", "Food") e subcompetência (ex.: "third person -s").
  topic text not null,
  subskill text,
  item_type text not null,
  scoring_mode text generated always as (
    case when item_type in ('open_text', 'oral_response') then 'manual' else 'auto' end
  ) stored,
  level text not null,
  level_rank smallint generated always as (
    case level when 'A1' then 1 when 'A2' then 2 when 'B1' then 3
               when 'B2' then 4 when 'C1' then 5 when 'C2' then 6 end
  ) stored,
  is_screening boolean not null default false,
  points numeric(6, 2) not null default 1,
  estimated_seconds integer,
  tags text[] not null default '{}'::text[],
  -- Mesmos formatos de placement_items.
  prompt jsonb not null,
  options jsonb,
  answer_key jsonb,
  rubric jsonb,
  media jsonb,
  metadata jsonb not null default '{}'::jsonb,
  -- Só questões 'published' podem ser incluídas em nivelamentos; oficiais não publicadas
  -- ficam visíveis apenas para super_admin.
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint placement_bank_items_skill_check
    check (skill in ('grammar', 'vocabulary', 'reading', 'listening', 'speaking', 'writing')),
  constraint placement_bank_items_type_check
    check (item_type in ('single_choice', 'multiple_choice', 'true_false', 'gap_fill',
                         'matching', 'ordering', 'open_text', 'oral_response')),
  constraint placement_bank_items_skill_type_check check (
    (skill = 'speaking' and item_type = 'oral_response')
    or (skill = 'writing' and item_type = 'open_text')
    or (skill in ('grammar', 'vocabulary', 'reading', 'listening')
        and item_type in ('single_choice', 'multiple_choice', 'true_false', 'gap_fill', 'matching', 'ordering'))
  ),
  constraint placement_bank_items_level_check check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  constraint placement_bank_items_topic_len check (char_length(btrim(topic)) between 1 and 80),
  constraint placement_bank_items_subskill_len check (subskill is null or char_length(btrim(subskill)) between 1 and 80),
  constraint placement_bank_items_status_check check (status in ('draft', 'published', 'archived')),
  constraint placement_bank_items_points_check check (points > 0 and points <= 100),
  constraint placement_bank_items_seconds_check check (estimated_seconds is null or estimated_seconds between 5 and 3600),
  constraint placement_bank_items_tags_check check (cardinality(tags) <= 20),
  constraint placement_bank_items_prompt_object check (jsonb_typeof(prompt) = 'object' and pg_column_size(prompt) <= 65536),
  constraint placement_bank_items_options_array check (options is null or (jsonb_typeof(options) = 'array' and pg_column_size(options) <= 32768)),
  constraint placement_bank_items_answer_key_object check (answer_key is null or (jsonb_typeof(answer_key) = 'object' and pg_column_size(answer_key) <= 16384)),
  constraint placement_bank_items_rubric_object check (rubric is null or (jsonb_typeof(rubric) = 'object' and pg_column_size(rubric) <= 16384)),
  constraint placement_bank_items_media_object check (media is null or (jsonb_typeof(media) = 'object' and pg_column_size(media) <= 4096)),
  -- 512 bytes abaixo do limite de placement_items: a importação acrescenta {"bank": {topic, subskill}}.
  constraint placement_bank_items_metadata_object check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 15872),
  constraint placement_bank_items_answer_key_rule check (
    case when item_type in ('open_text', 'oral_response') then answer_key is null
         else answer_key is not null and rubric is null end
  ),
  constraint placement_bank_items_options_rule check (
    item_type not in ('single_choice', 'multiple_choice', 'matching', 'ordering')
    or (case when jsonb_typeof(options) = 'array' then jsonb_array_length(options) >= 2 else false end)
  ),
  constraint placement_bank_items_screening_rule check (not is_screening or item_type not in ('open_text', 'oral_response')),
  constraint placement_bank_items_not_own_source check (source_bank_item_id is null or source_bank_item_id <> id)
);

comment on table public.placement_bank_items is
  'Bloom Placement: banco de questões reutilizáveis. teacher_id NULL = Banco oficial da Bloom (escrita só super_admin; professores veem só publicadas). Exclusivo do plano Pro; anon sem acesso.';
comment on column public.placement_bank_items.answer_key is
  'Gabarito das questões objetivas. Nunca deve ser devolvido ao aluno.';

create index placement_bank_items_teacher_idx on public.placement_bank_items (teacher_id, skill, level_rank);
create index placement_bank_items_official_idx on public.placement_bank_items (skill, level_rank)
  where teacher_id is null and status = 'published';
create index placement_bank_items_topic_idx on public.placement_bank_items (skill, topic);
create index placement_bank_items_source_idx on public.placement_bank_items (source_bank_item_id)
  where source_bank_item_id is not null;

-- Dono imutável; updated_at.
create or replace function public.placement_bank_keep_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.teacher_id is distinct from old.teacher_id then
    raise exception 'placement_bank_items.teacher_id não pode ser alterado' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.placement_bank_keep_identity() from public, anon, authenticated;

create trigger placement_bank_items_keep_identity before update on public.placement_bank_items
  for each row execute function public.placement_bank_keep_identity();

-- ----------------------------------------------------------------------------
-- RLS e privilégios (anon: nada)
-- ----------------------------------------------------------------------------

alter table public.placement_bank_items enable row level security;

revoke all on public.placement_bank_items from public, anon, authenticated;
grant select, insert, update, delete on public.placement_bank_items to authenticated;
grant all on public.placement_bank_items to service_role;

-- Ler: as próprias (qualquer status) e as oficiais publicadas; super_admin vê todas as oficiais.
create policy placement_bank_items_select on public.placement_bank_items
  for select to authenticated
  using (
    public.placement_access_allowed() and (
      teacher_id = (select auth.uid())
      or (teacher_id is null
          and (status = 'published'
               or public.has_role((select auth.uid()), 'super_admin'::public.app_role)))
    )
  );

-- Escrever: só as próprias; oficiais apenas por super_admin.
create policy placement_bank_items_insert on public.placement_bank_items
  for insert to authenticated
  with check (
    public.placement_access_allowed() and (
      teacher_id = (select auth.uid())
      or (teacher_id is null and public.has_role((select auth.uid()), 'super_admin'::public.app_role))
    )
  );

create policy placement_bank_items_update on public.placement_bank_items
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

create policy placement_bank_items_delete on public.placement_bank_items
  for delete to authenticated
  using (
    public.placement_access_allowed() and (
      teacher_id = (select auth.uid())
      or (teacher_id is null and public.has_role((select auth.uid()), 'super_admin'::public.app_role))
    )
  );

-- ----------------------------------------------------------------------------
-- Rastreabilidade em placement_items (coluna nova, opcional, sem FK)
-- ----------------------------------------------------------------------------

alter table public.placement_items add column source_bank_item_id uuid;

comment on column public.placement_items.source_bank_item_id is
  'Questão do banco (placement_bank_items) de onde esta cópia independente veio. Sem FK: excluir a origem não altera nivelamentos.';

-- Mesma questão de origem no máximo uma vez por seção.
create unique index placement_items_section_bank_source_key
  on public.placement_items (section_id, source_bank_item_id)
  where source_bank_item_id is not null;

-- ----------------------------------------------------------------------------
-- Inclusão em lote (atômica)
-- ----------------------------------------------------------------------------
-- Copia as questões do banco escolhidas para o FIM da seção, na ordem recebida, como
-- questões independentes (o banco não é alterado). Questões cuja origem já está na seção
-- são ignoradas e devolvidas em skipped_ids. Qualquer outra falha (sem Pro, seção de outro
-- professor, modelo publicado/arquivado, questão invisível/não publicada, habilidade
-- diferente da seção) cancela a chamada inteira, sem importação parcial.
-- Retorno: {"inserted": n, "item_ids": [...], "skipped_ids": [...]}
create or replace function public.placement_import_bank_items(p_section_id uuid, p_bank_item_ids uuid[])
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_template uuid;
  v_skill text;
  v_status text;
  v_ids uuid[];
  v_bad uuid;
  v_skipped uuid[];
  v_inserted uuid[];
  v_next integer;
begin
  if (select auth.uid()) is null or not public.placement_access_allowed() then
    raise exception 'PLACEMENT_ACCESS_DENIED: Bloom Placement é exclusivo do plano Pro.' using errcode = '42501';
  end if;
  if p_section_id is null or p_bank_item_ids is null or cardinality(p_bank_item_ids) = 0 then
    raise exception 'PLACEMENT_BANK_INVALID: selecione pelo menos uma questão.' using errcode = '22023';
  end if;
  if cardinality(p_bank_item_ids) > 100 then
    raise exception 'PLACEMENT_BANK_INVALID: no máximo 100 questões por vez.' using errcode = '22023';
  end if;
  if array_position(p_bank_item_ids, null) is not null then
    raise exception 'PLACEMENT_BANK_INVALID: identificador de questão vazio.' using errcode = '22023';
  end if;

  -- Seção: precisa ser visível e editável pelo professor (RLS). FOR UPDATE serializa
  -- importações simultâneas na mesma seção (posições sequenciais sem colisão).
  select s.template_id, s.skill into v_template, v_skill
    from public.placement_sections s
   where s.id = p_section_id
     for update;
  if not found or not public.placement_template_writable(v_template) then
    raise exception 'PLACEMENT_SECTION_NOT_FOUND: seção inexistente ou sem permissão.' using errcode = '42501';
  end if;

  -- Modelo em rascunho; FOR SHARE impede a publicação concorrente até o fim da importação.
  select t.status into v_status from public.placement_templates t where t.id = v_template for share;
  if v_status is distinct from 'draft' then
    raise exception 'PLACEMENT_TEMPLATE_LOCKED: seções e questões de modelo publicado ou arquivado não podem ser alteradas; crie uma nova versão por cópia.' using errcode = 'P0001';
  end if;

  -- Ids sem repetição, na ordem da primeira ocorrência.
  select array_agg(d.id order by d.ord) into v_ids
    from (select u.id, min(u.ord) as ord
            from unnest(p_bank_item_ids) with ordinality as u(id, ord)
           group by u.id) d;

  -- Toda questão precisa estar visível ao professor (RLS: próprias ou oficiais) e publicada.
  select u.id into v_bad
    from unnest(v_ids) as u(id)
   where not exists (select 1 from public.placement_bank_items b where b.id = u.id and b.status = 'published')
   limit 1;
  if v_bad is not null then
    raise exception 'PLACEMENT_BANK_ITEM_UNAVAILABLE: questão % indisponível.', v_bad using errcode = 'P0001';
  end if;

  -- Só questões da habilidade da seção.
  select b.id into v_bad
    from public.placement_bank_items b
   where b.id = any(v_ids) and b.skill <> v_skill
   limit 1;
  if v_bad is not null then
    raise exception 'PLACEMENT_BANK_SKILL_MISMATCH: a questão % é de outra habilidade.', v_bad using errcode = 'P0001';
  end if;

  -- Já importadas nesta seção: ignoradas (sem duplicar).
  select coalesce(array_agg(u.id order by u.ord), '{}'::uuid[]) into v_skipped
    from unnest(v_ids) with ordinality as u(id, ord)
   where exists (select 1 from public.placement_items i
                  where i.section_id = p_section_id and i.source_bank_item_id = u.id);

  select coalesce(max(i.position), 0) into v_next
    from public.placement_items i where i.section_id = p_section_id;

  with src as (
    select b.*, u.ord
      from unnest(v_ids) with ordinality as u(id, ord)
      join public.placement_bank_items b on b.id = u.id
     where not (u.id = any(v_skipped))
  ), ins as (
    insert into public.placement_items (
      template_id, section_id, skill, position, item_type, level, is_screening, points,
      estimated_seconds, tags, prompt, options, answer_key, rubric, media, metadata, active,
      source_bank_item_id)
    select v_template, p_section_id, src.skill, v_next + row_number() over (order by src.ord)::integer,
           src.item_type, src.level, src.is_screening, src.points, src.estimated_seconds, src.tags,
           src.prompt, src.options, src.answer_key, src.rubric, src.media,
           src.metadata || jsonb_build_object('bank', jsonb_strip_nulls(jsonb_build_object('topic', src.topic, 'subskill', src.subskill))),
           true, src.id
      from src
    returning id
  )
  select coalesce(array_agg(ins.id), '{}'::uuid[]) into v_inserted from ins;

  return jsonb_build_object('inserted', cardinality(v_inserted), 'item_ids', to_jsonb(v_inserted),
                            'skipped_ids', to_jsonb(v_skipped));
end;
$$;

revoke all on function public.placement_import_bank_items(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.placement_import_bank_items(uuid, uuid[]) to authenticated;

commit;

-- ----------------------------------------------------------------------------
-- Rollback (somente se necessário; descomente). Remove apenas o que foi criado aqui.
-- ----------------------------------------------------------------------------
-- begin;
-- drop function if exists public.placement_import_bank_items(uuid, uuid[]);
-- drop index if exists public.placement_items_section_bank_source_key;
-- alter table public.placement_items drop column if exists source_bank_item_id;
-- drop table if exists public.placement_bank_items;
-- drop function if exists public.placement_bank_keep_identity();
-- commit;

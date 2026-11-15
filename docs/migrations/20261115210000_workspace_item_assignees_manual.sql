-- =====================================================================================
-- Bloom · Workspace colaborativo · Responsáveis pelas tarefas · aplicação MANUAL
--
-- Pré-requisitos: Etapas 1 e 2 aplicadas. Nenhuma política, função ou trigger dessas etapas
-- é alterada.
--
-- * workspace_project_items.created_by: criador do item (auth.uid() no INSERT, imutável).
--   Itens antigos ficam NULL. user_id continua sendo o DONO do projeto (FKs compostas).
-- * public.workspace_item_assignees: responsáveis por tarefa (type = 'task'), sem duplicados.
--   Elegíveis: dono do projeto ou participantes com status 'accepted' (validado no banco).
-- * Toda tarefa nova recebe o criador como responsável inicial (trigger). A RPC
--   create_project_task cria a tarefa e grava os responsáveis escolhidos NA MESMA TRANSAÇÃO
--   (substitui o criador, acrescenta outros ou remove todos).
-- * set_project_item_assignees substitui o conjunto atomicamente, validando TODOS os
--   selecionados (inclusive os já atribuídos). Dono e participantes aceitos alteram;
--   projetos arquivados não permitem alterações.
-- * Concorrência: lock do projeto (mesma chave das RPCs da Etapa 1) → releitura do item
--   (FOR UPDATE) → projeto (FOR SHARE, impede arquivar no meio) → validações → escrita.
--   leave_project/remove_project_member usam o mesmo lock, então nunca se intercalam.
-- * Participante que sai/é removido (ou deixa de ser 'accepted') perde só as próprias
--   atribuições naquele projeto; a tarefa e os demais responsáveis permanecem.
-- * Escrita direta na tabela é negada ao cliente (só leitura por RLS + RPCs).
-- =====================================================================================
begin;

-- 0. Pré-checagens: abortam sem alterar nada se o ambiente não for o esperado.
do $$
begin
  if to_regclass('public.workspace_project_items') is null or to_regclass('public.workspace_project_members') is null
     or to_regclass('public.workspace_projects') is null or to_regclass('public.profiles') is null
     or to_regprocedure('public.workspace_project_accessible(uuid)') is null
     or to_regprocedure('public.workspace_project_writable(uuid)') is null
     or to_regprocedure('public.leave_project(uuid)') is null then
    raise exception 'Etapas 1/2 ausentes (itens, participantes ou funções de acesso)';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'workspace_project_items_guard' and not tgisinternal) then
    raise exception 'Etapa 2 ausente (trigger workspace_project_items_guard)';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'workspace_project_items'
        and column_name in ('id', 'project_id', 'phase_id', 'user_id', 'type', 'title', 'content', 'completed', 'order_index', 'meta')) <> 10 then
    raise exception 'workspace_project_items: colunas esperadas ausentes';
  end if;
  if to_regclass('public.workspace_item_assignees') is not null then
    raise exception 'workspace_item_assignees já existe (migração já aplicada?)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'workspace_project_items' and column_name = 'created_by') then
    raise exception 'workspace_project_items.created_by já existe';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
             and p.proname in ('set_project_item_assignees', 'create_project_task', 'workspace_item_assignees_guard',
                               'workspace_item_assignees_member_cleanup', 'workspace_item_assignees_type_cleanup',
                               'workspace_item_assignees_creator_default', 'workspace_project_items_creator',
                               'workspace_item_assignee_eligible', 'workspace_item_assignees_replace')) then
    raise exception 'Funções de responsáveis já existem';
  end if;
end $$;

-- 1. Criador do item (informativo; itens antigos ficam NULL = não registrado)
alter table public.workspace_project_items
  add column created_by uuid null references public.profiles(id) on delete set null;
comment on column public.workspace_project_items.created_by is
  'Professor que criou o item (auth.uid() no INSERT, imutável). user_id continua sendo o dono do projeto.';

create or replace function public.workspace_project_items_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());          -- nunca o valor enviado pelo cliente
  elsif new.created_by is distinct from old.created_by then
    raise exception 'workspace_item_creator_immutable';
  end if;
  return new;
end $$;

create trigger workspace_project_items_creator
  before insert or update of created_by on public.workspace_project_items
  for each row execute function public.workspace_project_items_creator();

-- 2. Responsáveis
create table public.workspace_item_assignees (
  item_id     uuid not null references public.workspace_project_items(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid null references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (item_id, user_id)
);
comment on table public.workspace_item_assignees is
  'Responsáveis por tarefas do Workspace (dono ou participantes aceitos). Escrita só pelas RPCs; leitura por RLS.';
create index workspace_item_assignees_user_idx on public.workspace_item_assignees (user_id);

alter table public.workspace_item_assignees enable row level security;
revoke all on table public.workspace_item_assignees from public, anon, authenticated;
grant select on table public.workspace_item_assignees to authenticated;

-- Leitura: quem acessa o projeto do item (dono ou participante aceito). Sem políticas de escrita.
create policy workspace_item_assignees_select on public.workspace_item_assignees
  for select to authenticated
  using (exists (select 1 from public.workspace_project_items i
                 where i.id = item_id and public.workspace_project_accessible(i.project_id)));

-- Elegível = dono do projeto ou participante 'accepted' (uso interno).
create or replace function public.workspace_item_assignee_eligible(p_project uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.workspace_projects p where p.id = p_project and p.user_id = p_user)
      or exists (select 1 from public.workspace_project_members m
                  where m.project_id = p_project and m.user_id = p_user and m.status = 'accepted');
$$;

-- Defesa em profundidade para qualquer escrita (inclusive futura): só tarefas, só elegíveis.
create or replace function public.workspace_item_assignees_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project uuid;
  v_type text;
begin
  select i.project_id, i.type into v_project, v_type from public.workspace_project_items i where i.id = new.item_id;
  if v_project is null then raise exception 'item_not_found'; end if;
  if v_type <> 'task' then raise exception 'assignee_task_only'; end if;
  if not public.workspace_item_assignee_eligible(v_project, new.user_id) then raise exception 'assignee_not_eligible'; end if;
  return new;
end $$;

create trigger workspace_item_assignees_guard
  before insert or update on public.workspace_item_assignees
  for each row execute function public.workspace_item_assignees_guard();

-- 3. Criador como responsável inicial de toda tarefa nova (projeto editável e criador elegível).
--    Quem cria pela RPC create_project_task pode, na mesma transação, trocar, acrescentar ou
--    remover. Sem sessão (SQL Editor) created_by é NULL e nada é atribuído.
create or replace function public.workspace_item_assignees_creator_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'task' and new.created_by is not null
     and public.workspace_item_assignee_eligible(new.project_id, new.created_by) then
    insert into public.workspace_item_assignees (item_id, user_id, assigned_by)
    values (new.id, new.created_by, new.created_by)
    on conflict (item_id, user_id) do nothing;
  end if;
  return null;
end $$;

create trigger workspace_item_assignees_creator_default
  after insert on public.workspace_project_items
  for each row execute function public.workspace_item_assignees_creator_default();

-- 4. Saída/remoção do projeto: retira só as atribuições desse professor naquele projeto.
create or replace function public.workspace_item_assignees_member_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'accepted' and (tg_op = 'DELETE' or new.status is distinct from 'accepted') then
    delete from public.workspace_item_assignees a
     using public.workspace_project_items i
     where a.item_id = i.id and i.project_id = old.project_id and a.user_id = old.user_id;
  end if;
  return null;
end $$;

create trigger workspace_item_assignees_member_cleanup
  after delete or update of status on public.workspace_project_members
  for each row execute function public.workspace_item_assignees_member_cleanup();

-- Tarefa convertida em outro tipo (ex.: link) deixa de ter responsáveis.
create or replace function public.workspace_item_assignees_type_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type is distinct from old.type and new.type <> 'task' then
    delete from public.workspace_item_assignees a where a.item_id = new.id;
  end if;
  return null;
end $$;

create trigger workspace_item_assignees_type_cleanup
  after update of type on public.workspace_project_items
  for each row execute function public.workspace_item_assignees_type_cleanup();

-- 5. Substituição do conjunto (núcleo comum; uso interno, chamado já com os locks obtidos).
--    Valida TODOS os selecionados antes de escrever; duplicados e NULL são descartados.
create or replace function public.workspace_item_assignees_replace(p_item uuid, p_project uuid, p_assignees uuid[], p_me uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_bad uuid;
begin
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_assignees, '{}')) as x where x is not null;
  if cardinality(v_ids) > 51 then raise exception 'assignee_limit'; end if;
  select x into v_bad from unnest(v_ids) as x where not public.workspace_item_assignee_eligible(p_project, x) limit 1;
  if v_bad is not null then raise exception 'assignee_not_eligible'; end if;
  delete from public.workspace_item_assignees a where a.item_id = p_item and a.user_id <> all (v_ids);
  insert into public.workspace_item_assignees (item_id, user_id, assigned_by)
  select p_item, x, p_me from unnest(v_ids) as x
  on conflict (item_id, user_id) do nothing;
end $$;

-- 6. RPC: define os responsáveis de uma tarefa existente.
create or replace function public.set_project_item_assignees(p_item uuid, p_assignees uuid[])
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_project uuid;
  v_type text;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  -- Leitura inicial só para descobrir o projeto (project_id é imutável pela Etapa 2).
  select i.project_id into v_project from public.workspace_project_items i where i.id = p_item;
  if v_project is null then raise exception 'item_not_found'; end if;
  -- Ordem de locks igual às RPCs da Etapa 1: projeto → linha.
  perform pg_advisory_xact_lock(hashtextextended('workspace_project_members:project:' || v_project::text, 0));
  select i.type into v_type from public.workspace_project_items i where i.id = p_item and i.project_id = v_project for update;
  if v_type is null then raise exception 'item_not_found'; end if;
  perform 1 from public.workspace_projects p where p.id = v_project for share;   -- impede arquivar no meio
  if not public.workspace_project_writable(v_project) then raise exception 'item_not_found'; end if;
  if v_type <> 'task' then raise exception 'assignee_task_only'; end if;

  perform public.workspace_item_assignees_replace(p_item, v_project, p_assignees, v_me);
  return query select a.user_id from public.workspace_item_assignees a where a.item_id = p_item order by a.created_at, a.user_id;
end $$;

-- 7. RPC: cria uma tarefa e seus responsáveis na mesma transação (sem falha parcial).
--    p_assignees NULL = só o criador (padrão); array (inclusive vazio) = exatamente esses.
--    Repetição com o mesmo p_id (rede instável) devolve o estado salvo sem duplicar.
create or replace function public.create_project_task(p_id uuid, p_project uuid, p_phase uuid, p_title text,
  p_content text, p_order_index integer, p_assignees uuid[] default null)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_owner uuid;
  v_existing record;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_id is null or p_project is null then raise exception 'item_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace_project_members:project:' || p_project::text, 0));
  select p.user_id into v_owner from public.workspace_projects p where p.id = p_project for share;
  if v_owner is null or not public.workspace_project_writable(p_project) then raise exception 'project_not_found'; end if;

  select i.project_id, i.type, i.created_by into v_existing from public.workspace_project_items i where i.id = p_id;
  if found then
    if v_existing.project_id = p_project and v_existing.type = 'task' and v_existing.created_by = v_me then
      return query select a.user_id from public.workspace_item_assignees a where a.item_id = p_id order by a.created_at, a.user_id;
      return;
    end if;
    raise exception 'item_conflict';
  end if;

  -- Os triggers da Etapa 2 e desta migração definem user_id (dono), created_by (v_me),
  -- validam a fase do mesmo projeto e atribuem o criador.
  insert into public.workspace_project_items (id, project_id, phase_id, user_id, type, title, content, completed, order_index, meta)
  values (p_id, p_project, p_phase, v_owner, 'task', btrim(coalesce(p_title, '')), coalesce(p_content, ''), false,
          coalesce(p_order_index, 0), '{}'::jsonb);

  if p_assignees is not null then
    perform public.workspace_item_assignees_replace(p_id, p_project, p_assignees, v_me);
  end if;
  return query select a.user_id from public.workspace_item_assignees a where a.item_id = p_id order by a.created_at, a.user_id;
end $$;

-- 8. Permissões: só as duas RPCs são executáveis pelo cliente.
revoke all on function public.workspace_project_items_creator()                         from public, anon, authenticated;
revoke all on function public.workspace_item_assignee_eligible(uuid, uuid)              from public, anon, authenticated;
revoke all on function public.workspace_item_assignees_guard()                          from public, anon, authenticated;
revoke all on function public.workspace_item_assignees_creator_default()                from public, anon, authenticated;
revoke all on function public.workspace_item_assignees_member_cleanup()                 from public, anon, authenticated;
revoke all on function public.workspace_item_assignees_type_cleanup()                   from public, anon, authenticated;
revoke all on function public.workspace_item_assignees_replace(uuid, uuid, uuid[], uuid) from public, anon, authenticated;
revoke all on function public.set_project_item_assignees(uuid, uuid[])                  from public, anon, authenticated;
revoke all on function public.create_project_task(uuid, uuid, uuid, text, text, integer, uuid[]) from public, anon, authenticated;
grant execute on function public.set_project_item_assignees(uuid, uuid[])                to authenticated;
grant execute on function public.create_project_task(uuid, uuid, uuid, text, text, integer, uuid[]) to authenticated;

commit;

-- =====================================================================================
-- VERIFICAÇÃO PÓS-MIGRAÇÃO: arquivo separado 20261115210000_workspace_item_assignees_verify.sql
--
-- ROLLBACK (manual, somente se necessário; apaga as atribuições e a coluna created_by):
-- begin;
--   drop function if exists public.create_project_task(uuid, uuid, uuid, text, text, integer, uuid[]);
--   drop function if exists public.set_project_item_assignees(uuid, uuid[]);
--   drop function if exists public.workspace_item_assignees_replace(uuid, uuid, uuid[], uuid);
--   drop trigger if exists workspace_item_assignees_type_cleanup on public.workspace_project_items;
--   drop function if exists public.workspace_item_assignees_type_cleanup();
--   drop trigger if exists workspace_item_assignees_member_cleanup on public.workspace_project_members;
--   drop function if exists public.workspace_item_assignees_member_cleanup();
--   drop trigger if exists workspace_item_assignees_creator_default on public.workspace_project_items;
--   drop function if exists public.workspace_item_assignees_creator_default();
--   drop table if exists public.workspace_item_assignees;   -- remove também o trigger guard e a política
--   drop function if exists public.workspace_item_assignees_guard();
--   drop function if exists public.workspace_item_assignee_eligible(uuid, uuid);
--   drop trigger if exists workspace_project_items_creator on public.workspace_project_items;
--   drop function if exists public.workspace_project_items_creator();
--   alter table public.workspace_project_items drop column if exists created_by;
-- commit;
-- =====================================================================================

-- ============================================================================
-- Bloom — Conexões entre post-its (Meu Mural e murais de Projetos) — MANUAL
-- ----------------------------------------------------------------------------
-- Executar no SQL Editor do Supabase. Pré-requisitos já aplicados:
--   * public.workspace_notes com id, user_id e project_id (mural pessoal =
--     project_id IS NULL; mural do projeto = project_id do projeto) e o trigger
--     workspace_notes_keep_identity (project_id/user_id imutáveis);
--   * 20261115180000_workspace_collab_access_manual.sql
--     (workspace_project_accessible / workspace_project_writable).
--
-- O QUE FAZ
--   Cria public.workspace_note_connections: uma seta entre duas notas do MESMO
--   mural, guardada só pelos IDs das notas (nunca por coordenadas).
--   * Cada mural tem as próprias conexões: o trigger exige que as duas notas
--     sejam do mesmo mural (mesmo projeto; ou, no pessoal, do mesmo professor)
--     e copia o project_id das notas — o cliente não escolhe o mural.
--   * Meu Mural: só o dono das notas cria/lê/remove (regra das notas pessoais).
--   * Projetos: as mesmas regras do mural do projeto — dono e participantes
--     aceitos veem; criam e removem enquanto o projeto está ativo (arquivado =
--     somente leitura). Conexões são do mural, compartilhadas por todos.
--   * Excluir uma nota (ou o projeto) remove as conexões dela (ON DELETE CASCADE).
--   * Uma conexão por par de notas (A→B e B→A = mesmo par); nunca a nota com
--     ela mesma. Não há UPDATE: mudar = remover e criar outra.
-- NÃO ALTERA workspace_notes, suas políticas, posições ou dados existentes.
-- ============================================================================
begin;

do $$
begin
  if to_regclass('public.workspace_notes') is null or to_regclass('public.workspace_projects') is null then
    raise exception 'PRECHECK: public.workspace_notes ou public.workspace_projects não existe.';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'workspace_notes'
         and column_name in ('id', 'user_id', 'project_id')) <> 3 then
    raise exception 'PRECHECK: workspace_notes sem as colunas id, user_id e project_id.';
  end if;
  if to_regprocedure('public.workspace_project_accessible(uuid)') is null
     or to_regprocedure('public.workspace_project_writable(uuid)') is null then
    raise exception 'PRECHECK: aplique 20261115180000_workspace_collab_access_manual.sql antes (funções de acesso a projetos).';
  end if;
end $$;

create table if not exists public.workspace_note_connections (
  id uuid primary key default gen_random_uuid(),
  -- Quem criou a conexão (no pessoal, o dono do mural).
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- Mural da conexão: NULL = Meu Mural; definido pelo trigger a partir das notas.
  project_id uuid references public.workspace_projects(id) on delete cascade,
  from_note_id uuid not null references public.workspace_notes(id) on delete cascade,
  to_note_id uuid not null references public.workspace_notes(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint workspace_note_connections_not_self check (from_note_id <> to_note_id)
);

comment on table public.workspace_note_connections is
  'Setas entre post-its de um mesmo mural (pessoal ou de projeto), por IDs das notas. Removidas com a nota (cascade).';

-- Um único vínculo por par, em qualquer direção.
create unique index if not exists workspace_note_connections_pair_key
  on public.workspace_note_connections (least(from_note_id, to_note_id), greatest(from_note_id, to_note_id));
create index if not exists workspace_note_connections_user_idx on public.workspace_note_connections (user_id);
create index if not exists workspace_note_connections_project_idx on public.workspace_note_connections (project_id);
create index if not exists workspace_note_connections_from_idx on public.workspace_note_connections (from_note_id);
create index if not exists workspace_note_connections_to_idx on public.workspace_note_connections (to_note_id);

-- Mesmo mural: as duas notas existem, têm o mesmo project_id e, no mural pessoal,
-- o mesmo autor. O project_id da conexão vem das notas (nunca do cliente).
create or replace function public.workspace_note_connections_same_board()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.workspace_notes%rowtype;
  v_to public.workspace_notes%rowtype;
begin
  select * into v_from from public.workspace_notes where id = new.from_note_id;
  select * into v_to from public.workspace_notes where id = new.to_note_id;
  -- Mesma mensagem para nota inexistente e murais diferentes (não revela notas de outros murais).
  if v_from.id is null or v_to.id is null
     or v_from.project_id is distinct from v_to.project_id
     or (v_from.project_id is null and v_from.user_id <> v_to.user_id) then
    raise exception 'INVALID_CONNECTION: as notas precisam existir e ser do mesmo mural.' using errcode = 'P0001';
  end if;
  new.project_id := v_from.project_id;
  return new;
end;
$$;

revoke all on function public.workspace_note_connections_same_board() from public, anon, authenticated;

drop trigger if exists workspace_note_connections_same_board on public.workspace_note_connections;
create trigger workspace_note_connections_same_board
  before insert on public.workspace_note_connections
  for each row execute function public.workspace_note_connections_same_board();

-- Nota do mural pessoal do usuário atual (mesma regra de edição das notas pessoais).
create or replace function public.workspace_personal_note_owned(p_note uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_notes n
     where n.id = p_note and n.project_id is null and n.user_id = (select auth.uid())
  );
$$;

revoke all on function public.workspace_personal_note_owned(uuid) from public, anon, authenticated;
grant execute on function public.workspace_personal_note_owned(uuid) to authenticated;

alter table public.workspace_note_connections enable row level security;

revoke all on public.workspace_note_connections from public, anon, authenticated;
grant select, insert, delete on public.workspace_note_connections to authenticated;
grant all on public.workspace_note_connections to service_role;

-- As políticas são avaliadas depois do trigger, com o project_id já vindo das notas.
drop policy if exists workspace_note_connections_select on public.workspace_note_connections;
create policy workspace_note_connections_select on public.workspace_note_connections
  for select to authenticated
  using (
    (project_id is null and user_id = (select auth.uid()))
    or (project_id is not null and public.workspace_project_accessible(project_id))
  );

drop policy if exists workspace_note_connections_insert on public.workspace_note_connections;
create policy workspace_note_connections_insert on public.workspace_note_connections
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      (project_id is null
        and public.workspace_personal_note_owned(from_note_id)
        and public.workspace_personal_note_owned(to_note_id))
      or (project_id is not null and public.workspace_project_writable(project_id))
    )
  );

drop policy if exists workspace_note_connections_delete on public.workspace_note_connections;
create policy workspace_note_connections_delete on public.workspace_note_connections
  for delete to authenticated
  using (
    (project_id is null and user_id = (select auth.uid()))
    or (project_id is not null and public.workspace_project_writable(project_id))
  );

commit;

-- ----------------------------------------------------------------------------
-- Rollback (somente se necessário; descomente). Remove apenas as conexões;
-- nenhuma nota é afetada.
-- ----------------------------------------------------------------------------
-- begin;
-- drop table if exists public.workspace_note_connections;
-- drop function if exists public.workspace_note_connections_same_board();
-- drop function if exists public.workspace_personal_note_owned(uuid);
-- commit;

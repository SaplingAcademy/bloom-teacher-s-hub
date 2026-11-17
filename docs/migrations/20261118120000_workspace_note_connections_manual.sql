-- ============================================================================
-- Bloom — Conexões entre post-its do Meu Mural — APLICAÇÃO MANUAL
-- ----------------------------------------------------------------------------
-- Executar no SQL Editor do Supabase. Pré-requisito: public.workspace_notes com
-- id, user_id e project_id (mural pessoal = project_id IS NULL).
--
-- O QUE FAZ
--   Cria public.workspace_note_connections: uma seta entre duas notas, guardada
--   SÓ pelos IDs das notas (nunca por coordenadas). As setas acompanham as notas
--   porque a posição é sempre lida das próprias notas.
--   * Escopo: Meu Mural (notas pessoais). As duas notas precisam ser do próprio
--     professor e do mural pessoal — a mesma regra de edição das notas pessoais.
--     Murais de projetos não são afetados.
--   * Excluir uma nota remove as conexões dela (FK ON DELETE CASCADE).
--   * Uma conexão por par de notas (A→B e B→A contam como o mesmo par); nunca
--     uma nota com ela mesma.
--   * O professor cria, lê e remove só as próprias conexões (RLS); não há
--     UPDATE: mudar uma conexão = remover e criar outra.
-- NÃO ALTERA workspace_notes, suas políticas, posições ou dados existentes.
-- ============================================================================
begin;

do $$
begin
  if to_regclass('public.workspace_notes') is null then
    raise exception 'PRECHECK: public.workspace_notes não existe.';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'workspace_notes'
         and column_name in ('id', 'user_id', 'project_id')) <> 3 then
    raise exception 'PRECHECK: workspace_notes sem as colunas id, user_id e project_id.';
  end if;
end $$;

create table if not exists public.workspace_note_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  from_note_id uuid not null references public.workspace_notes(id) on delete cascade,
  to_note_id uuid not null references public.workspace_notes(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint workspace_note_connections_not_self check (from_note_id <> to_note_id)
);

comment on table public.workspace_note_connections is
  'Setas entre post-its do Meu Mural, por IDs das notas. Removidas com a nota (cascade).';

-- Um único vínculo por par, em qualquer direção.
create unique index if not exists workspace_note_connections_pair_key
  on public.workspace_note_connections (least(from_note_id, to_note_id), greatest(from_note_id, to_note_id));
create index if not exists workspace_note_connections_user_idx on public.workspace_note_connections (user_id);
create index if not exists workspace_note_connections_from_idx on public.workspace_note_connections (from_note_id);
create index if not exists workspace_note_connections_to_idx on public.workspace_note_connections (to_note_id);

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

drop policy if exists workspace_note_connections_select on public.workspace_note_connections;
create policy workspace_note_connections_select on public.workspace_note_connections
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists workspace_note_connections_insert on public.workspace_note_connections;
create policy workspace_note_connections_insert on public.workspace_note_connections
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.workspace_personal_note_owned(from_note_id)
    and public.workspace_personal_note_owned(to_note_id)
  );

drop policy if exists workspace_note_connections_delete on public.workspace_note_connections;
create policy workspace_note_connections_delete on public.workspace_note_connections
  for delete to authenticated
  using (user_id = (select auth.uid()));

commit;

-- ----------------------------------------------------------------------------
-- Rollback (somente se necessário; descomente). Remove apenas as conexões;
-- nenhuma nota é afetada.
-- ----------------------------------------------------------------------------
-- begin;
-- drop table if exists public.workspace_note_connections;
-- drop function if exists public.workspace_personal_note_owned(uuid);
-- commit;

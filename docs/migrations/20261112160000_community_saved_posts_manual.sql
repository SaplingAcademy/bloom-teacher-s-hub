-- =========================================================================================
-- Comunidade Bloom — Etapa 2 (Salvar publicações)
-- Aplicação MANUAL no SQL Editor do Supabase. Não usar ferramentas de migração gerenciadas.
--
-- ORDEM
--   Pode ser aplicado antes ou depois do deploy do PR da Etapa 2:
--   - Antes deste arquivo, o app esconde o botão "Salvar" e o filtro "Salvos" (a tabela não
--     existe: PGRST205/42P01) e a Comunidade funciona como na Etapa 1.
--   - Depois deste arquivo, "Salvar" e "Salvos" aparecem automaticamente (sem novo deploy).
--   Recomendado: aplicar este arquivo primeiro e então fazer o merge/deploy.
--
-- REGRAS
--   - Privado: cada professor lê, cria e remove apenas os próprios salvamentos (RLS).
--   - Sem duplicidade: chave primária (user_id, post_id).
--   - Sem UPDATE: um salvamento é criado ou removido, nunca alterado.
--   - Sem efeitos colaterais: nenhum gatilho; não toca reactions, comments, ranking,
--     community_reputation_events ou notifications (não gera pontos, regadas ou notificações).
--   - Apagar a publicação ou o professor remove os salvamentos correspondentes (ON DELETE CASCADE).
--
-- ROLLBACK
--   drop table if exists public.community_saved_posts;
-- =========================================================================================
begin;

create table if not exists public.community_saved_posts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint community_saved_posts_pkey primary key (user_id, post_id)
);

comment on table public.community_saved_posts is
  'Comunidade Bloom: publicações salvas por cada professor (privado). Não afeta pontos, regadas nem notificações.';

-- Lista "Salvos" do professor, mais recentes primeiro (a PK já cobre user_id + post_id).
create index if not exists idx_community_saved_posts_user_created
  on public.community_saved_posts (user_id, created_at desc);

-- Remoção em cascata eficiente quando uma publicação é apagada.
create index if not exists idx_community_saved_posts_post
  on public.community_saved_posts (post_id);

alter table public.community_saved_posts enable row level security;

-- Privilégios mínimos: anon não acessa; authenticated só lê, cria e remove (sem UPDATE).
revoke all on public.community_saved_posts from anon;
revoke all on public.community_saved_posts from authenticated;
grant select, insert, delete on public.community_saved_posts to authenticated;
grant all on public.community_saved_posts to service_role;

drop policy if exists "Read own saved posts" on public.community_saved_posts;
create policy "Read own saved posts"
  on public.community_saved_posts
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Save posts as self" on public.community_saved_posts;
create policy "Save posts as self"
  on public.community_saved_posts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Remove own saved posts" on public.community_saved_posts;
create policy "Remove own saved posts"
  on public.community_saved_posts
  for delete
  to authenticated
  using (auth.uid() = user_id);

commit;

-- Verificação (somente leitura):
-- select policyname, cmd, roles, qual, with_check from pg_policies
--  where schemaname = 'public' and tablename = 'community_saved_posts';
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_schema = 'public' and table_name = 'community_saved_posts'
--    and grantee in ('anon', 'authenticated');
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.community_saved_posts'::regclass;

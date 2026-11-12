-- =========================================================================================
-- Comunidade Bloom — Etapa 1 (assuntos) · PARTE 1 de 2
-- Aplicação MANUAL no SQL Editor do Supabase. Não usar ferramentas de migração gerenciadas.
--
-- ORDEM SEGURA
--   1. Aplicar ESTE arquivo (coluna + validação de valores + índice).
--   2. Fazer o merge/deploy do PR da Etapa 1 (o app passa a ler e enviar `topic`).
--      O app também funciona antes deste arquivo: sem a coluna, ele usa a leitura antiga
--      e publica sem assunto. Mesmo assim, aplique este arquivo primeiro.
--   3. Aplicar 20261112140100_community_topics_step2_manual.sql (assunto obrigatório).
--
-- O QUE NÃO MUDA
--   Regadas (reactions), pontuação/ranking, community_reputation_events, notificações,
--   políticas RLS, funções e gatilhos existentes. Este arquivo só ADICIONA uma coluna
--   anulável, um CHECK e um índice. Publicações sem assunto continuam válidas e aparecem
--   normalmente, sem etiqueta. Não usa `deleted_at` (a coluna não existe no projeto).
--
-- ROLLBACK
--   drop index if exists public.idx_community_posts_topic_created;
--   alter table public.community_posts drop constraint if exists community_posts_topic_check;
--   alter table public.community_posts drop column if exists topic;
-- =========================================================================================
begin;

alter table public.community_posts
  add column if not exists topic text;

alter table public.community_posts
  drop constraint if exists community_posts_topic_check;
alter table public.community_posts
  add constraint community_posts_topic_check
  check (topic is null or topic in ('questions', 'lesson_ideas', 'materials', 'management', 'achievements'));

-- Feed filtrado por assunto, mais recentes primeiro.
create index if not exists idx_community_posts_topic_created
  on public.community_posts (topic, created_at desc);

commit;

-- Verificação (somente leitura):
-- select column_name, data_type, is_nullable from information_schema.columns
--  where table_schema = 'public' and table_name = 'community_posts' and column_name = 'topic';
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.community_posts'::regclass and conname = 'community_posts_topic_check';

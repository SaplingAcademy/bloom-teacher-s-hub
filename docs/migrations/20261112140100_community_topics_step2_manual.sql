-- =========================================================================================
-- Comunidade Bloom — Etapa 1 (assuntos) · PARTE 2 de 2
-- Aplicação MANUAL, somente DEPOIS de:
--   (a) 20261112140000_community_topics_step1_manual.sql aplicado, e
--   (b) o deploy do PR da Etapa 1 em produção (o app já envia `topic` ao publicar).
-- Aplicar antes do deploy faria as publicações do app antigo (sem assunto) falharem.
--
-- REGRA
--   - Toda NOVA publicação precisa de assunto (INSERT sem `topic` é recusado).
--   - Publicações antigas sem assunto continuam editáveis (título/conteúdo pelo Perfil):
--     o gatilho só age quando o próprio `topic` muda, e só impede REMOVER um assunto já definido.
--   - BEFORE trigger que apenas valida: não altera linhas, não escreve em outras tabelas e não
--     interfere em regadas, pontuação, ranking, community_reputation_events ou notificações
--     (uma inserção recusada simplesmente não acontece).
--
-- Observação: com 0 publicações hoje, um NOT NULL também seria possível, mas o gatilho é
-- seguro mesmo que alguma publicação sem assunto seja criada entre a parte 1 e o deploy.
--
-- ROLLBACK
--   drop trigger if exists community_posts_require_topic on public.community_posts;
--   drop function if exists public.community_posts_require_topic();
-- =========================================================================================
begin;

create or replace function public.community_posts_require_topic()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.topic is null then
    raise exception 'COMMUNITY_TOPIC_REQUIRED' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.topic is not null and new.topic is null then
    raise exception 'COMMUNITY_TOPIC_REQUIRED' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists community_posts_require_topic on public.community_posts;
create trigger community_posts_require_topic
  before insert or update of topic on public.community_posts
  for each row execute function public.community_posts_require_topic();

commit;

-- Verificação (somente leitura):
-- select trigger_name, action_timing, event_manipulation from information_schema.triggers
--  where event_object_schema = 'public' and event_object_table = 'community_posts'
--    and trigger_name = 'community_posts_require_topic';

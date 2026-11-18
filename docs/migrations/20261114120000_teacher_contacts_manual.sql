-- =====================================================================================
-- Bloom · Meus Contatos · Etapa 1 (banco e segurança) · aplicação MANUAL
-- Tabelas teacher_contacts e teacher_contact_cooldowns + RPCs SECURITY DEFINER.
-- O cliente não acessa as tabelas diretamente. Nenhuma política ou função existente é
-- alterada. Notificações usam apenas colunas existentes (sem coluna link).
-- =====================================================================================
begin;

-- 0. Pré-checagens: abortam sem alterar nada se o ambiente não for o esperado.
do $$
declare
  v_type text;
  v_udt_schema text;
  v_udt_name text;
  v_domain text;
begin
  if to_regclass('public.teacher_contacts') is not null
     or to_regclass('public.teacher_contact_cooldowns') is not null then
    raise exception 'Meus Contatos: tabelas já existem (migração já aplicada?)';
  end if;
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications'
        and column_name in ('user_id', 'actor_id', 'type', 'title', 'message', 'read', 'created_at')) <> 7 then
    raise exception 'notifications: colunas esperadas ausentes';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'notifications'
               and is_nullable = 'NO' and column_default is null
               and column_name not in ('user_id', 'actor_id', 'type', 'title', 'message')) then
    raise exception 'notifications: coluna obrigatória sem default que as RPCs não preenchem';
  end if;
  if exists (select 1 from pg_constraint
             where conrelid = 'public.notifications'::regclass and contype = 'c'
               and pg_get_constraintdef(oid) ilike '%type%') then
    raise exception 'notifications.type possui CHECK: revisar valores permitidos antes de aplicar';
  end if;
  -- notifications.type precisa aceitar 'contact_request' e 'contact_accepted':
  -- texto livre, ou ENUM que já contenha os dois valores. Domínios exigem revisão manual.
  select c.data_type, c.udt_schema, c.udt_name, c.domain_name
    into v_type, v_udt_schema, v_udt_name, v_domain
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'notifications' and c.column_name = 'type';
  if v_domain is not null then
    raise exception 'notifications.type usa o domínio %: revisar valores permitidos antes de aplicar', v_domain;
  end if;
  if v_type = 'USER-DEFINED' then
    if (select count(*) from pg_enum e
        join pg_type t on t.oid = e.enumtypid
        join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = v_udt_schema and t.typname = v_udt_name
          and e.enumlabel in ('contact_request', 'contact_accepted')) <> 2 then
      raise exception 'notifications.type é o ENUM %.% sem os valores contact_request/contact_accepted', v_udt_schema, v_udt_name;
    end if;
  elsif v_type not in ('text', 'character varying') then
    raise exception 'notifications.type tem tipo inesperado: %', v_type;
  end if;
end $$;

-- 1. Relações ativas: uma linha por par (qualquer sentido), pendente ou aceita.
create table public.teacher_contacts (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.profiles(id) on delete cascade,
  addressee_id  uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  responded_at  timestamptz,
  pair_low      uuid generated always as (least(requester_id, addressee_id)) stored,
  pair_high     uuid generated always as (greatest(requester_id, addressee_id)) stored,
  constraint teacher_contacts_status_check check (status in ('pending', 'accepted')),
  constraint teacher_contacts_no_self      check (requester_id <> addressee_id),
  constraint teacher_contacts_responded    check (status = 'pending' or responded_at is not null),
  constraint teacher_contacts_pair_unique  unique (pair_low, pair_high)
);
comment on table public.teacher_contacts is
  'Meus Contatos: solicitações pendentes e contatos aceitos. Acesso somente via RPCs.';
create index teacher_contacts_requester_status_idx on public.teacher_contacts (requester_id, status);
create index teacher_contacts_addressee_status_idx on public.teacher_contacts (addressee_id, status);

-- 2. Cooldown privado por sentido (remetente recusado → destinatário que recusou).
--    Independe da linha de relação: cancelar, remover, convites inversos ou novos convites
--    nunca apagam o bloqueio; só expira ou é removido quando os dois se tornam contatos.
create table public.teacher_contact_cooldowns (
  requester_id   uuid not null references public.profiles(id) on delete cascade,
  addressee_id   uuid not null references public.profiles(id) on delete cascade,
  blocked_until  timestamptz not null,
  created_at     timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  constraint teacher_contact_cooldowns_no_self check (requester_id <> addressee_id)
);
comment on table public.teacher_contact_cooldowns is
  'Meus Contatos: recusas privadas (5 dias). Nunca exposta ao cliente; usada apenas pelas RPCs.';

-- RLS ligada, sem políticas e sem privilégios: nenhum acesso direto pelo cliente.
alter table public.teacher_contacts enable row level security;
alter table public.teacher_contact_cooldowns enable row level security;
revoke all on table public.teacher_contacts from public, anon, authenticated;
revoke all on table public.teacher_contact_cooldowns from public, anon, authenticated;

-- 3. Notificação interna (EXECUTE negado ao cliente). Texto no idioma do destinatário.
create or replace function public.teacher_contacts_notify(p_recipient uuid, p_actor uuid, p_type text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_en boolean;
  v_name text;
  v_title text;
  v_message text;
begin
  select coalesce(p.locale, '') ilike 'en%' into v_en from public.profiles p where p.id = p_recipient;
  v_en := coalesce(v_en, false);
  select nullif(btrim(p.full_name), '') into v_name from public.profiles p where p.id = p_actor;

  if p_type = 'contact_request' then
    -- Antispam: não repete enquanto houver aviso não lido recente do mesmo remetente.
    if exists (select 1 from public.notifications n
               where n.user_id = p_recipient and n.actor_id = p_actor and n.type = 'contact_request'
                 and n.read = false and n.created_at > now() - interval '5 days') then
      return;
    end if;
    v_title   := case when v_en then 'New contact request' else 'Nova solicitação de contato' end;
    v_message := case when v_en then coalesce(v_name, 'A teacher') || ' wants to add you to their contacts.'
                      else coalesce(v_name, 'Um(a) professor(a)') || ' quer adicionar você aos contatos.' end;
  elsif p_type = 'contact_accepted' then
    v_title   := case when v_en then 'Contact request accepted' else 'Solicitação de contato aceita' end;
    v_message := case when v_en then coalesce(v_name, 'A teacher') || ' accepted your contact request.'
                      else coalesce(v_name, 'Um(a) professor(a)') || ' aceitou sua solicitação de contato.' end;
  else
    raise exception 'contact_invalid_notification';
  end if;

  insert into public.notifications (user_id, actor_id, type, title, message)
  values (p_recipient, p_actor, p_type, v_title, v_message);
end $$;

-- 4. Busca: nome (mínimo 3 caracteres, curingas escapados) ou e-mail completo.
--    Nunca retorna e-mail. relation: none | outgoing | incoming | contact | cooldown.
--    cooldown aparece apenas para o próprio remetente bloqueado, com o horário de liberação.
create or replace function public.search_teachers(p_query text)
returns table (teacher_id uuid, full_name text, avatar_url text, relation text, request_id uuid, cooldown_until timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_q text := btrim(coalesce(p_query, ''));
  v_pattern text;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if char_length(v_q) > 200 then return; end if;
  -- Escapa \ primeiro, depois % e _, para que o texto digitado seja literal no ILIKE.
  v_pattern := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  with candidates as (
    select p.id as cid, p.full_name as cname, p.avatar_url as cavatar
    from public.profiles p
    join auth.users u on u.id = p.id
    where position('@' in v_q) > 0 and lower(u.email) = lower(v_q) and p.id <> v_me
    union
    select p.id, p.full_name, p.avatar_url
    from public.profiles p
    where position('@' in v_q) = 0 and char_length(v_q) >= 3 and p.id <> v_me
      and nullif(btrim(p.full_name), '') is not null
      and p.full_name ilike v_pattern escape '\'
  )
  select c.cid,
         c.cname,
         c.cavatar,
         case
           when tc.id is not null and tc.status = 'accepted' then 'contact'
           when tc.id is not null and tc.requester_id = v_me then 'outgoing'
           when tc.id is not null then 'incoming'
           when cd.blocked_until > now() then 'cooldown'
           else 'none'
         end,
         case when tc.status = 'pending' then tc.id end,
         case when tc.id is null and cd.blocked_until > now() then cd.blocked_until end
  from candidates c
  left join public.teacher_contacts tc
         on tc.pair_low = least(v_me, c.cid) and tc.pair_high = greatest(v_me, c.cid)
  left join public.teacher_contact_cooldowns cd
         on cd.requester_id = v_me and cd.addressee_id = c.cid
  order by c.cname nulls last, c.cid
  limit 20;
end $$;

-- 5. Enviar solicitação (idempotente).
--    Ordem única de locks em todas as RPCs: remetente (só aqui) → par → linhas.
create or replace function public.send_contact_request(p_addressee uuid)
returns table (request_id uuid, relation text, cooldown_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_row_id uuid;
  v_row_status text;
  v_row_requester uuid;
  v_blocked_until timestamptz;
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_addressee is null or p_addressee = v_me then raise exception 'contact_self'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_addressee) then
    raise exception 'contact_target_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('teacher_contacts:out:' || v_me::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'teacher_contacts:pair:' || least(v_me, p_addressee)::text || ':' || greatest(v_me, p_addressee)::text, 0));

  select tc.id, tc.status, tc.requester_id into v_row_id, v_row_status, v_row_requester
  from public.teacher_contacts tc
  where tc.pair_low = least(v_me, p_addressee) and tc.pair_high = greatest(v_me, p_addressee)
  for update;

  if v_row_id is not null then
    if v_row_status = 'accepted' then
      return query select v_row_id, 'contact'::text, null::timestamptz;
      return;
    end if;
    -- Pendente em qualquer sentido: nada muda (convite inverso não é aceito implicitamente).
    return query select v_row_id,
                        (case when v_row_requester = v_me then 'outgoing' else 'incoming' end)::text,
                        null::timestamptz;
    return;
  end if;

  -- Sem relação ativa: aplica o cooldown deste sentido, se houver.
  select cd.blocked_until into v_blocked_until
  from public.teacher_contact_cooldowns cd
  where cd.requester_id = v_me and cd.addressee_id = p_addressee
  for update;
  if v_blocked_until is not null and v_blocked_until > now() then
    return query select null::uuid, 'cooldown'::text, v_blocked_until;
    return;
  end if;
  if v_blocked_until is not null then
    delete from public.teacher_contact_cooldowns cd
     where cd.requester_id = v_me and cd.addressee_id = p_addressee;
  end if;

  if (select count(*) from public.teacher_contacts tc
      where tc.requester_id = v_me and tc.status = 'pending') >= 50 then
    raise exception 'contact_pending_limit';
  end if;

  insert into public.teacher_contacts (requester_id, addressee_id)
  values (v_me, p_addressee)
  returning id into v_id;

  perform public.teacher_contacts_notify(p_addressee, v_me, 'contact_request');
  return query select v_id, 'outgoing'::text, null::timestamptz;
end $$;

-- 6. Aceitar ou recusar (somente o destinatário de uma solicitação pendente).
create or replace function public.respond_contact_request(p_request_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_requester uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_accept is null then raise exception 'contact_invalid_response'; end if;

  -- O par de uma linha nunca muda; é relido e validado após o lock.
  select tc.pair_low, tc.pair_high into v_low, v_high
  from public.teacher_contacts tc where tc.id = p_request_id;
  if v_low is null then raise exception 'contact_request_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher_contacts:pair:' || v_low::text || ':' || v_high::text, 0));

  select tc.requester_id into v_requester
  from public.teacher_contacts tc
  where tc.id = p_request_id and tc.addressee_id = v_me and tc.status = 'pending'
  for update;
  if v_requester is null then raise exception 'contact_request_not_found'; end if;

  if p_accept then
    update public.teacher_contacts tc
       set status = 'accepted', responded_at = now(), updated_at = now()
     where tc.id = p_request_id;
    -- Contatos estabelecidos: bloqueios antigos do par deixam de fazer sentido.
    delete from public.teacher_contact_cooldowns cd
     where (cd.requester_id = v_requester and cd.addressee_id = v_me)
        or (cd.requester_id = v_me and cd.addressee_id = v_requester);
    perform public.teacher_contacts_notify(v_requester, v_me, 'contact_accepted');
  else
    -- Recusa privada: apaga a solicitação, registra 5 dias de bloqueio para o remetente
    -- e não gera notificação.
    delete from public.teacher_contacts tc where tc.id = p_request_id;
    insert into public.teacher_contact_cooldowns (requester_id, addressee_id, blocked_until)
    values (v_requester, v_me, now() + interval '5 days')
    on conflict (requester_id, addressee_id)
    do update set blocked_until = excluded.blocked_until, created_at = now();
  end if;

  update public.notifications n
     set read = true
   where n.user_id = v_me and n.actor_id = v_requester and n.type = 'contact_request' and n.read = false;

  return case when p_accept then 'contact' else 'none' end;
end $$;

-- 7. Cancelar uma solicitação pendente enviada. Não afeta nenhum cooldown.
create or replace function public.cancel_contact_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_addressee uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select tc.pair_low, tc.pair_high into v_low, v_high
  from public.teacher_contacts tc where tc.id = p_request_id;
  if v_low is null then raise exception 'contact_request_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher_contacts:pair:' || v_low::text || ':' || v_high::text, 0));

  delete from public.teacher_contacts tc
   where tc.id = p_request_id and tc.requester_id = v_me and tc.status = 'pending'
  returning tc.addressee_id into v_addressee;
  if v_addressee is null then raise exception 'contact_request_not_found'; end if;

  -- Remove o aviso ainda não lido do destinatário.
  delete from public.notifications n
   where n.user_id = v_addressee and n.actor_id = v_me and n.type = 'contact_request' and n.read = false;
end $$;

-- 8. Remover um contato aceito (qualquer um dos dois). Sem notificação e sem cooldown.
create or replace function public.remove_contact(p_other uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_other is null or p_other = v_me then raise exception 'contact_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'teacher_contacts:pair:' || least(v_me, p_other)::text || ':' || greatest(v_me, p_other)::text, 0));

  delete from public.teacher_contacts tc
   where tc.pair_low = least(v_me, p_other) and tc.pair_high = greatest(v_me, p_other)
     and tc.status = 'accepted'
  returning tc.id into v_id;
  if v_id is null then raise exception 'contact_not_found'; end if;
end $$;

-- 9. Minhas relações ativas (contatos, recebidas, enviadas). Recusas nunca aparecem.
create or replace function public.list_my_contacts()
returns table (request_id uuid, other_id uuid, full_name text, avatar_url text, relation text,
               created_at timestamptz, responded_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  return query
  select tc.id,
         p.id,
         p.full_name,
         p.avatar_url,
         (case when tc.status = 'accepted' then 'contact'
               when tc.requester_id = v_me then 'outgoing'
               else 'incoming' end)::text,
         tc.created_at,
         tc.responded_at
  from public.teacher_contacts tc
  join public.profiles p
    on p.id = case when tc.requester_id = v_me then tc.addressee_id else tc.requester_id end
  where tc.requester_id = v_me or tc.addressee_id = v_me
  order by tc.status, p.full_name nulls last, p.id;
end $$;

-- 10. Base para o futuro compartilhamento de projetos: responde só sobre o PRÓPRIO usuário.
--     Uso futuro em RLS: with check (public.is_my_contact(invitee_id)).
create or replace function public.is_my_contact(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.uid() is not null and exists (
    select 1 from public.teacher_contacts tc
    where tc.pair_low = least(auth.uid(), p_other)
      and tc.pair_high = greatest(auth.uid(), p_other)
      and tc.status = 'accepted'), false);
$$;

-- 11. Permissões mínimas. O Supabase concede EXECUTE a anon/authenticated por padrão em
--     funções novas; por isso tudo é revogado explicitamente e só o necessário é concedido.
revoke all on function public.teacher_contacts_notify(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.search_teachers(text)                    from public, anon, authenticated;
revoke all on function public.send_contact_request(uuid)               from public, anon, authenticated;
revoke all on function public.respond_contact_request(uuid, boolean)   from public, anon, authenticated;
revoke all on function public.cancel_contact_request(uuid)             from public, anon, authenticated;
revoke all on function public.remove_contact(uuid)                     from public, anon, authenticated;
revoke all on function public.list_my_contacts()                       from public, anon, authenticated;
revoke all on function public.is_my_contact(uuid)                      from public, anon, authenticated;
grant execute on function public.search_teachers(text)                  to authenticated;
grant execute on function public.send_contact_request(uuid)             to authenticated;
grant execute on function public.respond_contact_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_contact_request(uuid)           to authenticated;
grant execute on function public.remove_contact(uuid)                   to authenticated;
grant execute on function public.list_my_contacts()                     to authenticated;
grant execute on function public.is_my_contact(uuid)                    to authenticated;

commit;

-- =====================================================================================
-- VERIFICAÇÃO PÓS-MIGRAÇÃO (somente leitura). Esperado:
--   todas com security_definer = true e search_path vazio;
--   teacher_contacts_notify: anon = false e authenticated = false;
--   demais funções: anon = false e authenticated = true;
--   nenhuma das duas tabelas com privilégio para anon ou authenticated.
-- select p.proname,
--        p.prosecdef as security_definer,
--        p.proconfig as config,
--        has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in ('teacher_contacts_notify', 'search_teachers', 'send_contact_request',
--                     'respond_contact_request', 'cancel_contact_request', 'remove_contact',
--                     'list_my_contacts', 'is_my_contact')
-- order by p.proname;
-- select t.tbl, r.role,
--        has_table_privilege(r.role, t.tbl, 'SELECT, INSERT, UPDATE, DELETE') as any_privilege
-- from (values ('public.teacher_contacts'), ('public.teacher_contact_cooldowns')) as t(tbl)
-- cross join (values ('anon'), ('authenticated')) as r(role);
--
-- ROLLBACK (manual, somente se necessário):
-- begin;
--   delete from public.notifications where type in ('contact_request', 'contact_accepted');
--   drop function if exists public.is_my_contact(uuid);
--   drop function if exists public.list_my_contacts();
--   drop function if exists public.remove_contact(uuid);
--   drop function if exists public.cancel_contact_request(uuid);
--   drop function if exists public.respond_contact_request(uuid, boolean);
--   drop function if exists public.send_contact_request(uuid);
--   drop function if exists public.search_teachers(text);
--   drop function if exists public.teacher_contacts_notify(uuid, uuid, text);
--   drop table if exists public.teacher_contact_cooldowns;
--   drop table if exists public.teacher_contacts;
-- commit;
-- =====================================================================================

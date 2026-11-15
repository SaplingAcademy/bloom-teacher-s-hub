-- =====================================================================================
-- Bloom · Workspace colaborativo · Etapa 1: participantes e convites · aplicação MANUAL
--
-- Cria public.workspace_project_members e RPCs SECURITY DEFINER para convidar (por e-mail
-- exato de um professor cadastrado), aceitar, recusar, remover e sair. O proprietário continua
-- sendo workspace_projects.user_id e nunca tem linha nesta tabela.
--
-- NÃO concede acesso a projetos: nenhuma política, FK, função de acesso, Storage ou tabela
-- existente é alterada. Um convite aceito só passará a dar acesso na Etapa 2.
-- O cliente não acessa a tabela diretamente (RLS sem políticas, sem privilégios).
-- =====================================================================================
begin;

-- 0. Pré-checagens: abortam sem alterar nada se o ambiente não for o esperado.
do $$
declare
  v_type text;
begin
  if to_regclass('public.workspace_projects') is null or to_regclass('public.profiles') is null
     or to_regclass('public.notifications') is null or to_regclass('auth.users') is null then
    raise exception 'Tabelas esperadas ausentes (workspace_projects, profiles, notifications, auth.users)';
  end if;
  if to_regclass('public.workspace_project_members') is not null then
    raise exception 'workspace_project_members já existe (migração já aplicada?)';
  end if;
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'workspace_projects'
        and column_name in ('id', 'user_id', 'title', 'status')) <> 4 then
    raise exception 'workspace_projects: colunas esperadas ausentes (id, user_id, title, status)';
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
  select data_type into v_type from information_schema.columns
   where table_schema = 'public' and table_name = 'notifications' and column_name = 'type';
  if v_type not in ('text', 'character varying') then
    raise exception 'notifications.type tem tipo inesperado (%): revisar antes de aplicar', v_type;
  end if;
  if exists (select 1 from pg_constraint
             where conrelid = 'public.notifications'::regclass and contype = 'c'
               and pg_get_constraintdef(oid) ilike '%type%') then
    raise exception 'notifications.type possui CHECK: revisar valores permitidos antes de aplicar';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public'
               and p.proname in ('invite_project_member', 'respond_project_invite', 'remove_project_member',
                                 'leave_project', 'list_project_members', 'list_my_project_invites',
                                 'workspace_project_members_notify')) then
    raise exception 'Funções de participantes já existem';
  end if;
end $$;

-- 1. Participantes e convites: uma linha por (projeto, professor).
create table public.workspace_project_members (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.workspace_projects(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  invited_by    uuid not null references public.profiles(id) on delete cascade,
  role          text not null default 'editor',
  status        text not null default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  responded_at  timestamptz,
  constraint workspace_project_members_unique unique (project_id, user_id),
  constraint workspace_project_members_role_check check (role in ('editor')),
  constraint workspace_project_members_status_check check (status in ('pending', 'accepted', 'declined')),
  constraint workspace_project_members_not_self check (user_id <> invited_by),
  constraint workspace_project_members_responded check (status = 'pending' or responded_at is not null)
);
comment on table public.workspace_project_members is
  'Workspace colaborativo: convites e participantes (o dono é workspace_projects.user_id e não tem linha). Acesso só via RPCs. Etapa 1: não concede acesso ao projeto.';

create index workspace_project_members_user_status_idx on public.workspace_project_members (user_id, status);
create index workspace_project_members_project_status_idx on public.workspace_project_members (project_id, status);

alter table public.workspace_project_members enable row level security;
revoke all on table public.workspace_project_members from public, anon, authenticated;

-- 2. Notificação interna (EXECUTE negado ao cliente). Texto no idioma do destinatário.
--    Não inclui e-mails; usa o nome do perfil de quem age e o título do projeto.
create or replace function public.workspace_project_members_notify(p_recipient uuid, p_actor uuid, p_type text, p_project_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_en boolean;
  v_name text;
  v_title text := coalesce(nullif(btrim(p_project_title), ''), '—');
  v_head text;
  v_body text;
begin
  select coalesce(p.locale, '') ilike 'en%' into v_en from public.profiles p where p.id = p_recipient;
  v_en := coalesce(v_en, false);
  select nullif(btrim(p.full_name), '') into v_name from public.profiles p where p.id = p_actor;

  if p_type = 'project_invite' then
    v_head := case when v_en then 'Project invitation' else 'Convite para projeto' end;
    v_body := case when v_en then coalesce(v_name, 'A teacher') || ' invited you to the project "' || v_title || '".'
                   else coalesce(v_name, 'Um(a) professor(a)') || ' convidou você para o projeto "' || v_title || '".' end;
  elsif p_type = 'project_invite_accepted' then
    v_head := case when v_en then 'Invitation accepted' else 'Convite aceito' end;
    v_body := case when v_en then coalesce(v_name, 'A teacher') || ' accepted your invitation to "' || v_title || '".'
                   else coalesce(v_name, 'Um(a) professor(a)') || ' aceitou seu convite para "' || v_title || '".' end;
  else
    raise exception 'project_invalid_notification';
  end if;

  insert into public.notifications (user_id, actor_id, type, title, message)
  values (p_recipient, p_actor, p_type, v_head, v_body);
end $$;

-- 3. Convidar por e-mail exato (somente o dono, projeto ativo). Idempotente; reaproveita a
--    linha de um convite recusado. Nunca retorna e-mail.
--    Ordem de locks em todas as RPCs: projeto → par (projeto, professor) → linha.
create or replace function public.invite_project_member(p_project uuid, p_email text)
returns table (member_id uuid, status text, invitee_name text, invitee_avatar text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_owner uuid;
  v_project_status text;
  v_title text;
  v_invitee uuid;
  v_row_id uuid;
  v_row_status text;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if v_email = '' or position('@' in v_email) = 0 or char_length(v_email) > 320 then
    raise exception 'invite_invalid_email';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('workspace_project_members:project:' || coalesce(p_project::text, ''), 0));
  select wp.user_id, wp.status, wp.title into v_owner, v_project_status, v_title
    from public.workspace_projects wp where wp.id = p_project;
  if v_owner is null or v_owner <> v_me then raise exception 'project_not_found'; end if;
  if v_project_status <> 'active' then raise exception 'project_archived'; end if;

  select u.id into v_invitee
    from auth.users u
    join public.profiles p on p.id = u.id
   where lower(u.email) = v_email
   limit 1;
  if v_invitee is null then raise exception 'invite_user_not_found'; end if;
  if v_invitee = v_me then raise exception 'invite_self'; end if;

  perform pg_advisory_xact_lock(hashtextextended('workspace_project_members:pair:' || p_project::text || ':' || v_invitee::text, 0));
  select m.id, m.status into v_row_id, v_row_status
    from public.workspace_project_members m
   where m.project_id = p_project and m.user_id = v_invitee
   for update;

  if v_row_id is not null and v_row_status in ('pending', 'accepted') then
    -- Duplicidade ativa: nada muda e nenhuma notificação é repetida.
    return query
      select v_row_id, v_row_status, p.full_name, p.avatar_url from public.profiles p where p.id = v_invitee;
    return;
  end if;

  if (select count(*) from public.workspace_project_members m
       where m.project_id = p_project and m.status in ('pending', 'accepted')) >= 50 then
    raise exception 'project_member_limit';
  end if;

  if v_row_id is not null then
    update public.workspace_project_members m
       set status = 'pending', invited_by = v_me, responded_at = null, created_at = now(), updated_at = now()
     where m.id = v_row_id;
  else
    insert into public.workspace_project_members (project_id, user_id, invited_by)
    values (p_project, v_invitee, v_me)
    returning id into v_row_id;
  end if;

  perform public.workspace_project_members_notify(v_invitee, v_me, 'project_invite', v_title);
  return query
    select v_row_id, 'pending'::text, p.full_name, p.avatar_url from public.profiles p where p.id = v_invitee;
end $$;

-- 4. Responder ao próprio convite pendente. Aceite notifica o dono; recusa é silenciosa.
create or replace function public.respond_project_invite(p_member_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_project uuid;
  v_owner uuid;
  v_title text;
  v_inviter uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_accept is null then raise exception 'invite_invalid_response'; end if;

  select m.project_id into v_project from public.workspace_project_members m where m.id = p_member_id;
  if v_project is null then raise exception 'invite_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace_project_members:project:' || v_project::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('workspace_project_members:pair:' || v_project::text || ':' || v_me::text, 0));

  select m.invited_by into v_inviter
    from public.workspace_project_members m
   where m.id = p_member_id and m.user_id = v_me and m.status = 'pending'
   for update;
  if v_inviter is null then raise exception 'invite_not_found'; end if;

  select wp.user_id, wp.title into v_owner, v_title from public.workspace_projects wp where wp.id = v_project;

  update public.workspace_project_members m
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now(), updated_at = now()
   where m.id = p_member_id;

  if p_accept and v_owner is not null then
    perform public.workspace_project_members_notify(v_owner, v_me, 'project_invite_accepted', v_title);
  end if;

  update public.notifications n set read = true
   where n.user_id = v_me and n.actor_id = v_inviter and n.type = 'project_invite' and n.read = false;

  return case when p_accept then 'accepted' else 'declined' end;
end $$;

-- 5. Remover participante ou cancelar convite (somente o dono). O dono não tem linha, logo
--    não pode ser removido.
create or replace function public.remove_project_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_project uuid;
  v_user uuid;
  v_status text;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select m.project_id, m.user_id into v_project, v_user from public.workspace_project_members m where m.id = p_member_id;
  if v_project is null then raise exception 'member_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace_project_members:project:' || v_project::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('workspace_project_members:pair:' || v_project::text || ':' || v_user::text, 0));

  if not exists (select 1 from public.workspace_projects wp where wp.id = v_project and wp.user_id = v_me) then
    raise exception 'member_not_found';
  end if;

  delete from public.workspace_project_members m
   where m.id = p_member_id and m.project_id = v_project
  returning m.status into v_status;
  if v_status is null then raise exception 'member_not_found'; end if;

  -- Convite cancelado: remove o aviso ainda não lido do convidado.
  if v_status = 'pending' then
    delete from public.notifications n
     where n.user_id = v_user and n.actor_id = v_me and n.type = 'project_invite' and n.read = false;
  end if;
end $$;

-- 6. Sair de um projeto (participante aceito). O dono não pode sair do próprio projeto.
create or replace function public.leave_project(p_project uuid)
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
  if exists (select 1 from public.workspace_projects wp where wp.id = p_project and wp.user_id = v_me) then
    raise exception 'owner_cannot_leave';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace_project_members:project:' || coalesce(p_project::text, ''), 0));
  perform pg_advisory_xact_lock(hashtextextended('workspace_project_members:pair:' || coalesce(p_project::text, '') || ':' || v_me::text, 0));

  delete from public.workspace_project_members m
   where m.project_id = p_project and m.user_id = v_me and m.status = 'accepted'
  returning m.id into v_id;
  if v_id is null then raise exception 'member_not_found'; end if;
end $$;

-- 7. Participantes de um projeto (dono ou participante aceito). Sem e-mails.
--    O dono vê também convites pendentes e recusados; participantes veem só aceitos.
create or replace function public.list_project_members(p_project uuid)
returns table (member_id uuid, user_id uuid, full_name text, avatar_url text, role text, status text,
               created_at timestamptz, responded_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_owner uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select wp.user_id into v_owner from public.workspace_projects wp where wp.id = p_project;
  if v_owner is null then raise exception 'project_not_found'; end if;
  if v_owner <> v_me and not exists (
    select 1 from public.workspace_project_members m
     where m.project_id = p_project and m.user_id = v_me and m.status = 'accepted') then
    raise exception 'project_not_found';
  end if;

  return query
  select m.id, m.user_id, p.full_name, p.avatar_url, m.role, m.status, m.created_at, m.responded_at
    from public.workspace_project_members m
    join public.profiles p on p.id = m.user_id
   where m.project_id = p_project
     and (v_owner = v_me or m.status = 'accepted')
   order by case m.status when 'accepted' then 0 when 'pending' then 1 else 2 end, p.full_name nulls last, m.id;
end $$;

-- 8. Meus convites pendentes (para responder): projeto, título e quem convidou. Sem e-mails.
create or replace function public.list_my_project_invites()
returns table (member_id uuid, project_id uuid, project_title text, invited_by uuid, inviter_name text,
               inviter_avatar text, created_at timestamptz)
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
  select m.id, m.project_id, wp.title, m.invited_by, p.full_name, p.avatar_url, m.created_at
    from public.workspace_project_members m
    join public.workspace_projects wp on wp.id = m.project_id
    left join public.profiles p on p.id = m.invited_by
   where m.user_id = v_me and m.status = 'pending'
   order by m.created_at desc, m.id;
end $$;

-- 9. Permissões mínimas: nada para PUBLIC/anon; o helper de notificação não é executável pelo
--    cliente. (O Supabase concede EXECUTE por padrão em funções novas; por isso tudo é revogado.)
revoke all on function public.workspace_project_members_notify(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.invite_project_member(uuid, text)      from public, anon, authenticated;
revoke all on function public.respond_project_invite(uuid, boolean)  from public, anon, authenticated;
revoke all on function public.remove_project_member(uuid)            from public, anon, authenticated;
revoke all on function public.leave_project(uuid)                    from public, anon, authenticated;
revoke all on function public.list_project_members(uuid)             from public, anon, authenticated;
revoke all on function public.list_my_project_invites()              from public, anon, authenticated;
grant execute on function public.invite_project_member(uuid, text)     to authenticated;
grant execute on function public.respond_project_invite(uuid, boolean) to authenticated;
grant execute on function public.remove_project_member(uuid)           to authenticated;
grant execute on function public.leave_project(uuid)                   to authenticated;
grant execute on function public.list_project_members(uuid)            to authenticated;
grant execute on function public.list_my_project_invites()             to authenticated;

commit;

-- =====================================================================================
-- VERIFICAÇÃO PÓS-MIGRAÇÃO (somente leitura). Esperado:
--   tabela com RLS ativa, sem políticas e sem privilégios para anon/authenticated;
--   funções security_definer=true, search_path vazio; helper de notificação sem EXECUTE para
--   anon/authenticated; demais funções com EXECUTE só para authenticated;
--   nenhuma função de acesso existente (workspace_project_accessible etc.) alterada.
-- select relname, relrowsecurity from pg_class where oid = 'public.workspace_project_members'::regclass;
-- select count(*) as policies from pg_policies where schemaname = 'public' and tablename = 'workspace_project_members';
-- select r.role, has_table_privilege(r.role, 'public.workspace_project_members', 'SELECT, INSERT, UPDATE, DELETE') as any_privilege
--   from (values ('anon'), ('authenticated')) as r(role);
-- select p.proname, p.prosecdef, p.proconfig,
--        has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('workspace_project_members_notify', 'invite_project_member', 'respond_project_invite',
--                      'remove_project_member', 'leave_project', 'list_project_members', 'list_my_project_invites')
--  order by p.proname;
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.workspace_project_members'::regclass order by conname;
--
-- ROLLBACK (manual, somente se necessário; convites e participantes registrados serão perdidos):
-- begin;
--   delete from public.notifications where type in ('project_invite', 'project_invite_accepted');
--   drop function if exists public.list_my_project_invites();
--   drop function if exists public.list_project_members(uuid);
--   drop function if exists public.leave_project(uuid);
--   drop function if exists public.remove_project_member(uuid);
--   drop function if exists public.respond_project_invite(uuid, boolean);
--   drop function if exists public.invite_project_member(uuid, text);
--   drop function if exists public.workspace_project_members_notify(uuid, uuid, text, text);
--   drop table if exists public.workspace_project_members;
-- commit;
-- =====================================================================================

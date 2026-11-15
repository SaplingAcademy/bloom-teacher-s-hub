-- =====================================================================================
-- Bloom · Workspace colaborativo · Etapa 2: acesso compartilhado aos projetos · aplicação MANUAL
--
-- Pré-requisitos já aplicados: mural por projeto (workspace_project_accessible/_writable,
-- workspace_note_writable, trigger workspace_notes_keep_identity) e Etapa 1
-- (public.workspace_project_members + RPCs). Nada da Etapa 1 é recriado.
--
-- Regras:
--   * Acesso = dono (workspace_projects.user_id) OU participante com status 'accepted'.
--     Convites 'pending'/'declined' não concedem nada. As funções de acesso leem
--     workspace_project_members a cada consulta: remover ou sair revoga na hora.
--   * Participantes leem e editam projeto (título, descrição, cor, ícone, datas), fases,
--     itens e o mural do projeto enquanto ele estiver ATIVO; projetos arquivados ficam só
--     leitura para eles.
--   * Somente o dono: arquivar/reativar (status), excluir o projeto, convidar e remover
--     (RPCs da Etapa 1). user_id/id do projeto nunca mudam.
--   * Fases e itens continuam com user_id = dono do projeto (FKs compostas atuais): um
--     trigger preenche o dono no INSERT, ignorando o valor enviado pelo cliente. project_id e
--     user_id ficam imutáveis; item só pode apontar para fase do mesmo projeto.
--   * Mural do projeto: participantes veem todas as notas e imagens, criam notas próprias e
--     editam/movem/travam qualquer nota. Imagens só pelo autor da nota (como hoje). Excluir
--     nota: autor ou dono do projeto. Mural pessoal (project_id IS NULL) não muda.
--   * Storage (workspace-media): leitura de arquivos de notas de projetos acessíveis; o dono
--     do projeto pode apagar arquivos de notas do projeto (limpeza ao excluir nota/projeto).
--     Arquivos de notas de projeto exigem acesso atual ao projeto também para o próprio autor.
--
-- Estratégia: as políticas existentes (PERMISSIVE por user_id) NÃO são alteradas nem
-- removidas. Novas políticas PERMISSIVE acrescentam o acesso de participantes; políticas
-- RESTRICTIVE novas só atuam em notas/arquivos de projeto. Projetos individuais (sem linhas
-- em workspace_project_members) continuam exatamente como hoje.
-- =====================================================================================
begin;

-- 0. Pré-checagens: abortam sem alterar nada se o ambiente não for o esperado.
do $$
begin
  if to_regclass('public.workspace_projects') is null or to_regclass('public.workspace_project_phases') is null
     or to_regclass('public.workspace_project_items') is null or to_regclass('public.workspace_notes') is null
     or to_regclass('public.workspace_note_images') is null then
    raise exception 'Tabelas do Workspace ausentes';
  end if;
  if to_regclass('public.workspace_project_members') is null
     or to_regprocedure('public.list_project_members(uuid)') is null then
    raise exception 'Etapa 1 (workspace_project_members) não aplicada';
  end if;
  if to_regprocedure('public.workspace_project_accessible(uuid)') is null
     or to_regprocedure('public.workspace_project_writable(uuid)') is null
     or to_regprocedure('public.workspace_note_writable(uuid)') is null
     or not exists (select 1 from pg_trigger where tgrelid = 'public.workspace_notes'::regclass
                    and tgname = 'workspace_notes_keep_identity' and not tgisinternal) then
    raise exception 'Migração do mural por projeto ausente (funções de acesso ou trigger workspace_notes_keep_identity)';
  end if;
  if (select count(*) from information_schema.columns where table_schema = 'public'
        and ((table_name = 'workspace_projects' and column_name in ('id', 'user_id', 'status'))
          or (table_name = 'workspace_project_phases' and column_name in ('id', 'project_id', 'user_id'))
          or (table_name = 'workspace_project_items' and column_name in ('id', 'project_id', 'user_id', 'phase_id'))
          or (table_name = 'workspace_notes' and column_name in ('id', 'project_id', 'user_id'))
          or (table_name = 'workspace_note_images' and column_name in ('note_id', 'user_id')))) <> 15 then
    raise exception 'Colunas esperadas ausentes nas tabelas do Workspace';
  end if;
  -- Políticas RESTRICTIVE existentes em projetos/fases/itens bloqueariam participantes.
  if exists (select 1 from pg_policies where schemaname = 'public' and permissive = 'RESTRICTIVE'
             and tablename in ('workspace_projects', 'workspace_project_phases', 'workspace_project_items')) then
    raise exception 'Há políticas RESTRICTIVE em projetos/fases/itens: revisar antes de aplicar';
  end if;
  -- Notas/imagens: as únicas RESTRICTIVE compatíveis são as do mural por projeto (todas presentes,
  -- nenhuma outra). Uma restrição desconhecida (ex.: user_id = auth.uid()) esconderia o mural dos
  -- participantes. Cada uma é comparada por tabela, comando, papéis, USING e WITH CHECK; a
  -- comparação ignora apenas espaços e o prefixo "public." (depende do search_path da sessão).
  if exists (
    with expected(policyname, tablename, cmd, using_expr, check_expr) as (values
      ('workspace_notes_project_scope_select',       'workspace_notes',       'SELECT', '((project_id IS NULL) OR workspace_project_accessible(project_id))', ''),
      ('workspace_notes_project_scope_insert',       'workspace_notes',       'INSERT', '', '((project_id IS NULL) OR workspace_project_writable(project_id))'),
      ('workspace_notes_project_scope_update',       'workspace_notes',       'UPDATE', '((project_id IS NULL) OR workspace_project_writable(project_id))', '((project_id IS NULL) OR workspace_project_writable(project_id))'),
      ('workspace_notes_project_scope_delete',       'workspace_notes',       'DELETE', '((project_id IS NULL) OR workspace_project_writable(project_id))', ''),
      ('workspace_note_images_project_scope_insert', 'workspace_note_images', 'INSERT', '', 'workspace_note_writable(note_id)'),
      ('workspace_note_images_project_scope_update', 'workspace_note_images', 'UPDATE', 'workspace_note_writable(note_id)', 'workspace_note_writable(note_id)'),
      ('workspace_note_images_project_scope_delete', 'workspace_note_images', 'DELETE', 'workspace_note_writable(note_id)', ''))
    select 1 from expected e
      left join pg_policies p on p.schemaname = 'public' and p.policyname = e.policyname
     where p.policyname is null
        or p.permissive <> 'RESTRICTIVE' or p.tablename <> e.tablename or p.cmd <> e.cmd
        or p.roles <> array['authenticated']::name[]
        or regexp_replace(lower(coalesce(p.qual, '')), '\s+|public\.', '', 'g')       <> regexp_replace(lower(e.using_expr), '\s+|public\.', '', 'g')
        or regexp_replace(lower(coalesce(p.with_check, '')), '\s+|public\.', '', 'g') <> regexp_replace(lower(e.check_expr), '\s+|public\.', '', 'g')
  ) then
    raise exception 'Políticas RESTRICTIVE do mural por projeto ausentes ou com definição diferente do esperado (USING/WITH CHECK, comando, tabela ou papéis)';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and permissive = 'RESTRICTIVE'
             and tablename in ('workspace_notes', 'workspace_note_images')
             and policyname not in ('workspace_notes_project_scope_select', 'workspace_notes_project_scope_insert',
                                    'workspace_notes_project_scope_update', 'workspace_notes_project_scope_delete',
                                    'workspace_note_images_project_scope_insert', 'workspace_note_images_project_scope_update',
                                    'workspace_note_images_project_scope_delete',
                                    'workspace_note_images_project_scope_select')) then  -- criada por esta etapa (reexecução)
    raise exception 'Há políticas RESTRICTIVE desconhecidas em notas/imagens: revisar antes de aplicar';
  end if;
  -- Storage: uma RESTRICTIVE existente sobre workspace-media poderia bloquear a leitura compartilhada.
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and permissive = 'RESTRICTIVE'
             and coalesce(qual, '') || coalesce(with_check, '') ilike '%workspace-media%'
             and policyname not like 'workspace_media_project_scope_%') then
    raise exception 'Há políticas RESTRICTIVE em storage.objects para workspace-media: revisar antes de aplicar';
  end if;
  if exists (select 1 from pg_policies where policyname in (
               'workspace_projects_member_select', 'workspace_projects_member_update',
               'workspace_project_phases_member_select', 'workspace_project_phases_member_insert',
               'workspace_project_phases_member_update', 'workspace_project_phases_member_delete',
               'workspace_project_items_member_select', 'workspace_project_items_member_insert',
               'workspace_project_items_member_update', 'workspace_project_items_member_delete',
               'workspace_notes_member_select', 'workspace_notes_member_update', 'workspace_notes_project_owner_delete',
               'workspace_note_images_member_select', 'workspace_note_images_project_scope_select',
               'workspace_media_project_read', 'workspace_media_project_owner_delete',
               'workspace_media_project_scope_select', 'workspace_media_project_scope_insert',
               'workspace_media_project_scope_update', 'workspace_media_project_scope_delete')) then
    raise exception 'Políticas da Etapa 2 já existem (migração já aplicada?)';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname in ('workspace_project_owner', 'workspace_note_accessible',
               'workspace_media_note_rule', 'workspace_projects_guard', 'workspace_project_children_guard')) then
    raise exception 'Funções da Etapa 2 já existem';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and coalesce(qual, '') || coalesce(with_check, '') ilike '%workspace-media%') then
    raise exception 'storage.objects sem políticas para workspace-media';
  end if;
end $$;

-- 1. Funções de acesso: só o corpo muda (assinaturas, políticas e permissões atuais são mantidas).
--    Acessível = dono ou participante aceito; editável = acessível e projeto ativo.
create or replace function public.workspace_project_accessible(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_projects p
    where p.id = p_project
      and (p.user_id = (select auth.uid())
           or exists (select 1 from public.workspace_project_members m
                      where m.project_id = p.id and m.user_id = (select auth.uid()) and m.status = 'accepted'))
  );
$$;

create or replace function public.workspace_project_writable(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_projects p
    where p.id = p_project and p.status = 'active'
      and (p.user_id = (select auth.uid())
           or exists (select 1 from public.workspace_project_members m
                      where m.project_id = p.id and m.user_id = (select auth.uid()) and m.status = 'accepted'))
  );
$$;
-- workspace_note_writable(uuid) não muda: continua exigindo o autor da nota (imagens só pelo
-- autor) e, em notas de projeto, workspace_project_writable (agora com participantes).

-- Somente o dono (qualquer status).
create or replace function public.workspace_project_owner(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.workspace_projects p where p.id = p_project and p.user_id = (select auth.uid()));
$$;

-- Nota visível: pessoal do próprio professor, ou de projeto acessível.
create or replace function public.workspace_note_accessible(p_note uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_notes n
    where n.id = p_note
      and ((n.project_id is null and n.user_id = (select auth.uid()))
           or (n.project_id is not null and public.workspace_project_accessible(n.project_id)))
  );
$$;

-- Regra de Storage para caminhos autor/notes/nota/arquivo de notas de PROJETO.
-- Retorna NULL quando o caminho não é de nota de projeto (formato diferente, nota inexistente,
-- autor diferente da pasta ou nota pessoal): nesses casos valem só as políticas atuais.
create or replace function public.workspace_media_note_rule(p_name text, p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[];
  v_project uuid;
  v_author uuid;
  v_me uuid := (select auth.uid());
begin
  if p_name is null or p_name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/notes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$' then
    return null;
  end if;
  v_parts := string_to_array(p_name, '/');
  select n.project_id, n.user_id into v_project, v_author
    from public.workspace_notes n where n.id = v_parts[3]::uuid;
  if v_project is null or v_author is distinct from v_parts[1]::uuid then
    return null;
  end if;
  return case p_action
    when 'read'         then public.workspace_project_accessible(v_project)
    when 'owner_delete' then public.workspace_project_owner(v_project)
    when 'write'        then v_author = v_me and public.workspace_project_writable(v_project)
    when 'delete'       then public.workspace_project_owner(v_project)
                             or (v_author = v_me and public.workspace_project_writable(v_project))
    else false
  end;
end $$;

revoke all on function public.workspace_project_owner(uuid)              from public, anon, authenticated;
revoke all on function public.workspace_note_accessible(uuid)            from public, anon, authenticated;
revoke all on function public.workspace_media_note_rule(text, text)      from public, anon, authenticated;
revoke all on function public.workspace_project_accessible(uuid)         from public, anon, authenticated;
revoke all on function public.workspace_project_writable(uuid)           from public, anon, authenticated;
-- Políticas RLS executam com o papel de quem consulta: authenticated precisa de EXECUTE.
grant execute on function public.workspace_project_owner(uuid)           to authenticated;
grant execute on function public.workspace_note_accessible(uuid)         to authenticated;
grant execute on function public.workspace_media_note_rule(text, text)   to authenticated;
grant execute on function public.workspace_project_accessible(uuid)      to authenticated;
grant execute on function public.workspace_project_writable(uuid)        to authenticated;

-- 2. Proteções do projeto: id/user_id imutáveis; status (arquivar/reativar) só pelo dono.
--    Sem auth.uid(), só operação administrativa: sem papel JWT na sessão (SQL Editor/postgres)
--    ou papel JWT service_role. Requisições anon/authenticated sem sub são recusadas.
create or replace function public.workspace_projects_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_jwt_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                              nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role');
begin
  if new.id is distinct from old.id or new.user_id is distinct from old.user_id then
    raise exception 'workspace_project_owner_immutable';
  end if;
  if new.status is distinct from old.status
     and v_uid is distinct from old.user_id
     and not (v_uid is null and (v_jwt_role is null or v_jwt_role = 'service_role')) then
    raise exception 'workspace_project_owner_only';
  end if;
  return new;
end $$;

create trigger workspace_projects_guard
  before update on public.workspace_projects
  for each row execute function public.workspace_projects_guard();

-- 3. Fases e itens: user_id = dono do projeto (definido pelo banco no INSERT), project_id e
--    user_id imutáveis, e item só em fase do mesmo projeto.
create or replace function public.workspace_project_children_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if tg_op = 'INSERT' then
    select p.user_id into v_owner from public.workspace_projects p where p.id = new.project_id;
    if v_owner is not null then
      new.user_id := v_owner;
    end if;
  else
    if new.project_id is distinct from old.project_id
       or (new.user_id is not null and new.user_id is distinct from old.user_id) then
      raise exception 'workspace_project_child_immutable';
    end if;
  end if;
  -- Fases não têm phase_id: a checagem fica num bloco separado (PL/pgSQL não abrevia AND).
  if tg_table_name = 'workspace_project_items' then
    if new.phase_id is not null
       and (tg_op = 'INSERT' or new.phase_id is distinct from old.phase_id)
       and not exists (select 1 from public.workspace_project_phases ph
                       where ph.id = new.phase_id and ph.project_id = new.project_id) then
      raise exception 'workspace_item_phase_mismatch';
    end if;
  end if;
  return new;
end $$;

revoke all on function public.workspace_projects_guard()         from public, anon, authenticated;
revoke all on function public.workspace_project_children_guard() from public, anon, authenticated;

create trigger workspace_project_phases_guard
  before insert or update on public.workspace_project_phases
  for each row execute function public.workspace_project_children_guard();

create trigger workspace_project_items_guard
  before insert or update on public.workspace_project_items
  for each row execute function public.workspace_project_children_guard();

-- 4. Políticas PERMISSIVE novas (somadas às atuais por user_id, que continuam intactas).
--    Projetos: participantes leem; editam só projetos ativos. Sem INSERT/DELETE para eles.
create policy workspace_projects_member_select on public.workspace_projects
  for select to authenticated using (public.workspace_project_accessible(id));
create policy workspace_projects_member_update on public.workspace_projects
  for update to authenticated
  using (public.workspace_project_writable(id)) with check (public.workspace_project_writable(id));

create policy workspace_project_phases_member_select on public.workspace_project_phases
  for select to authenticated using (public.workspace_project_accessible(project_id));
create policy workspace_project_phases_member_insert on public.workspace_project_phases
  for insert to authenticated with check (public.workspace_project_writable(project_id));
create policy workspace_project_phases_member_update on public.workspace_project_phases
  for update to authenticated
  using (public.workspace_project_writable(project_id)) with check (public.workspace_project_writable(project_id));
create policy workspace_project_phases_member_delete on public.workspace_project_phases
  for delete to authenticated using (public.workspace_project_writable(project_id));

create policy workspace_project_items_member_select on public.workspace_project_items
  for select to authenticated using (public.workspace_project_accessible(project_id));
create policy workspace_project_items_member_insert on public.workspace_project_items
  for insert to authenticated with check (public.workspace_project_writable(project_id));
create policy workspace_project_items_member_update on public.workspace_project_items
  for update to authenticated
  using (public.workspace_project_writable(project_id)) with check (public.workspace_project_writable(project_id));
create policy workspace_project_items_member_delete on public.workspace_project_items
  for delete to authenticated using (public.workspace_project_writable(project_id));

-- Mural do projeto: ver todas as notas; editar qualquer nota (autor e mural imutáveis pelo
-- trigger existente); excluir notas de outros autores só o dono. Criar continua pelo autor
-- (política atual) com a restrição existente de projeto editável.
create policy workspace_notes_member_select on public.workspace_notes
  for select to authenticated
  using (project_id is not null and public.workspace_project_accessible(project_id));
create policy workspace_notes_member_update on public.workspace_notes
  for update to authenticated
  using (project_id is not null and public.workspace_project_writable(project_id))
  with check (project_id is not null and public.workspace_project_writable(project_id));
create policy workspace_notes_project_owner_delete on public.workspace_notes
  for delete to authenticated
  using (project_id is not null and public.workspace_project_owner(project_id));

-- Imagens: leitura de todas as imagens de notas visíveis. Gravar/remover continua só pelo
-- autor (políticas atuais + restrições do mural). A restrição de leitura revoga também os
-- registros do próprio ex-participante.
create policy workspace_note_images_member_select on public.workspace_note_images
  for select to authenticated using (public.workspace_note_accessible(note_id));
create policy workspace_note_images_project_scope_select on public.workspace_note_images
  as restrictive for select to authenticated using (public.workspace_note_accessible(note_id));

-- 5. Storage (bucket workspace-media). As políticas atuais (pasta do próprio professor) ficam.
--    Novas PERMISSIVE: ler arquivos de notas de projetos acessíveis; dono do projeto apaga
--    arquivos das notas do projeto. Novas RESTRICTIVE: só afetam arquivos de notas de projeto
--    (rule NULL = sem efeito) e exigem acesso atual ao projeto, inclusive para o autor.
create policy workspace_media_project_read on storage.objects
  for select to authenticated
  using (bucket_id = 'workspace-media' and coalesce(public.workspace_media_note_rule(name, 'read'), false));
create policy workspace_media_project_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'workspace-media' and coalesce(public.workspace_media_note_rule(name, 'owner_delete'), false));

create policy workspace_media_project_scope_select on storage.objects
  as restrictive for select to authenticated
  using (bucket_id <> 'workspace-media' or coalesce(public.workspace_media_note_rule(name, 'read'), true));
create policy workspace_media_project_scope_insert on storage.objects
  as restrictive for insert to authenticated
  with check (bucket_id <> 'workspace-media' or coalesce(public.workspace_media_note_rule(name, 'write'), true));
create policy workspace_media_project_scope_update on storage.objects
  as restrictive for update to authenticated
  using (bucket_id <> 'workspace-media' or coalesce(public.workspace_media_note_rule(name, 'write'), true))
  with check (bucket_id <> 'workspace-media' or coalesce(public.workspace_media_note_rule(name, 'write'), true));
create policy workspace_media_project_scope_delete on storage.objects
  as restrictive for delete to authenticated
  using (bucket_id <> 'workspace-media' or coalesce(public.workspace_media_note_rule(name, 'delete'), true));

commit;

-- =====================================================================================
-- VERIFICAÇÃO PÓS-MIGRAÇÃO: consulta separada (somente leitura), entregue junto com este
-- arquivo como bloom_workspace_colaborativo_etapa2_verificacao.
--
-- ROLLBACK (manual, somente se necessário). Restaura as funções de acesso "somente dono" do
-- mural por projeto e remove tudo o que esta etapa criou. Dados não são apagados: fases e
-- itens criados por participantes já pertencem ao dono do projeto; notas criadas por
-- participantes continuam no mural do projeto (visíveis ao dono pelo mural, não ao autor).
-- begin;
--   drop policy if exists workspace_media_project_scope_delete on storage.objects;
--   drop policy if exists workspace_media_project_scope_update on storage.objects;
--   drop policy if exists workspace_media_project_scope_insert on storage.objects;
--   drop policy if exists workspace_media_project_scope_select on storage.objects;
--   drop policy if exists workspace_media_project_owner_delete on storage.objects;
--   drop policy if exists workspace_media_project_read on storage.objects;
--   drop policy if exists workspace_note_images_project_scope_select on public.workspace_note_images;
--   drop policy if exists workspace_note_images_member_select on public.workspace_note_images;
--   drop policy if exists workspace_notes_project_owner_delete on public.workspace_notes;
--   drop policy if exists workspace_notes_member_update on public.workspace_notes;
--   drop policy if exists workspace_notes_member_select on public.workspace_notes;
--   drop policy if exists workspace_project_items_member_delete on public.workspace_project_items;
--   drop policy if exists workspace_project_items_member_update on public.workspace_project_items;
--   drop policy if exists workspace_project_items_member_insert on public.workspace_project_items;
--   drop policy if exists workspace_project_items_member_select on public.workspace_project_items;
--   drop policy if exists workspace_project_phases_member_delete on public.workspace_project_phases;
--   drop policy if exists workspace_project_phases_member_update on public.workspace_project_phases;
--   drop policy if exists workspace_project_phases_member_insert on public.workspace_project_phases;
--   drop policy if exists workspace_project_phases_member_select on public.workspace_project_phases;
--   drop policy if exists workspace_projects_member_update on public.workspace_projects;
--   drop policy if exists workspace_projects_member_select on public.workspace_projects;
--   drop trigger if exists workspace_project_items_guard on public.workspace_project_items;
--   drop trigger if exists workspace_project_phases_guard on public.workspace_project_phases;
--   drop trigger if exists workspace_projects_guard on public.workspace_projects;
--   drop function if exists public.workspace_project_children_guard();
--   drop function if exists public.workspace_projects_guard();
--   drop function if exists public.workspace_media_note_rule(text, text);
--   drop function if exists public.workspace_note_accessible(uuid);
--   drop function if exists public.workspace_project_owner(uuid);
--   create or replace function public.workspace_project_accessible(p_project uuid)
--   returns boolean language sql stable security definer set search_path = '' as $$
--     select exists (select 1 from public.workspace_projects p
--                    where p.id = p_project and p.user_id = (select auth.uid()));
--   $$;
--   create or replace function public.workspace_project_writable(p_project uuid)
--   returns boolean language sql stable security definer set search_path = '' as $$
--     select exists (select 1 from public.workspace_projects p
--                    where p.id = p_project and p.user_id = (select auth.uid()) and p.status = 'active');
--   $$;
-- commit;
-- =====================================================================================

-- Migration: Bloom Community Content Ownership, Immutable Version History, Soft Delete, Draft Autosave, and Concurrency Control
-- Date: 2026-08-08

-- =========================================================================
-- 1. EXTEND COMMUNITY_POSTS & COMMENTS FOR SOFT DELETE & VERSIONING
-- =========================================================================

alter table public.community_posts
  add column if not exists version_number integer default 1 not null,
  add column if not exists is_edited boolean default false not null,
  add column if not exists last_edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists deletion_reason text;

alter table public.comments
  add column if not exists version_number integer default 1 not null,
  add column if not exists is_edited boolean default false not null,
  add column if not exists last_edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists deletion_reason text;

-- =========================================================================
-- 2. CREATE IMMUTABLE VERSION HISTORY TABLE (COMMUNITY_POST_VERSIONS)
-- =========================================================================

create table if not exists public.community_post_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.community_posts(id) on delete restrict not null,
  author_id uuid references public.profiles(id) on delete cascade not null,
  version_number integer not null,
  title_snapshot text not null,
  content_snapshot text not null,
  metadata_snapshot jsonb default '{}'::jsonb not null,
  edit_reason text,
  change_type text default 'edit' not null, -- 'edit', 'restoration', 'accepted_solution_update'
  created_at timestamptz default now() not null,
  created_by uuid references public.profiles(id) on delete cascade not null,
  checksum text,
  constraint unique_post_version_number unique (post_id, version_number)
);

-- =========================================================================
-- 3. CREATE PRIVATE DRAFTS AUTOSAVE TABLE (COMMUNITY_DRAFTS)
-- =========================================================================

create table if not exists public.community_drafts (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  draft_type text default 'post' not null, -- 'post', 'comment', 'article'
  linked_post_id uuid references public.community_posts(id) on delete cascade,
  title text,
  content text,
  metadata jsonb default '{}'::jsonb not null,
  last_saved_at timestamptz default now() not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- =========================================================================
-- 4. ROW LEVEL SECURITY (RLS) & IMMUTABILITY POLICIES
-- =========================================================================

alter table public.community_post_versions enable row level security;
alter table public.community_drafts enable row level security;

-- 4.1 community_post_versions policies
drop policy if exists "Read post versions for non-deleted posts" on public.community_post_versions;
drop policy if exists "Insert post versions by author" on public.community_post_versions;

create policy "Read post versions for non-deleted posts" on public.community_post_versions
  for select to authenticated using (true);

create policy "Insert post versions by author" on public.community_post_versions
  for insert to authenticated
  with check (auth.uid() = created_by);

-- Explicitly disallow UPDATE or DELETE on version records to ensure strict immutability
drop policy if exists "Disallow update on versions" on public.community_post_versions;
drop policy if exists "Disallow delete on versions" on public.community_post_versions;

-- 4.2 community_drafts policies (Strict owner privacy)
drop policy if exists "Manage own community drafts" on public.community_drafts;

create policy "Manage own community drafts" on public.community_drafts
  for all to authenticated
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- =========================================================================
-- 5. INDEXES FOR FAST LOOKUPS
-- =========================================================================

create index if not exists idx_post_versions_post_id on public.community_post_versions(post_id, version_number desc);
create index if not exists idx_community_drafts_teacher_type on public.community_drafts(teacher_id, draft_type);
create index if not exists idx_community_posts_deleted_at on public.community_posts(deleted_at) where deleted_at is null;

-- =========================================================================
-- 6. RPC: EDIT_COMMUNITY_POST (TRANSACTIONAL + OPTIMISTIC CONCURRENCY CHECK)
-- =========================================================================

create or replace function public.edit_community_post(
  p_post_id uuid,
  p_teacher_id uuid,
  p_new_title text,
  p_new_content text,
  p_edit_reason text default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_post record;
  v_new_version integer;
  v_version_id uuid;
begin
  -- Auth check
  if auth.uid() is null or auth.uid() <> p_teacher_id then
    return jsonb_build_object('success', false, 'error', 'Unauthorized access');
  end if;

  -- Lock current post for update
  select * into v_current_post
  from public.community_posts
  where id = p_post_id and author_id = p_teacher_id and deleted_at is null
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Post not found or unauthorized');
  end if;

  -- Optimistic concurrency check: if expected version passed, ensure post was not modified concurrently
  if p_expected_version is not null and v_current_post.version_number <> p_expected_version then
    return jsonb_build_object(
      'success', false,
      'concurrency_conflict', true,
      'current_version', v_current_post.version_number,
      'error', 'Outra sessão modificou esta publicação. Atualize a página para ver as alterações recentes.'
    );
  end if;

  -- 1. Insert snapshot of current version into community_post_versions
  insert into public.community_post_versions (
    post_id,
    author_id,
    version_number,
    title_snapshot,
    content_snapshot,
    metadata_snapshot,
    edit_reason,
    change_type,
    created_by
  ) values (
    v_current_post.id,
    v_current_post.author_id,
    v_current_post.version_number,
    v_current_post.title,
    v_current_post.content,
    jsonb_build_object(
      'tags', v_current_post.tags,
      'subject_garden_id', v_current_post.subject_garden_id,
      'thematic_garden_ids', v_current_post.thematic_garden_ids,
      'water_count', v_current_post.water_count,
      'growth_stage', v_current_post.growth_stage
    ),
    p_edit_reason,
    'edit',
    p_teacher_id
  )
  returning id into v_version_id;

  v_new_version := v_current_post.version_number + 1;

  -- 2. Update community_posts main record
  update public.community_posts
  set
    title = p_new_title,
    content = p_new_content,
    version_number = v_new_version,
    is_edited = true,
    last_edited_at = now(),
    updated_at = now()
  where id = p_post_id;

  return jsonb_build_object(
    'success', true,
    'post_id', p_post_id,
    'new_version_number', v_new_version,
    'version_snapshot_id', v_version_id
  );
exception
  when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;

-- =========================================================================
-- 7. RPC: RESTORE_COMMUNITY_POST_VERSION
-- =========================================================================

create or replace function public.restore_community_post_version(
  p_post_id uuid,
  p_teacher_id uuid,
  p_target_version_number integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_post record;
  v_target_version record;
  v_new_version integer;
begin
  if auth.uid() is null or auth.uid() <> p_teacher_id then
    return jsonb_build_object('success', false, 'error', 'Unauthorized access');
  end if;

  select * into v_current_post
  from public.community_posts
  where id = p_post_id and author_id = p_teacher_id and deleted_at is null
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Post not found or unauthorized');
  end if;

  select * into v_target_version
  from public.community_post_versions
  where post_id = p_post_id and version_number = p_target_version_number;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Versão alvo não encontrada');
  end if;

  -- Save current version snapshot before restoring
  insert into public.community_post_versions (
    post_id,
    author_id,
    version_number,
    title_snapshot,
    content_snapshot,
    metadata_snapshot,
    edit_reason,
    change_type,
    created_by
  ) values (
    v_current_post.id,
    v_current_post.author_id,
    v_current_post.version_number,
    v_current_post.title,
    v_current_post.content,
    jsonb_build_object('tags', v_current_post.tags),
    'Restauração para a versão #' || p_target_version_number,
    'restoration',
    p_teacher_id
  );

  v_new_version := v_current_post.version_number + 1;

  -- Update post with snapshot content
  update public.community_posts
  set
    title = v_target_version.title_snapshot,
    content = v_target_version.content_snapshot,
    version_number = v_new_version,
    is_edited = true,
    last_edited_at = now(),
    updated_at = now()
  where id = p_post_id;

  return jsonb_build_object(
    'success', true,
    'new_version_number', v_new_version,
    'restored_from_version', p_target_version_number
  );
exception
  when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;

-- =========================================================================
-- 8. RPC: SOFT_DELETE_COMMUNITY_POST
-- =========================================================================

create or replace function public.soft_delete_community_post(
  p_post_id uuid,
  p_teacher_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> p_teacher_id then
    return jsonb_build_object('success', false, 'error', 'Unauthorized access');
  end if;

  update public.community_posts
  set
    deleted_at = now(),
    deleted_by = p_teacher_id,
    deletion_reason = p_reason,
    updated_at = now()
  where id = p_post_id and author_id = p_teacher_id;

  return jsonb_build_object('success', true, 'post_id', p_post_id);
exception
  when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';

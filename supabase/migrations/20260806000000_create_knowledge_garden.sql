-- Migration: Bloom Knowledge Garden & "Regar" (Watering) Interaction Model
-- Date: 2026-08-06
-- Scope: Replaces traditional Likes/Reactions with 🌱 Regar, daily limit enforcement, growth stages, and Cultivar (Meu Jardim)

-- =========================================================================
-- 1. EXTEND COMMUNITY_POSTS & COMMENTS TABLES
-- =========================================================================

alter table public.community_posts
  add column if not exists water_count integer default 0 not null,
  add column if not exists growth_stage text default 'seedling' not null, -- 'seedling', 'growing', 'blooming', 'favorite', 'reference'
  add column if not exists is_accepted_solution boolean default false not null,
  add column if not exists is_community_article boolean default false not null,
  add column if not exists article_contributors jsonb default '[]'::jsonb not null;

alter table public.comments
  add column if not exists water_count integer default 0 not null,
  add column if not exists is_accepted_answer boolean default false not null;

-- =========================================================================
-- 2. CREATE IDEA_WATERINGS TABLE (DAILY QUOTA TRACKING)
-- =========================================================================

create table if not exists public.idea_waterings (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  post_id uuid references public.community_posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  watered_at timestamptz default now() not null,
  watered_date date default current_date not null,
  constraint only_one_water_target check (
    (post_id is not null and comment_id is null) or
    (post_id is null and comment_id is not null)
  ),
  constraint unique_teacher_post_water unique (teacher_id, post_id),
  constraint unique_teacher_comment_water unique (teacher_id, comment_id)
);

-- =========================================================================
-- 3. CREATE CULTIVATED_ITEMS TABLE (MEU JARDIM / SAVED RESOURCES)
-- =========================================================================

create table if not exists public.cultivated_items (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  post_id uuid references public.community_posts(id) on delete cascade not null,
  item_type text default 'discussion' not null, -- 'discussion', 'resource', 'activity'
  cultivated_at timestamptz default now() not null,
  constraint unique_teacher_cultivated_post unique (teacher_id, post_id)
);

-- =========================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

alter table public.idea_waterings enable row level security;
alter table public.cultivated_items enable row level security;

-- 4.1 idea_waterings policies
drop policy if exists "Read all waterings" on public.idea_waterings;
drop policy if exists "Manage own waterings" on public.idea_waterings;

create policy "Read all waterings" on public.idea_waterings
  for select to authenticated using (true);

create policy "Manage own waterings" on public.idea_waterings
  for all to authenticated
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- 4.2 cultivated_items policies
drop policy if exists "Manage own cultivated items" on public.cultivated_items;

create policy "Manage own cultivated items" on public.cultivated_items
  for all to authenticated
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- =========================================================================
-- 5. INDEXES FOR PERFORMANCE
-- =========================================================================

create index if not exists idx_idea_waterings_teacher_date on public.idea_waterings(teacher_id, watered_date);
create index if not exists idx_idea_waterings_post on public.idea_waterings(post_id);
create index if not exists idx_cultivated_items_teacher on public.cultivated_items(teacher_id);
create index if not exists idx_community_posts_water_count on public.community_posts(water_count desc);
create index if not exists idx_community_posts_growth_stage on public.community_posts(growth_stage);

-- =========================================================================
-- 6. RPC: WATER_IDEA (ENFORCES 5 WATERINGS/DAY LIMIT & UPDATES GROWTH STAGE)
-- =========================================================================

create or replace function public.water_idea(
  p_teacher_id uuid,
  p_post_id uuid default null,
  p_comment_id uuid default null,
  p_daily_limit integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today_date date := current_date;
  v_used_today integer;
  v_new_water_count integer;
  v_new_stage text;
  v_already_watered boolean;
begin
  -- Auth verification
  if auth.uid() is null or auth.uid() <> p_teacher_id then
    return jsonb_build_object('success', false, 'error', 'Unauthorized access');
  end if;

  if p_post_id is null and p_comment_id is null then
    return jsonb_build_object('success', false, 'error', 'Must specify post_id or comment_id');
  end if;

  -- Check if already watered this item
  if p_post_id is not null then
    select exists (
      select 1 from public.idea_waterings
      where teacher_id = p_teacher_id and post_id = p_post_id
    ) into v_already_watered;
  else
    select exists (
      select 1 from public.idea_waterings
      where teacher_id = p_teacher_id and comment_id = p_comment_id
    ) into v_already_watered;
  end if;

  if v_already_watered then
    return jsonb_build_object(
      'success', false,
      'already_watered', true,
      'error', 'Você já regou esta ideia!'
    );
  end if;

  -- Check daily quota used
  select count(*) into v_used_today
  from public.idea_waterings
  where teacher_id = p_teacher_id and watered_date = v_today_date;

  if v_used_today >= p_daily_limit then
    return jsonb_build_object(
      'success', false,
      'limit_reached', true,
      'used_today', v_used_today,
      'daily_limit', p_daily_limit,
      'error', 'Você usou suas ' || p_daily_limit || ' regadas de hoje. Volte amanhã para cultivar mais ideias!'
    );
  end if;

  -- Insert watering record
  insert into public.idea_waterings (teacher_id, post_id, comment_id, watered_date)
  values (p_teacher_id, p_post_id, p_comment_id, v_today_date);

  -- Update post or comment water_count & recalculate growth stage
  if p_post_id is not null then
    update public.community_posts
    set water_count = water_count + 1
    where id = p_post_id
    returning water_count into v_new_water_count;

    -- Calculate stage based on watering count
    if v_new_water_count >= 50 then
      v_new_stage := 'reference'; -- 🌳 Referência Bloom
    elsif v_new_water_count >= 30 then
      v_new_stage := 'favorite';  -- 🌸 Favorita da Comunidade
    elsif v_new_water_count >= 15 then
      v_new_stage := 'blooming';  -- 🌼 Florindo
    elsif v_new_water_count >= 5 then
      v_new_stage := 'growing';   -- 🌿 Crescendo
    else
      v_new_stage := 'seedling';  -- 🌱 Mudinha
    end if;

    update public.community_posts
    set growth_stage = v_new_stage
    where id = p_post_id;
  else
    update public.comments
    set water_count = water_count + 1
    where id = p_comment_id
    returning water_count into v_new_water_count;
  end if;

  return jsonb_build_object(
    'success', true,
    'water_count', v_new_water_count,
    'growth_stage', v_new_stage,
    'used_today', v_used_today + 1,
    'remaining_today', p_daily_limit - (v_used_today + 1)
  );
exception
  when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';

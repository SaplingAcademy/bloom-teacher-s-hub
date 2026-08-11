-- Migration: Bloom Knowledge Ecosystem (Subject Gardens, Thematic Gardens, Bloom Library, Teacher Preferences)
-- Date: 2026-08-07

-- =========================================================================
-- 1. CREATE SUBJECT GARDENS TABLE (WHAT TEACHERS TEACH)
-- =========================================================================

create table if not exists public.subject_gardens (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  category text default 'language' not null, -- 'language', 'science', 'arts', 'other'
  icon text default 'BookOpen',
  created_at timestamptz default now() not null
);

-- =========================================================================
-- 2. CREATE THEMATIC GARDENS TABLE (PEDAGOGICAL & PROFESSIONAL TOPICS)
-- =========================================================================

create table if not exists public.thematic_gardens (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  category text default 'methodology' not null, -- 'audience', 'methodology', 'tech', 'business'
  icon text default 'Sparkles',
  created_at timestamptz default now() not null
);

-- =========================================================================
-- 3. CREATE TEACHER GARDENS & PREFERENCES TABLES
-- =========================================================================

create table if not exists public.teacher_gardens (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade not null,
  garden_type text not null, -- 'subject', 'thematic'
  garden_id uuid not null,
  created_at timestamptz default now() not null,
  constraint unique_teacher_garden unique (teacher_id, garden_type, garden_id)
);

create table if not exists public.teacher_preferences (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade unique not null,
  preferred_content_language text default 'pt-BR' not null,
  preferred_ui_language text default 'pt-BR' not null,
  subjects_taught text[] default '{}'::text[] not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- =========================================================================
-- 4. CREATE BLOOM LIBRARY ARTICLES TABLE
-- =========================================================================

create table if not exists public.bloom_library_articles (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.community_posts(id) on delete cascade not null,
  title text not null,
  summary text not null,
  content text not null,
  contributors jsonb default '[]'::jsonb not null,
  category text default 'Article' not null,
  created_at timestamptz default now() not null
);

-- =========================================================================
-- 5. EXTEND COMMUNITY_POSTS FOR GECOSYSTEM METADATA
-- =========================================================================

alter table public.community_posts
  add column if not exists subject_garden_id uuid references public.subject_gardens(id) on delete set null,
  add column if not exists thematic_garden_ids uuid[] default '{}'::uuid[] not null,
  add column if not exists ai_metadata jsonb default '{}'::jsonb not null,
  add column if not exists original_language text default 'pt-BR' not null;

-- =========================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

alter table public.subject_gardens enable row level security;
alter table public.thematic_gardens enable row level security;
alter table public.teacher_gardens enable row level security;
alter table public.teacher_preferences enable row level security;
alter table public.bloom_library_articles enable row level security;

-- Read policies for public lookup
drop policy if exists "Read all subject gardens" on public.subject_gardens;
create policy "Read all subject gardens" on public.subject_gardens for select to authenticated using (true);

drop policy if exists "Read all thematic gardens" on public.thematic_gardens;
create policy "Read all thematic gardens" on public.thematic_gardens for select to authenticated using (true);

drop policy if exists "Read all library articles" on public.bloom_library_articles;
create policy "Read all library articles" on public.bloom_library_articles for select to authenticated using (true);

-- Owner policies
drop policy if exists "Manage own teacher gardens" on public.teacher_gardens;
create policy "Manage own teacher gardens" on public.teacher_gardens
  for all to authenticated
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

drop policy if exists "Manage own preferences" on public.teacher_preferences;
create policy "Manage own preferences" on public.teacher_preferences
  for all to authenticated
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- =========================================================================
-- 7. SEED INITIAL SUBJECT & THEMATIC GARDENS
-- =========================================================================

insert into public.subject_gardens (name, slug, category, icon)
values
  ('Inglês', 'english', 'language', 'Globe'),
  ('Espanhol', 'spanish', 'language', 'Globe'),
  ('Francês', 'french', 'language', 'Globe'),
  ('Italiano', 'italian', 'language', 'Globe'),
  ('Alemão', 'german', 'language', 'Globe'),
  ('Japonês', 'japanese', 'language', 'Globe'),
  ('Português', 'portuguese', 'language', 'Globe'),
  ('Matemática', 'math', 'science', 'BookOpen'),
  ('Programação', 'programming', 'science', 'Code')
on conflict (slug) do nothing;

insert into public.thematic_gardens (name, slug, category, icon)
values
  ('Crianças (Kids)', 'kids', 'audience', 'User'),
  ('Adolescentes (Teens)', 'teens', 'audience', 'Users'),
  ('Adultos', 'adults', 'audience', 'UserCheck'),
  ('Inglês para Negócios', 'business', 'methodology', 'Briefcase'),
  ('Conversação & Fluência', 'conversation', 'methodology', 'MessageSquare'),
  ('Gramática Prática', 'grammar', 'methodology', 'BookOpen'),
  ('Pronúncia & Fonética', 'pronunciation', 'methodology', 'Mic'),
  ('Gamificação', 'gamification', 'methodology', 'Sparkles'),
  ('Inteligência Artificial', 'ai', 'tech', 'Cpu'),
  ('Tecnologia Educacional', 'edtech', 'tech', 'Laptop'),
  ('Marketing & Leads', 'marketing', 'business', 'TrendingUp'),
  ('Gestão Financeira', 'finance', 'business', 'DollarSign')
on conflict (slug) do nothing;

-- Reload schema
notify pgrst, 'reload schema';

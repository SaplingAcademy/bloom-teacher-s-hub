-- ============================================================================
-- BLOOM ACADEMY — ETAPA 2C.2: Gerenciamento de conteúdos (SQL MANUAL)
-- ============================================================================
-- Execute este script UMA VEZ no SQL Editor do Supabase (projeto Bloom).
-- Pré-requisito: docs/migrations/20261105040000_roles_plans_manual.sql já
-- aplicado (user_roles + public.has_role).
--
-- Durante o desenvolvimento privado, SOMENTE super_admin lê/escreve estas
-- tabelas. A estrutura já prevê a futura leitura de conteúdos publicados
-- por professores Pro (política comentada na seção 6) — NÃO ative agora.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabelas
-- ----------------------------------------------------------------------------

create table if not exists public.academy_courses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  short_description text not null default '',
  full_description text,
  category text not null check (category in (
    'teaching_methodology', 'student_management', 'business_management',
    'professional_development', 'mastering_bloom'
  )),
  cover_url text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.academy_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.academy_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.academy_modules(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  position integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.academy_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  category text not null check (category in (
    'teaching_methodology', 'student_management', 'business_management',
    'professional_development', 'mastering_bloom'
  )),
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  thumbnail_url text,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  status text not null default 'draft' check (status in ('draft', 'published')),
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. Grants (obrigatórios: o PostgREST não concede privilégios por padrão)
-- ----------------------------------------------------------------------------

grant select, insert, update, delete on public.academy_courses to authenticated;
grant select, insert, update, delete on public.academy_modules to authenticated;
grant select, insert, update, delete on public.academy_lessons to authenticated;
grant select, insert, update, delete on public.academy_videos to authenticated;
grant all on public.academy_courses to service_role;
grant all on public.academy_modules to service_role;
grant all on public.academy_lessons to service_role;
grant all on public.academy_videos to service_role;

-- ----------------------------------------------------------------------------
-- 3. Índices
-- ----------------------------------------------------------------------------

create index if not exists academy_courses_status_idx on public.academy_courses (status);
create index if not exists academy_courses_category_idx on public.academy_courses (category);
create index if not exists academy_modules_course_idx on public.academy_modules (course_id, position);
create index if not exists academy_lessons_module_idx on public.academy_lessons (module_id, position);
create index if not exists academy_videos_status_idx on public.academy_videos (status);
create index if not exists academy_videos_category_idx on public.academy_videos (category);

-- ----------------------------------------------------------------------------
-- 4. Timestamps automáticos
-- ----------------------------------------------------------------------------

create or replace function public.academy_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists academy_courses_touch on public.academy_courses;
create trigger academy_courses_touch before update on public.academy_courses
  for each row execute function public.academy_touch_updated_at();

drop trigger if exists academy_modules_touch on public.academy_modules;
create trigger academy_modules_touch before update on public.academy_modules
  for each row execute function public.academy_touch_updated_at();

drop trigger if exists academy_lessons_touch on public.academy_lessons;
create trigger academy_lessons_touch before update on public.academy_lessons
  for each row execute function public.academy_touch_updated_at();

drop trigger if exists academy_videos_touch on public.academy_videos;
create trigger academy_videos_touch before update on public.academy_videos
  for each row execute function public.academy_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 5. RLS — desenvolvimento privado: somente super_admin
-- ----------------------------------------------------------------------------

alter table public.academy_courses enable row level security;
alter table public.academy_modules enable row level security;
alter table public.academy_lessons enable row level security;
alter table public.academy_videos enable row level security;

drop policy if exists academy_courses_admin_all on public.academy_courses;
create policy academy_courses_admin_all on public.academy_courses
  for all to authenticated
  using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists academy_modules_admin_all on public.academy_modules;
create policy academy_modules_admin_all on public.academy_modules
  for all to authenticated
  using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists academy_lessons_admin_all on public.academy_lessons;
create policy academy_lessons_admin_all on public.academy_lessons
  for all to authenticated
  using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists academy_videos_admin_all on public.academy_videos;
create policy academy_videos_admin_all on public.academy_videos
  for all to authenticated
  using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

-- ----------------------------------------------------------------------------
-- 6. FUTURO (NÃO ATIVAR AGORA) — leitura de conteúdos publicados por
-- professores Pro quando a Academy for lançada. Exemplo:
--
-- create policy academy_courses_pro_read on public.academy_courses
--   for select to authenticated
--   using (status = 'published' and exists (
--     select 1 from public.teacher_subscriptions s
--     where s.teacher_id = auth.uid() and s.plan = 'pro'
--   ));
-- (Repetir para módulos/aulas filtrando pelo curso publicado, e para vídeos.)
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 7. Bucket de capas (Storage) — público para leitura, escrita só super_admin
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'academy-covers',
  'academy-covers',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists academy_covers_public_read on storage.objects;
create policy academy_covers_public_read on storage.objects
  for select to public
  using (bucket_id = 'academy-covers');

drop policy if exists academy_covers_admin_write on storage.objects;
create policy academy_covers_admin_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'academy-covers' and public.has_role(auth.uid(), 'super_admin'));

drop policy if exists academy_covers_admin_update on storage.objects;
create policy academy_covers_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'academy-covers' and public.has_role(auth.uid(), 'super_admin'));

drop policy if exists academy_covers_admin_delete on storage.objects;
create policy academy_covers_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'academy-covers' and public.has_role(auth.uid(), 'super_admin'));

-- ----------------------------------------------------------------------------
-- 8. Recarregar o cache do PostgREST
-- ----------------------------------------------------------------------------

notify pgrst, 'reload schema';

-- ============================================================================
-- BLOOM ACADEMY — ETAPA 2C.3: Progresso individual (SQL MANUAL)
-- ============================================================================
-- Execute UMA VEZ no SQL Editor do Supabase, DEPOIS de:
--   20261105040000_roles_plans_manual.sql  (user_roles + public.has_role)
--   20261105070000_academy_content_manual.sql (tabelas de conteúdo)
--
-- Durante o desenvolvimento privado: somente super_admin usa estas tabelas,
-- e cada um lê/altera apenas o PRÓPRIO progresso (user_id = auth.uid()).
-- Para liberar no futuro, basta trocar a condição de papel nas políticas.
-- ============================================================================

-- 1. Conclusão de aulas (uma linha por usuário/aula; ausência = não concluída)
create table if not exists public.academy_lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.academy_lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- 2. Última aula acessada (uma linha por usuário/curso)
create table if not exists public.academy_course_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  last_lesson_id uuid references public.academy_lessons(id) on delete set null,
  last_accessed_at timestamptz not null default now(),
  primary key (user_id, course_id)
);

-- 3. Conclusão de videoaulas independentes (separada dos cursos)
create table if not exists public.academy_video_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null references public.academy_videos(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

-- 4. Grants (sem acesso anônimo)
revoke all on public.academy_lesson_progress, public.academy_course_progress, public.academy_video_progress from anon;
grant select, insert, update, delete on public.academy_lesson_progress to authenticated;
grant select, insert, update, delete on public.academy_course_progress to authenticated;
grant select, insert, update, delete on public.academy_video_progress to authenticated;
grant all on public.academy_lesson_progress, public.academy_course_progress, public.academy_video_progress to service_role;

-- 5. RLS: próprio progresso + super_admin
alter table public.academy_lesson_progress enable row level security;
alter table public.academy_course_progress enable row level security;
alter table public.academy_video_progress enable row level security;

drop policy if exists academy_lesson_progress_own on public.academy_lesson_progress;
create policy academy_lesson_progress_own on public.academy_lesson_progress
  for all to authenticated
  using (user_id = auth.uid() and public.has_role(auth.uid(), 'super_admin'))
  with check (user_id = auth.uid() and public.has_role(auth.uid(), 'super_admin'));

drop policy if exists academy_course_progress_own on public.academy_course_progress;
create policy academy_course_progress_own on public.academy_course_progress
  for all to authenticated
  using (user_id = auth.uid() and public.has_role(auth.uid(), 'super_admin'))
  with check (user_id = auth.uid() and public.has_role(auth.uid(), 'super_admin'));

drop policy if exists academy_video_progress_own on public.academy_video_progress;
create policy academy_video_progress_own on public.academy_video_progress
  for all to authenticated
  using (user_id = auth.uid() and public.has_role(auth.uid(), 'super_admin'))
  with check (user_id = auth.uid() and public.has_role(auth.uid(), 'super_admin'));

-- 6. Recarregar o cache de esquema da API
notify pgrst, 'reload schema';

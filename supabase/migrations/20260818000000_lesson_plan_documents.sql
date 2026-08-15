-- ============================================================================
-- Bloom — Histórico de Planos (documentos de lesson plan concluídos)
-- Reutiliza a arquitetura existente: calendar_events -> lesson_plans.
-- Um documento = um lesson plan inteiro concluído (nunca uma aula avulsa).
-- ============================================================================
begin;

create table if not exists public.lesson_plan_documents (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  plan_number integer not null default 1,
  title text,
  status text not null default 'completed',
  period_start date,
  period_end date,
  lesson_count integer not null default 0,
  -- versão fechada do plano: todas as aulas com data, horário, conteúdo,
  -- homework, notas, presença, anexos e status no momento da conclusão.
  snapshot jsonb not null default '[]'::jsonb,
  plan_created_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  constraint lesson_plan_documents_subject_ck check (
    (class_id is not null and student_id is null)
    or (class_id is null and student_id is not null)
  )
);

create index if not exists lesson_plan_documents_student_idx
  on public.lesson_plan_documents (student_id, completed_at desc);
create index if not exists lesson_plan_documents_class_idx
  on public.lesson_plan_documents (class_id, completed_at desc);
create index if not exists lesson_plan_documents_teacher_idx
  on public.lesson_plan_documents (teacher_id, completed_at desc);

grant select, insert, update, delete on public.lesson_plan_documents to authenticated;
grant all on public.lesson_plan_documents to service_role;

alter table public.lesson_plan_documents enable row level security;

drop policy if exists "own lesson plan documents" on public.lesson_plan_documents;
create policy "own lesson plan documents" on public.lesson_plan_documents
  for all to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

-- Aulas do plano concluído continuam existindo (mesma tabela), apenas saem do
-- plano ativo ao serem vinculadas ao documento fechado.
alter table public.lesson_plans
  add column if not exists archived_document_id uuid
  references public.lesson_plan_documents(id) on delete set null;

create index if not exists lesson_plans_archived_document_idx
  on public.lesson_plans (archived_document_id);

commit;

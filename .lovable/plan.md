# Disponibilidade do professor como fonte única de verdade

## 1. Onde os dados estão hoje (inspeção realizada)

| Dado | Onde vive hoje | Problema |
|---|---|---|
| Disponibilidade-base (dias + horários) | `onboarding.answers` (jsonb) → convertida por `src/lib/availability-engine.ts` para `settings.working_availability` (jsonb) | Coluna `working_availability` **não aparece** em `supabase_schema.sql` nem em nenhuma migration (só `rest_blocks` foi adicionada em `20260815`). Precisa ser confirmada/criada. |
| Cache local | `localStorage["bloom.working_availability.<teacherId>"]` (engine) **e** `localStorage["bloom.working.availability"]` (calendário, linha 524) | Duas chaves diferentes = duas verdades. |
| Pausas recorrentes | `settings.rest_blocks` (jsonb) | OK |
| Férias/feriados | tabela `teacher_time_off` | OK, mas usada só no lesson plan e parcialmente no calendário |
| Duração padrão | `settings.default_class_duration` | Usada só pelo capacity-engine |
| Timezone | `profiles.timezone` / `teacher_profiles.timezone` | Ignorado: o calendário e o cadastro de aluno gravam `"America/Sao_Paulo"` hardcoded |
| Horário recorrente do aluno | tabela `student_schedules` (student_id, weekday, start_time, end_time) | **`unique (student_id, weekday)`** impede duas aulas no mesmo dia; não tem `duration` nem `active` |
| Ocorrência de aula | `calendar_events` (unique student_id+schedule_id+date) **e** `student_lessons` (unique student_id+lesson_number) | Duas tabelas de ocorrência; `student_lessons` é projetada para `calendar_events` — duplicação de verdade |
| Eventos do calendário mock | `localStorage["bloom.calendar.events"]` + `seedDefaultEvents()` em `calendar-sync.ts` | Dados fictícios convivendo com dados reais |
| Interface `WorkingAvailability` | declarada **duas vezes**: `availability-engine.ts` e `calendar-sync.ts` (esta com `defaultAvailability` Seg–Sáb fake) | Fallback fake mascara "sem disponibilidade" |

## 2. Fonte única de verdade proposta

```text
settings (1 por professor)
  ├ working_availability jsonb   → dias/horários base
  ├ rest_blocks jsonb            → pausas recorrentes
  ├ default_class_duration       → duração padrão
  └ timezone                     → NOVO (hoje só em profiles)
teacher_time_off                 → exceções de data (férias/feriados)
        ↓ restringe
student_schedules                → horário RECORRENTE do aluno (N por aluno)
        ↓ gera
calendar_events                  → OCORRÊNCIA específica (data real, status, remarcação)
        ↓ 1:1 opcional
student_lessons                  → LESSON PLAN da ocorrência (conteúdo, homework, anexos)
```

Regra: `calendar_events` passa a ser a **única** tabela de ocorrência. `student_lessons` deixa de gerar datas próprias e passa a referenciar a ocorrência (`event_id`), mantendo `scheduled_date` apenas como espelho de leitura. Assim remarcação/cancelamento muda a ocorrência e o plano continua colado na aula certa.

## 3. Migration proposta (NÃO será executada sem sua aprovação)

Tudo aditivo e idempotente. Nenhuma tabela dropada, nenhum dado alterado, nenhuma política RLS existente enfraquecida.

```sql
-- A. settings: garantir colunas da fonte de verdade
alter table public.settings
  add column if not exists working_availability jsonb default '[]'::jsonb,
  add column if not exists timezone text default 'America/Sao_Paulo';

-- B. student_schedules: permitir mais de uma aula no mesmo dia
alter table public.student_schedules
  drop constraint if exists student_schedules_student_id_weekday_key;
alter table public.student_schedules
  add column if not exists duration integer default 60,
  add column if not exists active boolean default true;
create unique index if not exists student_schedules_unique_slot
  on public.student_schedules (student_id, weekday, start_time);

-- C. student_lessons: ancorar o plano na ocorrência real
alter table public.student_lessons
  add column if not exists event_id uuid references public.calendar_events(id) on delete set null;
create index if not exists idx_student_lessons_event_id on public.student_lessons(event_id);

-- D. calendar_events: suporte a remarcação/avulsa
alter table public.calendar_events
  add column if not exists origin text default 'recurring',   -- recurring | manual | makeup
  add column if not exists rescheduled_from date;
```

Ponto de atenção: o `drop constraint` em (B) é o único item destrutivo de *estrutura* (não de dados) — é exatamente o que hoje impede "2 aulas na segunda". O índice único novo é mais permissivo, então nada existente quebra.

RLS: nenhuma política alterada. As novas colunas herdam as policies já existentes (ownership via `students.teacher_id` / `teacher_id = auth.uid()`).

## 4. Alterações de código (após aprovação da migration)

**Novo — `src/lib/teacher-availability.ts`** (fonte única, substitui leituras espalhadas)
- `getTeacherAvailability(teacherId)` → `{ days, restBlocks, timeOff, defaultDuration, timezone }`, uma única chamada, cache em memória.
- `isSlotAvailable(date, start, end)` / `getAvailableSlots(weekday)` / `findConflicts(slot)`.

**`src/lib/availability-engine.ts`** — mantém escrita/conversão do onboarding; passa a exportar tipos consumidos por todos.

**`src/lib/calendar-sync.ts`**
- Remove a `WorkingAvailability` duplicada e `defaultAvailability` (fallback fake) — importa da engine.
- Remove `seedDefaultEvents` / `getCalendarEvents` / `saveCalendarEvents` do fluxo real (localStorage vira só cache offline, nunca semente).
- `syncStudentSchedulesToSupabaseEvents` passa a pular datas de `teacher_time_off` e a marcar `origin`.

**`src/routes/_app.calendar.tsx`**
- Grid renderiza faixas indisponíveis (fora do horário, pausas, dias off) a partir da fonte única.
- Unifica a chave localStorage (`bloom.working.availability` deixa de existir).
- Timezone do professor em vez de `"America/Sao_Paulo"` hardcoded.
- Criar/mover aula fora da disponibilidade: aviso claro com confirmação (não bloqueio).

**`src/routes/_app.students.tsx`**
- Seletor de horários limitado à disponibilidade real (dias off desabilitados, slots por `default_class_duration`).
- Permite N horários por semana, inclusive vários no mesmo dia.
- Checagem de conflito com outros alunos/turmas antes de salvar → `SchedulingConflictDialog` (já existe).
- `teacher_id` sempre da sessão autenticada, nunca do formulário.

**`src/lib/lesson-plan-sync.ts`**
- `generateLessonPlanOccurrences` deixa de ser a origem das datas: passa a ler as ocorrências de `calendar_events` do aluno e preencher `event_id`.
- Quando ainda não existem ocorrências, gera-as primeiro (via calendar-sync) e então cria os planos.
- Datas exibidas no plano (Aula 1 — 17/08/2026) vêm da ocorrência, não de cálculo local.

## 5. O que fica preparado para o futuro
Cancelamento e reposição (`status` + `origin: makeup`), feriados/férias (`teacher_time_off` já respeitado em toda geração), aula avulsa (`origin: manual`, sem `schedule_id`), alteração temporária de horário (edita a ocorrência, não a recorrência), geração automática das próximas aulas (janela rolante a partir de `student_schedules`).

## 6. Aguardando sua aprovação
Aprovar a migration da seção 3 (especialmente o item B) libera a implementação da seção 4. Nada será executado antes disso.

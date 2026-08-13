# Aulas e Lesson Plans para Turmas e Duplas

Objetivo: turmas/duplas usarem exatamente o mesmo sistema de aulas dos alunos individuais, com presença individual por ocorrência. Sem sistema paralelo.

## 1. O que já existe hoje

| Área | Estado atual |
| --- | --- |
| Lesson plan individual | `student_lessons` (número da aula, data, horário, conteúdo, homework, notas, `attachments` jsonb, `attendance_status`, `completed`) + `src/lib/lesson-plan-sync.ts` + UI `StudentLessonPlanTable` e `LessonNotesModal` (uploads no bucket `resources`) |
| Calendário | `calendar_events` (uma linha por ocorrência, `type` Private/Group, `class_id`, `status`, unique `(student_id, schedule_id, date)`) |
| Turmas | `classes`, `class_members`, `class_schedules` + `src/lib/class-sync.ts`; UI em `ClassManagementComponents.tsx` (ClassCard, ClassDetailsView, ClassFormModal) |
| Aulas de turma | `class_sessions` (data, horário, topic/content/homework/notes) — paralelo e mais pobre que `student_lessons` |
| Presença de turma | `class_attendance` (por `class_session_id` + `student_id`) — não ligada ao calendário |
| Recorrência | `class_schedules` projetadas em `calendar_events` por `projectClassSchedulesToCalendar` (8 semanas fixas, sem checar disponibilidade) |
| Disponibilidade | `teacher-availability.ts` (working availability, pausas, timezone de `teacher_profiles`) + `time-off-engine.ts` (`teacher_time_off`) — hoje usados só no fluxo individual |

Problema central: a turma tem hoje uma trilha própria (`class_sessions` + `class_attendance`) desconectada de `calendar_events` e da disponibilidade real.

## 2. Arquitetura proposta (unificada)

Fonte de verdade de ocorrência = **`calendar_events`** para individual, dupla e turma.

```text
classes ──< class_schedules ──> gera ocorrências (availability + time_off)
                                     │
                                     ▼
                              calendar_events   (1 linha = 1 aula real)
                                     │
                     ┌───────────────┴────────────────┐
                     ▼                                ▼
              lesson_plans (1 por evento)     attendance_records (1 por aluno)
```

- Individual continua com `student_lessons`, mas cada linha passa a apontar para `calendar_events` via `calendar_event_id` (coluna já prevista no plano de disponibilidade aprovado).
- Turma/dupla: o lesson plan é **único por ocorrência** (`event_id`), nunca duplicado por aluno.
- Presença: sempre individual, em `attendance_records(event_id, student_id)` — vale também para individual (1 linha só), o que unifica relatórios.

## 3. Migration necessária (sim)

1. `calendar_events`: garantir `class_id`, adicionar `class_schedule_id`, e unique parcial `(class_id, date, start_time)` para ocorrências de turma (a unique atual só cobre aluno individual).
2. Nova `class_lessons` (lesson plan da turma), espelhando `student_lessons`:
   `id, teacher_id, class_id, calendar_event_id (unique), class_schedule_id, lesson_number, scheduled_date, start_time, end_time, duration, content, homework, homework_posted, notes, attachments jsonb, completed, status`.
   Unique `(class_id, lesson_number)` e unique `(calendar_event_id)` → garante 1 plano por aula.
3. Nova `attendance_records`:
   `id, teacher_id, event_id → calendar_events(id) on delete cascade, student_id → students(id) on delete cascade, status text not null default 'present', notes text, timestamps`, unique `(event_id, student_id)`.
   Statuses: `present`, `absent`, `late`, `excused`, `cancelled` (aula não realizada) — via CHECK.
4. Backfill: `class_sessions` → `class_lessons` (casando por `class_id` + `date`), `class_attendance` → `attendance_records` (via evento correspondente). `class_sessions`/`class_attendance` ficam como legado somente leitura e são removidas em migration posterior, depois de validado.
5. GRANTs para `authenticated`/`service_role` nas novas tabelas.

Nada é destrutivo nesta etapa; nenhuma tabela existente perde coluna.

## 4. Geração de datas (mesma fonte de verdade)

`projectClassSchedulesToCalendar` passa a usar o mesmo gerador do individual:
`getTeacherAvailability` (working availability + pausas + timezone de `teacher_profiles`) e `fetchTeacherTimeOff`/`checkDateIsNonWorking`, com pulo de datas bloqueadas sem consumir número de aula, e detecção de conflito com `findRecurringConflicts`. Extrai-se um único `generateOccurrences()` compartilhado entre `lesson-plan-sync.ts` e `class-sync.ts`.

## 5. UI reutilizada

- `StudentLessonPlanTable` é generalizada para `LessonPlanTable` com `subjectType: "student" | "class"`; mesmo layout, cores, filtros, conflitos e auto-reagendamento.
- `LessonNotesModal` reutilizado integralmente (mesmos uploads no bucket `resources`, homework, notas).
- Ao abrir uma aula de turma: plano único no topo + lista de alunos ativos com seletor de presença individual (present/absent/late/excused) e nota por aluno, salvando em `attendance_records`.
- `ClassDetailsView` ganha a aba "Lesson Plan" idêntica à do aluno; o perfil do aluno individual passa a exibir também as aulas das turmas em que participa (histórico consolidado).

## 6. RLS

- `class_lessons`: `SELECT/INSERT/UPDATE/DELETE` com `teacher_id = auth.uid()`.
- `attendance_records`: `teacher_id = auth.uid()`, mais validação de que o `event_id` pertence ao professor (função `security definer` `bloom_event_belongs_to_teacher(event_id, uid)`) para impedir gravar presença em evento de terceiros.
- Sem policies para `anon`. Grants apenas para `authenticated` e `service_role`.

## 7. Ordem de execução (após aprovação)

1. Migration (schema + backfill) — apresentada em SQL completo antes de rodar.
2. `class-lesson-sync.ts` reutilizando os helpers do individual.
3. Generalização de `LessonPlanTable` + painel de presença.
4. Integração em `ClassDetailsView`, calendário e histórico do aluno.
5. Verificação de isolamento por professor e conflitos de disponibilidade.

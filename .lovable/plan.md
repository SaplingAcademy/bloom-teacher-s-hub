# Aulas e Lesson Plans unificados (individual, dupla e turma)

Revisão: **uma única tabela `lesson_plans`**, ligada a `calendar_events` por `event_id`, e **uma única `attendance_records`** por aluno/evento. Nada de `class_lessons` ao lado de `student_lessons`.

## 1. O que já existe

| Área | Estado atual |
| --- | --- |
| Lesson plan individual | `student_lessons` (lesson_number, data, horário, content, homework, notes, `attachments` jsonb, `attendance_status`, `completed`) + `lesson-plan-sync.ts` + `StudentLessonPlanTable` / `LessonNotesModal` (uploads no bucket `resources`) |
| Calendário | `calendar_events` — 1 linha por ocorrência, `type` Private/Group, `class_id`, `status`, unique `(student_id, schedule_id, date)` |
| Turmas/duplas | `classes` + `class_members` + `class_schedules` + `class-sync.ts`; UI em `ClassManagementComponents.tsx` |
| Aula de turma | `class_sessions` — trilha paralela, mais pobre, desligada do calendário |
| Presença de turma | `class_attendance` (por `class_session_id`) — desligada do calendário |
| Recorrência | `projectClassSchedulesToCalendar` gera 8 semanas fixas, sem checar disponibilidade |
| Disponibilidade | `teacher-availability.ts` (working availability, pausas, timezone de `teacher_profiles`) + `time-off-engine.ts` (`teacher_time_off`) — usados só no fluxo individual |

Dupla **não** ganha entidade nova: continua sendo uma `classes` com `type = 'pair'` e 2 `class_members`.

## 2. Arquitetura final (um só sistema)

```text
individual: students ──< student_schedules ┐
turma/dupla: classes ──< class_schedules ──┤ gerador único de ocorrências
                                           │ (availability + pausas + timezone + time_off)
                                           ▼
                                    calendar_events        1 linha = 1 aula real
                                           │
                          ┌────────────────┴─────────────────┐
                          ▼                                  ▼
                   lesson_plans (1:1 com evento)     attendance_records (1 por aluno)
```

Regras:
- `calendar_events` é a fonte de verdade da ocorrência, para os três formatos. Individual traz `student_id`; turma/dupla traz `class_id`.
- `lesson_plans` é **1:1 com o evento** (`event_id` unique). Nunca duplicado por aluno.
- `attendance_records` é sempre por aluno + evento — no individual gera 1 linha, na dupla 2, na turma N. Relatórios e histórico do aluno ficam idênticos nos três casos.
- **`cancelled` é estado do evento** (`calendar_events.status = 'Cancelled'`), não status de presença. Cancelar a aula não exige tocar em presença.

## 3. Migration (necessária)

1. `calendar_events`
   - garantir `class_id` e adicionar `class_schedule_id`;
   - unique parcial `(class_id, class_schedule_id, date, start_time)` para ocorrências de turma (a unique atual só cobre individual);
   - manter `status` como local do cancelamento; `attendance_recorded` vira derivado.
2. Nova `lesson_plans`
   `id, teacher_id, event_id uuid unique → calendar_events(id) on delete cascade, class_id, student_id, lesson_number, scheduled_date, start_time, end_time, duration, content, homework, homework_posted, notes, attachments jsonb, completed, created_at, updated_at`.
   - `event_id` unique = garantia estrutural de "um plano por aula".
   - `class_id`/`student_id` são desnormalizações para consulta rápida; exatamente um deles preenchido (CHECK).
   - índices: `(class_id, lesson_number)`, `(student_id, lesson_number)`, `(teacher_id, scheduled_date)`.
3. Nova `attendance_records`
   `id, teacher_id, event_id → calendar_events(id) on delete cascade, student_id → students(id) on delete cascade, status text not null default 'present', notes text, timestamps`, unique `(event_id, student_id)`.
   - CHECK status em `('present','absent','late','excused')` — sem `cancelled`.
4. Backfill (sem perda)
   - cada `student_lessons` recebe/garante seu `calendar_events` correspondente → insere em `lesson_plans` (`lesson_number`, conteúdo, homework, notas, attachments preservados);
   - `student_lessons.attendance_status` → `attendance_records` (`Present→present`, `Absent→absent`, `Cancelled`/`Rescheduled` → não vira presença, refletem em `calendar_events.status`);
   - `class_sessions` → evento correspondente (casando `class_id` + `date` + `start_time`) → `lesson_plans`;
   - `class_attendance` → `attendance_records` via o evento resolvido.
5. Depreciação
   `student_lessons`, `class_sessions` e `class_attendance` ficam como **legado somente leitura** após o backfill; a remoção acontece em migration posterior, só depois de validar dados em produção. Nenhuma coluna é apagada agora.
6. GRANTs para `authenticated` e `service_role` nas duas novas tabelas.

## 4. Geração de datas — uma fonte de verdade

Um único `generateOccurrences()` compartilhado por individual e turma, usando `getTeacherAvailability` (working availability, pausas, timezone de `teacher_profiles`) e `fetchTeacherTimeOff`/`checkDateIsNonWorking`: datas bloqueadas são puladas sem consumir número de aula, e conflitos são detectados por `findRecurringConflicts`. `projectClassSchedulesToCalendar` passa a chamar esse gerador em vez das 8 semanas fixas.

## 5. Camada de código

- `lesson-plan-sync.ts` é reescrito sobre `lesson_plans` + `calendar_events`, com uma API única: `fetchLessonPlans({ studentId | classId })`, `saveLessonPlan(eventId, patch)`, `ensureOccurrences(...)`.
- `class-sync.ts` deixa de ter trilha própria de sessões e passa a chamar essa mesma API.
- `StudentLessonPlanTable` → `LessonPlanTable` com `subject: {kind:'student'|'class', id}`; mesmo layout, cores, filtros, conflito e auto-reagendamento.
- `LessonNotesModal` reutilizado integralmente (uploads, homework, notas).
- Aula de turma aberta: plano único no topo + lista de alunos ativos com presença individual (present/absent/late/excused) e nota por aluno; botão separado "Cancelar aula" age no evento.
- Perfil do aluno passa a mostrar também as aulas das turmas em que participa, no mesmo histórico.

## 6. RLS

- `lesson_plans` e `attendance_records`: todas as operações com `teacher_id = auth.uid()`.
- Além disso, função `security definer` `bloom_event_belongs_to_teacher(event_id, uid)` usada no `WITH CHECK` das duas tabelas, impedindo anexar plano/presença a evento de outro professor.
- `attendance_records`: `student_id` precisa ser membro ativo da turma do evento (ou o aluno do evento individual) — validado por função `security definer` no `WITH CHECK`.
- Sem policies `anon`; grants apenas `authenticated` + `service_role`.

## 7. Ordem de execução (após aprovação)

1. SQL completo da migration (schema + backfill) apresentado antes de rodar.
2. Reescrita de `lesson-plan-sync.ts` e adaptação de `class-sync.ts`.
3. Generalização da tabela de lesson plan + painel de presença.
4. Integração em `ClassDetailsView`, calendário e histórico do aluno.
5. Verificação: isolamento por professor, unicidade por evento, conflitos de disponibilidade e paridade individual/dupla/turma.

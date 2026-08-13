# Disponibilidade do professor como fonte única de verdade

## 1. Onde os dados estão hoje (inspeção realizada)

| Dado | Onde vive hoje | Problema |
|---|---|---|
| Disponibilidade-base (dias + horários) | `onboarding.answers` (jsonb) → convertida por `src/lib/availability-engine.ts` para `settings.working_availability` (jsonb) | Coluna `working_availability` **não aparece** em `supabase_schema.sql` nem em nenhuma migration (só `rest_blocks` foi adicionada em `20260815`). Precisa ser confirmada/criada. |
| Cache local | `localStorage["bloom.working_availability.<teacherId>"]` (engine) **e** `localStorage["bloom.working.availability"]` (calendário, linha 524) | Duas chaves diferentes = duas verdades. |
| Pausas recorrentes | `settings.rest_blocks` (jsonb) | OK |
| Férias/feriados | tabela `teacher_time_off` | OK, mas usada só no lesson plan e parcialmente no calendário |
| Duração padrão | `settings.default_class_duration` | Usada só pelo capacity-engine |
| Timezone | `teacher_profiles.timezone` (existe) e `profiles.timezone` (legado) | Ignorado pelo app: calendário e cadastro de aluno gravam `"America/Sao_Paulo"` hardcoded. **Não será criado `settings.timezone`** — `teacher_profiles.timezone` é a fonte única. |
| Horário recorrente do aluno | tabela `student_schedules` (student_id, weekday, start_time, end_time) | **`unique (student_id, weekday)`** impede duas aulas no mesmo dia; não tem `duration` nem `active` |
| Ocorrência de aula | `calendar_events` (unique student_id+schedule_id+date) **e** `student_lessons` (unique student_id+lesson_number) | Duas tabelas de ocorrência; `student_lessons` é projetada para `calendar_events` — duplicação de verdade |
| Eventos do calendário mock | `localStorage["bloom.calendar.events"]` + `seedDefaultEvents()` em `calendar-sync.ts` | Dados fictícios convivendo com dados reais |
| Interface `WorkingAvailability` | declarada **duas vezes**: `availability-engine.ts` e `calendar-sync.ts` (esta com `defaultAvailability` Seg–Sáb fake) | Fallback fake mascara "sem disponibilidade" |

## 2. Fonte única de verdade proposta

```text
teacher_profiles (1 por professor)
  └ timezone                     → FONTE ÚNICA de timezone (nada novo é criado)
settings (1 por professor — teacher_id já é UNIQUE NOT NULL, confirmado)
  ├ working_availability jsonb   → dias/horários base
  ├ rest_blocks jsonb            → pausas recorrentes
  └ default_class_duration       → duração padrão
teacher_time_off                 → exceções de data (férias/feriados)
        ↓ restringe
student_schedules                → horário RECORRENTE do aluno (N por aluno)
        ↓ gera
calendar_events                  → OCORRÊNCIA específica (data real, status, remarcação, linhagem)
        ↓ 1:1 garantido por índice único
student_lessons                  → LESSON PLAN da ocorrência (conteúdo, homework, anexos)
```

Regra: `calendar_events` é a **única** tabela de ocorrência. `student_lessons` deixa de gerar datas próprias e passa a referenciar a ocorrência (`event_id`), com **no máximo um plano por ocorrência** garantido no banco. `scheduled_date` permanece só como espelho de leitura.

Confirmação de unicidade de `settings`: `supabase_schema.sql` já declara `teacher_id uuid references public.profiles(id) on delete cascade unique not null` — a relação 1:1 professor↔settings já está protegida. A migration apenas revalida esse índice de forma idempotente.

## 3. Migration SQL revisada (NÃO será executada sem nova aprovação)

Aditiva e idempotente. Nenhuma tabela dropada, nenhum dado destruído, nenhuma policy RLS enfraquecida. Timezone **não** é duplicado.

```sql
-- A. settings: apenas a disponibilidade-base (SEM timezone — fonte é teacher_profiles.timezone)
alter table public.settings
  add column if not exists working_availability jsonb default '[]'::jsonb;

-- A.1 revalidar 1 registro por professor (já existe como UNIQUE; idempotente)
create unique index if not exists settings_teacher_id_unique
  on public.settings (teacher_id);

-- B. student_schedules: permitir mais de uma aula no mesmo dia
alter table public.student_schedules
  drop constraint if exists student_schedules_student_id_weekday_key;
alter table public.student_schedules
  add column if not exists duration_minutes integer default 60,
  add column if not exists active boolean default true;
create unique index if not exists student_schedules_unique_slot
  on public.student_schedules (student_id, weekday, start_time);

-- C. student_lessons: ancorar o plano na ocorrência real, no máximo 1 plano por ocorrência
alter table public.student_lessons
  add column if not exists event_id uuid references public.calendar_events(id) on delete set null;
create unique index if not exists student_lessons_event_id_unique
  on public.student_lessons (event_id)
  where event_id is not null;

-- D. calendar_events: linhagem real de remarcação + origem da ocorrência
alter table public.calendar_events
  add column if not exists origin text default 'recurring';  -- recurring | manual | makeup
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='calendar_events'
      and column_name='rescheduled_from_event_id'
  ) then
    alter table public.calendar_events
      add column rescheduled_from_event_id uuid
      references public.calendar_events(id) on delete set null;
  end if;
end $$;
create index if not exists idx_calendar_events_rescheduled_from
  on public.calendar_events (rescheduled_from_event_id);

-- E. Backfill da disponibilidade a partir do onboarding já respondido (ver seção 3.1)
update public.settings s
set working_availability = public.bloom_availability_from_onboarding(o.answers)
from public.onboarding o
where o.teacher_id = s.teacher_id
  and (s.working_availability is null
       or jsonb_array_length(coalesce(s.working_availability,'[]'::jsonb)) = 0)
  and coalesce(jsonb_array_length(o.answers->'working_days'), 0) > 0;

-- E.1 professores com onboarding mas sem linha em settings
insert into public.settings (teacher_id, working_availability)
select o.teacher_id, public.bloom_availability_from_onboarding(o.answers)
from public.onboarding o
where coalesce(jsonb_array_length(o.answers->'working_days'), 0) > 0
  and not exists (select 1 from public.settings s where s.teacher_id = o.teacher_id)
on conflict (teacher_id) do nothing;

notify pgrst, 'reload schema';
```

Pontos de atenção:
- O `drop constraint` em (B) é a única mudança estrutural removida — é exatamente o que hoje impede "2 aulas na segunda". O índice novo é mais permissivo, nada existente quebra.
- `duration_minutes` é coluna **nova**; nenhuma coluna `duration` existe hoje em `student_schedules`, então não há rename destrutivo nem perda de dados.
- RLS: nenhuma policy criada, alterada ou removida. Colunas novas herdam as policies existentes (ownership via `students.teacher_id` e `teacher_id = auth.uid()`).

### 3.1 Estratégia de backfill da disponibilidade

Hoje o app faz esse backfill **em runtime**, no `fetchTeacherWorkingAvailability` (lê `onboarding.answers` e grava em `settings`). Isso só roda quando o professor abre o app e depende do cliente. A proposta é replicar a mesma conversão no banco, uma vez, para ninguém perder dados:

1. Antes de rodar, gerar um **relatório de contagem** (somente leitura):
   `select count(*) from public.onboarding where coalesce(jsonb_array_length(answers->'working_days'),0) > 0;` — quantos professores têm disponibilidade a recuperar; e quantos desses já têm `settings.working_availability` não vazio (esses são **preservados**, nunca sobrescritos).
2. Criar a função auxiliar `public.bloom_availability_from_onboarding(answers jsonb)` (SQL puro, `stable`), espelhando `convertOnboardingToWorkingAvailability`: usa `working_days`, `same_availability_all_days`, `unified_availability`, `custom_availability`, com fallback `09:00–18:00`; retorna o array jsonb dos 7 dias com `enabled`.
3. O `UPDATE` só toca linhas com `working_availability` nulo ou vazio — quem já configurou manualmente fica intacto.
4. O `INSERT` cobre professores com onboarding mas sem linha em `settings`.
5. Após a migration, o backfill em runtime dentro de `availability-engine.ts` continua como rede de segurança para onboardings novos, mas deixa de ser o caminho principal.

## 4. Alterações de código (após aprovação da migration)

**Novo — `src/lib/teacher-availability.ts`** (fonte única de leitura)
- `getTeacherAvailability(teacherId)` → `{ days, restBlocks, timeOff, defaultDuration, timezone }`, com `timezone` vindo de `teacher_profiles.timezone`.
- `isSlotAvailable(date, start, end)` / `getAvailableSlots(weekday)` / `findConflicts(slot)`.

**Política de cache local (MVP/beta)**
- Supabase é a única fonte operacional. `localStorage` deixa de ser fonte de leitura autoritativa.
- Onde permanecer, vira apenas cache de *primeiro paint*, com carimbo `updated_at`, e é **sempre** substituído pela resposta do Supabase quando ela chega; nunca é gravado por cima de dado mais recente do servidor e nunca é usado como fallback de escrita.
- Removidos do fluxo real: `seedDefaultEvents()`, `bloom.calendar.events`, `bloom.working.availability`, `bloom.students.list` e os fallbacks "offline" que inventam registros (ex.: `createTeacherTimeOffBatch` gerando IDs locais). Falha de rede passa a ser erro visível, não dado fantasma.

**`src/lib/availability-engine.ts`** — mantém escrita/conversão do onboarding; passa a exportar os tipos usados por todos.

**`src/lib/calendar-sync.ts`**
- Remove a `WorkingAvailability` duplicada e o `defaultAvailability` fake — importa da engine.
- `syncStudentSchedulesToSupabaseEvents` pula datas de `teacher_time_off` e grava `origin`.

**`src/routes/_app.calendar.tsx`**
- Faixas indisponíveis (fora do horário, pausas, dias off) renderizadas a partir da fonte única.
- Timezone do professor em vez de `"America/Sao_Paulo"` hardcoded.
- Criar/mover aula fora da disponibilidade: aviso claro com confirmação (não bloqueio). Remarcar grava `rescheduled_from_event_id`.

**`src/routes/_app.students.tsx`**
- Seletor de horários limitado à disponibilidade real; N horários por semana, inclusive vários no mesmo dia; grava `duration_minutes`.
- Conflito com outro aluno/turma → `SchedulingConflictDialog` (já existe) antes de salvar.
- `teacher_id` sempre da sessão autenticada, nunca do formulário.

**`src/lib/lesson-plan-sync.ts`**
- Datas do plano vêm das ocorrências de `calendar_events`, preenchendo `event_id` (1:1 garantido pelo índice único).
- Sem ocorrências ainda, gera-as primeiro via calendar-sync e depois cria os planos.

## 5. O que fica preparado para o futuro
Cancelamento e reposição (`status` + `origin: makeup`), feriados/férias (`teacher_time_off` já respeitado em toda geração), aula avulsa (`origin: manual`, sem `schedule_id`), alteração temporária de horário (edita a ocorrência, não a recorrência), geração automática das próximas aulas (janela rolante a partir de `student_schedules`).

## 6. Testes de isolamento (após migration + implementação)

Executados com **dois professores reais distintos** (A e B), autenticados via sessão, usando a chave publishable (RLS ativa) — nunca service role:

| Alvo | Testes |
|---|---|
| `student_schedules` | A tenta SELECT/UPDATE/DELETE em schedule de aluno de B; A tenta INSERT com `student_id` de B |
| `calendar_events` | A tenta SELECT/UPDATE/DELETE em evento de B; A tenta INSERT com `teacher_id` de B e com `student_id` de B; A tenta INSERT com `rescheduled_from_event_id` apontando para evento de B |
| `student_lessons` | A tenta SELECT/UPDATE/DELETE em plano de B; A tenta INSERT com `event_id` de B e com `student_id` de B |
| `settings` / `teacher_profiles` / `teacher_time_off` | A tenta SELECT/UPDATE da disponibilidade, timezone e time off de B |

Resultado esperado: SELECT retorna 0 linhas; INSERT/UPDATE/DELETE cruzados falham por RLS (ou afetam 0 linhas). Relatório com o resultado de cada célula será apresentado ao final. Se algum cruzamento passar, a implementação para e o gap é reportado antes de qualquer outra mudança.

## 7. Aguardando sua aprovação
Aprovar a migration revisada da seção 3 (incluindo o backfill 3.1) libera a implementação da seção 4 e os testes da seção 6. Nada será executado no banco antes disso.

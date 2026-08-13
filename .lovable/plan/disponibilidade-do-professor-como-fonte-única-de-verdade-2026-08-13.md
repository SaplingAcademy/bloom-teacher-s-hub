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

## 3. Migration SQL final (revisada — NÃO executada)

Ordem obrigatória: **(0) função → (1) simulação read-only → (2) sua aprovação → (3) DDL + backfill**.

### 3.0 Função de conversão (espelha `convertOnboardingToWorkingAvailability`, sem fallback silencioso)

```sql
-- Normaliza "9:00", "09:00:00", " 09:00 " → "09:00"; devolve NULL se não for hora válida
create or replace function public.bloom_norm_time(v text)
returns text
language sql
immutable
as $$
  select case
    when v is null then null
    when btrim(v) ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
      then lpad(split_part(btrim(v), ':', 1), 2, '0') || ':' || split_part(btrim(v), ':', 2)
    else null
  end;
$$;

-- Extrai {start,end} de um objeto de disponibilidade aceitando camelCase e snake_case.
-- Só devolve um par quando AMBOS existem, são válidos e start < end. Caso contrário, NULL.
create or replace function public.bloom_avail_pair(obj jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when obj is null or jsonb_typeof(obj) <> 'object' then null
    else (
      select case
        when st is not null and en is not null and st < en
          then jsonb_build_object('startTime', st, 'endTime', en)
        else null
      end
      from (
        select
          public.bloom_norm_time(coalesce(obj->>'startTime', obj->>'start_time')) as st,
          public.bloom_norm_time(coalesce(obj->>'endTime',   obj->>'end_time'))   as en
      ) x
    )
  end;
$$;

-- Converte onboarding.answers → working_availability[] (7 dias).
-- Devolve NULL quando não há informação suficiente para determinar QUALQUER dia trabalhado.
create or replace function public.bloom_availability_from_onboarding(answers jsonb)
returns jsonb
language sql
stable
as $$
with cfg as (
  select
    coalesce(answers->'working_days', answers->'workingDays', '[]'::jsonb)            as working_days,
    -- default TRUE, igual ao TS (só é false quando explicitamente false)
    coalesce(
      nullif(coalesce(answers->>'same_availability_all_days', answers->>'sameAvailabilityAllDays'), '')::boolean,
      true
    )                                                                                  as same_all,
    public.bloom_avail_pair(coalesce(answers->'unified_availability', answers->'unifiedAvailability'))  as unified,
    coalesce(answers->'custom_availability', answers->'customAvailability', '{}'::jsonb) as custom
),
days as (
  select d.day_key, d.ord
  from (values
    ('Monday',1),('Tuesday',2),('Wednesday',3),('Thursday',4),
    ('Friday',5),('Saturday',6),('Sunday',7)
  ) as d(day_key, ord)
),
resolved as (
  select
    days.day_key,
    days.ord,
    -- dia só é candidato se estiver listado em working_days
    (select exists (
       select 1 from jsonb_array_elements_text(cfg.working_days) wd
       where lower(btrim(wd)) = lower(days.day_key)
     )) as selected,
    case
      when cfg.same_all then cfg.unified
      else coalesce(
             public.bloom_avail_pair(cfg.custom->days.day_key),
             cfg.unified              -- só como herança explícita do onboarding, nunca inventado
           )
    end as pair
  from days cross join cfg
)
select case
  -- nenhum dia com horário determinável → não grava nada, professor é reportado como "insuficiente"
  when not exists (select 1 from resolved where selected and pair is not null) then null
  else (
    select jsonb_agg(
      jsonb_build_object(
        'day',       r.day_key,
        'enabled',   (r.selected and r.pair is not null),
        'startTime', case when r.selected and r.pair is not null then r.pair->>'startTime' end,
        'endTime',   case when r.selected and r.pair is not null then r.pair->>'endTime'   end
      )
      order by r.ord
    )
    from resolved r
  )
end;
$$;
```

**Como isso espelha (e corrige) o TS:**

| Caso | `convertOnboardingToWorkingAvailability` (hoje) | Função SQL (proposta) |
|---|---|---|
| `working_days` ausente/vazio | devolve 7 dias desabilitados com `09:00–18:00` | devolve `NULL` → linha ignorada e reportada |
| dia não selecionado | `enabled:false` + `09:00–18:00` | `enabled:false` + `startTime/endTime = null` |
| `same_availability_all_days` ausente | tratado como `true` | tratado como `true` (idêntico) |
| `unified_availability` presente e válido | usado em todos os dias selecionados | idêntico |
| `unified_availability` ausente/incompleto e `same_all = true` | vira `09:00–18:00` (**inventa disponibilidade**) | dia fica `enabled:false`; se nenhum dia sobrar, retorna `NULL` |
| `custom_availability[dia]` válido | usado | idêntico |
| `custom_availability[dia]` ausente | cai no unified, senão `09:00–18:00` | cai no unified **se válido**; senão `enabled:false` |
| horário malformado (`"9h"`, `"25:00"`, start ≥ end) | aceito como string | rejeitado → dia `enabled:false` |
| chaves camelCase vs snake_case | ambas aceitas | ambas aceitas |

Nenhum `09:00–18:00` sobrevive: ausência de informação nunca vira disponibilidade real.

### 3.1 Simulação read-only (rodar ANTES do backfill, não grava nada)

Sem acesso direto ao Postgres nesta sessão (a conexão do app é só REST com a chave publishable, e RLS bloqueia leitura administrativa), então este bloco precisa rodar no SQL Editor do seu projeto. Ele só faz `SELECT` — e depende apenas das funções da seção 3.0, que também não alteram dados.

```sql
-- Contagens
with conv as (
  select
    o.teacher_id,
    o.answers,
    public.bloom_availability_from_onboarding(o.answers) as computed,
    s.teacher_id is not null                             as has_settings,
    coalesce(jsonb_array_length(coalesce(s.working_availability, '[]'::jsonb)), 0) > 0 as already_configured
  from public.onboarding o
  left join public.settings s on s.teacher_id = o.teacher_id
)
select
  count(*)                                                                as total_onboarding,
  count(*) filter (where already_configured)                              as preservados,
  count(*) filter (where computed is null and not already_configured)     as ignorados_dados_insuficientes,
  count(*) filter (where computed is not null and not already_configured and has_settings)     as serao_atualizados,
  count(*) filter (where computed is not null and not already_configured and not has_settings) as serao_inseridos
from conv;

-- Amostra da transformação para validação visual (10 casos que seriam gravados)
select o.teacher_id,
       o.answers->'working_days'               as working_days,
       o.answers->'same_availability_all_days' as same_all,
       o.answers->'unified_availability'       as unified,
       o.answers->'custom_availability'        as custom,
       public.bloom_availability_from_onboarding(o.answers) as resultado
from public.onboarding o
where public.bloom_availability_from_onboarding(o.answers) is not null
limit 10;

-- Casos que serão IGNORADOS (para você revisar antes)
select o.teacher_id, o.answers
from public.onboarding o
where public.bloom_availability_from_onboarding(o.answers) is null
limit 10;
```

### 3.2 DDL + backfill (executar só após você validar a simulação)

Aditiva e idempotente. Nenhuma tabela dropada, nenhum dado destruído, nenhuma policy RLS criada/alterada/removida. Timezone **não** é duplicado (fonte: `teacher_profiles.timezone`).

```sql
-- A. settings: apenas a disponibilidade-base
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

-- C. student_lessons: ancorar o plano na ocorrência, no máximo 1 plano por ocorrência
alter table public.student_lessons
  add column if not exists event_id uuid references public.calendar_events(id) on delete set null;
create unique index if not exists student_lessons_event_id_unique
  on public.student_lessons (event_id)
  where event_id is not null;

-- D. calendar_events: origem + linhagem real de remarcação
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

-- E. Backfill: só onde não há disponibilidade configurada e a conversão produziu resultado
update public.settings s
set working_availability = public.bloom_availability_from_onboarding(o.answers)
from public.onboarding o
where o.teacher_id = s.teacher_id
  and coalesce(jsonb_array_length(coalesce(s.working_availability, '[]'::jsonb)), 0) = 0
  and public.bloom_availability_from_onboarding(o.answers) is not null;

-- E.1 professores com onboarding mas sem linha em settings
insert into public.settings (teacher_id, working_availability)
select o.teacher_id, public.bloom_availability_from_onboarding(o.answers)
from public.onboarding o
where public.bloom_availability_from_onboarding(o.answers) is not null
  and not exists (select 1 from public.settings s where s.teacher_id = o.teacher_id)
on conflict (teacher_id) do nothing;

notify pgrst, 'reload schema';
```

Pontos de atenção:
- O `drop constraint` em (B) é a única estrutura removida — é exatamente o que impede "2 aulas na segunda". O índice novo é mais permissivo, nada existente quebra.
- `duration_minutes` é coluna **nova**; `student_schedules` não tem coluna `duration` hoje, então não há rename destrutivo.
- Colunas novas herdam as policies RLS existentes (ownership via `students.teacher_id` e `teacher_id = auth.uid()`).
- O backfill em runtime dentro de `availability-engine.ts` continua como rede de segurança para onboardings novos, mas será alinhado à mesma regra (sem inventar `09:00–18:00`).

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
Sequência proposta: você aprova a função 3.0 + roda a simulação 3.1 → validamos os números e os exemplos → só então executo o DDL + backfill 3.2, seguido da implementação da seção 4 e dos testes de isolamento da seção 6. Nada foi executado no banco.

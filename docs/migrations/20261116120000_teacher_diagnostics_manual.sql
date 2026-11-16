-- =====================================================================================
-- Bloom · Diagnóstico Inicial das Teachers · aplicação MANUAL
--
-- * public.teacher_diagnostics: uma linha por teacher (respostas em jsonb, etapa atual,
--   aceite do aviso de privacidade e datas).
-- * Contas EXISTENTES na implantação ficam isentas (status 'exempt'). Contas novas não têm
--   linha e, portanto, precisam concluir o diagnóstico antes do onboarding padrão.
--   Administradoras (super_admin) nunca são obrigadas.
-- * O cliente só LÊ a própria linha. Toda escrita passa por RPCs SECURITY DEFINER:
--   accept_teacher_diagnostic_consent, save_teacher_diagnostic_step e
--   complete_teacher_diagnostic. As respostas são limpas e validadas no servidor; a conclusão
--   exige todas as perguntas obrigatórias e condicionais. Status, datas e isenção nunca vêm do
--   frontend; respostas concluídas não podem ser alteradas.
-- * list_teacher_diagnostics: somente super_admin (painel /admin).
-- * Nenhuma tabela, política ou função existente é alterada.
-- =====================================================================================
begin;

-- 0. Pré-checagens: abortam sem alterar nada se o ambiente não for o esperado.
do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.user_roles') is null then
    raise exception 'Tabelas esperadas ausentes (profiles, user_roles)';
  end if;
  if to_regprocedure('public.has_role(uuid, public.app_role)') is null then
    raise exception 'Função public.has_role(uuid, app_role) ausente';
  end if;
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'app_role' and e.enumlabel = 'super_admin') then
    raise exception 'app_role sem o valor super_admin';
  end if;
  if to_regclass('public.teacher_diagnostics') is not null then
    raise exception 'teacher_diagnostics já existe (migração já aplicada?)';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
             and p.proname in ('get_my_teacher_diagnostic', 'accept_teacher_diagnostic_consent', 'save_teacher_diagnostic_step',
                               'complete_teacher_diagnostic', 'list_teacher_diagnostics', 'teacher_diagnostic_clean',
                               'teacher_diagnostic_missing')) then
    raise exception 'Funções do diagnóstico já existem';
  end if;
end $$;

-- 1. Tabela
create table public.teacher_diagnostics (
  teacher_id           uuid primary key references public.profiles(id) on delete cascade,
  status               text not null default 'in_progress',
  current_step         smallint not null default 1,
  answers              jsonb not null default '{}'::jsonb,
  schema_version       integer not null default 1,
  consent_accepted_at  timestamptz,
  started_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  completed_at         timestamptz,
  constraint teacher_diagnostics_status_check check (status in ('exempt', 'in_progress', 'completed')),
  constraint teacher_diagnostics_step_check check (current_step between 1 and 5),
  constraint teacher_diagnostics_answers_object check (jsonb_typeof(answers) = 'object'),
  constraint teacher_diagnostics_answers_size check (pg_column_size(answers) <= 65536),
  constraint teacher_diagnostics_completed_check check (status <> 'completed' or (completed_at is not null and consent_accepted_at is not null))
);
comment on table public.teacher_diagnostics is
  'Diagnóstico inicial das teachers. Leitura da própria linha por RLS; escrita só pelas RPCs; leitura geral só super_admin (list_teacher_diagnostics).';

alter table public.teacher_diagnostics enable row level security;
revoke all on table public.teacher_diagnostics from public, anon, authenticated;
grant select on table public.teacher_diagnostics to authenticated;

create policy teacher_diagnostics_select_own on public.teacher_diagnostics
  for select to authenticated using (teacher_id = (select auth.uid()));

-- 2. Contas existentes na implantação: isentas.
insert into public.teacher_diagnostics (teacher_id, status, current_step)
select p.id, 'exempt', 1 from public.profiles p
on conflict (teacher_id) do nothing;

-- 3. Limpeza/validação das respostas (perguntas conhecidas; demais chaves são ignoradas).
--    Textos: aparados, até 1000 caracteres. Escolhas: apenas valores permitidos.
create or replace function public.teacher_diagnostic_clean(p_answers jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_key text;
  v_value jsonb;
  v_text text;
  v_items text[];
  v_single constant jsonb := '{
    "experience": ["lt1","1_2","3_5","6_10","gt10"],
    "main_activity": ["yes","no"],
    "students": ["0_5","6_10","11_20","21_40","gt40"],
    "team": ["solo","with_others"],
    "forgot_info": ["yes","no"],
    "admin_hours": ["lt1","1_2","2_4","4_6","gt6"],
    "business_view": ["yes","partly","no"]
  }'::jsonb;
  v_multi constant jsonb := '{
    "student_info_tools": ["paper","spreadsheet","google_calendar","whatsapp","notion","app","none","other"],
    "payment_tracking": ["spreadsheet","notebook","finance_app","bank","whatsapp","memory","other"],
    "pain_points": ["schedule","makeups","payments","collections","forecast","lesson_count","student_info","materials","progress","communication","priorities","other"]
  }'::jsonb;
  v_texts constant text[] := array['other_activity','student_info_tools_other','payment_tracking_other','makeup_control','admin_tools',
    'pain_points_other','eliminate_one','most_time','avoided_task','forgot_info_detail','day_organization','prioritization','improve','wish'];
  v_scales constant text[] := array['admin_control','professionalism'];
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'diagnostic_invalid_answers'; end if;
  for v_key, v_value in select key, value from jsonb_each(p_answers) loop
    if v_single ? v_key then
      if jsonb_typeof(v_value) <> 'string' or not (v_single -> v_key) ? (v_value #>> '{}') then raise exception 'diagnostic_invalid_answer:%', v_key; end if;
      v_out := v_out || jsonb_build_object(v_key, v_value);
    elsif v_multi ? v_key then
      if jsonb_typeof(v_value) <> 'array' then raise exception 'diagnostic_invalid_answer:%', v_key; end if;
      select coalesce(array_agg(distinct x order by x), '{}') into v_items from jsonb_array_elements_text(v_value) as x;
      if exists (select 1 from unnest(v_items) as x where not (v_multi -> v_key) ? x) then raise exception 'diagnostic_invalid_answer:%', v_key; end if;
      v_out := v_out || jsonb_build_object(v_key, to_jsonb(v_items));
    elsif v_key = any (v_texts) then
      if jsonb_typeof(v_value) <> 'string' then raise exception 'diagnostic_invalid_answer:%', v_key; end if;
      v_text := left(btrim(v_value #>> '{}'), 1000);
      v_out := v_out || jsonb_build_object(v_key, v_text);
    elsif v_key = any (v_scales) then
      if jsonb_typeof(v_value) <> 'number' or (v_value #>> '{}')::numeric not in (0,1,2,3,4,5,6,7,8,9,10) then
        raise exception 'diagnostic_invalid_answer:%', v_key;
      end if;
      v_out := v_out || jsonb_build_object(v_key, (v_value #>> '{}')::int);
    end if;
  end loop;
  return v_out;
end $$;

-- Primeira pergunta obrigatória sem resposta (NULL = completo). Abertas: mínimo de 2 caracteres.
create or replace function public.teacher_diagnostic_missing(p_answers jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_text_ok boolean;
begin
  foreach v_key in array array['experience','main_activity','students','team','admin_hours','forgot_info','business_view'] loop
    if coalesce(p_answers ->> v_key, '') = '' then return v_key; end if;
  end loop;
  foreach v_key in array array['student_info_tools','payment_tracking','pain_points'] loop
    if jsonb_typeof(p_answers -> v_key) is distinct from 'array' or jsonb_array_length(p_answers -> v_key) = 0 then return v_key; end if;
    if (p_answers -> v_key) ? 'other' and char_length(btrim(coalesce(p_answers ->> (v_key || '_other'), ''))) < 2 then return v_key || '_other'; end if;
  end loop;
  foreach v_key in array array['makeup_control','admin_tools','eliminate_one','most_time','avoided_task','day_organization','prioritization','improve','wish'] loop
    if char_length(btrim(coalesce(p_answers ->> v_key, ''))) < 2 then return v_key; end if;
  end loop;
  foreach v_key in array array['admin_control','professionalism'] loop
    if jsonb_typeof(p_answers -> v_key) is distinct from 'number' then return v_key; end if;
  end loop;
  if p_answers ->> 'main_activity' = 'no' and char_length(btrim(coalesce(p_answers ->> 'other_activity', ''))) < 2 then return 'other_activity'; end if;
  if p_answers ->> 'forgot_info' = 'yes' and char_length(btrim(coalesce(p_answers ->> 'forgot_info_detail', ''))) < 2 then return 'forgot_info_detail'; end if;
  return null;
end $$;

-- 4. Estado do próprio diagnóstico (usado pelo app para decidir a rota).
create or replace function public.get_my_teacher_diagnostic()
returns table (required boolean, status text, current_step integer, answers jsonb, consent_accepted_at timestamptz, schema_version integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_row public.teacher_diagnostics;
  v_admin boolean;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select * into v_row from public.teacher_diagnostics d where d.teacher_id = v_me;
  v_admin := public.has_role(v_me, 'super_admin');
  if v_row.teacher_id is null then
    return query select not v_admin, 'not_started'::text, 1, '{}'::jsonb, null::timestamptz, 1;
  else
    return query select (not v_admin and v_row.status = 'in_progress'), v_row.status, v_row.current_step::int, v_row.answers,
                        v_row.consent_accepted_at, v_row.schema_version;
  end if;
end $$;

-- 5. Aceite do aviso (cria a linha da teacher; nunca reabre isenta/concluída).
create or replace function public.accept_teacher_diagnostic_consent()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_row public.teacher_diagnostics;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  insert into public.teacher_diagnostics (teacher_id, status, current_step, consent_accepted_at)
  values (v_me, 'in_progress', 1, now())
  on conflict (teacher_id) do nothing;
  select * into v_row from public.teacher_diagnostics d where d.teacher_id = v_me for update;
  if v_row.status <> 'in_progress' then raise exception 'diagnostic_closed'; end if;
  if v_row.consent_accepted_at is null then
    update public.teacher_diagnostics d set consent_accepted_at = now(), updated_at = now() where d.teacher_id = v_me
    returning d.consent_accepted_at into v_row.consent_accepted_at;
  end if;
  return v_row.consent_accepted_at;
end $$;

-- 6. Salvar etapa (respostas parciais limpas e mescladas; etapa para retomar).
create or replace function public.save_teacher_diagnostic_step(p_step integer, p_answers jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_row public.teacher_diagnostics;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_step is null or p_step < 1 or p_step > 5 then raise exception 'diagnostic_invalid_step'; end if;
  select * into v_row from public.teacher_diagnostics d where d.teacher_id = v_me for update;
  if v_row.teacher_id is null or v_row.consent_accepted_at is null then raise exception 'diagnostic_consent_required'; end if;
  if v_row.status <> 'in_progress' then raise exception 'diagnostic_closed'; end if;
  update public.teacher_diagnostics d
     set answers = d.answers || public.teacher_diagnostic_clean(p_answers), current_step = p_step, updated_at = now()
   where d.teacher_id = v_me;
  return p_step;
end $$;

-- 7. Concluir: valida tudo no servidor e encerra (sem edição posterior).
create or replace function public.complete_teacher_diagnostic(p_answers jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_row public.teacher_diagnostics;
  v_answers jsonb;
  v_missing text;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select * into v_row from public.teacher_diagnostics d where d.teacher_id = v_me for update;
  if v_row.teacher_id is null or v_row.consent_accepted_at is null then raise exception 'diagnostic_consent_required'; end if;
  if v_row.status <> 'in_progress' then raise exception 'diagnostic_closed'; end if;
  v_answers := v_row.answers || public.teacher_diagnostic_clean(coalesce(p_answers, '{}'::jsonb));
  v_missing := public.teacher_diagnostic_missing(v_answers);
  if v_missing is not null then raise exception 'diagnostic_incomplete:%', v_missing; end if;
  update public.teacher_diagnostics d
     set answers = v_answers, status = 'completed', current_step = 5, completed_at = now(), updated_at = now()
   where d.teacher_id = v_me
  returning d.completed_at into v_row.completed_at;
  return v_row.completed_at;
end $$;

-- 8. Painel: somente super_admin. Isentas não aparecem.
create or replace function public.list_teacher_diagnostics()
returns table (teacher_id uuid, full_name text, status text, current_step integer, answers jsonb, schema_version integer,
               consent_accepted_at timestamptz, started_at timestamptz, updated_at timestamptz, completed_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'super_admin') then raise exception 'forbidden'; end if;
  return query
  select d.teacher_id, p.full_name, d.status, d.current_step::int, d.answers, d.schema_version,
         d.consent_accepted_at, d.started_at, d.updated_at, d.completed_at
    from public.teacher_diagnostics d
    join public.profiles p on p.id = d.teacher_id
   where d.status in ('in_progress', 'completed')
   order by d.completed_at desc nulls last, d.updated_at desc;
end $$;

-- 9. Permissões
revoke all on function public.teacher_diagnostic_clean(jsonb)              from public, anon, authenticated;
revoke all on function public.teacher_diagnostic_missing(jsonb)            from public, anon, authenticated;
revoke all on function public.get_my_teacher_diagnostic()                  from public, anon, authenticated;
revoke all on function public.accept_teacher_diagnostic_consent()          from public, anon, authenticated;
revoke all on function public.save_teacher_diagnostic_step(integer, jsonb) from public, anon, authenticated;
revoke all on function public.complete_teacher_diagnostic(jsonb)           from public, anon, authenticated;
revoke all on function public.list_teacher_diagnostics()                   from public, anon, authenticated;
grant execute on function public.get_my_teacher_diagnostic()                  to authenticated;
grant execute on function public.accept_teacher_diagnostic_consent()          to authenticated;
grant execute on function public.save_teacher_diagnostic_step(integer, jsonb) to authenticated;
grant execute on function public.complete_teacher_diagnostic(jsonb)           to authenticated;
grant execute on function public.list_teacher_diagnostics()                   to authenticated;

commit;

-- =====================================================================================
-- VERIFICAÇÃO PÓS-MIGRAÇÃO: arquivo separado 20261116120000_teacher_diagnostics_verify.sql
--
-- ROLLBACK (manual, somente se necessário; apaga todos os diagnósticos):
-- begin;
--   drop function if exists public.list_teacher_diagnostics();
--   drop function if exists public.complete_teacher_diagnostic(jsonb);
--   drop function if exists public.save_teacher_diagnostic_step(integer, jsonb);
--   drop function if exists public.accept_teacher_diagnostic_consent();
--   drop function if exists public.get_my_teacher_diagnostic();
--   drop function if exists public.teacher_diagnostic_missing(jsonb);
--   drop function if exists public.teacher_diagnostic_clean(jsonb);
--   drop table if exists public.teacher_diagnostics;
-- commit;
-- =====================================================================================

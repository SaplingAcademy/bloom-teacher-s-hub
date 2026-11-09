-- Bloom — Renovação programada de contratos (APLICAÇÃO MANUAL)
-- Nome: 20261109120000_scheduled_contract_renewals_manual.sql
--
-- Somente estrutura: não altera nenhum contrato ou cobrança existente.
--
-- 1. Índices únicos parciais: no máximo UMA renovação programada ('scheduled') por
--    contrato anterior e por aluno (protege também contra requisições simultâneas).
--
-- 2. public.activate_due_scheduled_contracts()  — chamada pelo app e pelo agendador
--    - Sem parâmetros: a data efetiva é SEMPRE a do servidor em America/Sao_Paulo.
--    - Usuário autenticado: processa apenas os contratos do próprio professor (auth.uid()).
--    - Sem usuário: somente service_role ou sessão direta do banco (pg_cron/SQL Editor
--      como postgres) processa todos os professores; qualquer outro chamador é recusado.
--
-- 3. public.activate_due_scheduled_contracts_core(p_today, p_teacher_id) — interna
--    - Executável apenas por service_role (e pelo dono); usuários comuns não controlam a data.
--    - Para cada contrato programado vencido, bloqueado com FOR UPDATE SKIP LOCKED, só
--      ativa se a transição for válida:
--        * possui renewed_from_id (sem órfãos) e o contrato anterior existe;
--        * o anterior está 'active' (não ativa sobre contrato encerrado inesperadamente);
--        * anterior e novo pertencem ao mesmo aluno e professor, e o aluno pertence ao professor;
--        * o novo começa depois do início e do término do anterior (sem sobreposição);
--        * não há outro contrato ativo para o aluno (respeita idx_student_packages_active_student).
--    - Transição atômica em sub-transação: conclui o anterior com o PRÓPRIO término
--      (ended_at/last_due_date; contínuo = véspera do novo início), ativa o novo e atualiza
--      students.package_id/due_day. Cada UPDATE precisa afetar exatamente 1 linha; caso
--      contrário a sub-transação é desfeita e a ativação NÃO é contabilizada.
--    - Idempotente: apenas linhas ainda 'scheduled' são processadas.
--    - Nunca lê nem altera cobranças (invoices/payments).
--
--    SECURITY DEFINER com escopo explícito por professor: o resultado não depende das
--    políticas RLS de students/student_packages (tabelas do dono, sem FORCE RLS).
--    Conferir com a consulta de verificação de RLS antes de aplicar.
--
-- Não executar automaticamente. Aplicar manualmente no SQL Editor do Supabase.

begin;

-- 1. Uma renovação programada por contrato anterior e por aluno
create unique index if not exists idx_student_packages_scheduled_renewal
  on public.student_packages (renewed_from_id)
  where status = 'scheduled' and renewed_from_id is not null;

create unique index if not exists idx_student_packages_scheduled_student
  on public.student_packages (student_id)
  where status = 'scheduled';

-- Assinatura anterior (proposta não aplicada) que aceitava data do cliente.
drop function if exists public.activate_due_scheduled_contracts(date);

-- 2. Núcleo interno: transição validada, atômica e idempotente
create or replace function public.activate_due_scheduled_contracts_core(p_today date, p_teacher_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new public.student_packages%rowtype;
  v_prev public.student_packages%rowtype;
  v_prev_end date;
  v_rows integer;
  v_count integer := 0;
begin
  if p_today is null then
    raise exception 'activate_due_scheduled_contracts_core: data obrigatória';
  end if;

  for v_new in
    select *
    from public.student_packages
    where status = 'scheduled'
      and started_at <= p_today
      and (p_teacher_id is null or teacher_id = p_teacher_id)
    order by started_at, created_at
    for update skip locked
  loop
    begin
      -- Vínculo obrigatório com o contrato anterior (sem órfãos).
      if v_new.renewed_from_id is null then
        raise warning 'contrato % não ativado: renovação sem contrato anterior', v_new.id;
        continue;
      end if;

      select * into v_prev
      from public.student_packages
      where id = v_new.renewed_from_id
      for update;

      if not found then
        raise warning 'contrato % não ativado: contrato anterior inexistente', v_new.id;
        continue;
      end if;

      -- Estado esperado: o anterior ainda está em vigor.
      if v_prev.status <> 'active' then
        raise warning 'contrato % não ativado: contrato anterior em estado %', v_new.id, v_prev.status;
        continue;
      end if;

      -- Consistência de aluno e professor.
      if v_prev.student_id <> v_new.student_id or v_prev.teacher_id <> v_new.teacher_id then
        raise warning 'contrato % não ativado: vínculos inconsistentes com o anterior', v_new.id;
        continue;
      end if;
      if not exists (
        select 1 from public.students s
        where s.id = v_new.student_id and s.teacher_id = v_new.teacher_id
      ) then
        raise warning 'contrato % não ativado: aluno não pertence ao professor', v_new.id;
        continue;
      end if;

      -- Sem sobreposição com o contrato anterior.
      v_prev_end := coalesce(v_prev.ended_at, v_prev.last_due_date);
      if v_new.started_at <= v_prev.started_at
         or (v_prev_end is not null and v_new.started_at <= v_prev_end) then
        raise warning 'contrato % não ativado: início sobreposto ao contrato anterior', v_new.id;
        continue;
      end if;

      -- Índice único de ativo: nenhum outro contrato ativo além do anterior.
      if exists (
        select 1 from public.student_packages
        where student_id = v_new.student_id
          and status = 'active'
          and id <> v_prev.id
      ) then
        raise warning 'contrato % não ativado: aluno possui outro contrato ativo', v_new.id;
        continue;
      end if;

      -- Transição: cada UPDATE deve afetar exatamente uma linha.
      update public.student_packages
      set status = 'completed',
          ended_at = coalesce(v_prev_end, v_new.started_at - 1),
          updated_at = now()
      where id = v_prev.id and status = 'active';
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then
        raise exception 'contrato anterior % não concluído', v_prev.id;
      end if;

      update public.student_packages
      set status = 'active', updated_at = now()
      where id = v_new.id and status = 'scheduled';
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then
        raise exception 'contrato % não ativado', v_new.id;
      end if;

      update public.students
      set package_id = v_new.package_id,
          due_day = coalesce(v_new.due_day, due_day),
          updated_at = now()
      where id = v_new.student_id and teacher_id = v_new.teacher_id;
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then
        raise exception 'aluno % não atualizado', v_new.student_id;
      end if;

      v_count := v_count + 1;
    exception when others then
      -- Desfaz só esta transição (sub-transação); não é contabilizada.
      raise warning 'contrato % não ativado: %', v_new.id, sqlerrm;
    end;
  end loop;

  return v_count;
end;
$$;

-- 3. Ponto de entrada (app e agendador): data do servidor em America/Sao_Paulo
create or replace function public.activate_due_scheduled_contracts()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_uid uuid := auth.uid();
  v_role text := auth.role();
begin
  if v_uid is not null then
    return public.activate_due_scheduled_contracts_core(v_today, v_uid);
  end if;
  -- Sem usuário: somente serviço ou sessão direta do banco (ex.: pg_cron como postgres).
  if v_role = 'service_role' or (v_role is null and session_user in ('postgres', 'supabase_admin')) then
    return public.activate_due_scheduled_contracts_core(v_today, null);
  end if;
  raise exception 'activate_due_scheduled_contracts: não autorizado' using errcode = '42501';
end;
$$;

revoke all on function public.activate_due_scheduled_contracts_core(date, uuid) from public, anon, authenticated;
grant execute on function public.activate_due_scheduled_contracts_core(date, uuid) to service_role;

revoke all on function public.activate_due_scheduled_contracts() from public, anon;
grant execute on function public.activate_due_scheduled_contracts() to authenticated, service_role;

commit;

-- 4. AGENDAMENTO AUTOMÁTICO — DESATIVADO (NÃO EXECUTAR SEM AUTORIZAÇÃO ESPECÍFICA)
-- O agendador do Supabase ("Integrations → Cron") usa a extensão pg_cron, hoje não
-- instalada. Após autorização e habilitação (Database → Extensions → pg_cron), o job
-- diário às 00:05 de Brasília (03:05 UTC) chamaria o MESMO ponto de entrada:
--
-- select cron.schedule(
--   'bloom-activate-scheduled-contracts',
--   '5 3 * * *',
--   $job$ select public.activate_due_scheduled_contracts(); $job$
-- );
--
-- Para remover: select cron.unschedule('bloom-activate-scheduled-contracts');

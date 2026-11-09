-- Bloom — Renovação programada de contratos (APLICAÇÃO MANUAL)
-- Nome: 20261109120000_scheduled_contract_renewals_manual.sql
--
-- O que faz (somente estrutura; não altera nenhum contrato ou cobrança existente):
--   1. Índices únicos parciais: no máximo UMA renovação programada ('scheduled') por
--      contrato anterior e por aluno — protege inclusive contra requisições simultâneas.
--   2. RPC public.activate_due_scheduled_contracts(p_today): ativa, de forma transacional
--      e idempotente, as renovações programadas cujo início chegou. Para cada uma:
--        - bloqueia a linha programada (FOR UPDATE SKIP LOCKED) e o contrato anterior;
--        - conclui o contrato anterior com o próprio término (ended_at existente ou
--          início do novo − 1 — nunca encurta: o novo começa no dia seguinte ao término);
--        - ativa o novo contrato e atualiza students.package_id/due_day;
--        - respeita o índice único de contrato ativo (idx_student_packages_active_student):
--          se já houver outro ativo para o aluno, não ativa;
--        - nunca ativa se o contrato anterior estiver inativo (aluno inativado).
--      Cada contrato é processado em sub-transação: uma falha não afeta os demais e
--      nunca deixa estado intermediário (anterior concluído sem o novo ativo).
--      SECURITY INVOKER: pelo app, a RLS limita ao professor autenticado; executada
--      pelo agendador (postgres/service_role), processa todos os professores.
--
-- Pré-condições verificadas em produção (consulta de verificação, 2026-11-09):
--   status sem CHECK; idx_student_packages_active_student existe; RLS ativa;
--   sem duplicidades; pg_cron não instalado.
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

-- 2. Ativação transacional e idempotente
create or replace function public.activate_due_scheduled_contracts(p_today date default current_date)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  -- Margem de 1 dia para fuso horário do cliente; nunca antecipa além disso.
  v_today date := least(coalesce(p_today, current_date), current_date + 1);
  v_new public.student_packages%rowtype;
  v_prev public.student_packages%rowtype;
  v_count integer := 0;
begin
  for v_new in
    select *
    from public.student_packages
    where status = 'scheduled'
      and started_at <= v_today
    order by started_at, created_at
    for update skip locked
  loop
    begin
      -- Revalida após o bloqueio (outra execução pode ter processado a linha).
      if not exists (select 1 from public.student_packages where id = v_new.id and status = 'scheduled') then
        continue;
      end if;

      v_prev := null;
      if v_new.renewed_from_id is not null then
        select * into v_prev
        from public.student_packages
        where id = v_new.renewed_from_id
        for update;

        -- Aluno inativado (ou contrato anterior encerrado de outra forma): não ativa sozinho.
        if found and v_prev.status = 'inactive' then
          continue;
        end if;
      end if;

      -- Respeita o índice único de ativo: outro contrato ativo que não seja o anterior bloqueia.
      if exists (
        select 1 from public.student_packages
        where student_id = v_new.student_id
          and status = 'active'
          and id <> v_new.id
          and id is distinct from v_new.renewed_from_id
      ) then
        continue;
      end if;

      -- Conclui o anterior com o próprio término (sem encurtar) e só então ativa o novo.
      if v_prev.id is not null and v_prev.status = 'active' then
        update public.student_packages
        set status = 'completed',
            ended_at = coalesce(ended_at, v_new.started_at - 1),
            updated_at = now()
        where id = v_prev.id and status = 'active';
      end if;

      update public.student_packages
      set status = 'active', updated_at = now()
      where id = v_new.id and status = 'scheduled';

      update public.students
      set package_id = v_new.package_id,
          due_day = coalesce(v_new.due_day, due_day),
          updated_at = now()
      where id = v_new.student_id;

      v_count := v_count + 1;
    exception when others then
      -- Desfaz só esta ativação (sub-transação) e segue com as demais.
      raise warning 'activate_due_scheduled_contracts: contrato % não ativado: %', v_new.id, sqlerrm;
    end;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.activate_due_scheduled_contracts(date) from public;
grant execute on function public.activate_due_scheduled_contracts(date) to authenticated, service_role;

commit;

-- 3. AGENDAMENTO AUTOMÁTICO (OPCIONAL — NÃO EXECUTAR SEM AUTORIZAÇÃO)
-- O agendador nativo do Supabase ("Integrations → Cron") usa a extensão pg_cron.
-- Depois de habilitá-la (Database → Extensions → pg_cron), um job diário às 00:05 de
-- Brasília (03:05 UTC) chamaria a MESMA função transacional:
--
-- select cron.schedule(
--   'bloom-activate-scheduled-contracts',
--   '5 3 * * *',
--   $job$ select public.activate_due_scheduled_contracts((now() at time zone 'America/Sao_Paulo')::date); $job$
-- );
--
-- Para remover: select cron.unschedule('bloom-activate-scheduled-contracts');

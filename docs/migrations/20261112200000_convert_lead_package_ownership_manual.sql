-- =========================================================================================
-- Segurança — P2: convert_lead_to_student valida o pacote e filtra tarefas pela professora
-- Aplicação MANUAL no SQL Editor do Supabase, como postgres. Não usar ferramentas de migração.
--
-- PROBLEMAS CORRIGIDOS (confirmados na definição de produção)
--   1. p_package_id não era validado contra public.packages.teacher_id: por ser SECURITY DEFINER,
--      a função gravava em students/student_packages o pacote de outra professora, contornando a
--      política RLS de student_packages (que exige p.teacher_id = auth.uid()).
--   2. O UPDATE public.tasks (conclusão das tarefas pendentes do Lead) não filtrava por teacher_id.
--
-- O QUE ESTE ARQUIVO FAZ
--   Lê a definição REAL instalada (pg_get_functiondef), aplica somente duas alterações de texto e
--   recria a função com CREATE OR REPLACE (preserva dono, SECURITY DEFINER, search_path e o ACL
--   corrigido no P1 — anon continua sem EXECUTE):
--     a) antes do INSERT em public.students (ou seja, depois da guarda already_converted, que
--        continua respondendo igual em reconversões), insere:
--          se p_package_id não for nulo e não pertencer a p_teacher_id →
--          return {success: false, error: 'Package not found or unauthorized'}
--     b) no UPDATE public.tasks, "where lead_id = p_lead_id" passa a
--        "where lead_id = p_lead_id and teacher_id = p_teacher_id".
--   Todo o restante (assinatura, defaults, autorização, FOR UPDATE, converted_at, criação do
--   aluno, vínculo do pacote, evento/atividade, idempotência, retorno, exception) fica idêntico.
--   Não altera outras funções, tabelas de negócio nem políticas RLS.
--
-- SEGURANÇA DA EXECUÇÃO (tudo em uma transação; qualquer falha aborta sem alterar nada)
--   - exatamente uma função public.convert_lead_to_student com a assinatura esperada,
--     SECURITY DEFINER e com dono postgres;
--   - exatamente um INSERT em public.students e um UPDATE em public.tasks com
--     "where lead_id = p_lead_id" e sem filtro de teacher_id;
--   - reaplicação: se as duas alterações já estiverem presentes, nada é feito; se só uma estiver,
--     aborta (estado inesperado);
--   - antes de alterar, guarda a definição e o ACL originais em
--     bloom_security_audit.p2_function_definition_snapshot (schema fora da API, RLS habilitado,
--     sem acesso para PUBLIC, anon e authenticated) — uma única vez;
--   - depois de recriar, confere: as duas alterações presentes, a quantidade de ocorrências de
--     converted_at inalterada, dono/SECURITY DEFINER/search_path/ACL idênticos aos de antes,
--     anon sem EXECUTE e authenticated com EXECUTE.
--
-- ROLLBACK
--   Ver "ROLLBACK EXATO" no fim do arquivo. Depois da aplicação, execute a consulta "IMPRESSÃO
--   DIGITAL" e guarde o valor fora do banco: o rollback exige esse valor.
-- =========================================================================================
begin;
set local search_path = pg_catalog, public;

create schema if not exists bloom_security_audit;
revoke all on schema bloom_security_audit from public, anon, authenticated;

create table if not exists bloom_security_audit.p2_function_definition_snapshot (
  function_signature text primary key,
  original_definition text not null,
  original_acl aclitem[] not null,
  captured_at timestamptz not null default now()
);
alter table bloom_security_audit.p2_function_definition_snapshot enable row level security;
revoke all on bloom_security_audit.p2_function_definition_snapshot from public, anon, authenticated;

do $p2$
declare
  c_sig constant text := 'public.convert_lead_to_student(uuid, uuid, text, text, text, text, text, text, text, uuid, text, text)';
  c_error constant text := 'Package not found or unauthorized';
  v_oid oid;
  v_count int;
  v_def text;
  v_new text;
  v_tasks text[];
  v_tasks_block text;
  v_tasks_new text;
  v_has_pkg boolean;
  v_has_tasks boolean;
  v_acl_before aclitem[];
  v_owner_before oid;
  v_config_before text[];
  v_converted_before int;
  v_after record;
begin
  -- 1. Função exata, sem overloads
  select count(*) into v_count
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'convert_lead_to_student';
  if v_count <> 1 then
    raise exception 'P2 abortado: esperada exatamente uma convert_lead_to_student; encontradas %.', v_count;
  end if;

  v_oid := to_regprocedure(c_sig);
  if v_oid is null then
    raise exception 'P2 abortado: assinatura % não encontrada.', c_sig;
  end if;

  select p.proacl, p.proowner, p.proconfig
    into v_acl_before, v_owner_before, v_config_before
  from pg_proc p where p.oid = v_oid;

  if not (select prosecdef from pg_proc where oid = v_oid) then
    raise exception 'P2 abortado: a função não é SECURITY DEFINER.';
  end if;
  if v_owner_before <> 'postgres'::regrole then
    raise exception 'P2 abortado: dono da função é %, esperado postgres.', v_owner_before::regrole;
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception 'P2 abortado: anon ainda executa a função (aplicar o P1 antes).';
  end if;

  v_def := pg_get_functiondef(v_oid);

  -- 2. Estado atual: já corrigido, parcialmente corrigido ou original
  select array_agg(m[1]) into v_tasks
  from regexp_matches(v_def, '(update\s+public\.tasks\M[^;]*;)', 'gi') as m;
  if coalesce(cardinality(v_tasks), 0) <> 1 then
    raise exception 'P2 abortado: esperado exatamente um UPDATE public.tasks; encontrados %.', coalesce(cardinality(v_tasks), 0);
  end if;
  v_tasks_block := v_tasks[1];

  v_has_pkg := position(c_error in v_def) > 0;
  v_has_tasks := v_tasks_block ~* '\mteacher_id\s*=\s*p_teacher_id\M';

  if v_has_pkg and v_has_tasks then
    raise notice 'P2 já aplicado: validação do pacote e filtro de tarefas presentes. Nenhuma mudança.';
    return;
  end if;
  if v_has_pkg <> v_has_tasks then
    raise exception 'P2 abortado: estado parcial (pacote=%, tarefas=%); revisar a definição.', v_has_pkg, v_has_tasks;
  end if;

  -- 3. Conferências da definição original
  if (select count(*) from regexp_matches(v_def, 'insert\s+into\s+public\.students\s*\(', 'gi')) <> 1 then
    raise exception 'P2 abortado: esperado exatamente um INSERT em public.students.';
  end if;
  if (select count(*) from regexp_matches(v_tasks_block, 'where\s+lead_id\s*=\s*p_lead_id\M', 'gi')) <> 1 then
    raise exception 'P2 abortado: UPDATE public.tasks sem "where lead_id = p_lead_id" esperado.';
  end if;
  if v_tasks_block ~* '\mteacher_id\M' then
    raise exception 'P2 abortado: UPDATE public.tasks já referencia teacher_id de outra forma; revisar.';
  end if;
  v_converted_before := (select count(*) from regexp_matches(v_def, 'converted_at', 'gi'));

  -- 4. Snapshot da definição original (uma única vez)
  insert into bloom_security_audit.p2_function_definition_snapshot (function_signature, original_definition, original_acl)
  values (c_sig, v_def, coalesce(v_acl_before, acldefault('f', v_owner_before)))
  on conflict (function_signature) do nothing;
  if (select original_definition from bloom_security_audit.p2_function_definition_snapshot where function_signature = c_sig) <> v_def then
    raise exception 'P2 abortado: snapshot preexistente não corresponde à definição atual; revisar.';
  end if;

  -- 5a. Validação do pacote, imediatamente antes do INSERT em public.students
  v_new := regexp_replace(
    v_def,
    '(insert\s+into\s+public\.students\s*\()',
    E'-- P2: o pacote informado precisa pertencer à professora autenticada\n'
    || E'  if p_package_id is not null and not exists (\n'
    || E'    select 1 from public.packages pk\n'
    || E'    where pk.id = p_package_id and pk.teacher_id = p_teacher_id\n'
    || E'  ) then\n'
    || E'    return jsonb_build_object(''success'', false, ''error'', ''' || c_error || E''');\n'
    || E'  end if;\n\n'
    || E'  \\1',
    'i'
  );

  -- 5b. Filtro de tarefas pela professora
  v_tasks_new := regexp_replace(v_tasks_block, '(where\s+lead_id\s*=\s*p_lead_id)\M', '\1 and teacher_id = p_teacher_id', 'i');
  if v_tasks_new = v_tasks_block or position(v_tasks_block in v_new) = 0 then
    raise exception 'P2 abortado: alteração do UPDATE public.tasks não pôde ser aplicada.';
  end if;
  v_new := replace(v_new, v_tasks_block, v_tasks_new);

  if v_new = v_def then
    raise exception 'P2 abortado: o patch não produziu alterações.';
  end if;

  execute v_new;

  -- 6. Conferência pós-alteração (dentro da mesma transação)
  select p.proacl, p.proowner, p.proconfig, p.prosecdef, pg_get_functiondef(p.oid) as def
    into v_after
  from pg_proc p where p.oid = v_oid;

  if position(c_error in v_after.def) = 0
     or v_after.def !~* 'update\s+public\.tasks\M[^;]*where\s+lead_id\s*=\s*p_lead_id\s+and\s+teacher_id\s*=\s*p_teacher_id' then
    raise exception 'P2 abortado: alterações ausentes na definição recriada.';
  end if;
  if (select count(*) from regexp_matches(v_after.def, 'converted_at', 'gi')) <> v_converted_before then
    raise exception 'P2 abortado: ocorrências de converted_at mudaram.';
  end if;
  if v_after.proacl is distinct from v_acl_before
     or v_after.proowner <> v_owner_before
     or v_after.proconfig is distinct from v_config_before
     or not v_after.prosecdef then
    raise exception 'P2 abortado: dono, SECURITY DEFINER, search_path ou ACL mudaram.';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') or not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'P2 abortado: permissões efetivas inesperadas (anon deve estar sem EXECUTE; authenticated com).';
  end if;
end;
$p2$;

notify pgrst, 'reload schema';
commit;

-- =========================================================================================
-- VERIFICAÇÃO PÓS-APLICAÇÃO (somente leitura; executar separadamente)
-- Esperado: valida_pacote = true, filtra_tarefas = true, preserva_converted_at = true,
--           security_definer = true, dono = postgres, anon_exec = false, auth_exec = true.
-- =========================================================================================
-- select
--   position('Package not found or unauthorized' in d.def) > 0 as valida_pacote,
--   d.def ~* 'update\s+public\.tasks\M[^;]*where\s+lead_id\s*=\s*p_lead_id\s+and\s+teacher_id\s*=\s*p_teacher_id' as filtra_tarefas,
--   d.def ~* 'converted_at\s*=\s*coalesce\s*\(\s*converted_at' as preserva_converted_at,
--   p.prosecdef as security_definer,
--   pg_get_userbyid(p.proowner) as dono,
--   p.proconfig,
--   has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
--   has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
--   p.proacl
-- from pg_proc p
-- cross join lateral (select pg_get_functiondef(p.oid) as def) d
-- where p.oid = 'public.convert_lead_to_student(uuid, uuid, text, text, text, text, text, text, text, uuid, text, text)'::regprocedure;
--
-- IMPRESSÃO DIGITAL (somente leitura): executar logo após a aplicação e guardar fora do banco.
-- select md5(original_definition || '|' || original_acl::text) as fingerprint
-- from bloom_security_audit.p2_function_definition_snapshot
-- where function_signature = 'public.convert_lead_to_student(uuid, uuid, text, text, text, text, text, text, text, uuid, text, text)';

-- =========================================================================================
-- ROLLBACK EXATO (somente se necessário; executar separadamente, sem os "--", como postgres)
-- Recria a definição original guardada no snapshot (CREATE OR REPLACE preserva o ACL atual) e
-- confere que a definição voltou a ser idêntica à original e que o ACL não mudou (anon segue sem
-- EXECUTE). Aborta, sem alterar nada, se a impressão digital não conferir.
-- Substitua <COLE_A_IMPRESSAO_DIGITAL> pelo valor guardado após a aplicação.
-- =========================================================================================
-- begin;
-- set local search_path = pg_catalog, public;
-- do $p2rb$
-- declare
--   c_sig constant text := 'public.convert_lead_to_student(uuid, uuid, text, text, text, text, text, text, text, uuid, text, text)';
--   v_fingerprint text := '<COLE_A_IMPRESSAO_DIGITAL>';
--   v_snap record;
--   v_oid oid;
--   v_acl_before aclitem[];
-- begin
--   select * into v_snap from bloom_security_audit.p2_function_definition_snapshot where function_signature = c_sig;
--   if not found then
--     raise exception 'Rollback abortado: snapshot não encontrado.';
--   end if;
--   if md5(v_snap.original_definition || '|' || v_snap.original_acl::text) is distinct from v_fingerprint then
--     raise exception 'Rollback abortado: impressão digital não confere (snapshot alterado ou valor incorreto).';
--   end if;
--   v_oid := to_regprocedure(c_sig);
--   if v_oid is null then
--     raise exception 'Rollback abortado: função não encontrada.';
--   end if;
--   select proacl into v_acl_before from pg_proc where oid = v_oid;
--   execute v_snap.original_definition;
--   if pg_get_functiondef(v_oid) is distinct from v_snap.original_definition then
--     raise exception 'Rollback abortado: definição restaurada difere da original.';
--   end if;
--   if (select proacl from pg_proc where oid = v_oid) is distinct from v_acl_before
--      or has_function_privilege('anon', v_oid, 'EXECUTE') then
--     raise exception 'Rollback abortado: ACL mudou durante o rollback.';
--   end if;
-- end;
-- $p2rb$;
-- notify pgrst, 'reload schema';
-- commit;
--
-- Limpeza do snapshot (opcional, apenas depois de confirmar que o rollback não será necessário)
-- drop table bloom_security_audit.p2_function_definition_snapshot;

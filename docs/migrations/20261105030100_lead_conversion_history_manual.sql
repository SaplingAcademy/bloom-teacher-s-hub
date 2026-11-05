-- BLOOM: correção pontual do destino do histórico de conversão.
-- APLICAÇÃO MANUAL. Este arquivo NÃO foi executado.
-- Modifica apenas o INSERT de automation_activity dentro da definição REAL
-- instalada, sem reconstruir a função a partir de uma migration antiga.
-- Preserva assinatura/defaults, autorização, FOR UPDATE, converted_at,
-- NULL/modalidade, pacotes, tarefas, evento/payload, retorno e grants existentes.
-- Sem backfill: a leitura do Bloom já inclui os registros antigos pelo evento
-- lead.converted associado ao Lead original, sem modificar nenhum registro.

begin;

do $manual_patch$
declare
  v_oid oid;
  v_count integer;
  v_definition text;
  v_block text;
  v_blocks text[];
  v_changed_block text;
begin
  -- Nunca selecionar arbitrariamente um overload nem criar outra assinatura.
  select count(*), (array_agg(p.oid))[1]
    into v_count, v_oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'convert_lead_to_student'
     and p.prokind = 'f';

  if v_count <> 1 then
    raise exception 'Esperada exatamente uma convert_lead_to_student; encontradas %. Nenhuma mudança aplicada.', v_count;
  end if;

  select pg_get_functiondef(v_oid) into v_definition;

  -- Restringe o patch ao comando que registra a atividade, não ao aluno,
  -- às tarefas, ao payload nem a outro trecho da função.
  select array_agg(m[1]) into v_blocks
    from regexp_matches(
      v_definition,
      '(insert\s+into\s+public\.automation_activity\s*\([^;]+;)',
      'gi'
    ) as m;

  if coalesce(cardinality(v_blocks), 0) <> 1 then
    raise exception 'INSERT de automation_activity diferente do esperado. Nenhuma mudança aplicada.';
  end if;

  v_block := v_blocks[1];
  if v_block !~* '''lead_converted''' then
    raise exception 'O INSERT não é o registro de conversão esperado. Nenhuma mudança aplicada.';
  end if;

  -- Reaplicação é inofensiva: não toca na função já corrigida.
  if v_block ~* '''leads''\s*,\s*p_lead_id' then
    raise notice 'Histórico de conversão já direcionado ao Lead; nenhuma mudança necessária.';
    return;
  end if;

  if v_block !~* '''students''\s*,\s*v_student_id' then
    raise exception 'Destino histórico diferente do esperado. Nenhuma mudança aplicada.';
  end if;

  v_changed_block := regexp_replace(
    v_block,
    '''students''(\s*,\s*)v_student_id\M',
    '''leads''\1p_lead_id',
    'i'
  );
  if v_changed_block = v_block then
    raise exception 'Patch não produziu a alteração esperada. Nenhuma mudança aplicada.';
  end if;

  -- CREATE OR REPLACE da própria definição preserva owner e grants da função.
  -- O bloqueio do Lead e a guarda already_converted permanecem intactos:
  -- reexecuções não criam aluno, evento ou atividade de conversão novamente.
  execute replace(v_definition, v_block, v_changed_block);
end;
$manual_patch$;

notify pgrst, 'reload schema';
commit;
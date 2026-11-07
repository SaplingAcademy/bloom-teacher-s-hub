-- ============================================================================
-- BLOOM — ETAPA 1: CONTRATOS DOS ALUNOS (PROPOSTA DE SQL MANUAL)
-- ============================================================================
-- NÃO EXECUTADO durante a preparação desta proposta.
--
-- Escopo: instalação nova das tabelas usadas por src/types/contracts.ts e
-- src/lib/student-contracts.ts. Não altera students.course_* nem o faturamento.
--
-- SEGURANÇA: se public.student_contracts ou
-- public.student_contract_documents já existirem, NÃO execute este script.
-- Nesse caso, primeiro reconcile as definições instaladas e gere um script
-- incremental; CREATE TABLE sem IF NOT EXISTS faz a transação falhar sem
-- substituir tabelas, políticas ou histórico existentes.
--
-- PRÉ-REQUISITO FORA DESTE SQL: criar o bucket "contracts" pela Storage API,
-- com public=false, file_size_limit=10485760 (10 MB) e allowed_mime_types=
-- ['application/pdf', 'image/jpeg', 'image/png']. Buckets não são criados por
-- esta migração. As políticas de storage.objects estão na seção 8.
-- ============================================================================

BEGIN;

-- 1. Contratos: cada linha é um contrato histórico independente.
CREATE TABLE public.student_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_package_id uuid REFERENCES public.student_packages(id) ON DELETE SET NULL,
  previous_contract_id uuid REFERENCES public.student_contracts(id) ON DELETE SET NULL,
  title text,
  contract_number text,
  start_date date NOT NULL,
  -- Nullable somente para compatibilidade com contratos antigos indeterminados.
  -- A criação da Etapa 1 exige as duas datas no formulário e na ativação.
  end_date date,
  status text NOT NULL DEFAULT 'draft',
  reminders_enabled boolean NOT NULL DEFAULT true,
  signer_type text NOT NULL DEFAULT 'student',
  signer_name text,
  signer_email text,
  signer_phone text,
  signer_document text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_contracts_dates_valid
    CHECK (end_date IS NULL OR end_date > start_date),
  CONSTRAINT student_contracts_status_valid
    CHECK (status IN ('draft', 'active', 'renewed', 'completed', 'cancelled')),
  CONSTRAINT student_contracts_signer_type_valid
    CHECK (signer_type IN ('student', 'guardian', 'company', 'other')),
  CONSTRAINT student_contracts_not_self_previous
    CHECK (previous_contract_id IS NULL OR previous_contract_id <> id)
);

-- 2. Metadados dos documentos; o binário fica somente no bucket privado.
CREATE TABLE public.student_contract_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.student_contracts(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_type text NOT NULL DEFAULT 'signed',
  file_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  file_size_bytes bigint NOT NULL,
  mime_type text NOT NULL,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_contract_documents_type_valid
    CHECK (document_type IN ('original', 'signed', 'amendment', 'cancellation', 'other')),
  CONSTRAINT student_contract_documents_size_valid
    CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760),
  CONSTRAINT student_contract_documents_mime_valid
    CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  CONSTRAINT student_contract_documents_name_not_blank
    CHECK (length(btrim(file_name)) > 0)
);

-- 3. Grants explícitos; nenhum acesso anon.
REVOKE ALL ON TABLE public.student_contracts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.student_contract_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_contracts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.student_contract_documents TO authenticated;
GRANT ALL ON TABLE public.student_contracts TO service_role;
GRANT ALL ON TABLE public.student_contract_documents TO service_role;

-- 4. Índices: histórico, documentos e um único contrato atual por aluno.
CREATE INDEX student_contracts_teacher_student_start_idx
  ON public.student_contracts (teacher_id, student_id, start_date DESC, id);
CREATE INDEX student_contracts_previous_idx
  ON public.student_contracts (previous_contract_id)
  WHERE previous_contract_id IS NOT NULL;
CREATE UNIQUE INDEX student_contracts_one_active_per_student_idx
  ON public.student_contracts (student_id)
  WHERE status = 'active';
CREATE UNIQUE INDEX student_contracts_one_successor_per_contract_idx
  ON public.student_contracts (previous_contract_id)
  WHERE previous_contract_id IS NOT NULL;
CREATE INDEX student_contract_documents_contract_created_idx
  ON public.student_contract_documents (contract_id, created_at DESC, id);
CREATE INDEX student_contract_documents_teacher_idx
  ON public.student_contract_documents (teacher_id, contract_id);

-- 5. Integridade das relações e timestamps.
CREATE FUNCTION public.validate_student_contract_relationships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.teacher_id <> auth.uid() THEN
    RAISE EXCEPTION 'Contract teacher must match the authenticated teacher';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = NEW.student_id AND s.teacher_id = NEW.teacher_id
  ) THEN
    RAISE EXCEPTION 'Contract student must belong to the same teacher';
  END IF;

  IF NEW.student_package_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.student_packages sp
    WHERE sp.id = NEW.student_package_id
      AND sp.student_id = NEW.student_id
      AND sp.teacher_id = NEW.teacher_id
  ) THEN
    RAISE EXCEPTION 'Contract package must belong to the same student and teacher';
  END IF;

  IF NEW.previous_contract_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.student_contracts sc
    WHERE sc.id = NEW.previous_contract_id
      AND sc.student_id = NEW.student_id
      AND sc.teacher_id = NEW.teacher_id
  ) THEN
    RAISE EXCEPTION 'Previous contract must belong to the same student and teacher';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_student_contract_relationships()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER student_contracts_validate_and_touch
  BEFORE INSERT OR UPDATE ON public.student_contracts
  FOR EACH ROW EXECUTE FUNCTION public.validate_student_contract_relationships();

CREATE FUNCTION public.validate_student_contract_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.teacher_id <> auth.uid() THEN
    RAISE EXCEPTION 'Document teacher must match the authenticated teacher';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.student_contracts sc
    WHERE sc.id = NEW.contract_id AND sc.teacher_id = NEW.teacher_id
  ) THEN
    RAISE EXCEPTION 'Document contract must belong to the same teacher';
  END IF;

  IF NEW.file_path NOT LIKE NEW.teacher_id::text || '/' || NEW.contract_id::text || '/%' THEN
    RAISE EXCEPTION 'Document path must be teacher_id/contract_id/filename';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_student_contract_document()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER student_contract_documents_validate
  BEFORE INSERT OR UPDATE ON public.student_contract_documents
  FOR EACH ROW EXECUTE FUNCTION public.validate_student_contract_document();

-- 6. Ativação transacional de um contrato já cadastrado como rascunho.
-- Bloqueia o aluno para serializar renovações, marca o atual como renovado,
-- vincula previous_contract_id e ativa o novo sem apagar qualquer histórico.
CREATE FUNCTION public.activate_student_contract(p_contract_id uuid)
RETURNS public.student_contracts
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_teacher_id uuid := auth.uid();
  v_target public.student_contracts%ROWTYPE;
  v_student_id uuid;
  v_previous_id uuid;
BEGIN
  IF v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_target
  FROM public.student_contracts
  WHERE id = p_contract_id AND teacher_id = v_teacher_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  IF v_target.end_date IS NULL OR v_target.end_date <= v_target.start_date THEN
    RAISE EXCEPTION 'A new current contract requires an end date after its start date';
  END IF;

  IF v_target.status = 'active' THEN
    RETURN v_target;
  END IF;

  SELECT s.id INTO v_student_id
  FROM public.students s
  WHERE s.id = v_target.student_id AND s.teacher_id = v_teacher_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  UPDATE public.student_contracts
  SET status = 'renewed'
  WHERE student_id = v_target.student_id
    AND teacher_id = v_teacher_id
    AND status = 'active'
    AND id <> v_target.id
  RETURNING id INTO v_previous_id;

  UPDATE public.student_contracts
  SET status = 'active', previous_contract_id = v_previous_id
  WHERE id = v_target.id AND teacher_id = v_teacher_id
  RETURNING * INTO v_target;

  RETURN v_target;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_student_contract(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_student_contract(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_student_contract(uuid) TO service_role;

-- 7. RLS das tabelas: somente o professor proprietário.
ALTER TABLE public.student_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_contract_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY student_contracts_select_own ON public.student_contracts
  FOR SELECT TO authenticated
  USING (teacher_id = (SELECT auth.uid()));
CREATE POLICY student_contracts_insert_own ON public.student_contracts
  FOR INSERT TO authenticated
  WITH CHECK (teacher_id = (SELECT auth.uid()));
CREATE POLICY student_contracts_update_own ON public.student_contracts
  FOR UPDATE TO authenticated
  USING (teacher_id = (SELECT auth.uid()))
  WITH CHECK (teacher_id = (SELECT auth.uid()));
CREATE POLICY student_contracts_delete_own ON public.student_contracts
  FOR DELETE TO authenticated
  USING (teacher_id = (SELECT auth.uid()));

CREATE POLICY student_contract_documents_select_own ON public.student_contract_documents
  FOR SELECT TO authenticated
  USING (teacher_id = (SELECT auth.uid()));
CREATE POLICY student_contract_documents_insert_own ON public.student_contract_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    teacher_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.student_contracts sc
      WHERE sc.id = contract_id AND sc.teacher_id = (SELECT auth.uid())
    )
  );
CREATE POLICY student_contract_documents_delete_own ON public.student_contract_documents
  FOR DELETE TO authenticated
  USING (teacher_id = (SELECT auth.uid()));

-- 8. Storage privado: prefixo teacher_id/contract_id/filename.
-- SELECT exige metadados para visualização/download assinados.
-- DELETE depende apenas do prefixo do proprietário, permitindo limpar órfãos
-- depois da remoção dos metadados ou de uma falha de gravação.
CREATE POLICY contracts_storage_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'contracts'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.student_contract_documents scd
      WHERE scd.file_path = name AND scd.teacher_id = (SELECT auth.uid())
    )
  );

CREATE POLICY contracts_storage_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contracts'
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.student_contracts sc
      WHERE sc.id::text = (storage.foldername(name))[2]
        AND sc.teacher_id = (SELECT auth.uid())
    )
  );

CREATE POLICY contracts_storage_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'contracts'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

NOTIFY pgrst, 'reload schema';
COMMIT;

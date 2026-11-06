BEGIN;

CREATE TABLE public.teacher_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_checklist_title_not_blank
    CHECK (length(btrim(title)) > 0)
);

REVOKE ALL ON TABLE public.teacher_checklist_items
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.teacher_checklist_items
  TO authenticated;
GRANT INSERT (id, teacher_id, title, completed)
  ON TABLE public.teacher_checklist_items TO authenticated;
GRANT UPDATE (title, completed)
  ON TABLE public.teacher_checklist_items TO authenticated;
GRANT ALL ON TABLE public.teacher_checklist_items TO service_role;

ALTER TABLE public.teacher_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY teacher_checklist_select_own
  ON public.teacher_checklist_items
  FOR SELECT TO authenticated
  USING (teacher_id = (SELECT auth.uid()));

CREATE POLICY teacher_checklist_insert_own
  ON public.teacher_checklist_items
  FOR INSERT TO authenticated
  WITH CHECK (teacher_id = (SELECT auth.uid()));

CREATE POLICY teacher_checklist_update_own
  ON public.teacher_checklist_items
  FOR UPDATE TO authenticated
  USING (teacher_id = (SELECT auth.uid()))
  WITH CHECK (teacher_id = (SELECT auth.uid()));

CREATE POLICY teacher_checklist_delete_own
  ON public.teacher_checklist_items
  FOR DELETE TO authenticated
  USING (teacher_id = (SELECT auth.uid()));

CREATE INDEX teacher_checklist_owner_completion_created_idx
  ON public.teacher_checklist_items
  (teacher_id, completed, created_at, id);

CREATE FUNCTION public.touch_teacher_checklist_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_teacher_checklist_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER teacher_checklist_updated_at
  BEFORE UPDATE ON public.teacher_checklist_items
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_teacher_checklist_updated_at();

NOTIFY pgrst, 'reload schema';

COMMIT;
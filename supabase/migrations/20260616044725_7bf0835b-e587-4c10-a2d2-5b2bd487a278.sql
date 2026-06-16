-- ============ TASKS ============
CREATE TYPE public.task_status   AS ENUM ('backlog', 'todo', 'in_progress', 'in_review', 'done');
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE public.tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id    uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  post_id      uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  title        text NOT NULL,
  description  text,
  status       public.task_status NOT NULL DEFAULT 'backlog',
  priority     public.task_priority NOT NULL DEFAULT 'medium',
  assignee_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date     date,
  position     integer NOT NULL DEFAULT 0,
  created_by   uuid NOT NULL REFERENCES auth.users(id),
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_workspace ON public.tasks(workspace_id);
CREATE INDEX idx_tasks_client    ON public.tasks(client_id);
CREATE INDEX idx_tasks_post      ON public.tasks(post_id);
CREATE INDEX idx_tasks_assignee  ON public.tasks(assignee_id);
CREATE INDEX idx_tasks_status    ON public.tasks(status);

CREATE TABLE public.task_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_comments_task ON public.task_comments(task_id);

CREATE TRIGGER t_tasks_u BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments TO authenticated;
GRANT ALL ON public.tasks, public.task_comments TO service_role;

ALTER TABLE public.tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tk_all ON public.tasks FOR ALL TO authenticated
  USING (public.user_in_workspace(workspace_id))
  WITH CHECK (public.user_in_workspace(workspace_id));
CREATE POLICY tc_all ON public.task_comments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.user_in_workspace(t.workspace_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.user_in_workspace(t.workspace_id)));

CREATE OR REPLACE FUNCTION public.update_task_positions(_updates jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row jsonb;
BEGIN
  FOR _row IN SELECT * FROM jsonb_array_elements(_updates) LOOP
    UPDATE public.tasks
    SET position = (_row->>'position')::int,
        status   = (_row->>'status')::public.task_status,
        completed_at = CASE
          WHEN (_row->>'status') = 'done' AND completed_at IS NULL THEN now()
          WHEN (_row->>'status') <> 'done' THEN NULL
          ELSE completed_at END
    WHERE id = (_row->>'id')::uuid AND public.user_in_workspace(workspace_id);
  END LOOP;
END; $$;
REVOKE EXECUTE ON FUNCTION public.update_task_positions(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_task_positions(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_open_task_count()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FROM public.tasks
  WHERE assignee_id = auth.uid() AND status <> 'done' AND public.user_in_workspace(workspace_id);
$$;
REVOKE EXECUTE ON FUNCTION public.my_open_task_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_open_task_count() TO authenticated;

-- ============ BRAND CORE ============
CREATE TYPE public.brand_module_type AS ENUM ('diagnosis','persona','competitors','positioning','product_ladder');

CREATE TABLE public.brand_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  visible_in_portal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.brand_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type public.brand_module_type NOT NULL,
  title text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}',
  visible_in_portal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, type)
);
CREATE TABLE public.brand_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES public.brand_folders(id) ON DELETE SET NULL,
  name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  visible_in_portal boolean NOT NULL DEFAULT false,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_folders, public.brand_modules, public.brand_files TO authenticated;
GRANT ALL ON public.brand_folders, public.brand_modules, public.brand_files TO service_role;

ALTER TABLE public.brand_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_files   ENABLE ROW LEVEL SECURITY;

CREATE POLICY bfo_all ON public.brand_folders FOR ALL TO authenticated
  USING (public.user_in_workspace(workspace_id)) WITH CHECK (public.user_in_workspace(workspace_id));
CREATE POLICY bm_all ON public.brand_modules FOR ALL TO authenticated
  USING (public.user_in_workspace(workspace_id)) WITH CHECK (public.user_in_workspace(workspace_id));
CREATE POLICY bfi_all ON public.brand_files FOR ALL TO authenticated
  USING (public.user_in_workspace(workspace_id)) WITH CHECK (public.user_in_workspace(workspace_id));

CREATE OR REPLACE FUNCTION public.touch_brand_module_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_brand_module_updated_at BEFORE UPDATE ON public.brand_modules
  FOR EACH ROW EXECUTE FUNCTION public.touch_brand_module_updated_at();

CREATE POLICY "brand files team read"   ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'brand-files' AND public.user_in_workspace((storage.foldername(name))[1]::uuid));
CREATE POLICY "brand files team insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'brand-files' AND public.user_in_workspace((storage.foldername(name))[1]::uuid));
CREATE POLICY "brand files team update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'brand-files' AND public.user_in_workspace((storage.foldername(name))[1]::uuid));
CREATE POLICY "brand files team delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'brand-files' AND public.user_in_workspace((storage.foldername(name))[1]::uuid));
CREATE POLICY "brand files portal read" ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'brand-files' AND EXISTS (
    SELECT 1 FROM public.brand_files bf
    LEFT JOIN public.brand_folders bfo ON bfo.id = bf.folder_id
    WHERE bf.storage_path = storage.objects.name AND bf.visible_in_portal = true
      AND (bf.folder_id IS NULL OR bfo.visible_in_portal = true)));

CREATE OR REPLACE FUNCTION public.portal_get_brand_modules(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid uuid;
BEGIN
  SELECT id INTO _cid FROM clients WHERE portal_token = _token AND portal_enabled = true;
  IF _cid IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(row_to_json(m) ORDER BY m.type) FROM brand_modules m
    WHERE m.client_id = _cid AND m.visible_in_portal = true), '[]'::jsonb);
END; $$;
CREATE OR REPLACE FUNCTION public.portal_get_brand_folders(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid uuid;
BEGIN
  SELECT id INTO _cid FROM clients WHERE portal_token = _token AND portal_enabled = true;
  IF _cid IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(row_to_json(f) ORDER BY f.name) FROM brand_folders f
    WHERE f.client_id = _cid AND f.visible_in_portal = true), '[]'::jsonb);
END; $$;
CREATE OR REPLACE FUNCTION public.portal_get_brand_files(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid uuid;
BEGIN
  SELECT id INTO _cid FROM clients WHERE portal_token = _token AND portal_enabled = true;
  IF _cid IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(row_to_json(bf) ORDER BY bf.folder_id NULLS FIRST, bf.name)
    FROM brand_files bf LEFT JOIN brand_folders bfo ON bfo.id = bf.folder_id
    WHERE bf.client_id = _cid AND bf.visible_in_portal = true
      AND (bf.folder_id IS NULL OR bfo.visible_in_portal = true)), '[]'::jsonb);
END; $$;
REVOKE EXECUTE ON FUNCTION public.portal_get_brand_modules(text), public.portal_get_brand_folders(text), public.portal_get_brand_files(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_get_brand_modules(text), public.portal_get_brand_folders(text), public.portal_get_brand_files(text) TO anon, authenticated;

-- ============ FINANCIAL ============
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS monthly_fee numeric(10,2) DEFAULT 0;
CREATE TYPE public.fin_status AS ENUM ('pending','paid','overdue','cancelled');
CREATE TYPE public.expense_category AS ENUM ('ferramentas','trafego_pago','freelancer','infraestrutura','impostos','outros');

CREATE TABLE public.financial_revenues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  description text NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  due_date date NOT NULL,
  paid_at date,
  status public.fin_status NOT NULL DEFAULT 'pending',
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_day integer,
  category text NOT NULL DEFAULT 'Mensalidade',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.financial_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  due_date date NOT NULL,
  paid_at date,
  status public.fin_status NOT NULL DEFAULT 'pending',
  category public.expense_category NOT NULL DEFAULT 'outros',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.financial_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  auto_generate_revenues boolean NOT NULL DEFAULT true,
  revenue_generation_day integer NOT NULL DEFAULT 1 CHECK (revenue_generation_day BETWEEN 1 AND 28),
  default_revenue_category text NOT NULL DEFAULT 'Mensalidade',
  currency text NOT NULL DEFAULT 'BRL',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.financial_revenues (workspace_id);
CREATE INDEX ON public.financial_revenues (client_id);
CREATE INDEX ON public.financial_revenues (status);
CREATE INDEX ON public.financial_revenues (due_date);
CREATE INDEX ON public.financial_expenses (workspace_id);
CREATE INDEX ON public.financial_expenses (status);
CREATE INDEX ON public.financial_expenses (due_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_revenues, public.financial_expenses, public.financial_settings TO authenticated;
GRANT ALL ON public.financial_revenues, public.financial_expenses, public.financial_settings TO service_role;

ALTER TABLE public.financial_revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fr_all" ON public.financial_revenues FOR ALL TO authenticated
  USING (public.user_in_workspace(workspace_id)) WITH CHECK (public.user_in_workspace(workspace_id));
CREATE POLICY "fe_all" ON public.financial_expenses FOR ALL TO authenticated
  USING (public.user_in_workspace(workspace_id)) WITH CHECK (public.user_in_workspace(workspace_id));
CREATE POLICY "fs_all" ON public.financial_settings FOR ALL TO authenticated
  USING (public.user_in_workspace(workspace_id)) WITH CHECK (public.user_in_workspace(workspace_id));

CREATE OR REPLACE FUNCTION public.touch_financial_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_fr_updated_at BEFORE UPDATE ON public.financial_revenues
  FOR EACH ROW EXECUTE FUNCTION public.touch_financial_updated_at();
CREATE TRIGGER trg_fe_updated_at BEFORE UPDATE ON public.financial_expenses
  FOR EACH ROW EXECUTE FUNCTION public.touch_financial_updated_at();
CREATE TRIGGER trg_fs_updated_at BEFORE UPDATE ON public.financial_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_financial_updated_at();

CREATE OR REPLACE FUNCTION public.cancel_client_pending_revenues()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'archived' AND OLD.status <> 'archived' THEN
    UPDATE public.financial_revenues SET status = 'cancelled'
     WHERE client_id = NEW.id AND status IN ('pending','overdue');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_cancel_revenues_on_archive AFTER UPDATE OF status ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.cancel_client_pending_revenues();

CREATE OR REPLACE FUNCTION public.generate_monthly_revenues(_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _c public.clients; _settings public.financial_settings;
  _gen_day integer := 1; _cat text := 'Mensalidade'; _today date := current_date;
  _month_start date; _month_end date; _due date; _generated integer := 0; _already integer := 0;
BEGIN
  IF NOT public.user_in_workspace(_workspace_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO _settings FROM public.financial_settings WHERE workspace_id = _workspace_id;
  IF FOUND THEN _gen_day := _settings.revenue_generation_day; _cat := _settings.default_revenue_category; END IF;
  _month_start := date_trunc('month', _today)::date;
  _month_end := (date_trunc('month', _today) + interval '1 month - 1 day')::date;
  _due := (_month_start + ((_gen_day - 1) || ' days')::interval)::date;
  IF _due > _month_end THEN _due := _month_end; END IF;
  FOR _c IN SELECT * FROM public.clients
     WHERE workspace_id = _workspace_id AND status = 'active' AND monthly_fee IS NOT NULL AND monthly_fee > 0 LOOP
    IF EXISTS (SELECT 1 FROM public.financial_revenues
       WHERE client_id = _c.id AND workspace_id = _workspace_id
         AND due_date BETWEEN _month_start AND _month_end AND status <> 'cancelled') THEN
      _already := _already + 1;
    ELSE
      INSERT INTO public.financial_revenues
        (workspace_id, client_id, description, amount, due_date, status, is_recurring, recurrence_day, category)
      VALUES (_workspace_id, _c.id, 'Mensalidade — ' || _c.name, _c.monthly_fee, _due, 'pending', true, _gen_day, _cat);
      _generated := _generated + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('geradas', _generated, 'ja_existiam', _already);
END; $$;
REVOKE EXECUTE ON FUNCTION public.generate_monthly_revenues(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_monthly_revenues(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.overdue_revenue_count(_workspace_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::integer FROM public.financial_revenues
   WHERE workspace_id = _workspace_id AND status = 'overdue' AND public.user_in_workspace(_workspace_id);
$$;
REVOKE EXECUTE ON FUNCTION public.overdue_revenue_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.overdue_revenue_count(uuid) TO authenticated;
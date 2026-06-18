-- =============================================================
-- MIGRATION: Colunas customizáveis do kanban + RLS financeiro
-- =============================================================

-- ── 1. Tabela de colunas do kanban ────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_boards_columns (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  color          text        NOT NULL DEFAULT '#6b7280',
  position       integer     NOT NULL DEFAULT 0,
  is_done_column boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.task_boards_columns ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_boards_columns TO authenticated;
GRANT ALL ON public.task_boards_columns TO service_role;

CREATE POLICY "tbc_all" ON public.task_boards_columns FOR ALL TO authenticated
  USING  (public.user_in_workspace(workspace_id))
  WITH CHECK (public.user_in_workspace(workspace_id));

-- Trigger: keep updated_at fresh
CREATE TRIGGER t_task_boards_columns_u
  BEFORE UPDATE ON public.task_boards_columns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 2. Seed default columns for existing workspaces ───────────
INSERT INTO public.task_boards_columns (workspace_id, name, color, position, is_done_column)
SELECT w.id, c.name, c.color, c.pos, c.done
FROM public.workspaces w
CROSS JOIN (VALUES
  ('Backlog',      '#6b7280', 0, false),
  ('A fazer',      '#3b82f6', 1, false),
  ('Em progresso', '#f59e0b', 2, false),
  ('Em revisão',   '#8b5cf6', 3, false),
  ('Concluído',    '#22c55e', 4, true)
) AS c(name, color, pos, done)
WHERE NOT EXISTS (
  SELECT 1 FROM public.task_boards_columns tbc WHERE tbc.workspace_id = w.id
);

-- ── 3. Add column_id to tasks ─────────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS column_id uuid REFERENCES public.task_boards_columns(id) ON DELETE SET NULL;

-- ── 4. Migrate existing tasks → column_id based on status ────
UPDATE public.tasks t
SET column_id = (
  SELECT col.id
  FROM public.task_boards_columns col
  WHERE col.workspace_id = t.workspace_id
    AND col.name = CASE t.status
      WHEN 'backlog'     THEN 'Backlog'
      WHEN 'todo'        THEN 'A fazer'
      WHEN 'in_progress' THEN 'Em progresso'
      WHEN 'in_review'   THEN 'Em revisão'
      WHEN 'done'        THEN 'Concluído'
      ELSE 'Backlog'
    END
  ORDER BY col.position
  LIMIT 1
)
WHERE t.column_id IS NULL;

-- ── 5. Trigger: seed columns for new workspaces ───────────────
CREATE OR REPLACE FUNCTION public.seed_workspace_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.task_boards_columns (workspace_id, name, color, position, is_done_column) VALUES
    (NEW.id, 'Backlog',      '#6b7280', 0, false),
    (NEW.id, 'A fazer',      '#3b82f6', 1, false),
    (NEW.id, 'Em progresso', '#f59e0b', 2, false),
    (NEW.id, 'Em revisão',   '#8b5cf6', 3, false),
    (NEW.id, 'Concluído',    '#22c55e', 4, true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_workspace_columns ON public.workspaces;
CREATE TRIGGER trg_seed_workspace_columns
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.seed_workspace_columns();

-- ── 6. Update update_task_positions to handle column_id ──────
CREATE OR REPLACE FUNCTION public.update_task_positions(_updates jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row      jsonb;
  _col_id   uuid;
  _is_done  boolean;
BEGIN
  FOR _row IN SELECT * FROM jsonb_array_elements(_updates) LOOP
    -- Resolve column_id if provided
    _col_id := NULL;
    IF _row->>'column_id' IS NOT NULL THEN
      _col_id := (_row->>'column_id')::uuid;
      SELECT is_done_column INTO _is_done
        FROM public.task_boards_columns WHERE id = _col_id;
    END IF;

    UPDATE public.tasks
    SET
      position     = (_row->>'position')::int,
      column_id    = COALESCE(_col_id, column_id),
      -- Keep status in sync for legacy compatibility
      status       = CASE
        WHEN _col_id IS NOT NULL THEN
          CASE WHEN _is_done THEN 'done'::public.task_status ELSE status END
        WHEN _row->>'status' IS NOT NULL THEN
          (_row->>'status')::public.task_status
        ELSE status
      END,
      completed_at = CASE
        WHEN _col_id IS NOT NULL AND _is_done AND completed_at IS NULL THEN now()
        WHEN _col_id IS NOT NULL AND NOT _is_done                      THEN NULL
        WHEN (_row->>'status') = 'done' AND completed_at IS NULL       THEN now()
        WHEN (_row->>'status') IS NOT NULL AND (_row->>'status') <> 'done' THEN NULL
        ELSE completed_at
      END
    WHERE id = (_row->>'id')::uuid
      AND public.user_in_workspace(workspace_id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_task_positions(jsonb) TO authenticated;

-- ── 7. Update open-task-count to respect is_done_column ──────
CREATE OR REPLACE FUNCTION public.my_open_task_count()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)
  FROM public.tasks t
  LEFT JOIN public.task_boards_columns c ON c.id = t.column_id
  WHERE t.assignee_id = auth.uid()
    AND (
      (t.column_id IS NOT NULL AND c.is_done_column = false) OR
      (t.column_id IS NULL     AND t.status <> 'done')
    )
    AND public.user_in_workspace(t.workspace_id);
$$;

GRANT EXECUTE ON FUNCTION public.my_open_task_count() TO authenticated;

-- ── 8. P5: RLS financeiro — apenas owners ─────────────────────
-- financial_revenues
DROP POLICY IF EXISTS "fr_all"   ON public.financial_revenues;
DROP POLICY IF EXISTS "fr_owner" ON public.financial_revenues;
CREATE POLICY "fr_owner" ON public.financial_revenues FOR ALL TO authenticated
  USING  (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

-- financial_expenses
DROP POLICY IF EXISTS "fe_all"   ON public.financial_expenses;
DROP POLICY IF EXISTS "fe_owner" ON public.financial_expenses;
CREATE POLICY "fe_owner" ON public.financial_expenses FOR ALL TO authenticated
  USING  (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

-- financial_settings
DROP POLICY IF EXISTS "fs_all"   ON public.financial_settings;
DROP POLICY IF EXISTS "fs_owner" ON public.financial_settings;
CREATE POLICY "fs_owner" ON public.financial_settings FOR ALL TO authenticated
  USING  (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

-- ── 9. overdue_revenue_count: respect owner check ─────────────
CREATE OR REPLACE FUNCTION public.overdue_revenue_count(_workspace_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.is_workspace_owner(_workspace_id) THEN
      (SELECT COUNT(*)::integer FROM public.financial_revenues
       WHERE workspace_id = _workspace_id AND status = 'overdue')
    ELSE 0
  END;
$$;
GRANT EXECUTE ON FUNCTION public.overdue_revenue_count(uuid) TO authenticated;

-- ── 10. generate_monthly_revenues: only owner can call ────────
CREATE OR REPLACE FUNCTION public.generate_monthly_revenues(_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _client   record;
  _year     int  := date_part('year',  now())::int;
  _month    int  := date_part('month', now())::int;
  _generated int := 0;
  _already   int := 0;
  _due_date  date;
  _settings  record;
  _day       int := 1;
BEGIN
  IF NOT public.is_workspace_owner(_workspace_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT revenue_generation_day INTO _settings
  FROM public.financial_settings WHERE workspace_id = _workspace_id;
  IF FOUND THEN _day := _settings.revenue_generation_day; END IF;

  _due_date := make_date(_year, _month, LEAST(_day, 28));

  FOR _client IN
    SELECT id, name, monthly_fee
    FROM public.clients
    WHERE workspace_id = _workspace_id
      AND status = 'active'
      AND monthly_fee IS NOT NULL
      AND monthly_fee > 0
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.financial_revenues
      WHERE client_id = _client.id
        AND workspace_id = _workspace_id
        AND date_trunc('month', due_date) = date_trunc('month', _due_date)
        AND status <> 'cancelled'
    ) THEN
      _already := _already + 1;
    ELSE
      INSERT INTO public.financial_revenues
        (workspace_id, client_id, description, amount, due_date, status, is_recurring, category)
      VALUES
        (_workspace_id, _client.id,
         'Mensalidade — ' || _client.name,
         _client.monthly_fee,
         _due_date,
         'pending',
         true,
         'Mensalidade');
      _generated := _generated + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('geradas', _generated, 'ja_existiam', _already);
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_monthly_revenues(uuid) TO authenticated;

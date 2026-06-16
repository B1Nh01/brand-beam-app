-- =============================================================
-- MIGRATION: Módulo Financeiro — 2026-06-16
-- =============================================================

-- monthly_fee nos clientes
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS monthly_fee numeric(10,2) DEFAULT 0;

-- ENUMs
CREATE TYPE public.fin_status AS ENUM ('pending', 'paid', 'overdue', 'cancelled');
CREATE TYPE public.expense_category AS ENUM (
  'ferramentas', 'trafego_pago', 'freelancer',
  'infraestrutura', 'impostos', 'outros'
);

-- ── Receitas ──────────────────────────────────────────────────
CREATE TABLE public.financial_revenues (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id       uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  description     text NOT NULL,
  amount          numeric(10,2) NOT NULL CHECK (amount > 0),
  due_date        date NOT NULL,
  paid_at         date,
  status          public.fin_status NOT NULL DEFAULT 'pending',
  is_recurring    boolean NOT NULL DEFAULT false,
  recurrence_day  integer,
  category        text NOT NULL DEFAULT 'Mensalidade',
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Despesas ──────────────────────────────────────────────────
CREATE TABLE public.financial_expenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  description  text NOT NULL,
  amount       numeric(10,2) NOT NULL CHECK (amount > 0),
  due_date     date NOT NULL,
  paid_at      date,
  status       public.fin_status NOT NULL DEFAULT 'pending',
  category     public.expense_category NOT NULL DEFAULT 'outros',
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Configurações financeiras ─────────────────────────────────
CREATE TABLE public.financial_settings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  auto_generate_revenues   boolean NOT NULL DEFAULT true,
  revenue_generation_day   integer NOT NULL DEFAULT 1
    CHECK (revenue_generation_day BETWEEN 1 AND 28),
  default_revenue_category text NOT NULL DEFAULT 'Mensalidade',
  currency                 text NOT NULL DEFAULT 'BRL',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX ON public.financial_revenues (workspace_id);
CREATE INDEX ON public.financial_revenues (client_id);
CREATE INDEX ON public.financial_revenues (status);
CREATE INDEX ON public.financial_revenues (due_date);
CREATE INDEX ON public.financial_expenses (workspace_id);
CREATE INDEX ON public.financial_expenses (status);
CREATE INDEX ON public.financial_expenses (due_date);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.financial_revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fr_all" ON public.financial_revenues FOR ALL TO authenticated
  USING  (public.user_in_workspace(workspace_id))
  WITH CHECK (public.user_in_workspace(workspace_id));

CREATE POLICY "fe_all" ON public.financial_expenses FOR ALL TO authenticated
  USING  (public.user_in_workspace(workspace_id))
  WITH CHECK (public.user_in_workspace(workspace_id));

CREATE POLICY "fs_all" ON public.financial_settings FOR ALL TO authenticated
  USING  (public.user_in_workspace(workspace_id))
  WITH CHECK (public.user_in_workspace(workspace_id));

-- ── Triggers updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_financial_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_fr_updated_at  BEFORE UPDATE ON public.financial_revenues
  FOR EACH ROW EXECUTE FUNCTION public.touch_financial_updated_at();
CREATE TRIGGER trg_fe_updated_at  BEFORE UPDATE ON public.financial_expenses
  FOR EACH ROW EXECUTE FUNCTION public.touch_financial_updated_at();
CREATE TRIGGER trg_fs_updated_at  BEFORE UPDATE ON public.financial_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_financial_updated_at();

-- ── Ao arquivar cliente → cancelar receitas pendentes ─────────
CREATE OR REPLACE FUNCTION public.cancel_client_pending_revenues()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'archived' AND OLD.status <> 'archived' THEN
    UPDATE public.financial_revenues
       SET status = 'cancelled'
     WHERE client_id = NEW.id
       AND status IN ('pending', 'overdue');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_cancel_revenues_on_archive
  AFTER UPDATE OF status ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.cancel_client_pending_revenues();

-- ── RPC: gerar mensalidades do mês ───────────────────────────
CREATE OR REPLACE FUNCTION public.generate_monthly_revenues(_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _c           public.clients;
  _settings    public.financial_settings;
  _gen_day     integer := 1;
  _cat         text    := 'Mensalidade';
  _today       date    := current_date;
  _month_start date;
  _month_end   date;
  _due         date;
  _generated   integer := 0;
  _already     integer := 0;
BEGIN
  IF NOT public.user_in_workspace(_workspace_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO _settings
    FROM public.financial_settings WHERE workspace_id = _workspace_id;
  IF FOUND THEN
    _gen_day := _settings.revenue_generation_day;
    _cat     := _settings.default_revenue_category;
  END IF;

  _month_start := date_trunc('month', _today)::date;
  _month_end   := (date_trunc('month', _today) + interval '1 month - 1 day')::date;
  _due         := (_month_start + ((_gen_day - 1) || ' days')::interval)::date;
  IF _due > _month_end THEN _due := _month_end; END IF;

  FOR _c IN
    SELECT * FROM public.clients
     WHERE workspace_id = _workspace_id
       AND status = 'active'
       AND monthly_fee IS NOT NULL
       AND monthly_fee > 0
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.financial_revenues
       WHERE client_id    = _c.id
         AND workspace_id = _workspace_id
         AND due_date BETWEEN _month_start AND _month_end
         AND status <> 'cancelled'
    ) THEN
      _already := _already + 1;
    ELSE
      INSERT INTO public.financial_revenues
        (workspace_id, client_id, description, amount, due_date,
         status, is_recurring, recurrence_day, category)
      VALUES
        (_workspace_id, _c.id, 'Mensalidade — ' || _c.name,
         _c.monthly_fee, _due, 'pending', true, _gen_day, _cat);
      _generated := _generated + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('geradas', _generated, 'ja_existiam', _already);
END; $$;

GRANT EXECUTE ON FUNCTION public.generate_monthly_revenues(uuid) TO authenticated;

-- ── RPC: badge de vencidas no menu ───────────────────────────
CREATE OR REPLACE FUNCTION public.overdue_revenue_count(_workspace_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::integer
    FROM public.financial_revenues
   WHERE workspace_id = _workspace_id AND status = 'overdue';
$$;

GRANT EXECUTE ON FUNCTION public.overdue_revenue_count(uuid) TO authenticated;

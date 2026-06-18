-- =============================================================
-- MIGRATION: Tabela post_stages (status por etapa do Content Flow)
-- =============================================================

CREATE TABLE IF NOT EXISTS public.post_stages (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid        NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  stage      text        NOT NULL,
  status     text        NOT NULL DEFAULT 'draft',
  content    jsonb       NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, stage),
  CHECK (stage  IN ('tema', 'conteudo', 'midia', 'legenda')),
  CHECK (status IN ('draft', 'in_approval', 'adjustment_requested', 'approved'))
);

ALTER TABLE public.post_stages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_stages TO authenticated;
GRANT ALL ON public.post_stages TO service_role;

CREATE POLICY "ps_workspace" ON public.post_stages FOR ALL TO authenticated
  USING  (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND public.user_in_workspace(p.workspace_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND public.user_in_workspace(p.workspace_id)));

CREATE TRIGGER t_post_stages_u
  BEFORE UPDATE ON public.post_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Portal access: clients can read/update their own post_stages via portal token
-- (will be enforced via RPC in portal routes, not direct RLS for portal anon)

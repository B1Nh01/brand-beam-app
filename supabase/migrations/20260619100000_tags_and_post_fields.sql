-- Block 2: Tags system + format_type/veiculacao on posts

-- ─── New columns on posts ──────────────────────────────────────────────────
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS format_type text,
  ADD COLUMN IF NOT EXISTS veiculacao  text;

DO $$ BEGIN
  ALTER TABLE public.posts
    ADD CONSTRAINT posts_format_type_check CHECK (format_type IN ('feed', 'stories'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.posts
    ADD CONSTRAINT posts_veiculacao_check CHECK (veiculacao IN ('video', 'post'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Tags ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tags (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id    uuid        REFERENCES public.clients(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  color        text        NOT NULL DEFAULT '#6366f1',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (workspace_id, client_id, name)
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;

DO $$ BEGIN
  CREATE POLICY "tags_workspace" ON public.tags FOR ALL TO authenticated
    USING  (public.user_in_workspace(workspace_id))
    WITH CHECK (public.user_in_workspace(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Post-Tags (N:N) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_tags (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  tag_id  uuid NOT NULL REFERENCES public.tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

ALTER TABLE public.post_tags ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.post_tags TO authenticated;
GRANT ALL ON public.post_tags TO service_role;

DO $$ BEGIN
  CREATE POLICY "post_tags_workspace" ON public.post_tags FOR ALL TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_tags.post_id AND public.user_in_workspace(p.workspace_id)
    ))
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_tags.post_id AND public.user_in_workspace(p.workspace_id)
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

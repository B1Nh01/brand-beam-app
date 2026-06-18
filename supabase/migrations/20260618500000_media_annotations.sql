-- ============================================================
-- MIGRATION: Proofing — tabela media_annotations + RPCs portal
-- ============================================================

-- ── 1. Tabela ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.media_annotations (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_media_id     uuid        NOT NULL REFERENCES public.post_media(id) ON DELETE CASCADE,
  author_type       public.comment_author_type NOT NULL,
  author_user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name       text,
  x_position        numeric     NOT NULL CHECK (x_position >= 0 AND x_position <= 100),
  y_position        numeric     NOT NULL CHECK (y_position >= 0 AND y_position <= 100),
  timestamp_seconds numeric,
  body              text        NOT NULL CHECK (char_length(body) <= 500),
  resolved          boolean     NOT NULL DEFAULT false,
  resolved_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ── 2. RLS ───────────────────────────────────────────────────

ALTER TABLE public.media_annotations ENABLE ROW LEVEL SECURITY;

-- Equipe: acesso total via workspace
CREATE POLICY ma_team ON public.media_annotations FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.post_media pm
    JOIN public.posts p ON p.id = pm.post_id
    WHERE pm.id = media_annotations.post_media_id
      AND public.user_in_workspace(p.workspace_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.post_media pm
    JOIN public.posts p ON p.id = pm.post_id
    WHERE pm.id = media_annotations.post_media_id
      AND public.user_in_workspace(p.workspace_id)
  ));

-- ── 3. portal_get_annotations ────────────────────────────────

CREATE OR REPLACE FUNCTION public.portal_get_annotations(
  _token         text,
  _post_media_id uuid
)
RETURNS TABLE (
  id                uuid,
  post_media_id     uuid,
  author_type       text,
  author_name       text,
  x_position        numeric,
  y_position        numeric,
  timestamp_seconds numeric,
  body              text,
  resolved          boolean,
  created_at        timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    ma.id, ma.post_media_id, ma.author_type::text, ma.author_name,
    ma.x_position, ma.y_position, ma.timestamp_seconds,
    ma.body, ma.resolved, ma.created_at
  FROM public.media_annotations ma
  JOIN public.post_media pm ON pm.id = ma.post_media_id
  JOIN public.posts      p  ON p.id  = pm.post_id
  JOIN public.clients    c  ON c.id  = p.client_id
  WHERE c.portal_token = _token AND ma.post_media_id = _post_media_id;
$$;
GRANT EXECUTE ON FUNCTION public.portal_get_annotations(text, uuid) TO anon, authenticated;

-- ── 4. portal_add_annotation ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.portal_add_annotation(
  _token             text,
  _post_media_id     uuid,
  _author_name       text,
  _x                 numeric,
  _y                 numeric,
  _body              text,
  _timestamp_seconds numeric DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _post_id      uuid;
  _client_id    uuid;
  _workspace_id uuid;
  _new_id       uuid;
BEGIN
  SELECT p.id, c.id, p.workspace_id
    INTO _post_id, _client_id, _workspace_id
  FROM public.post_media pm
  JOIN public.posts   p ON p.id = pm.post_id
  JOIN public.clients c ON c.id = p.client_id
  WHERE c.portal_token = _token AND pm.id = _post_media_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'unauthorized'; END IF;

  INSERT INTO public.media_annotations (
    post_media_id, author_type, author_name,
    x_position, y_position, body, timestamp_seconds
  )
  VALUES (_post_media_id, 'client', _author_name, _x, _y, _body, _timestamp_seconds)
  RETURNING id INTO _new_id;

  -- Avisar a equipe baixando o status do post
  UPDATE public.posts
     SET status = 'adjustment_requested'
   WHERE id = _post_id AND status IN ('in_approval', 'approved');

  INSERT INTO public.activity_log (workspace_id, client_id, post_id, action, actor)
  VALUES (_workspace_id, _client_id, _post_id,
          'Anotação de proofing adicionada na mídia', _author_name);

  RETURN _new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.portal_add_annotation(text, uuid, text, numeric, numeric, text, numeric)
  TO anon, authenticated;

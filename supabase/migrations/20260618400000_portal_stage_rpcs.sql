-- =============================================================
-- MIGRATION: RPCs de aprovação por etapa no portal
-- =============================================================

-- ── 1. portal_get_post_stages ────────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_get_post_stages(_token text, _post_id uuid)
RETURNS TABLE (
  id         uuid,
  post_id    uuid,
  stage      text,
  status     text,
  content    jsonb,
  updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ps.id, ps.post_id, ps.stage, ps.status, ps.content, ps.updated_at
  FROM public.post_stages ps
  JOIN public.posts      p ON p.id    = ps.post_id
  JOIN public.clients    c ON c.id    = p.client_id
  WHERE c.portal_token = _token AND ps.post_id = _post_id;
$$;
GRANT EXECUTE ON FUNCTION public.portal_get_post_stages(text, uuid) TO anon, authenticated;

-- ── 2. portal_approve_stage ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_approve_stage(
  _token       text,
  _post_id     uuid,
  _stage       text,
  _author_name text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _client_id    uuid;
  _workspace_id uuid;
  _all_approved boolean;
BEGIN
  SELECT c.id, p.workspace_id INTO _client_id, _workspace_id
  FROM public.posts p
  JOIN public.clients c ON c.id = p.client_id
  WHERE c.portal_token = _token AND p.id = _post_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'unauthorized'; END IF;

  -- Mark stage as approved
  INSERT INTO public.post_stages (post_id, stage, status)
  VALUES (_post_id, _stage, 'approved')
  ON CONFLICT (post_id, stage) DO UPDATE SET status = 'approved', updated_at = now();

  -- Check if all 4 stages are now approved
  SELECT (
    (SELECT COUNT(*) FROM public.post_stages WHERE post_id = _post_id AND status = 'approved') >= 4
  ) INTO _all_approved;

  IF _all_approved THEN
    UPDATE public.posts SET status = 'approved' WHERE id = _post_id;
    INSERT INTO public.activity_log (workspace_id, client_id, post_id, action, actor)
    VALUES (_workspace_id, _client_id, _post_id, 'Post aprovado pelo cliente (todas as etapas)', _author_name);
  ELSE
    INSERT INTO public.activity_log (workspace_id, client_id, post_id, action, actor)
    VALUES (_workspace_id, _client_id, _post_id, 'Etapa ' || _stage || ' aprovada pelo cliente', _author_name);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.portal_approve_stage(text, uuid, text, text) TO anon, authenticated;

-- ── 3. portal_request_stage_adjustment ───────────────────────
CREATE OR REPLACE FUNCTION public.portal_request_stage_adjustment(
  _token       text,
  _post_id     uuid,
  _stage       text,
  _author_name text,
  _body        text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _client_id    uuid;
  _workspace_id uuid;
BEGIN
  SELECT c.id, p.workspace_id INTO _client_id, _workspace_id
  FROM public.posts p
  JOIN public.clients c ON c.id = p.client_id
  WHERE c.portal_token = _token AND p.id = _post_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'unauthorized'; END IF;

  -- Mark stage as adjustment_requested
  INSERT INTO public.post_stages (post_id, stage, status)
  VALUES (_post_id, _stage, 'adjustment_requested')
  ON CONFLICT (post_id, stage) DO UPDATE SET status = 'adjustment_requested', updated_at = now();

  -- Downgrade overall post status
  UPDATE public.posts SET status = 'adjustment_requested' WHERE id = _post_id;

  -- Add comment with stage label
  INSERT INTO public.post_comments (post_id, author_type, author_name, body)
  VALUES (_post_id, 'client', _author_name, '[Etapa: ' || _stage || '] ' || _body);

  INSERT INTO public.activity_log (workspace_id, client_id, post_id, action, actor)
  VALUES (_workspace_id, _client_id, _post_id, 'Ajuste solicitado na etapa ' || _stage, _author_name);
END;
$$;
GRANT EXECUTE ON FUNCTION public.portal_request_stage_adjustment(text, uuid, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.regenerate_portal_token(_client_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ws uuid; _new text;
BEGIN
  SELECT workspace_id INTO _ws FROM public.clients WHERE id = _client_id;
  IF _ws IS NULL THEN RAISE EXCEPTION 'invalid_client'; END IF;
  IF NOT public.user_in_workspace(_ws) THEN RAISE EXCEPTION 'forbidden'; END IF;
  _new := encode(extensions.gen_random_bytes(24), 'hex');
  UPDATE public.clients SET portal_token = _new WHERE id = _client_id;
  RETURN _new;
END; $$;
REVOKE EXECUTE ON FUNCTION public.regenerate_portal_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_portal_token(uuid) TO authenticated;
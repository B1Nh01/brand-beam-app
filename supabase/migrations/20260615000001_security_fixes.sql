-- =============================================================
-- MIGRATION: Security fixes — 2026-06-15
-- =============================================================

-- ============================================================
-- FIX 1: Storage policies com isolamento de workspace
-- Antes: qualquer usuário autenticado lia/escrevia qualquer
--        arquivo de qualquer workspace.
-- Depois: valida que o primeiro segmento do path (workspace_id)
--         pertence ao workspace do usuário logado.
-- ============================================================

DROP POLICY IF EXISTS "team read media"   ON storage.objects;
DROP POLICY IF EXISTS "team upload media" ON storage.objects;
DROP POLICY IF EXISTS "team update media" ON storage.objects;
DROP POLICY IF EXISTS "team delete media" ON storage.objects;

CREATE POLICY "workspace read media" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'post-media' AND
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = auth.uid()
      AND workspace_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "workspace upload media" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'post-media' AND
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = auth.uid()
      AND workspace_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "workspace update media" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'post-media' AND
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = auth.uid()
      AND workspace_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "workspace delete media" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'post-media' AND
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = auth.uid()
      AND workspace_id::text = (storage.foldername(name))[1]
  )
);

-- Portal (anon): permite gerar signed URLs apenas para mídia de posts
-- não-draft de clientes com portal habilitado.
-- O path (workspace_id/post_id/...) não é adivinhável, mas validamos
-- no banco mesmo assim para garantia dupla.
CREATE POLICY "portal read media" ON storage.objects FOR SELECT TO anon
USING (
  bucket_id = 'post-media' AND
  EXISTS (
    SELECT 1 FROM public.post_media pm
    JOIN public.posts p ON p.id = pm.post_id
    JOIN public.clients c ON c.id = p.client_id
    WHERE pm.storage_path = name
      AND c.portal_enabled = true
      AND p.status <> 'draft'
  )
);

-- ============================================================
-- FIX 2: accept_invite — verificar email do usuário logado
-- Antes: qualquer usuário autenticado podia aceitar o convite
--        de outro, mesmo sem ser o destinatário.
-- Depois: valida que auth.users.email == invite.email (case-insensitive).
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_invite(_token uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _i          public.workspace_invites;
  _uid        uuid := auth.uid();
  _user_email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO _i FROM public.workspace_invites WHERE token = _token;
  IF _i.id IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF _i.status <> 'pending' THEN RAISE EXCEPTION 'invite_not_pending'; END IF;
  IF _i.expires_at < now() THEN
    UPDATE public.workspace_invites SET status = 'expired' WHERE id = _i.id;
    RAISE EXCEPTION 'invite_expired';
  END IF;

  -- Garantir que o usuário logado é o destinatário do convite
  SELECT lower(email) INTO _user_email FROM auth.users WHERE id = _uid;
  IF _user_email IS DISTINCT FROM lower(_i.email) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (_i.workspace_id, _uid, _i.role)
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  UPDATE public.workspace_invites SET status = 'accepted' WHERE id = _i.id;

  INSERT INTO public.activity_log (workspace_id, action, actor)
  VALUES (_i.workspace_id, 'Novo membro entrou', _i.email);

  RETURN _i.workspace_id;
END; $$;

-- ============================================================
-- FIX 3: Regeneração de portal_token via servidor
-- Antes: o token era gerado no frontend com crypto.randomUUID()
--        — código de cliente não auditável pelo servidor.
-- Depois: RPC SECURITY DEFINER gera 32 bytes aleatórios no banco
--         e valida pertencimento ao workspace do usuário.
-- ============================================================

CREATE OR REPLACE FUNCTION public.regenerate_portal_token(_client_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _c     public.clients;
  _token text;
BEGIN
  SELECT * INTO _c FROM public.clients WHERE id = _client_id;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'invalid_client'; END IF;
  IF NOT public.user_in_workspace(_c.workspace_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  _token := encode(gen_random_bytes(32), 'hex');
  UPDATE public.clients SET portal_token = _token WHERE id = _client_id;
  RETURN _token;
END; $$;

GRANT EXECUTE ON FUNCTION public.regenerate_portal_token(uuid) TO authenticated;

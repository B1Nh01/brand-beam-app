
-- ENUMS
CREATE TYPE public.app_workspace_role AS ENUM ('owner', 'member');
CREATE TYPE public.client_status AS ENUM ('active', 'paused', 'archived');
CREATE TYPE public.post_format AS ENUM ('static', 'carousel', 'reels', 'story');
CREATE TYPE public.post_platform AS ENUM ('instagram', 'tiktok', 'both');
CREATE TYPE public.approval_mode AS ENUM ('fast', 'flow');
CREATE TYPE public.post_status AS ENUM ('draft', 'in_approval', 'adjustment_requested', 'approved', 'scheduled', 'published');
CREATE TYPE public.flow_stage AS ENUM ('idea', 'copy', 'media', 'final');
CREATE TYPE public.comment_author_type AS ENUM ('team', 'client');

-- updated_at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- TABLES
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_workspace_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  instagram_handle text,
  tiktok_handle text,
  avatar_url text,
  brand_color text DEFAULT '#7c3aed',
  portal_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  portal_enabled boolean NOT NULL DEFAULT true,
  monthly_fee numeric,
  status public.client_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_clients_portal_token ON public.clients(portal_token);
CREATE INDEX idx_clients_workspace ON public.clients(workspace_id);

CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  idea text,
  copy text,
  caption text,
  format public.post_format NOT NULL DEFAULT 'static',
  platform public.post_platform NOT NULL DEFAULT 'instagram',
  scheduled_date date,
  scheduled_time time,
  approval_mode public.approval_mode NOT NULL DEFAULT 'fast',
  status public.post_status NOT NULL DEFAULT 'draft',
  flow_stage public.flow_stage NOT NULL DEFAULT 'idea',
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_posts_workspace ON public.posts(workspace_id);
CREATE INDEX idx_posts_client ON public.posts(client_id);

CREATE TABLE public.post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  type text NOT NULL DEFAULT 'image',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_post_media_post ON public.post_media(post_id);

CREATE TABLE public.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_type public.comment_author_type NOT NULL,
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_post_comments_post ON public.post_comments(post_id);

CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_workspace ON public.activity_log(workspace_id);

-- updated_at triggers
CREATE TRIGGER t_workspaces_u BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_members_u BEFORE UPDATE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_clients_u BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_posts_u BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_post_media_u BEFORE UPDATE ON public.post_media FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_post_comments_u BEFORE UPDATE ON public.post_comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- membership helper (security definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.user_in_workspace(_workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = auth.uid()
  );
$$;

-- GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_media TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_log TO authenticated;
GRANT ALL ON public.workspaces, public.workspace_members, public.clients, public.posts, public.post_media, public.post_comments, public.activity_log TO service_role;

-- RLS
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY ws_select ON public.workspaces FOR SELECT TO authenticated USING (public.user_in_workspace(id));
CREATE POLICY ws_insert ON public.workspaces FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY ws_update ON public.workspaces FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY ws_delete ON public.workspaces FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY wm_select ON public.workspace_members FOR SELECT TO authenticated USING (public.user_in_workspace(workspace_id));
CREATE POLICY wm_insert ON public.workspace_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid()));
CREATE POLICY wm_delete ON public.workspace_members FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid()));

CREATE POLICY cl_all ON public.clients FOR ALL TO authenticated USING (public.user_in_workspace(workspace_id)) WITH CHECK (public.user_in_workspace(workspace_id));
CREATE POLICY po_all ON public.posts FOR ALL TO authenticated USING (public.user_in_workspace(workspace_id)) WITH CHECK (public.user_in_workspace(workspace_id));
CREATE POLICY pm_all ON public.post_media FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND public.user_in_workspace(p.workspace_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND public.user_in_workspace(p.workspace_id)));
CREATE POLICY pc_all ON public.post_comments FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND public.user_in_workspace(p.workspace_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND public.user_in_workspace(p.workspace_id)));
CREATE POLICY al_all ON public.activity_log FOR ALL TO authenticated USING (public.user_in_workspace(workspace_id)) WITH CHECK (public.user_in_workspace(workspace_id));

-- ============ PORTAL RPCs (security definer, token validated) ============
CREATE OR REPLACE FUNCTION public._portal_client(_token text)
RETURNS public.clients LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.clients WHERE portal_token = _token AND portal_enabled = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.portal_get_client(_token text)
RETURNS TABLE (id uuid, name text, avatar_url text, brand_color text, instagram_handle text, tiktok_handle text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, avatar_url, brand_color, instagram_handle, tiktok_handle
  FROM public.clients WHERE portal_token = _token AND portal_enabled = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.portal_get_posts(_token text)
RETURNS SETOF public.posts LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.* FROM public.posts p
  JOIN public.clients c ON c.id = p.client_id
  WHERE c.portal_token = _token AND c.portal_enabled = true
    AND p.status <> 'draft'
  ORDER BY p.scheduled_date NULLS LAST, p.position;
$$;

CREATE OR REPLACE FUNCTION public.portal_get_media(_token text)
RETURNS SETOF public.post_media LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.* FROM public.post_media m
  JOIN public.posts p ON p.id = m.post_id
  JOIN public.clients c ON c.id = p.client_id
  WHERE c.portal_token = _token AND c.portal_enabled = true AND p.status <> 'draft'
  ORDER BY m.sort_order;
$$;

CREATE OR REPLACE FUNCTION public.portal_get_comments(_token text, _post_id uuid)
RETURNS SETOF public.post_comments LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pc.* FROM public.post_comments pc
  JOIN public.posts p ON p.id = pc.post_id
  JOIN public.clients c ON c.id = p.client_id
  WHERE c.portal_token = _token AND c.portal_enabled = true AND p.id = _post_id AND p.status <> 'draft'
  ORDER BY pc.created_at;
$$;

CREATE OR REPLACE FUNCTION public.portal_add_comment(_token text, _post_id uuid, _author_name text, _body text)
RETURNS public.post_comments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.clients; _row public.post_comments;
BEGIN
  SELECT * INTO _c FROM public.clients WHERE portal_token = _token AND portal_enabled = true;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.posts p WHERE p.id = _post_id AND p.client_id = _c.id AND p.status <> 'draft') THEN
    RAISE EXCEPTION 'invalid_post'; END IF;
  INSERT INTO public.post_comments (post_id, author_type, author_name, body)
  VALUES (_post_id, 'client', COALESCE(NULLIF(_author_name,''),'Cliente'), _body) RETURNING * INTO _row;
  INSERT INTO public.activity_log (workspace_id, client_id, post_id, action, actor)
  VALUES (_c.workspace_id, _c.id, _post_id, 'Comentário do cliente', COALESCE(_author_name,'Cliente'));
  RETURN _row;
END; $$;

CREATE OR REPLACE FUNCTION public.portal_approve(_token text, _post_id uuid, _author_name text)
RETURNS public.posts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.clients; _p public.posts;
BEGIN
  SELECT * INTO _c FROM public.clients WHERE portal_token = _token AND portal_enabled = true;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  SELECT * INTO _p FROM public.posts WHERE id = _post_id AND client_id = _c.id AND status IN ('in_approval','adjustment_requested');
  IF _p.id IS NULL THEN RAISE EXCEPTION 'invalid_post'; END IF;
  IF _p.approval_mode = 'fast' THEN
    UPDATE public.posts SET status = 'approved' WHERE id = _post_id RETURNING * INTO _p;
  ELSE
    IF _p.flow_stage = 'idea' THEN UPDATE public.posts SET flow_stage='copy', status='in_approval' WHERE id=_post_id RETURNING * INTO _p;
    ELSIF _p.flow_stage = 'copy' THEN UPDATE public.posts SET flow_stage='media', status='in_approval' WHERE id=_post_id RETURNING * INTO _p;
    ELSIF _p.flow_stage = 'media' THEN UPDATE public.posts SET flow_stage='final', status='in_approval' WHERE id=_post_id RETURNING * INTO _p;
    ELSE UPDATE public.posts SET status='approved' WHERE id=_post_id RETURNING * INTO _p;
    END IF;
  END IF;
  INSERT INTO public.activity_log (workspace_id, client_id, post_id, action, actor)
  VALUES (_c.workspace_id, _c.id, _post_id, 'Aprovação do cliente', COALESCE(_author_name,'Cliente'));
  RETURN _p;
END; $$;

CREATE OR REPLACE FUNCTION public.portal_request_adjustment(_token text, _post_id uuid, _author_name text, _body text)
RETURNS public.posts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.clients; _p public.posts;
BEGIN
  IF _body IS NULL OR length(trim(_body)) = 0 THEN RAISE EXCEPTION 'comment_required'; END IF;
  SELECT * INTO _c FROM public.clients WHERE portal_token = _token AND portal_enabled = true;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  SELECT * INTO _p FROM public.posts WHERE id = _post_id AND client_id = _c.id AND status IN ('in_approval','adjustment_requested');
  IF _p.id IS NULL THEN RAISE EXCEPTION 'invalid_post'; END IF;
  INSERT INTO public.post_comments (post_id, author_type, author_name, body)
  VALUES (_post_id, 'client', COALESCE(NULLIF(_author_name,''),'Cliente'), _body);
  UPDATE public.posts SET status = 'adjustment_requested' WHERE id = _post_id RETURNING * INTO _p;
  INSERT INTO public.activity_log (workspace_id, client_id, post_id, action, actor)
  VALUES (_c.workspace_id, _c.id, _post_id, 'Ajuste solicitado', COALESCE(_author_name,'Cliente'));
  RETURN _p;
END; $$;

REVOKE ALL ON FUNCTION public._portal_client(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_get_client(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_get_posts(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_get_media(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_get_comments(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_add_comment(text, uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_approve(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_request_adjustment(text, uuid, text, text) TO anon, authenticated;

-- ============ SEED on new user ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ws uuid; _c1 uuid; _c2 uuid; _p uuid; _today date := current_date;
BEGIN
  INSERT INTO public.workspaces (name, owner_id) VALUES ('Minha Agência', NEW.id) RETURNING id INTO _ws;
  INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES (_ws, NEW.id, 'owner');

  INSERT INTO public.clients (workspace_id, name, instagram_handle, tiktok_handle, brand_color, monthly_fee)
  VALUES (_ws, 'Café Aurora', '@cafeaurora', '@cafeaurora', '#7c3aed', 1500) RETURNING id INTO _c1;
  INSERT INTO public.clients (workspace_id, name, instagram_handle, brand_color, monthly_fee)
  VALUES (_ws, 'Studio Bloom', '@studiobloom', '#ec4899', 2200) RETURNING id INTO _c2;

  INSERT INTO public.posts (workspace_id, client_id, title, idea, copy, caption, format, platform, scheduled_date, approval_mode, status, position)
  VALUES (_ws, _c1, 'Lançamento do café gelado', 'Mostrar o novo café gelado de verão', 'Roteiro do reels', 'O verão chegou ☀️ Conheça nosso novo café gelado!', 'reels', 'instagram', _today + 2, 'fast', 'in_approval', 0) RETURNING id INTO _p;
  INSERT INTO public.post_comments (post_id, author_type, author_name, body) VALUES (_p, 'client', 'Marina', 'Amei a ideia! Podemos ver as imagens?');

  INSERT INTO public.posts (workspace_id, client_id, title, idea, copy, caption, format, platform, scheduled_date, approval_mode, status, flow_stage, position)
  VALUES (_ws, _c1, 'Bastidores da torra', 'Processo de torra dos grãos', 'Copy em revisão', 'Do grão à xícara 🤎', 'carousel', 'both', _today + 5, 'flow', 'in_approval', 'copy', 1);

  INSERT INTO public.posts (workspace_id, client_id, title, caption, format, platform, scheduled_date, approval_mode, status, position)
  VALUES (_ws, _c1, 'Promo de quarta', 'Quarta é dia de 2 por 1 ☕', 'static', 'instagram', _today + 7, 'fast', 'approved', 2);

  INSERT INTO public.posts (workspace_id, client_id, title, idea, caption, format, platform, scheduled_date, approval_mode, status, position)
  VALUES (_ws, _c2, 'Coleção primavera', 'Apresentar a nova coleção', 'Primavera floresceu na Bloom 🌸', 'carousel', 'instagram', _today + 1, 'fast', 'adjustment_requested', 0) RETURNING id INTO _p;
  INSERT INTO public.post_comments (post_id, author_type, author_name, body) VALUES (_p, 'client', 'João', 'A legenda pode ficar mais curta?');

  INSERT INTO public.posts (workspace_id, client_id, title, caption, format, platform, scheduled_date, approval_mode, status, flow_stage, position)
  VALUES (_ws, _c2, 'Tutorial de skincare', 'Passo a passo da sua rotina ✨', 'reels', 'tiktok', _today + 4, 'flow', 'in_approval', 'idea', 1);

  INSERT INTO public.posts (workspace_id, client_id, title, caption, format, platform, scheduled_date, approval_mode, status, position)
  VALUES (_ws, _c2, 'Depoimento de cliente', 'Resultados reais 💕', 'story', 'instagram', _today + 6, 'fast', 'draft', 2);

  INSERT INTO public.activity_log (workspace_id, client_id, action, actor) VALUES (_ws, _c1, 'Workspace criado', 'Sistema');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

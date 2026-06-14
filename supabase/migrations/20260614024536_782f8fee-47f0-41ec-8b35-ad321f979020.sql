
-- Enum for invite status
DO $$ BEGIN
  CREATE TYPE public.invite_status AS ENUM ('pending', 'accepted', 'expired');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Owner helper
CREATE OR REPLACE FUNCTION public.is_workspace_owner(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = auth.uid() AND role = 'owner'
  );
$$;

-- Table
CREATE TABLE public.workspace_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  role public.app_workspace_role NOT NULL DEFAULT 'member',
  status public.invite_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_invites TO authenticated;
GRANT ALL ON public.workspace_invites TO service_role;

ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view workspace invites"
ON public.workspace_invites FOR SELECT TO authenticated
USING (public.user_in_workspace(workspace_id));

CREATE POLICY "Owner can create invites"
ON public.workspace_invites FOR INSERT TO authenticated
WITH CHECK (public.is_workspace_owner(workspace_id));

CREATE POLICY "Owner can update invites"
ON public.workspace_invites FOR UPDATE TO authenticated
USING (public.is_workspace_owner(workspace_id));

CREATE POLICY "Owner can delete invites"
ON public.workspace_invites FOR DELETE TO authenticated
USING (public.is_workspace_owner(workspace_id));

CREATE TRIGGER update_workspace_invites_updated_at
BEFORE UPDATE ON public.workspace_invites
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public: validate invite by token (returns workspace name + validity info)
CREATE OR REPLACE FUNCTION public.get_invite(_token uuid)
RETURNS TABLE(email text, role app_workspace_role, status invite_status, expires_at timestamptz, workspace_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.email, i.role,
    CASE WHEN i.status = 'pending' AND i.expires_at < now() THEN 'expired'::invite_status ELSE i.status END,
    i.expires_at, w.name
  FROM public.workspace_invites i
  JOIN public.workspaces w ON w.id = i.workspace_id
  WHERE i.token = _token
  LIMIT 1;
$$;

-- Accept invite as the currently authenticated user
CREATE OR REPLACE FUNCTION public.accept_invite(_token uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _i public.workspace_invites; _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _i FROM public.workspace_invites WHERE token = _token;
  IF _i.id IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF _i.status <> 'pending' THEN RAISE EXCEPTION 'invite_not_pending'; END IF;
  IF _i.expires_at < now() THEN
    UPDATE public.workspace_invites SET status = 'expired' WHERE id = _i.id;
    RAISE EXCEPTION 'invite_expired';
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (_i.workspace_id, _uid, _i.role)
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  UPDATE public.workspace_invites SET status = 'accepted' WHERE id = _i.id;

  INSERT INTO public.activity_log (workspace_id, action, actor)
  VALUES (_i.workspace_id, 'Novo membro entrou', _i.email);

  RETURN _i.workspace_id;
END; $$;

-- List members with name + email
CREATE OR REPLACE FUNCTION public.list_workspace_members(_workspace_id uuid)
RETURNS TABLE(user_id uuid, role app_workspace_role, email text, name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.user_in_workspace(_workspace_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT m.user_id, m.role, u.email::text,
    COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email::text)
  FROM public.workspace_members m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.workspace_id = _workspace_id
  ORDER BY m.role, m.created_at;
END; $$;

-- Remove a member (owner only, cannot remove an owner)
CREATE OR REPLACE FUNCTION public.remove_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_workspace_owner(_workspace_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = _workspace_id AND user_id = _user_id AND role = 'owner') THEN
    RAISE EXCEPTION 'cannot_remove_owner';
  END IF;
  DELETE FROM public.workspace_members WHERE workspace_id = _workspace_id AND user_id = _user_id;
END; $$;

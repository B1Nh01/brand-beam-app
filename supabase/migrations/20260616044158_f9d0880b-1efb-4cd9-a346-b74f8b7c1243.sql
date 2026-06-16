-- 1. Fix privilege escalation via self-insert into workspace_members
DROP POLICY IF EXISTS "wm_insert" ON public.workspace_members;
CREATE POLICY "wm_insert" ON public.workspace_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_members.workspace_id AND w.owner_id = auth.uid()
    )
  );

-- 2. Restrict post-media storage policies to workspace members (path = <workspace_id>/<post_id>/<file>)
DROP POLICY IF EXISTS "team read media" ON storage.objects;
DROP POLICY IF EXISTS "team upload media" ON storage.objects;
DROP POLICY IF EXISTS "team update media" ON storage.objects;
DROP POLICY IF EXISTS "team delete media" ON storage.objects;

CREATE POLICY "team read media" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'post-media' AND public.user_in_workspace(((storage.foldername(name))[1])::uuid));

CREATE POLICY "team upload media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'post-media' AND public.user_in_workspace(((storage.foldername(name))[1])::uuid));

CREATE POLICY "team update media" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'post-media' AND public.user_in_workspace(((storage.foldername(name))[1])::uuid))
  WITH CHECK (bucket_id = 'post-media' AND public.user_in_workspace(((storage.foldername(name))[1])::uuid));

CREATE POLICY "team delete media" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'post-media' AND public.user_in_workspace(((storage.foldername(name))[1])::uuid));

-- 3. Lock down SECURITY DEFINER function execution

-- Internal trigger helpers: callable by nobody directly
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Team functions: authenticated only (remove anon)
REVOKE EXECUTE ON FUNCTION public.user_in_workspace(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_workspace_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_workspace_members(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_workspace_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_in_workspace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_workspace_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_workspace_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite(uuid) TO authenticated;

-- Portal + invite preview functions: intentionally public (anon) by token
GRANT EXECUTE ON FUNCTION public.portal_get_posts(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_get_media(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_get_client(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_get_comments(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_approve(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_request_adjustment(text, uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_add_comment(text, uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_invite(uuid) TO anon, authenticated;

-- Internal portal helper: not directly callable
REVOKE EXECUTE ON FUNCTION public._portal_client(text) FROM PUBLIC, anon, authenticated;
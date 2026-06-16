DROP POLICY IF EXISTS "Members can view workspace invites" ON public.workspace_invites;
CREATE POLICY "Owner can view workspace invites"
  ON public.workspace_invites
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_owner(workspace_id));
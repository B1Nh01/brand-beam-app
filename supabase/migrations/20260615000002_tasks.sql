-- =============================================================
-- MIGRATION: Módulo de Tarefas (Kanban interno)
-- =============================================================

-- Enums
CREATE TYPE public.task_status   AS ENUM ('backlog', 'todo', 'in_progress', 'in_review', 'done');
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- Tabela principal
CREATE TABLE public.tasks (
  id           uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid                   NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id    uuid                   REFERENCES public.clients(id) ON DELETE SET NULL,
  post_id      uuid                   REFERENCES public.posts(id) ON DELETE SET NULL,
  title        text                   NOT NULL,
  description  text,
  status       public.task_status     NOT NULL DEFAULT 'backlog',
  priority     public.task_priority   NOT NULL DEFAULT 'medium',
  assignee_id  uuid                   REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date     date,
  position     integer                NOT NULL DEFAULT 0,
  created_by   uuid                   NOT NULL REFERENCES auth.users(id),
  completed_at timestamptz,
  created_at   timestamptz            NOT NULL DEFAULT now(),
  updated_at   timestamptz            NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_workspace ON public.tasks(workspace_id);
CREATE INDEX idx_tasks_client    ON public.tasks(client_id);
CREATE INDEX idx_tasks_post      ON public.tasks(post_id);
CREATE INDEX idx_tasks_assignee  ON public.tasks(assignee_id);
CREATE INDEX idx_tasks_status    ON public.tasks(status);

-- Comentários de tarefas
CREATE TABLE public.task_comments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text        NOT NULL,
  body        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_comments_task ON public.task_comments(task_id);

-- Trigger updated_at
CREATE TRIGGER t_tasks_u
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments TO authenticated;
GRANT ALL ON public.tasks, public.task_comments TO service_role;

-- RLS
ALTER TABLE public.tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tk_all ON public.tasks FOR ALL TO authenticated
  USING (public.user_in_workspace(workspace_id))
  WITH CHECK (public.user_in_workspace(workspace_id));

CREATE POLICY tc_all ON public.task_comments FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id AND public.user_in_workspace(t.workspace_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id AND public.user_in_workspace(t.workspace_id)
  ));

-- RPC: batch update de status + position (usado após drag-and-drop)
-- Aceita um array JSON: [{"id":"...","status":"todo","position":0}, ...]
CREATE OR REPLACE FUNCTION public.update_task_positions(_updates jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row jsonb;
BEGIN
  FOR _row IN SELECT * FROM jsonb_array_elements(_updates) LOOP
    UPDATE public.tasks
    SET
      position     = (_row->>'position')::int,
      status       = (_row->>'status')::public.task_status,
      completed_at = CASE
        WHEN (_row->>'status') = 'done' AND completed_at IS NULL THEN now()
        WHEN (_row->>'status') <> 'done'                          THEN NULL
        ELSE completed_at
      END
    WHERE id = (_row->>'id')::uuid
      AND public.user_in_workspace(workspace_id);
  END LOOP;
END; $$;

GRANT EXECUTE ON FUNCTION public.update_task_positions(jsonb) TO authenticated;

-- RPC: contagem de tarefas abertas atribuídas ao usuário (badge do menu)
CREATE OR REPLACE FUNCTION public.my_open_task_count()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)
  FROM public.tasks
  WHERE assignee_id = auth.uid()
    AND status <> 'done'
    AND public.user_in_workspace(workspace_id);
$$;

GRANT EXECUTE ON FUNCTION public.my_open_task_count() TO authenticated;

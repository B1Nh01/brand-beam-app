import { createFileRoute } from "@tanstack/react-router";
import { TaskBoard } from "@/components/task-board";
import { RouteError } from "@/components/route-error";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
  head: () => ({ meta: [{ title: "Tarefas — Stúdio" }] }),
  errorComponent: ({ error, reset }) => <RouteError error={error as Error} reset={reset} />,
});

function TasksPage() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Quadro de Tarefas</h1>
        <p className="text-muted-foreground">
          Kanban interno da equipe — produções, revisões e entregas.
        </p>
      </div>
      <TaskBoard />
    </div>
  );
}

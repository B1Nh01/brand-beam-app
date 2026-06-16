import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskDialog, TaskAvatar } from "@/components/task-dialog";
import {
  Task, TaskStatus, TaskPriority, Client,
  TASK_STATUS_ORDER, TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS, TASK_PRIORITY_CLASSES,
} from "@/lib/content";
import { fireConfetti } from "@/lib/confetti";
import { cn } from "@/lib/utils";
import { Plus, Paperclip, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";

type Member = { user_id: string; name: string; email: string; role: string };

type Filters = {
  clientId: string;
  assigneeId: string;
  priority: string;
  hasPost: string;
};

type Props = {
  fixedClientId?: string;
};

export function TaskBoard({ fixedClientId }: Props) {
  const qc = useQueryClient();
  const [colItems, setColItems] = useState<Record<TaskStatus, string[]>>({
    backlog: [], todo: [], in_progress: [], in_review: [], done: [],
  });
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [newTask, setNewTask] = useState<Partial<Task> | null>(null);
  const [doneExpanded, setDoneExpanded] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    clientId: fixedClientId ?? "all",
    assigneeId: "all",
    priority: "all",
    hasPost: "all",
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ── Data ──────────────────────────────────────────────────
  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["tasks", fixedClientId],
    queryFn: async () => {
      let q = supabase.from("tasks").select("*").order("position");
      if (fixedClientId) q = q.eq("client_id", fixedClientId);
      const { data } = await q;
      return (data ?? []) as Task[];
    },
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["clients-for-tasks"],
    enabled: !fixedClientId,
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("*").eq("status", "active").order("name");
      return (data ?? []) as Client[];
    },
  });

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ["members-for-tasks"],
    queryFn: async () => {
      const { data: ws } = await supabase
        .from("workspaces").select("id").order("created_at").limit(1).maybeSingle();
      if (!ws) return [];
      const { data } = await supabase.rpc("list_workspace_members", { _workspace_id: ws.id });
      return (data ?? []) as Member[];
    },
  });

  // ── Filter tasks ──────────────────────────────────────────
  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filters.clientId !== "all" && t.client_id !== filters.clientId) return false;
      if (filters.assigneeId !== "all" && t.assignee_id !== filters.assigneeId) return false;
      if (filters.priority !== "all" && t.priority !== filters.priority) return false;
      if (filters.hasPost === "yes" && !t.post_id) return false;
      if (filters.hasPost === "no" && t.post_id) return false;
      return true;
    });
  }, [tasks, filters]);

  // Sync colItems when data changes
  useEffect(() => {
    const grouped: Record<TaskStatus, string[]> = {
      backlog: [], todo: [], in_progress: [], in_review: [], done: [],
    };
    for (const t of filtered) grouped[t.status].push(t.id);
    setColItems(grouped);
  }, [filtered]);

  const taskMap = useMemo(() => {
    const m: Record<string, Task> = {};
    for (const t of tasks) m[t.id] = t;
    return m;
  }, [tasks]);

  const memberMap = useMemo(() => {
    const m: Record<string, Member> = {};
    for (const mb of members) m[mb.user_id] = mb;
    return m;
  }, [members]);

  // ── Find which column owns an id (task or column itself) ──
  const findColumn = useCallback(
    (id: string): TaskStatus | null => {
      if (TASK_STATUS_ORDER.includes(id as TaskStatus)) return id as TaskStatus;
      for (const status of TASK_STATUS_ORDER) {
        if (colItems[status].includes(id)) return status;
      }
      return null;
    },
    [colItems]
  );

  // ── Batch persist ─────────────────────────────────────────
  const persist = useCallback(
    async (updates: { id: string; status: TaskStatus; position: number }[]) => {
      if (!updates.length) return;
      await supabase.rpc("update_task_positions", { _updates: updates });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["my-open-tasks"] });
    },
    [qc]
  );

  // ── DnD handlers ──────────────────────────────────────────
  const handleDragStart = (e: DragStartEvent) => {
    setActiveTask(taskMap[e.active.id as string] ?? null);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = e;
    if (!over) return;

    const activeId = active.id as string;
    const overId   = over.id as string;
    const fromCol  = findColumn(activeId);
    const toCol    = findColumn(overId);
    if (!fromCol || !toCol) return;

    if (fromCol === toCol) {
      // Within-column reorder
      const oldIdx = colItems[fromCol].indexOf(activeId);
      const newIdx = colItems[fromCol].indexOf(overId);
      if (oldIdx === newIdx) return;

      const reordered = arrayMove(colItems[fromCol], oldIdx, newIdx);
      setColItems((prev) => ({ ...prev, [fromCol]: reordered }));

      const updates = reordered
        .map((id, i) => ({ id, status: fromCol, position: i }))
        .filter(({ id, position }) => taskMap[id]?.position !== position);
      await persist(updates);
    } else {
      // Cross-column move
      const fromItems = colItems[fromCol].filter((id) => id !== activeId);
      const toItems   = [...colItems[toCol]];
      const overIdx   = toItems.indexOf(overId);
      if (overIdx === -1) toItems.push(activeId);
      else toItems.splice(overIdx, 0, activeId);

      setColItems((prev) => ({ ...prev, [fromCol]: fromItems, [toCol]: toItems }));

      const wasNotDone = taskMap[activeId]?.status !== "done";
      if (toCol === "done" && wasNotDone) fireConfetti();

      const updates: { id: string; status: TaskStatus; position: number }[] = [];
      toItems.forEach((id, i) => {
        const t = taskMap[id];
        if (!t || t.status !== toCol || t.position !== i)
          updates.push({ id, status: toCol, position: i });
      });
      fromItems.forEach((id, i) => {
        const t = taskMap[id];
        if (t && t.position !== i)
          updates.push({ id, status: fromCol, position: i });
      });
      await persist(updates);
    }
  };

  const openNew = (status: TaskStatus) => {
    setNewTask({
      status,
      priority: "medium",
      client_id: fixedClientId ?? (filters.clientId !== "all" ? filters.clientId : null),
    });
  };

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-4">
      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => openNew("backlog")}>
          <Plus className="h-4 w-4" /> Nova tarefa
        </Button>

        {!fixedClientId && (
          <Select
            value={filters.clientId}
            onValueChange={(v) => setFilters((f) => ({ ...f, clientId: v }))}
          >
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Todos os clientes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <Select
          value={filters.assigneeId}
          onValueChange={(v) => setFilters((f) => ({ ...f, assigneeId: v }))}
        >
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select
          value={filters.priority}
          onValueChange={(v) => setFilters((f) => ({ ...f, priority: v }))}
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {(["urgent", "high", "medium", "low"] as TaskPriority[]).map((p) => (
              <SelectItem key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.hasPost}
          onValueChange={(v) => setFilters((f) => ({ ...f, hasPost: v }))}
        >
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="Vínculo com post" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="yes">Com post</SelectItem>
            <SelectItem value="no">Sem post</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Kanban ── */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {TASK_STATUS_ORDER.map((status) => {
            const ids = colItems[status];
            const isDone = status === "done";
            const visibleIds = isDone && !doneExpanded ? ids.slice(-10) : ids;

            return (
              <KanbanColumn
                key={status}
                status={status}
                count={ids.length}
                onAddTask={() => openNew(status)}
              >
                <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {isDone && ids.length > 10 && (
                      <button
                        className="flex w-full items-center justify-center gap-1 rounded-md py-1 text-xs text-muted-foreground hover:bg-accent"
                        onClick={() => setDoneExpanded((v) => !v)}
                      >
                        {doneExpanded
                          ? <><ChevronUp className="h-3 w-3" /> Mostrar menos</>
                          : <><ChevronDown className="h-3 w-3" /> Ver todas ({ids.length})</>
                        }
                      </button>
                    )}
                    {visibleIds.map((id) => {
                      const t = taskMap[id];
                      if (!t) return null;
                      const overdue = !!t.due_date && t.due_date < today && t.status !== "done";
                      return (
                        <SortableTaskCard
                          key={id}
                          task={t}
                          assignee={t.assignee_id ? memberMap[t.assignee_id] : undefined}
                          overdue={overdue}
                          onClick={() => setOpenTaskId(id)}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </KanbanColumn>
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask && (
            <TaskCardContent
              task={activeTask}
              assignee={activeTask.assignee_id ? memberMap[activeTask.assignee_id] : undefined}
              overdue={!!activeTask.due_date && activeTask.due_date < today && activeTask.status !== "done"}
              dragging
            />
          )}
        </DragOverlay>
      </DndContext>

      {/* ── Dialogs ── */}
      {openTaskId && (
        <TaskDialog
          taskId={openTaskId}
          onClose={() => { setOpenTaskId(null); qc.invalidateQueries({ queryKey: ["tasks"] }); }}
        />
      )}
      {newTask && (
        <TaskDialog
          initialValues={newTask}
          onClose={() => { setNewTask(null); qc.invalidateQueries({ queryKey: ["tasks"] }); }}
        />
      )}
    </div>
  );
}

// ─── Column ────────────────────────────────────────────────────
function KanbanColumn({
  status, count, onAddTask, children,
}: {
  status: TaskStatus;
  count: number;
  onAddTask: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[200px] flex-col rounded-xl border bg-card p-2 transition-colors",
        isOver && "bg-accent/40 ring-2 ring-primary/40"
      )}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          {TASK_STATUS_LABELS[status]}
        </span>
        <div className="flex items-center gap-1">
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {count}
          </span>
          <button
            onClick={onAddTask}
            className="rounded p-0.5 hover:bg-accent text-muted-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

// ─── Sortable card ─────────────────────────────────────────────
function SortableTaskCard({
  task, assignee, overdue, onClick,
}: {
  task: Task;
  assignee?: Member;
  overdue: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      {...attributes}
      {...listeners}
    >
      <TaskCardContent
        task={task}
        assignee={assignee}
        overdue={overdue}
        onClick={onClick}
      />
    </div>
  );
}

// ─── Card content ─────────────────────────────────────────────
function TaskCardContent({
  task, assignee, overdue, onClick, dragging,
}: {
  task: Task;
  assignee?: Member;
  overdue: boolean;
  onClick?: () => void;
  dragging?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "cursor-pointer select-none space-y-2 rounded-lg border bg-background p-2.5 text-sm shadow-sm transition-shadow hover:shadow-md",
        overdue && "border-destructive/60",
        dragging && "shadow-lg ring-2 ring-primary"
      )}
    >
      <p className="line-clamp-2 font-medium leading-snug">{task.title}</p>

      <div className="flex items-center justify-between gap-1">
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", TASK_PRIORITY_CLASSES[task.priority])}>
          {TASK_PRIORITY_LABELS[task.priority]}
        </span>

        <div className="flex items-center gap-1.5 text-muted-foreground">
          {task.post_id && <Paperclip className="h-3 w-3" />}
          {assignee && <TaskAvatar name={assignee.name} size="xs" />}
        </div>
      </div>

      {task.due_date && (
        <p className={cn("flex items-center gap-1 text-[10px]", overdue ? "text-destructive font-semibold" : "text-muted-foreground")}>
          <span>{overdue ? "⚠ Vencida:" : "📅"}</span> {task.due_date}
        </p>
      )}
    </div>
  );
}

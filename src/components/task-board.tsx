import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { TaskDialog, TaskAvatar } from "@/components/task-dialog";
import {
  Task, TaskPriority, Client,
  TASK_PRIORITY_LABELS, TASK_PRIORITY_CLASSES,
} from "@/lib/content";
import { fireConfetti } from "@/lib/confetti";
import { cn } from "@/lib/utils";
import { Plus, Paperclip, ChevronDown, ChevronUp, MoreHorizontal, Pencil, Palette, CheckCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────
type Column = {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  position: number;
  is_done_column: boolean;
};

type Member = { user_id: string; name: string; email: string; role: string };

type Filters = {
  clientId: string;
  assigneeId: string;
  priority: string;
  hasPost: string;
};

type Props = { fixedClientId?: string };

// ─── TaskBoard ────────────────────────────────────────────────
export function TaskBoard({ fixedClientId }: Props) {
  const qc = useQueryClient();
  const [colItems, setColItems] = useState<Record<string, string[]>>({});
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
  const [addColOpen, setAddColOpen] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ── Data ──────────────────────────────────────────────────────
  const { data: columns = [] } = useQuery<Column[]>({
    queryKey: ["task-columns"],
    queryFn: async () => {
      const { data: ws } = await supabase
        .from("workspaces").select("id").order("created_at").limit(1).maybeSingle();
      if (!ws) return [];
      const { data } = await supabase
        .from("task_boards_columns")
        .select("*")
        .eq("workspace_id", ws.id)
        .order("position");
      return (data ?? []) as Column[];
    },
  });

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

  // ── Filter tasks ──────────────────────────────────────────────
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

  // Sync colItems when columns/tasks change
  useEffect(() => {
    const grouped: Record<string, string[]> = {};
    for (const col of columns) grouped[col.id] = [];
    for (const t of filtered) {
      const colId = t.column_id ?? columns[0]?.id;
      if (colId && colId in grouped) grouped[colId].push(t.id);
      else if (columns[0]) grouped[columns[0].id].push(t.id);
    }
    setColItems(grouped);
  }, [filtered, columns]);

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

  const findColumn = useCallback(
    (id: string): string | null => {
      if (id in colItems) return id;
      for (const [colId, ids] of Object.entries(colItems)) {
        if (ids.includes(id)) return colId;
      }
      return null;
    },
    [colItems]
  );

  // ── Persist ───────────────────────────────────────────────────
  const persist = useCallback(
    async (updates: { id: string; column_id: string; position: number }[]) => {
      if (!updates.length) return;
      await supabase.rpc("update_task_positions", {
        _updates: updates.map((u) => ({ id: u.id, column_id: u.column_id, position: u.position })),
      });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["my-open-tasks"] });
    },
    [qc]
  );

  // ── DnD ───────────────────────────────────────────────────────
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
      const oldIdx = colItems[fromCol].indexOf(activeId);
      const newIdx = colItems[fromCol].indexOf(overId);
      if (oldIdx === newIdx) return;
      const reordered = arrayMove(colItems[fromCol], oldIdx, newIdx);
      setColItems((prev) => ({ ...prev, [fromCol]: reordered }));
      const updates = reordered
        .map((id, i) => ({ id, column_id: fromCol, position: i }))
        .filter(({ id, position }) => taskMap[id]?.position !== position);
      await persist(updates);
    } else {
      const fromItems = colItems[fromCol].filter((id) => id !== activeId);
      const toItems   = [...colItems[toCol]];
      const overIdx   = toItems.indexOf(overId);
      if (overIdx === -1) toItems.push(activeId);
      else toItems.splice(overIdx, 0, activeId);

      setColItems((prev) => ({ ...prev, [fromCol]: fromItems, [toCol]: toItems }));

      const toColObj = columns.find((c) => c.id === toCol);
      const wasNotDone = !columns.find((c) => c.id === taskMap[activeId]?.column_id)?.is_done_column;
      if (toColObj?.is_done_column && wasNotDone) fireConfetti();

      const updates: { id: string; column_id: string; position: number }[] = [];
      toItems.forEach((id, i) => {
        const t = taskMap[id];
        if (!t || t.column_id !== toCol || t.position !== i)
          updates.push({ id, column_id: toCol, position: i });
      });
      fromItems.forEach((id, i) => {
        const t = taskMap[id];
        if (t && t.position !== i)
          updates.push({ id, column_id: fromCol, position: i });
      });
      await persist(updates);
    }
  };

  const openNew = (colId: string) => {
    const col = columns.find((c) => c.id === colId);
    setNewTask({
      column_id: colId,
      priority: "medium",
      client_id: fixedClientId ?? (filters.clientId !== "all" ? filters.clientId : null),
    } as any);
  };

  const today = new Date().toISOString().split("T")[0];
  const workspaceId = columns[0]?.workspace_id;

  return (
    <div className="space-y-4">
      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => columns[0] && openNew(columns[0].id)}>
          <Plus className="h-4 w-4" /> Nova tarefa
        </Button>

        {!fixedClientId && (
          <Select value={filters.clientId} onValueChange={(v) => setFilters((f) => ({ ...f, clientId: v }))}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Todos os clientes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <Select value={filters.assigneeId} onValueChange={(v) => setFilters((f) => ({ ...f, assigneeId: v }))}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Responsável" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filters.priority} onValueChange={(v) => setFilters((f) => ({ ...f, priority: v }))}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Prioridade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {(["urgent", "high", "medium", "low"] as TaskPriority[]).map((p) => (
              <SelectItem key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Kanban ── */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {columns.map((col) => {
            const ids = colItems[col.id] ?? [];
            const isDone = col.is_done_column;
            const visibleIds = isDone && !doneExpanded ? ids.slice(-10) : ids;

            return (
              <KanbanColumn
                key={col.id}
                column={col}
                count={ids.length}
                onAddTask={() => openNew(col.id)}
                onRename={(name) => renameColumn(col.id, name, qc)}
                onChangeColor={(color) => recolorColumn(col.id, color, qc)}
                onToggleDone={() => toggleDoneColumn(col.id, col.is_done_column, qc)}
                onDelete={() => deleteColumn(col, colItems[col.id] ?? [], columns, qc)}
                canDelete={columns.length > 1}
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
                      const overdue = !!t.due_date && t.due_date < today && !col.is_done_column;
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

          {/* Add column button */}
          <button
            onClick={() => setAddColOpen(true)}
            className="flex h-fit w-56 flex-shrink-0 items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <Plus className="h-4 w-4" /> Nova coluna
          </button>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask && (
            <TaskCardContent
              task={activeTask}
              assignee={activeTask.assignee_id ? memberMap[activeTask.assignee_id] : undefined}
              overdue={!!activeTask.due_date && activeTask.due_date < today}
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

      <AddColumnDialog
        open={addColOpen}
        workspaceId={workspaceId ?? ""}
        nextPosition={columns.length}
        onClose={() => setAddColOpen(false)}
        onSaved={() => { setAddColOpen(false); qc.invalidateQueries({ queryKey: ["task-columns"] }); }}
      />
    </div>
  );
}

// ─── Column operations ─────────────────────────────────────────
async function renameColumn(id: string, name: string, qc: ReturnType<typeof useQueryClient>) {
  const { error } = await supabase.from("task_boards_columns").update({ name }).eq("id", id);
  if (error) { toast.error("Erro ao renomear coluna"); return; }
  qc.invalidateQueries({ queryKey: ["task-columns"] });
}

async function recolorColumn(id: string, color: string, qc: ReturnType<typeof useQueryClient>) {
  const { error } = await supabase.from("task_boards_columns").update({ color }).eq("id", id);
  if (error) { toast.error("Erro ao alterar cor"); return; }
  qc.invalidateQueries({ queryKey: ["task-columns"] });
}

async function toggleDoneColumn(id: string, current: boolean, qc: ReturnType<typeof useQueryClient>) {
  const { error } = await supabase.from("task_boards_columns").update({ is_done_column: !current }).eq("id", id);
  if (error) { toast.error("Erro ao atualizar coluna"); return; }
  toast.success(!current ? "Coluna marcada como 'Concluído'" : "Coluna desmarcada como 'Concluído'");
  qc.invalidateQueries({ queryKey: ["task-columns"] });
  qc.invalidateQueries({ queryKey: ["my-open-tasks"] });
}

async function deleteColumn(
  col: Column,
  taskIds: string[],
  allColumns: Column[],
  qc: ReturnType<typeof useQueryClient>
) {
  if (allColumns.length <= 1) {
    toast.error("Não é possível excluir a única coluna restante");
    return;
  }
  const fallback = allColumns.find((c) => c.id !== col.id);
  if (taskIds.length > 0 && fallback) {
    const move = window.confirm(
      `Esta coluna tem ${taskIds.length} tarefa(s). Mover para "${fallback.name}" antes de excluir?`
    );
    if (!move) return;
    await supabase.from("tasks").update({ column_id: fallback.id }).in("id", taskIds);
  }
  const { error } = await supabase.from("task_boards_columns").delete().eq("id", col.id);
  if (error) { toast.error("Erro ao excluir coluna"); return; }
  toast.success("Coluna excluída");
  qc.invalidateQueries({ queryKey: ["task-columns"] });
  qc.invalidateQueries({ queryKey: ["tasks"] });
}

// ─── KanbanColumn ─────────────────────────────────────────────
const PRESET_COLORS = [
  "#6b7280","#ef4444","#f97316","#f59e0b","#22c55e","#14b8a6",
  "#3b82f6","#6366f1","#8b5cf6","#ec4899","#0ea5e9","#84cc16",
];

function KanbanColumn({
  column, count, onAddTask, onRename, onChangeColor, onToggleDone, onDelete, canDelete, children,
}: {
  column: Column;
  count: number;
  onAddTask: () => void;
  onRename: (name: string) => void;
  onChangeColor: (color: string) => void;
  onToggleDone: () => void;
  onDelete: () => void;
  canDelete: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(column.name);
  const [showColors, setShowColors] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const commitRename = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== column.name) onRename(draft.trim());
    else setDraft(column.name);
  };

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-56 flex-shrink-0 min-h-[200px] flex-col rounded-xl border bg-card transition-colors",
        isOver && "bg-accent/40 ring-2 ring-primary/40"
      )}
    >
      {/* Column header bar */}
      <div
        className="h-1 rounded-t-xl"
        style={{ backgroundColor: column.color }}
      />

      <div className="flex items-center justify-between px-2 pb-2 pt-2">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setEditing(false); setDraft(column.name); } }}
            className="flex-1 rounded border bg-background px-1.5 py-0.5 text-xs font-semibold uppercase focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <span
            className="flex-1 cursor-pointer truncate text-xs font-semibold uppercase text-muted-foreground"
            onDoubleClick={() => setEditing(true)}
            title="Duplo clique para renomear"
          >
            {column.name}
          </span>
        )}

        <div className="ml-1 flex items-center gap-1">
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {count}
          </span>
          <button onClick={onAddTask} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> Renomear
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowColors((v) => !v)}>
                <Palette className="h-4 w-4" /> Mudar cor
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleDone}>
                <CheckCircle className="h-4 w-4" />
                {column.is_done_column ? "Desmarcar como Concluído" : "Marcar como Concluído"}
              </DropdownMenuItem>
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                    <Trash2 className="h-4 w-4" /> Excluir coluna
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {showColors && (
        <div className="mx-2 mb-2 flex flex-wrap gap-1.5">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => { onChangeColor(c); setShowColors(false); }}
              className={cn(
                "h-5 w-5 rounded-full border-2 transition-transform hover:scale-110",
                column.color === c ? "border-foreground" : "border-transparent"
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}

      <div className="flex-1 px-2 pb-2">{children}</div>
    </div>
  );
}

// ─── AddColumnDialog ──────────────────────────────────────────
function AddColumnDialog({
  open, workspaceId, nextPosition, onClose, onSaved,
}: {
  open: boolean;
  workspaceId: string;
  nextPosition: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName]   = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("task_boards_columns").insert({
      workspace_id: workspaceId,
      name: name.trim(),
      color,
      position: nextPosition,
      is_done_column: false,
    });
    setSaving(false);
    if (error) { toast.error("Erro ao criar coluna"); return; }
    toast.success("Coluna criada");
    setName(""); setColor("#3b82f6");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Nova coluna</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nome</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Aguardando cliente"
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Cor</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                    color === c ? "border-foreground" : "border-transparent"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={!name.trim() || saving}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── SortableTaskCard ─────────────────────────────────────────
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
      <TaskCardContent task={task} assignee={assignee} overdue={overdue} onClick={onClick} />
    </div>
  );
}

// ─── TaskCardContent ──────────────────────────────────────────
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

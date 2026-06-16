import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog, type ConfirmState } from "@/components/confirm-dialog";
import { StatusBadge } from "@/components/status-badge";
import {
  Task, TaskComment, TaskStatus, TaskPriority,
  TASK_STATUS_LABELS, TASK_STATUS_ORDER,
  TASK_PRIORITY_LABELS, TASK_PRIORITY_CLASSES,
  type Post, type Client,
} from "@/lib/content";
import { toast } from "sonner";
import { Send, Trash2, Paperclip, Calendar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type Member = { user_id: string; role: string; email: string; name: string };

type Props = {
  taskId?: string | null;
  initialValues?: Partial<Task>;
  onClose: () => void;
  onOpenPost?: (postId: string) => void;
};

export function TaskDialog({ taskId, initialValues, onClose, onOpenPost }: Props) {
  const qc = useQueryClient();
  const isNew = !taskId;
  const [form, setForm] = useState<Partial<Task>>(initialValues ?? {});
  const [comment, setComment] = useState("");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);

  // Fetch current user info
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      const name =
        data.user.user_metadata?.full_name ??
        data.user.user_metadata?.name ??
        data.user.email ??
        "Equipe";
      setMe({ id: data.user.id, name });
    });
  }, []);

  // Fetch task (edit mode)
  const { data: task } = useQuery({
    queryKey: ["task", taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", taskId!)
        .single();
      if (error) throw error;
      return data as Task;
    },
  });

  useEffect(() => {
    if (task) setForm(task);
  }, [task]);

  // Workspace members (for assignee)
  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ["members-for-tasks"],
    queryFn: async () => {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("id")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (!ws) return [];
      const { data } = await supabase.rpc("list_workspace_members", {
        _workspace_id: ws.id,
      });
      return (data ?? []) as Member[];
    },
  });

  // Clients (for client select)
  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["clients-for-tasks"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("status", "active")
        .order("name");
      return (data ?? []) as Client[];
    },
  });

  // Posts filtered by selected client
  const { data: posts = [] } = useQuery<Post[]>({
    queryKey: ["posts-for-tasks", form.client_id],
    enabled: !!form.client_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("posts")
        .select("*")
        .eq("client_id", form.client_id!)
        .neq("status", "published")
        .order("scheduled_date");
      return (data ?? []) as Post[];
    },
  });

  // Linked post data
  const { data: linkedPost } = useQuery<Post | null>({
    queryKey: ["linked-post", form.post_id],
    enabled: !!form.post_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("posts")
        .select("*")
        .eq("id", form.post_id!)
        .single();
      return (data ?? null) as Post | null;
    },
  });

  // Comments
  const { data: comments = [] } = useQuery<TaskComment[]>({
    queryKey: ["task-comments", taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data } = await supabase
        .from("task_comments")
        .select("*")
        .eq("task_id", taskId!)
        .order("created_at");
      return (data ?? []) as TaskComment[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["task", taskId] });
    qc.invalidateQueries({ queryKey: ["my-open-tasks"] });
  };

  const save = async () => {
    if (!form.title?.trim()) return toast.error("Título obrigatório");

    const { data: ws } = await supabase
      .from("workspaces")
      .select("id")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (!ws) return;

    if (isNew) {
      const payload = {
        workspace_id:  ws.id,
        client_id:     form.client_id ?? null,
        post_id:       form.post_id ?? null,
        title:         form.title!,
        description:   form.description ?? null,
        status:        (form.status ?? "backlog") as TaskStatus,
        priority:      (form.priority ?? "medium") as TaskPriority,
        assignee_id:   form.assignee_id ?? null,
        due_date:      form.due_date ?? null,
        position:      0,
        created_by:    me?.id ?? "",
      };
      const { data: newTask, error } = await supabase
        .from("tasks")
        .insert(payload)
        .select()
        .single();
      if (error) return toast.error(error.message);

      // Activity log when linked to a post
      if (form.post_id && form.client_id) {
        await supabase.from("activity_log").insert({
          workspace_id: ws.id,
          client_id:    form.client_id,
          post_id:      form.post_id,
          action:       `Tarefa criada: ${form.title}`,
          actor:        me?.name ?? "Equipe",
        });
        qc.invalidateQueries({ queryKey: ["activity"] });
      }

      toast.success("Tarefa criada");
      invalidate();
      onClose();
      return;
    }

    const { error } = await supabase
      .from("tasks")
      .update({
        title:       form.title,
        description: form.description ?? null,
        status:      form.status as TaskStatus,
        priority:    form.priority as TaskPriority,
        assignee_id: form.assignee_id ?? null,
        client_id:   form.client_id ?? null,
        post_id:     form.post_id ?? null,
        due_date:    form.due_date ?? null,
      })
      .eq("id", taskId!);

    if (error) return toast.error(error.message);
    toast.success("Tarefa salva");
    invalidate();
  };

  const deleteTask = async () => {
    if (!taskId) return;
    await supabase.from("tasks").delete().eq("id", taskId);
    toast.success("Tarefa excluída");
    invalidate();
    onClose();
  };

  const addComment = async () => {
    if (!comment.trim() || !taskId || !me) return;
    await supabase.from("task_comments").insert({
      task_id:     taskId,
      author_id:   me.id,
      author_name: me.name,
      body:        comment,
    });
    setComment("");
    qc.invalidateQueries({ queryKey: ["task-comments", taskId] });
  };

  const today = new Date().toISOString().split("T")[0];
  const isOverdue =
    form.due_date &&
    form.due_date < today &&
    form.status !== "done";

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-3xl p-0">
          <div className="grid max-h-[88vh] grid-cols-1 md:grid-cols-[1.5fr_1fr]">
            {/* ── Left: form ── */}
            <ScrollArea className="max-h-[88vh] border-r">
              <div className="space-y-5 p-6">
                <DialogHeader>
                  <DialogTitle className="text-base">
                    {isNew ? "Nova tarefa" : "Editar tarefa"}
                  </DialogTitle>
                </DialogHeader>

                {/* Title */}
                <div className="space-y-1.5">
                  <Label>Título *</Label>
                  <Input
                    value={form.title ?? ""}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="O que precisa ser feito?"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label>Descrição</Label>
                  <Textarea
                    rows={3}
                    value={form.description ?? ""}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Detalhes, contexto, links…"
                  />
                </div>

                {/* Status + Priority */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select
                      value={form.status ?? "backlog"}
                      onValueChange={(v) => setForm({ ...form, status: v as TaskStatus })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TASK_STATUS_ORDER.map((s) => (
                          <SelectItem key={s} value={s}>{TASK_STATUS_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Prioridade</Label>
                    <Select
                      value={form.priority ?? "medium"}
                      onValueChange={(v) => setForm({ ...form, priority: v as TaskPriority })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(["low", "medium", "high", "urgent"] as TaskPriority[]).map((p) => (
                          <SelectItem key={p} value={p}>
                            <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", TASK_PRIORITY_CLASSES[p])}>
                              {TASK_PRIORITY_LABELS[p]}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Assignee + Due date */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Responsável</Label>
                    <Select
                      value={form.assignee_id ?? "__none__"}
                      onValueChange={(v) =>
                        setForm({ ...form, assignee_id: v === "__none__" ? null : v })
                      }
                    >
                      <SelectTrigger><SelectValue placeholder="Sem responsável" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sem responsável</SelectItem>
                        {members.map((m) => (
                          <SelectItem key={m.user_id} value={m.user_id}>
                            <span className="flex items-center gap-2">
                              <Avatar name={m.name} size="xs" />
                              {m.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className={cn(isOverdue && "text-destructive")}>
                      {isOverdue ? "Vencida!" : "Vencimento"}
                    </Label>
                    <Input
                      type="date"
                      value={form.due_date ?? ""}
                      onChange={(e) => setForm({ ...form, due_date: e.target.value || null })}
                      className={cn(isOverdue && "border-destructive text-destructive")}
                    />
                  </div>
                </div>

                {/* Client + Post */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Cliente</Label>
                    <Select
                      value={form.client_id ?? "__none__"}
                      onValueChange={(v) =>
                        setForm({
                          ...form,
                          client_id: v === "__none__" ? null : v,
                          post_id: null,
                        })
                      }
                    >
                      <SelectTrigger><SelectValue placeholder="Sem cliente" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sem cliente</SelectItem>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Post vinculado</Label>
                    <Select
                      value={form.post_id ?? "__none__"}
                      onValueChange={(v) =>
                        setForm({ ...form, post_id: v === "__none__" ? null : v })
                      }
                      disabled={!form.client_id}
                    >
                      <SelectTrigger><SelectValue placeholder={form.client_id ? "Selecionar post" : "Escolha um cliente"} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sem post</SelectItem>
                        {posts.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.title} {p.scheduled_date ? `(${p.scheduled_date})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Linked post card */}
                {linkedPost && (
                  <div
                    className={cn(
                      "flex items-start justify-between gap-3 rounded-lg border bg-muted/40 p-3 text-sm",
                      onOpenPost && "cursor-pointer hover:bg-accent"
                    )}
                    onClick={() => onOpenPost?.(linkedPost.id)}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="flex items-center gap-1 font-medium">
                        <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                        {linkedPost.title}
                      </p>
                      {linkedPost.scheduled_date && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {linkedPost.scheduled_date}
                        </p>
                      )}
                    </div>
                    <StatusBadge
                      status={linkedPost.status}
                      flowStage={linkedPost.flow_stage ?? undefined}
                      approvalMode={linkedPost.approval_mode ?? undefined}
                    />
                  </div>
                )}

                <Separator />

                {/* Actions */}
                <div className="flex items-center justify-between gap-2">
                  <Button onClick={save}>{isNew ? "Criar tarefa" : "Salvar"}</Button>
                  {!isNew && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        setConfirm({
                          title: "Excluir tarefa?",
                          description: "Esta ação não pode ser desfeita.",
                          confirmLabel: "Excluir",
                          onConfirm: deleteTask,
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" /> Excluir
                    </Button>
                  )}
                </div>
              </div>
            </ScrollArea>

            {/* ── Right: comments ── */}
            <div className="flex max-h-[88vh] flex-col">
              <div className="border-b p-4">
                <h3 className="text-sm font-semibold">Comentários</h3>
              </div>

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3">
                  {comments.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground pt-4">
                      Sem comentários ainda.
                    </p>
                  )}
                  {comments.map((c) => (
                    <div key={c.id} className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <Avatar name={c.author_name} size="xs" />
                        <span className="text-xs font-semibold">{c.author_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(c.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </span>
                      </div>
                      <p className="ml-6 rounded-lg bg-muted px-3 py-2 text-sm">{c.body}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex gap-2 border-t p-3">
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Comentar…"
                  onKeyDown={(e) => e.key === "Enter" && addComment()}
                  disabled={isNew}
                />
                <Button size="icon" onClick={addComment} disabled={isNew}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog state={confirm} onOpenChange={(o) => !o && setConfirm(null)} />
    </>
  );
}

// ─── Avatar helper ───────────────────────────────────────────
function Avatar({ name, size = "sm" }: { name: string; size?: "xs" | "sm" }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  const colors = [
    "bg-violet-500", "bg-pink-500", "bg-amber-500",
    "bg-emerald-500", "bg-blue-500", "bg-orange-500",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  const cls = size === "xs" ? "h-5 w-5 text-[10px]" : "h-7 w-7 text-xs";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white",
        cls,
        color
      )}
    >
      {initials}
    </span>
  );
}

export { Avatar as TaskAvatar };

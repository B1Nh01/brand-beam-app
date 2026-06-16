import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge } from "@/components/status-badge";
import {
  FORMAT_LABELS,
  PLATFORM_LABELS,
  APPROVAL_LABELS,
  type Post,
  type PostComment,
  type PostMedia,
} from "@/lib/content";
import { toast } from "sonner";
import { Send, Upload, Trash2, ImageOff, ListChecks, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TaskDialog } from "@/components/task-dialog";
import { type Task, TASK_STATUS_LABELS, TASK_PRIORITY_CLASSES } from "@/lib/content";
import { cn } from "@/lib/utils";

type Props = {
  postId: string | null;
  newForClient?: { clientId: string; workspaceId: string; date?: string } | null;
  onClose: () => void;
};

export function PostDialog({ postId, newForClient, onClose }: Props) {
  const qc = useQueryClient();
  const open = !!postId || !!newForClient;
  const isNew = !!newForClient;

  const [form, setForm] = useState<Partial<Post>>({});
  const [comment, setComment] = useState("");
  const [tasksOpen, setTasksOpen] = useState(false);
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [newTaskValues, setNewTaskValues] = useState<Partial<Task> | null>(null);

  const postQuery = useQuery({
    queryKey: ["post", postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data, error } = await supabase.from("posts").select("*").eq("id", postId!).single();
      if (error) throw error;
      return data as Post;
    },
  });

  const mediaQuery = useQuery({
    queryKey: ["post-media", postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data } = await supabase.from("post_media").select("*").eq("post_id", postId!).order("sort_order");
      const media = (data ?? []) as PostMedia[];
      const withUrls = await Promise.all(
        media.map(async (m) => {
          const { data: s } = await supabase.storage.from("post-media").createSignedUrl(m.storage_path, 3600);
          return { ...m, url: s?.signedUrl };
        }),
      );
      return withUrls;
    },
  });

  const commentsQuery = useQuery({
    queryKey: ["post-comments", postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data } = await supabase.from("post_comments").select("*").eq("post_id", postId!).order("created_at");
      return (data ?? []) as PostComment[];
    },
  });

  const linkedTasksQuery = useQuery({
    queryKey: ["tasks-by-post", postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data } = await supabase.from("tasks").select("*").eq("post_id", postId!).order("position");
      return (data ?? []) as Task[];
    },
  });

  useEffect(() => {
    if (postQuery.data) setForm(postQuery.data);
    if (isNew)
      setForm({
        title: "",
        format: "static",
        platform: "instagram",
        approval_mode: "fast",
        status: "draft",
        scheduled_date: newForClient?.date,
      });
  }, [postQuery.data, isNew, newForClient?.date]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["posts"] });
    qc.invalidateQueries({ queryKey: ["post", postId] });
    qc.invalidateQueries({ queryKey: ["activity"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const logActivity = async (action: string) => {
    const ws = form.workspace_id ?? newForClient?.workspaceId;
    const cl = form.client_id ?? newForClient?.clientId;
    if (!ws) return;
    await supabase.from("activity_log").insert({ workspace_id: ws, client_id: cl, post_id: postId, action, actor: "Equipe" });
  };

  const save = async () => {
    if (isNew) {
      const { data, error } = await supabase
        .from("posts")
        .insert({
          workspace_id: newForClient!.workspaceId,
          client_id: newForClient!.clientId,
          title: form.title || "Novo post",
          idea: form.idea,
          copy: form.copy,
          caption: form.caption,
          format: form.format as Post["format"],
          platform: form.platform as Post["platform"],
          scheduled_date: form.scheduled_date,
          scheduled_time: form.scheduled_time,
          approval_mode: form.approval_mode as Post["approval_mode"],
        })
        .select()
        .single();
      if (error) return toast.error(error.message);
      await supabase.from("activity_log").insert({ workspace_id: newForClient!.workspaceId, client_id: newForClient!.clientId, post_id: data.id, action: "Post criado", actor: "Equipe" });
      toast.success("Post criado");
      invalidate();
      onClose();
      return;
    }
    const { error } = await supabase
      .from("posts")
      .update({
        title: form.title,
        idea: form.idea,
        copy: form.copy,
        caption: form.caption,
        format: form.format as Post["format"],
        platform: form.platform as Post["platform"],
        scheduled_date: form.scheduled_date,
        scheduled_time: form.scheduled_time,
        approval_mode: form.approval_mode as Post["approval_mode"],
      })
      .eq("id", postId!);
    if (error) return toast.error(error.message);
    toast.success("Post salvo");
    invalidate();
  };

  const sendForApproval = async () => {
    const { error } = await supabase.from("posts").update({ status: "in_approval" }).eq("id", postId!);
    if (error) return toast.error(error.message);
    await logActivity("Enviado para aprovação");
    toast.success("Enviado para aprovação");
    invalidate();
  };

  const setStatus = async (status: Post["status"]) => {
    const { error } = await supabase.from("posts").update({ status }).eq("id", postId!);
    if (error) return toast.error(error.message);
    await logActivity(`Status alterado para ${status}`);
    invalidate();
  };

  const ALLOWED_MIME: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif",
    "image/webp": "webp", "image/heic": "heic",
    "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
  };
  const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

  const upload = async (files: FileList | null) => {
    if (!files || !postId) return;
    const existing = mediaQuery.data?.length ?? 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = ALLOWED_MIME[file.type];
      if (!ext) {
        toast.error(`Tipo não permitido: ${file.name}`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`Arquivo muito grande (máx 50 MB): ${file.name}`);
        continue;
      }
      const safeName = `${Date.now()}-${i}.${ext}`;
      const path = `${form.workspace_id}/${postId}/${safeName}`;
      const { error } = await supabase.storage.from("post-media").upload(path, file, { contentType: file.type });
      if (error) {
        toast.error(error.message);
        continue;
      }
      await supabase.from("post_media").insert({
        post_id: postId,
        storage_path: path,
        type: file.type.startsWith("video") ? "video" : "image",
        sort_order: existing + i,
      });
    }
    qc.invalidateQueries({ queryKey: ["post-media", postId] });
    toast.success("Mídia enviada");
  };

  const deleteMedia = async (m: PostMedia) => {
    await supabase.storage.from("post-media").remove([m.storage_path]);
    await supabase.from("post_media").delete().eq("id", m.id);
    qc.invalidateQueries({ queryKey: ["post-media", postId] });
  };

  const addComment = async () => {
    if (!comment.trim() || !postId) return;
    await supabase.from("post_comments").insert({ post_id: postId, author_type: "team", body: comment, author_name: "Equipe" });
    setComment("");
    qc.invalidateQueries({ queryKey: ["post-comments", postId] });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl p-0">
        <div className="grid max-h-[85vh] grid-cols-1 md:grid-cols-[1.4fr_1fr]">
          <ScrollArea className="max-h-[85vh] border-r p-6">
            <DialogHeader className="mb-4">
              <DialogTitle className="flex items-center gap-2">
                {isNew ? "Novo post" : "Editar post"}
                {form.status && <StatusBadge status={form.status} flowStage={form.flow_stage ?? undefined} approvalMode={form.approval_mode ?? undefined} />}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Ideia</Label>
                <Textarea value={form.idea ?? ""} onChange={(e) => setForm({ ...form, idea: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Copy / Roteiro</Label>
                <Textarea value={form.copy ?? ""} onChange={(e) => setForm({ ...form, copy: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Legenda</Label>
                <Textarea value={form.caption ?? ""} onChange={(e) => setForm({ ...form, caption: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <SelectField label="Formato" value={form.format} options={FORMAT_LABELS} onChange={(v) => setForm({ ...form, format: v as Post["format"] })} />
                <SelectField label="Plataforma" value={form.platform} options={PLATFORM_LABELS} onChange={(v) => setForm({ ...form, platform: v as Post["platform"] })} />
                <SelectField label="Modo de aprovação" value={form.approval_mode} options={APPROVAL_LABELS} onChange={(v) => setForm({ ...form, approval_mode: v as Post["approval_mode"] })} />
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input type="date" value={form.scheduled_date ?? ""} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Hora</Label>
                  <Input type="time" value={form.scheduled_time ?? ""} onChange={(e) => setForm({ ...form, scheduled_time: e.target.value })} />
                </div>
              </div>

              {!isNew && (
                <div className="space-y-2">
                  <Label>Mídias</Label>
                  <div className="flex flex-wrap gap-2">
                    {mediaQuery.data?.map((m) => (
                      <div key={m.id} className="group relative h-24 w-24 overflow-hidden rounded-md border bg-muted">
                        {m.url ? (
                          m.type === "video" ? (
                            <video src={m.url} className="h-full w-full object-cover" />
                          ) : (
                            <img src={m.url} alt="mídia" className="h-full w-full object-cover" />
                          )
                        ) : (
                          <ImageOff className="m-auto mt-8 h-6 w-6 text-muted-foreground" />
                        )}
                        <button onClick={() => deleteMedia(m)} className="absolute right-1 top-1 rounded bg-background/80 p-1 opacity-0 transition group-hover:opacity-100">
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </button>
                      </div>
                    ))}
                    <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-accent">
                      <Upload className="h-5 w-5" />
                      Enviar
                      <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => upload(e.target.files)} />
                    </label>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={save}>{isNew ? "Criar" : "Salvar"}</Button>
                {!isNew && form.status === "draft" && <Button variant="secondary" onClick={sendForApproval}>Enviar para aprovação</Button>}
                {!isNew && form.status === "approved" && <Button variant="secondary" onClick={() => setStatus("scheduled")}>Marcar como agendado</Button>}
                {!isNew && form.status === "scheduled" && <Button variant="secondary" onClick={() => setStatus("published")}>Marcar como publicado</Button>}
              </div>
            </div>
          </ScrollArea>

          {!isNew && (
            <div className="flex max-h-[85vh] flex-col">
              {/* Tarefas vinculadas */}
              <Collapsible open={tasksOpen} onOpenChange={setTasksOpen}>
                <div className="flex items-center justify-between border-b px-3 py-2.5">
                  <CollapsibleTrigger asChild>
                    <button className="flex flex-1 items-center gap-2 text-left text-sm font-semibold hover:text-primary transition-colors">
                      <ListChecks className="h-4 w-4 shrink-0" />
                      Tarefas vinculadas
                      {(linkedTasksQuery.data?.length ?? 0) > 0 && (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-bold">
                          {linkedTasksQuery.data!.length}
                        </span>
                      )}
                      {tasksOpen ? <ChevronUp className="ml-auto h-3 w-3" /> : <ChevronDown className="ml-auto h-3 w-3" />}
                    </button>
                  </CollapsibleTrigger>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="ml-1 h-6 w-6 shrink-0"
                    title="Criar tarefa para este post"
                    onClick={() =>
                      setNewTaskValues({ post_id: postId!, client_id: form.client_id ?? undefined })
                    }
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <CollapsibleContent className="border-b">
                  <div className="max-h-52 overflow-y-auto p-2 space-y-1">
                    {linkedTasksQuery.data?.length === 0 && (
                      <p className="px-2 py-3 text-xs text-muted-foreground">Nenhuma tarefa vinculada.</p>
                    )}
                    {linkedTasksQuery.data?.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => setEditTaskId(task.id)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent transition-colors"
                      >
                        <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold", TASK_PRIORITY_CLASSES[task.priority])}>
                          {TASK_STATUS_LABELS[task.status]}
                        </span>
                        <span className="flex-1 truncate">{task.title}</span>
                      </button>
                    ))}
                    <button
                      onClick={() =>
                        setNewTaskValues({ post_id: postId!, client_id: form.client_id ?? undefined })
                      }
                      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      Criar tarefa para este post
                    </button>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Chat do post */}
              <div className="border-b p-4">
                <h3 className="text-sm font-semibold">Chat do post</h3>
                <p className="text-xs text-muted-foreground">Conversa com o cliente</p>
              </div>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3">
                  {commentsQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">Sem mensagens ainda.</p>}
                  {commentsQuery.data?.map((c) => (
                    <div key={c.id} className={c.author_type === "team" ? "ml-6" : "mr-6"}>
                      <div className={`rounded-lg p-2.5 text-sm ${c.author_type === "team" ? "bg-primary/10" : "bg-muted"}`}>
                        <p className="mb-0.5 text-xs font-semibold">{c.author_type === "team" ? "Equipe" : c.author_name}</p>
                        {c.body}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex gap-2 border-t p-3">
                <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Escreva uma mensagem" onKeyDown={(e) => e.key === "Enter" && addComment()} />
                <Button size="icon" onClick={addComment}><Send className="h-4 w-4" /></Button>
              </div>
            </div>
          )}

          {/* TaskDialog — criar/editar tarefa a partir do post */}
          {newTaskValues && (
            <TaskDialog
              initialValues={newTaskValues}
              onClose={() => {
                setNewTaskValues(null);
                qc.invalidateQueries({ queryKey: ["tasks-by-post", postId] });
                qc.invalidateQueries({ queryKey: ["tasks"] });
              }}
            />
          )}
          {editTaskId && (
            <TaskDialog
              taskId={editTaskId}
              onClose={() => {
                setEditTaskId(null);
                qc.invalidateQueries({ queryKey: ["tasks-by-post", postId] });
                qc.invalidateQueries({ queryKey: ["tasks"] });
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value?: string | null; options: Record<string, string>; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([k, v]) => (
            <SelectItem key={k} value={k}>{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

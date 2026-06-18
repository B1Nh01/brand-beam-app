import { useEffect, useMemo, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import {
  FORMAT_LABELS,
  PLATFORM_LABELS,
  APPROVAL_LABELS,
  FLOW_LABELS,
  FLOW_ORDER,
  type Post,
  type PostComment,
  type PostMedia,
  type FlowStage,
} from "@/lib/content";
import { toast } from "sonner";
import {
  Send,
  Upload,
  Trash2,
  ImageOff,
  ListChecks,
  ChevronDown,
  ChevronUp,
  Plus,
  Heart,
  MessageCircle,
  Share2,
  Link as LinkIcon,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { TaskDialog } from "@/components/task-dialog";
import { type Task, TASK_STATUS_LABELS, TASK_PRIORITY_CLASSES } from "@/lib/content";
import { cn } from "@/lib/utils";

// ── Stage types ──────────────────────────────────────────────────

type PostStage = {
  id: string;
  post_id: string;
  stage: string;
  status: string;
  content: Record<string, string> | null;
  updated_at: string;
};

type StageStatus = "draft" | "in_approval" | "adjustment_requested" | "approved";

const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  draft: "Rascunho",
  in_approval: "Em aprovação",
  adjustment_requested: "Ajuste",
  approved: "Aprovado",
};

const STAGE_DOT_COLOR: Record<StageStatus, string> = {
  draft: "#9ca3af",
  in_approval: "#f59e0b",
  adjustment_requested: "#ef4444",
  approved: "#22c55e",
};

function seededInt(seed: string, min: number, max: number) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return min + (Math.abs(h) % (max - min));
}

// ── Component ────────────────────────────────────────────────────

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
  const [activeTab, setActiveTab] = useState<FlowStage>("tema");
  const [refLinks, setRefLinks] = useState<[string, string, string]>(["", "", ""]);

  // ── Queries ──────────────────────────────────────────────────

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

  const stagesQuery = useQuery({
    queryKey: ["post-stages", postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data } = await supabase.from("post_stages").select("*").eq("post_id", postId!);
      return (data ?? []) as PostStage[];
    },
  });

  const clientQuery = useQuery({
    queryKey: ["client-preview", form.client_id],
    enabled: !!form.client_id && !isNew,
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("name,instagram_handle")
        .eq("id", form.client_id!)
        .single();
      return data;
    },
  });

  // ── Derived ──────────────────────────────────────────────────

  const stageStatusMap = useMemo(() => {
    const m: Record<string, StageStatus> = {};
    for (const s of stagesQuery.data ?? []) m[s.stage] = s.status as StageStatus;
    return m;
  }, [stagesQuery.data]);

  const getStageStatus = (stage: FlowStage): StageStatus => stageStatusMap[stage] ?? "draft";

  const firstMedia = mediaQuery.data?.find((m) => m.type === "image" && m.url);
  const previewLikes = postId ? seededInt(postId + "l", 150, 9999) : 0;
  const clientHandle = clientQuery.data?.instagram_handle
    ? `@${clientQuery.data.instagram_handle}`
    : clientQuery.data?.name ?? "cliente";

  // ── Effects ──────────────────────────────────────────────────

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

  useEffect(() => {
    const temaStage = stagesQuery.data?.find((s) => s.stage === "tema");
    if (temaStage?.content) {
      const c = temaStage.content as Record<string, string>;
      setRefLinks([c.ref_link_1 ?? "", c.ref_link_2 ?? "", c.ref_link_3 ?? ""]);
    }
  }, [stagesQuery.data]);

  // ── Mutations ────────────────────────────────────────────────

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
    await supabase.from("activity_log").insert({
      workspace_id: ws,
      client_id: cl,
      post_id: postId,
      action,
      actor: "Equipe",
    });
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
      await supabase.from("activity_log").insert({
        workspace_id: newForClient!.workspaceId,
        client_id: newForClient!.clientId,
        post_id: data.id,
        action: "Post criado",
        actor: "Equipe",
      });
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

    // Save Tema ref links
    if (refLinks.some((l) => l.trim())) {
      await supabase.from("post_stages").upsert(
        {
          post_id: postId!,
          stage: "tema",
          content: { ref_link_1: refLinks[0], ref_link_2: refLinks[1], ref_link_3: refLinks[2] },
        },
        { onConflict: "post_id,stage" },
      );
      qc.invalidateQueries({ queryKey: ["post-stages", postId] });
    }

    toast.success("Post salvo");
    invalidate();
  };

  const updateStageStatus = async (stage: FlowStage, status: StageStatus) => {
    const { error } = await supabase
      .from("post_stages")
      .upsert({ post_id: postId!, stage, status }, { onConflict: "post_id,stage" });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["post-stages", postId] });
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
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/heic": "heic",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
  };
  const MAX_FILE_BYTES = 50 * 1024 * 1024;

  const upload = async (files: FileList | null) => {
    if (!files || !postId) return;
    const existing = mediaQuery.data?.length ?? 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = ALLOWED_MIME[file.type];
      if (!ext) { toast.error(`Tipo não permitido: ${file.name}`); continue; }
      if (file.size > MAX_FILE_BYTES) { toast.error(`Arquivo muito grande (máx 50 MB): ${file.name}`); continue; }
      const safeName = `${Date.now()}-${i}.${ext}`;
      const path = `${form.workspace_id}/${postId}/${safeName}`;
      const { error } = await supabase.storage.from("post-media").upload(path, file, { contentType: file.type });
      if (error) { toast.error(error.message); continue; }
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
    await supabase.from("post_comments").insert({
      post_id: postId,
      author_type: "team",
      body: comment,
      author_name: "Equipe",
    });
    setComment("");
    qc.invalidateQueries({ queryKey: ["post-comments", postId] });
  };

  // ── Render ───────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl p-0">
        <div className="grid max-h-[88vh] grid-cols-1 md:grid-cols-[1.5fr_1fr]">
          {/* ── Left: form + tabs ── */}
          <ScrollArea className="max-h-[88vh] border-r p-5">
            <DialogHeader className="mb-3">
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {isNew ? "Novo post" : (form.title || "Editar post")}
                {form.status && (
                  <StatusBadge
                    status={form.status}
                    flowStage={form.flow_stage ?? undefined}
                    approvalMode={form.approval_mode ?? undefined}
                  />
                )}
              </DialogTitle>
            </DialogHeader>

            {/* Metadata */}
            <div className="mb-4 space-y-3">
              <div className="space-y-1.5">
                <Label>Título</Label>
                <Input
                  value={form.title ?? ""}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <SelectField
                  label="Formato"
                  value={form.format}
                  options={FORMAT_LABELS}
                  onChange={(v) => setForm({ ...form, format: v as Post["format"] })}
                />
                <SelectField
                  label="Plataforma"
                  value={form.platform}
                  options={PLATFORM_LABELS}
                  onChange={(v) => setForm({ ...form, platform: v as Post["platform"] })}
                />
                <SelectField
                  label="Modo de aprovação"
                  value={form.approval_mode}
                  options={APPROVAL_LABELS}
                  onChange={(v) => setForm({ ...form, approval_mode: v as Post["approval_mode"] })}
                />
                <div className="space-y-1.5">
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={form.scheduled_date ?? ""}
                    onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Stage tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FlowStage)}>
              <TabsList className="mb-3 grid w-full grid-cols-4">
                {FLOW_ORDER.map((stage) => (
                  <TabsTrigger key={stage} value={stage} className="gap-1.5 text-xs">
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: STAGE_DOT_COLOR[getStageStatus(stage)] }}
                    />
                    {FLOW_LABELS[stage]}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Tema */}
              <TabsContent value="tema" className="space-y-3">
                <StageStatusRow
                  stage="tema"
                  status={getStageStatus("tema")}
                  disabled={isNew}
                  onChange={updateStageStatus}
                />
                <div className="space-y-1.5">
                  <Label>Ideia / Briefing</Label>
                  <Textarea
                    rows={4}
                    value={form.idea ?? ""}
                    onChange={(e) => setForm({ ...form, idea: e.target.value })}
                    placeholder="Descreva a ideia do post..."
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <LinkIcon className="h-3.5 w-3.5" />
                    Referências visuais
                  </Label>
                  {refLinks.map((link, i) => (
                    <Input
                      key={i}
                      value={link}
                      onChange={(e) =>
                        setRefLinks((prev) => {
                          const n = [...prev] as [string, string, string];
                          n[i] = e.target.value;
                          return n;
                        })
                      }
                      placeholder={`Link de referência ${i + 1}`}
                      type="url"
                    />
                  ))}
                </div>
              </TabsContent>

              {/* Conteúdo */}
              <TabsContent value="conteudo" className="space-y-3">
                <StageStatusRow
                  stage="conteudo"
                  status={getStageStatus("conteudo")}
                  disabled={isNew}
                  onChange={updateStageStatus}
                />
                <div className="space-y-1.5">
                  <Label>Copy / Roteiro</Label>
                  <Textarea
                    rows={9}
                    value={form.copy ?? ""}
                    onChange={(e) => setForm({ ...form, copy: e.target.value })}
                    placeholder="Escreva o conteúdo do post..."
                  />
                </div>
              </TabsContent>

              {/* Mídia */}
              <TabsContent value="midia" className="space-y-3">
                <StageStatusRow
                  stage="midia"
                  status={getStageStatus("midia")}
                  disabled={isNew}
                  onChange={updateStageStatus}
                />
                {!isNew ? (
                  <div className="space-y-1.5">
                    <Label>Arquivos de mídia</Label>
                    <div className="flex flex-wrap gap-2">
                      {mediaQuery.data?.map((m) => (
                        <div
                          key={m.id}
                          className="group relative h-24 w-24 overflow-hidden rounded-md border bg-muted"
                        >
                          {m.url ? (
                            m.type === "video" ? (
                              <video src={m.url} className="h-full w-full object-cover" />
                            ) : (
                              <img src={m.url} alt="mídia" className="h-full w-full object-cover" />
                            )
                          ) : (
                            <ImageOff className="m-auto mt-8 h-6 w-6 text-muted-foreground" />
                          )}
                          <button
                            onClick={() => deleteMedia(m)}
                            className="absolute right-1 top-1 rounded bg-background/80 p-1 opacity-0 transition group-hover:opacity-100"
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </button>
                        </div>
                      ))}
                      <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-accent">
                        <Upload className="h-5 w-5" />
                        Enviar
                        <input
                          type="file"
                          multiple
                          accept="image/*,video/*"
                          className="hidden"
                          onChange={(e) => upload(e.target.files)}
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    Salve o post primeiro para adicionar mídias.
                  </p>
                )}
              </TabsContent>

              {/* Legenda */}
              <TabsContent value="legenda" className="space-y-3">
                <StageStatusRow
                  stage="legenda"
                  status={getStageStatus("legenda")}
                  disabled={isNew}
                  onChange={updateStageStatus}
                />
                <div className="space-y-1.5">
                  <Label>Legenda</Label>
                  <Textarea
                    rows={7}
                    value={form.caption ?? ""}
                    onChange={(e) => setForm({ ...form, caption: e.target.value })}
                    placeholder="Escreva a legenda final do post..."
                  />
                </div>
              </TabsContent>
            </Tabs>

            {/* Action buttons */}
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
              <Button onClick={save}>{isNew ? "Criar" : "Salvar"}</Button>
              {!isNew && form.status === "draft" && (
                <Button variant="secondary" onClick={sendForApproval}>
                  Enviar para aprovação
                </Button>
              )}
              {!isNew && form.status === "approved" && (
                <Button variant="secondary" onClick={() => setStatus("scheduled")}>
                  Marcar como agendado
                </Button>
              )}
              {!isNew && form.status === "scheduled" && (
                <Button variant="secondary" onClick={() => setStatus("published")}>
                  Marcar como publicado
                </Button>
              )}
            </div>
          </ScrollArea>

          {/* ── Right: preview + tasks + chat ── */}
          {!isNew && (
            <div className="flex max-h-[88vh] flex-col overflow-hidden">
              {/* Instagram preview */}
              <div className="flex-shrink-0 border-b bg-muted/20 p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Preview
                </p>
                <div className="mx-auto w-44 overflow-hidden rounded-2xl border-2 border-border bg-white shadow-md">
                  {/* Header */}
                  <div className="flex items-center gap-1.5 bg-white px-2 py-1.5">
                    <span
                      className="h-5 w-5 flex-shrink-0 rounded-full"
                      style={{
                        background:
                          "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
                      }}
                    />
                    <span className="flex-1 truncate text-[9px] font-semibold text-gray-900">
                      {clientHandle}
                    </span>
                    <span className="text-[9px] text-gray-400">•••</span>
                  </div>
                  {/* Media */}
                  <div className="aspect-square bg-gray-100">
                    {firstMedia?.url ? (
                      <img
                        src={firstMedia.url}
                        alt="preview"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImageOff className="h-5 w-5 text-gray-300" />
                      </div>
                    )}
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-2 bg-white px-2 pt-1.5">
                    <Heart className="h-3 w-3 text-gray-800" />
                    <MessageCircle className="h-3 w-3 text-gray-800" />
                    <Share2 className="h-3 w-3 text-gray-800" />
                  </div>
                  {/* Likes */}
                  <p className="bg-white px-2 pt-0.5 text-[8px] font-semibold text-gray-900">
                    {previewLikes.toLocaleString("pt-BR")} curtidas
                  </p>
                  {/* Caption */}
                  {form.caption && (
                    <p className="bg-white px-2 pb-2 text-[7px] leading-tight text-gray-800 line-clamp-2">
                      <span className="font-semibold">{clientHandle}</span>{" "}
                      {form.caption}
                    </p>
                  )}
                </div>
              </div>

              {/* Tasks */}
              <Collapsible open={tasksOpen} onOpenChange={setTasksOpen}>
                <div className="flex items-center justify-between border-b px-3 py-2.5">
                  <CollapsibleTrigger asChild>
                    <button className="flex flex-1 items-center gap-2 text-left text-sm font-semibold transition-colors hover:text-primary">
                      <ListChecks className="h-4 w-4 shrink-0" />
                      Tarefas vinculadas
                      {(linkedTasksQuery.data?.length ?? 0) > 0 && (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-bold">
                          {linkedTasksQuery.data!.length}
                        </span>
                      )}
                      {tasksOpen ? (
                        <ChevronUp className="ml-auto h-3 w-3" />
                      ) : (
                        <ChevronDown className="ml-auto h-3 w-3" />
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="ml-1 h-6 w-6 shrink-0"
                    onClick={() =>
                      setNewTaskValues({ post_id: postId!, client_id: form.client_id ?? undefined })
                    }
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <CollapsibleContent className="border-b">
                  <div className="max-h-40 space-y-1 overflow-y-auto p-2">
                    {linkedTasksQuery.data?.length === 0 && (
                      <p className="px-2 py-3 text-xs text-muted-foreground">
                        Nenhuma tarefa vinculada.
                      </p>
                    )}
                    {linkedTasksQuery.data?.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => setEditTaskId(task.id)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                      >
                        <span
                          className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                            TASK_PRIORITY_CLASSES[task.priority],
                          )}
                        >
                          {TASK_STATUS_LABELS[task.status]}
                        </span>
                        <span className="flex-1 truncate">{task.title}</span>
                      </button>
                    ))}
                    <button
                      onClick={() =>
                        setNewTaskValues({ post_id: postId!, client_id: form.client_id ?? undefined })
                      }
                      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" />
                      Criar tarefa para este post
                    </button>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Chat */}
              <div className="border-b px-3 py-2">
                <h3 className="text-sm font-semibold">Chat do post</h3>
              </div>
              <ScrollArea className="flex-1 p-3">
                <div className="space-y-2">
                  {commentsQuery.data?.length === 0 && (
                    <p className="text-sm text-muted-foreground">Sem mensagens ainda.</p>
                  )}
                  {commentsQuery.data?.map((c) => (
                    <div key={c.id} className={c.author_type === "team" ? "ml-4" : "mr-4"}>
                      <div
                        className={`rounded-lg p-2 text-sm ${
                          c.author_type === "team" ? "bg-primary/10" : "bg-muted"
                        }`}
                      >
                        <p className="mb-0.5 text-xs font-semibold">
                          {c.author_type === "team" ? "Equipe" : c.author_name}
                        </p>
                        {c.body}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex gap-2 border-t p-3">
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Escreva uma mensagem"
                  onKeyDown={(e) => e.key === "Enter" && addComment()}
                />
                <Button size="icon" onClick={addComment}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Task sub-dialogs */}
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
      </DialogContent>
    </Dialog>
  );
}

// ── Helper: stage status row ─────────────────────────────────────

function StageStatusRow({
  stage,
  status,
  disabled,
  onChange,
}: {
  stage: FlowStage;
  status: StageStatus;
  disabled: boolean;
  onChange: (stage: FlowStage, status: StageStatus) => void;
}) {
  if (disabled) return null;
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
      <span className="text-xs text-muted-foreground">Status desta etapa:</span>
      <Select value={status} onValueChange={(v) => onChange(stage, v as StageStatus)}>
        <SelectTrigger className="h-7 w-40 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(["draft", "in_approval", "adjustment_requested", "approved"] as StageStatus[]).map(
            (s) => (
              <SelectItem key={s} value={s}>
                {STAGE_STATUS_LABELS[s]}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Helper: select field ─────────────────────────────────────────

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string | null;
  options: Record<string, string>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([k, v]) => (
            <SelectItem key={k} value={k}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

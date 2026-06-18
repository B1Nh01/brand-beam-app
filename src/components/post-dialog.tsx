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
  FORMAT_TYPE_LABELS,
  VEICULACAO_LABELS,
  PLATFORM_LABELS,
  APPROVAL_LABELS,
  FLOW_LABELS,
  FLOW_ORDER,
  TAG_PALETTE,
  type Post,
  type PostComment,
  type PostMedia,
  type FlowStage,
  type Tag,
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
  Link as LinkIcon,
  Tag as TagIcon,
  X,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

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

  const clientId = postQuery.data?.client_id ?? null;
  const clientQuery = useQuery({
    queryKey: ["client-preview", clientId],
    enabled: !!clientId && !isNew,
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("name,instagram_handle")
        .eq("id", clientId!)
        .single();
      return data;
    },
  });

  const effectiveClientId = clientId ?? newForClient?.clientId ?? null;
  const effectiveWorkspaceId = form.workspace_id ?? newForClient?.workspaceId ?? null;

  const tagsQuery = useQuery<Tag[]>({
    queryKey: ["tags", effectiveWorkspaceId, effectiveClientId],
    enabled: !!effectiveWorkspaceId,
    queryFn: async () => {
      let q = supabase.from("tags").select("*").eq("workspace_id", effectiveWorkspaceId!);
      if (effectiveClientId) {
        q = (q as any).or(`client_id.eq.${effectiveClientId},client_id.is.null`);
      } else {
        q = (q as any).is("client_id", null);
      }
      const { data } = await (q as any).order("name");
      return (data ?? []) as Tag[];
    },
  });

  const postTagsQuery = useQuery<string[]>({
    queryKey: ["post-tags", postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data } = await supabase.from("post_tags").select("tag_id").eq("post_id", postId!);
      return (data ?? []).map((r: { tag_id: string }) => r.tag_id);
    },
  });

  // ── Derived ──────────────────────────────────────────────────

  const stageStatusMap = useMemo(() => {
    const m: Record<string, StageStatus> = {};
    for (const s of stagesQuery.data ?? []) m[s.stage] = s.status as StageStatus;
    return m;
  }, [stagesQuery.data]);

  const getStageStatus = (stage: FlowStage): StageStatus => stageStatusMap[stage] ?? "draft";


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
      const r1 = c.ref_link_1 ?? "";
      const r2 = c.ref_link_2 ?? "";
      const r3 = c.ref_link_3 ?? "";
      setRefLinks((prev) => (prev[0] === r1 && prev[1] === r2 && prev[2] === r3 ? prev : [r1, r2, r3]));
    }
  }, [stagesQuery.data]);

  useEffect(() => {
    if (postTagsQuery.data) setSelectedTagIds(postTagsQuery.data);
  }, [postTagsQuery.data]);

  // ── Mutations ────────────────────────────────────────────────

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["posts"] });
    qc.invalidateQueries({ queryKey: ["post", postId] });
    qc.invalidateQueries({ queryKey: ["activity"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const syncTags = async (pid: string) => {
    await supabase.from("post_tags").delete().eq("post_id", pid);
    if (selectedTagIds.length) {
      await supabase.from("post_tags").insert(selectedTagIds.map((tag_id) => ({ post_id: pid, tag_id })));
    }
    qc.invalidateQueries({ queryKey: ["post-tags", pid] });
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
          format_type: form.format_type ?? null,
          veiculacao: form.veiculacao ?? null,
          scheduled_date: form.scheduled_date,
          scheduled_time: form.scheduled_time,
          approval_mode: form.approval_mode as Post["approval_mode"],
        })
        .select()
        .single();
      if (error) return toast.error(error.message);
      if (selectedTagIds.length) await syncTags(data.id);
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
        format_type: form.format_type ?? null,
        veiculacao: form.veiculacao ?? null,
        scheduled_date: form.scheduled_date,
        scheduled_time: form.scheduled_time,
        approval_mode: form.approval_mode as Post["approval_mode"],
      })
      .eq("id", postId!);
    if (error) return toast.error(error.message);
    await syncTags(postId!);

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
      <DialogContent className="max-w-6xl p-0">
        <div className={cn(
          "grid max-h-[90vh] grid-cols-1",
          !isNew && "md:grid-cols-[3fr_2fr]",
        )}>

          {/* ── Left (60%): media gallery — existing posts only ── */}
          {!isNew && (
            <div className="flex max-h-[90vh] flex-col overflow-hidden border-r bg-muted/10">
              {/* Scrollable media area */}
              <ScrollArea className="flex-1 p-4">
                {(mediaQuery.data?.length ?? 0) > 0 ? (
                  <div className={cn(
                    "grid gap-2",
                    (mediaQuery.data?.length ?? 0) === 1 ? "grid-cols-1" : "grid-cols-2",
                  )}>
                    {mediaQuery.data?.map((m) => (
                      <div
                        key={m.id}
                        className="group relative aspect-square overflow-hidden rounded-lg bg-muted"
                      >
                        {m.url ? (
                          m.type === "video" ? (
                            <video src={m.url} controls className="h-full w-full object-cover" />
                          ) : (
                            <img src={m.url} alt="mídia" className="h-full w-full object-cover" />
                          )
                        ) : (
                          <ImageOff className="absolute inset-0 m-auto h-8 w-8 text-muted-foreground" />
                        )}
                        <button
                          onClick={() => deleteMedia(m)}
                          className="absolute right-1.5 top-1.5 rounded bg-background/80 p-1 opacity-0 shadow transition group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-muted-foreground">
                    <ImageOff className="h-8 w-8 opacity-30" />
                    <p className="text-sm">Sem mídia</p>
                  </div>
                )}

                <label className="mt-3 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50">
                  <Upload className="h-3.5 w-3.5" /> Adicionar mídia
                  <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => upload(e.target.files)} />
                </label>
              </ScrollArea>

              {/* Caption preview strip */}
              {form.caption && (
                <div className="max-h-36 flex-shrink-0 overflow-auto border-t bg-card/60 p-4">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Legenda
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80 line-clamp-5">
                    {form.caption}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Right (40%): form + tabs + chat + tasks ── */}
          <ScrollArea className="max-h-[90vh] p-5">
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
                <Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <SelectField label="Formato" value={form.format} options={FORMAT_LABELS} onChange={(v) => setForm({ ...form, format: v as Post["format"] })} />
                <SelectField label="Plataforma" value={form.platform} options={PLATFORM_LABELS} onChange={(v) => setForm({ ...form, platform: v as Post["platform"] })} />
                <SelectField label="Local" value={form.format_type ?? undefined} options={FORMAT_TYPE_LABELS} onChange={(v) => setForm({ ...form, format_type: v || null })} placeholder="Feed/Stories" />
                <SelectField label="Veiculação" value={form.veiculacao ?? undefined} options={VEICULACAO_LABELS} onChange={(v) => setForm({ ...form, veiculacao: v || null })} placeholder="Vídeo/Post" />
                <SelectField label="Aprovação" value={form.approval_mode} options={APPROVAL_LABELS} onChange={(v) => setForm({ ...form, approval_mode: v as Post["approval_mode"] })} />
                <div className="space-y-1.5">
                  <Label>Data</Label>
                  <Input type="date" value={form.scheduled_date ?? ""} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} />
                </div>
              </div>
              <TagPicker
                tags={tagsQuery.data ?? []}
                selectedIds={selectedTagIds}
                onChange={setSelectedTagIds}
                workspaceId={effectiveWorkspaceId}
                clientId={effectiveClientId}
                onTagCreated={() => qc.invalidateQueries({ queryKey: ["tags"] })}
              />
            </div>

            {/* Stage tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FlowStage)}>
              <TabsList className="mb-3 grid w-full grid-cols-4">
                {FLOW_ORDER.map((stage) => (
                  <TabsTrigger key={stage} value={stage} className="gap-1 text-xs">
                    <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: STAGE_DOT_COLOR[getStageStatus(stage)] }} />
                    {FLOW_LABELS[stage]}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Tema */}
              <TabsContent value="tema" className="space-y-3">
                <StageStatusRow stage="tema" status={getStageStatus("tema")} disabled={isNew} onChange={updateStageStatus} />
                <div className="space-y-1.5">
                  <Label>Ideia / Briefing</Label>
                  <Textarea rows={4} value={form.idea ?? ""} onChange={(e) => setForm({ ...form, idea: e.target.value })} placeholder="Descreva a ideia do post..." />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><LinkIcon className="h-3.5 w-3.5" /> Referências visuais</Label>
                  {refLinks.map((link, i) => (
                    <Input key={i} value={link} onChange={(e) => setRefLinks((prev) => { const n = [...prev] as [string, string, string]; n[i] = e.target.value; return n; })} placeholder={`Link de referência ${i + 1}`} type="url" />
                  ))}
                </div>
              </TabsContent>

              {/* Conteúdo */}
              <TabsContent value="conteudo" className="space-y-3">
                <StageStatusRow stage="conteudo" status={getStageStatus("conteudo")} disabled={isNew} onChange={updateStageStatus} />
                <div className="space-y-1.5">
                  <Label>Copy / Roteiro</Label>
                  <Textarea rows={8} value={form.copy ?? ""} onChange={(e) => setForm({ ...form, copy: e.target.value })} placeholder="Escreva o conteúdo do post..." />
                </div>
              </TabsContent>

              {/* Mídia — upload managed in left panel */}
              <TabsContent value="midia" className="space-y-3">
                <StageStatusRow stage="midia" status={getStageStatus("midia")} disabled={isNew} onChange={updateStageStatus} />
                {isNew ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    Salve o post primeiro para adicionar mídias.
                  </p>
                ) : (
                  <p className="rounded-lg bg-muted/40 p-3 text-center text-xs text-muted-foreground">
                    Faça upload e visualize as mídias no painel à esquerda.
                  </p>
                )}
              </TabsContent>

              {/* Legenda */}
              <TabsContent value="legenda" className="space-y-3">
                <StageStatusRow stage="legenda" status={getStageStatus("legenda")} disabled={isNew} onChange={updateStageStatus} />
                <div className="space-y-1.5">
                  <Label>Legenda</Label>
                  <Textarea rows={7} value={form.caption ?? ""} onChange={(e) => setForm({ ...form, caption: e.target.value })} placeholder="Escreva a legenda final do post..." />
                </div>
              </TabsContent>
            </Tabs>

            {/* Action buttons */}
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
              <Button onClick={save}>{isNew ? "Criar" : "Salvar"}</Button>
              {!isNew && form.status === "draft" && (
                <Button variant="secondary" onClick={sendForApproval}>Enviar para aprovação</Button>
              )}
              {!isNew && form.status === "approved" && (
                <Button variant="secondary" onClick={() => setStatus("scheduled")}>Marcar como agendado</Button>
              )}
              {!isNew && form.status === "scheduled" && (
                <Button variant="secondary" onClick={() => setStatus("published")}>Marcar como publicado</Button>
              )}
            </div>

            {/* Tasks */}
            {!isNew && (
              <Collapsible open={tasksOpen} onOpenChange={setTasksOpen} className="mt-3">
                <div className="flex items-center justify-between border-t pt-3">
                  <CollapsibleTrigger asChild>
                    <button className="flex flex-1 items-center gap-2 text-left text-sm font-semibold hover:text-primary transition-colors">
                      <ListChecks className="h-4 w-4 shrink-0" />
                      Tarefas
                      {(linkedTasksQuery.data?.length ?? 0) > 0 && (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-bold">
                          {linkedTasksQuery.data!.length}
                        </span>
                      )}
                      {tasksOpen ? <ChevronUp className="ml-auto h-3 w-3" /> : <ChevronDown className="ml-auto h-3 w-3" />}
                    </button>
                  </CollapsibleTrigger>
                  <Button size="icon" variant="ghost" className="ml-1 h-6 w-6 shrink-0" onClick={() => setNewTaskValues({ post_id: postId!, client_id: form.client_id ?? undefined })}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <CollapsibleContent className="mt-1.5 space-y-1">
                  {(linkedTasksQuery.data?.length ?? 0) === 0 && (
                    <p className="px-2 py-2 text-xs text-muted-foreground">Nenhuma tarefa vinculada.</p>
                  )}
                  {linkedTasksQuery.data?.map((task) => (
                    <button key={task.id} onClick={() => setEditTaskId(task.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent">
                      <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold", TASK_PRIORITY_CLASSES[task.priority])}>
                        {TASK_STATUS_LABELS[task.status]}
                      </span>
                      <span className="flex-1 truncate">{task.title}</span>
                    </button>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Chat */}
            {!isNew && (
              <div className="mt-3 space-y-2 border-t pt-3">
                <h3 className="text-sm font-semibold">Chat do post</h3>
                <div className="max-h-40 space-y-2 overflow-y-auto">
                  {commentsQuery.data?.length === 0 && (
                    <p className="text-xs text-muted-foreground">Sem mensagens ainda.</p>
                  )}
                  {commentsQuery.data?.map((c) => (
                    <div key={c.id} className={c.author_type === "team" ? "ml-4" : "mr-4"}>
                      <div className={cn("rounded-lg p-2 text-sm", c.author_type === "team" ? "bg-primary/10" : "bg-muted")}>
                        <p className="mb-0.5 text-xs font-semibold">{c.author_type === "team" ? "Equipe" : c.author_name}</p>
                        {c.body}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Escreva uma mensagem" onKeyDown={(e) => e.key === "Enter" && addComment()} />
                  <Button size="icon" onClick={addComment}><Send className="h-4 w-4" /></Button>
                </div>
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Task sub-dialogs */}
        {newTaskValues && (
          <TaskDialog initialValues={newTaskValues} onClose={() => { setNewTaskValues(null); qc.invalidateQueries({ queryKey: ["tasks-by-post", postId] }); qc.invalidateQueries({ queryKey: ["tasks"] }); }} />
        )}
        {editTaskId && (
          <TaskDialog taskId={editTaskId} onClose={() => { setEditTaskId(null); qc.invalidateQueries({ queryKey: ["tasks-by-post", postId] }); qc.invalidateQueries({ queryKey: ["tasks"] }); }} />
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
  placeholder,
}: {
  label: string;
  value?: string | null;
  options: Record<string, string>;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={value ?? (placeholder ? "__none__" : undefined)}
        onValueChange={(v) => onChange(v === "__none__" ? "" : v)}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder ?? "Selecionar"} />
        </SelectTrigger>
        <SelectContent>
          {placeholder && (
            <SelectItem value="__none__">{placeholder}</SelectItem>
          )}
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

// ── Helper: tag picker ───────────────────────────────────────────

function TagPicker({
  tags,
  selectedIds,
  onChange,
  workspaceId,
  clientId,
  onTagCreated,
}: {
  tags: Tag[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  workspaceId: string | null;
  clientId: string | null;
  onTagCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const selected = tags.filter((t) => selectedIds.includes(t.id));
  const filtered = tags.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );
  const canCreate =
    search.trim().length > 0 &&
    !filtered.some((t) => t.name.toLowerCase() === search.trim().toLowerCase());

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const createTag = async () => {
    if (!workspaceId || !search.trim() || creating) return;
    setCreating(true);
    const color = TAG_PALETTE[Math.floor(Math.random() * TAG_PALETTE.length)];
    const { data, error } = await supabase
      .from("tags")
      .insert({ workspace_id: workspaceId, client_id: clientId ?? null, name: search.trim(), color })
      .select()
      .single();
    setCreating(false);
    if (error || !data) return toast.error("Erro ao criar tag");
    onTagCreated();
    onChange([...selectedIds, data.id]);
    setSearch("");
  };

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        <TagIcon className="h-3.5 w-3.5" /> Tags
      </Label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 min-h-9">
        {selected.map((t) => (
          <span
            key={t.id}
            className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
            style={{ backgroundColor: t.color }}
          >
            {t.name}
            <button
              type="button"
              onClick={() => toggle(t.id)}
              className="ml-0.5 opacity-70 hover:opacity-100 leading-none"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors"
            >
              <Plus className="h-3 w-3" /> Adicionar
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Buscar ou criar tag..."
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty className="py-2 px-3 text-xs text-muted-foreground">
                  {canCreate ? (
                    <button
                      onClick={createTag}
                      disabled={creating}
                      className="flex w-full items-center gap-2 rounded py-1 text-left hover:text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Criar &ldquo;{search}&rdquo;
                    </button>
                  ) : (
                    "Nenhuma tag encontrada"
                  )}
                </CommandEmpty>
                <CommandGroup>
                  {filtered.map((t) => (
                    <CommandItem
                      key={t.id}
                      value={t.name}
                      onSelect={() => {
                        toggle(t.id);
                        setSearch("");
                      }}
                    >
                      <span
                        className="mr-2 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="flex-1">{t.name}</span>
                      {selectedIds.includes(t.id) && (
                        <span className="ml-auto text-xs text-muted-foreground">✓</span>
                      )}
                    </CommandItem>
                  ))}
                  {canCreate && (
                    <CommandItem value={`create:${search}`} onSelect={createTag} disabled={creating}>
                      <Plus className="mr-2 h-3.5 w-3.5" />
                      Criar &ldquo;{search}&rdquo;
                    </CommandItem>
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

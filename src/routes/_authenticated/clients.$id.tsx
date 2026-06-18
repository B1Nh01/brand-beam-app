import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { TaskBoard } from "@/components/task-board";
import { BrandCore } from "@/components/brand-core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import { PostDialog } from "@/components/post-dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Heart,
  MessageCircle,
  Grid3x3,
  ArrowUpDown,
  ChevronDown,
  Filter,
  X,
} from "lucide-react";
import { type Post, type Client, type Tag, STATUS_LABELS, PLATFORM_LABELS, FORMAT_TYPE_LABELS, VEICULACAO_LABELS } from "@/lib/content";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { RouteError } from "@/components/route-error";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  component: ClientSpace,
  errorComponent: ({ error, reset }) => <RouteError error={error as Error} reset={reset} />,
});

type PostWithTags = Post & { post_tags?: { tag_id: string }[] };

function ClientSpace() {
  const { id } = Route.useParams();
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [newPost, setNewPost] = useState<{ clientId: string; workspaceId: string; date?: string } | null>(null);

  const { data } = useQuery({
    queryKey: ["posts", id],
    queryFn: async () => {
      const [client, posts] = await Promise.all([
        supabase.from("clients").select("*").eq("id", id).single(),
        supabase.from("posts").select("*, post_tags(tag_id)").eq("client_id", id).order("scheduled_date"),
      ]);
      const c = client.data as Client | null;
      const media: Record<string, string> = {};
      const paths = [c?.avatar_url, c?.cover_url].filter((p): p is string => !!p && !p.startsWith("http"));
      if (paths.length) {
        const { data: signed } = await supabase.storage.from("client-media").createSignedUrls(paths, 3600);
        for (const s of signed ?? []) if (s.path && s.signedUrl) media[s.path] = s.signedUrl;
      }
      return { client: c as Client, posts: (posts.data ?? []) as PostWithTags[], media };
    },
  });

  const client = data?.client;
  const posts = data?.posts ?? [];
  const imgUrl = (path: string | null | undefined) =>
    !path ? null : path.startsWith("http") ? path : data?.media[path] ?? null;
  const cover = imgUrl(client?.cover_url);
  const avatar = imgUrl(client?.avatar_url);
  const brand = client?.brand_color ?? "#2563eb";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="h-24 sm:h-32">
          {cover ? (
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full" style={{ background: `linear-gradient(135deg, ${brand}, ${brand}99)` }} />
          )}
        </div>
        <div className="px-4 pb-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <div className="flex min-w-0 items-end gap-3">
              <span className="-mt-8 flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-card text-lg font-bold text-primary-foreground" style={{ backgroundColor: brand }}>
                {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : (client?.name?.charAt(0) ?? "?")}
              </span>
              <div className="min-w-0 pb-0.5">
                <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">{client?.name}</h1>
                <p className="truncate text-sm text-muted-foreground">{client?.instagram_handle}</p>
              </div>
            </div>
            {client && <Button className="shrink-0" onClick={() => setNewPost({ clientId: client.id, workspaceId: client.workspace_id })}><Plus className="h-4 w-4" /> <span className="hidden sm:inline">Novo post</span></Button>}
          </div>
          {client?.description && (
            <p className="mt-3 text-sm text-muted-foreground">{client.description}</p>
          )}
        </div>
      </div>

      <Tabs defaultValue="calendar">
        <div className="-mx-1 overflow-x-auto pb-1">
          <TabsList className="w-max">
            <TabsTrigger value="calendar">Calendário</TabsTrigger>
            <TabsTrigger value="tasks">Tarefas</TabsTrigger>
            <TabsTrigger value="arquivos">Arquivos</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="calendar" className="pt-4">
          <CalendarView
            posts={posts}
            clientId={id}
            workspaceId={client?.workspace_id ?? ""}
            onOpen={setOpenPost}
            onNew={(d) => client && setNewPost({ clientId: client.id, workspaceId: client.workspace_id, date: d })}
          />
        </TabsContent>

        <TabsContent value="tasks" className="pt-4">
          <TaskBoard fixedClientId={id} />
        </TabsContent>

        <TabsContent value="arquivos" className="pt-4">
          {client && <BrandCore clientId={id} workspaceId={client.workspace_id} />}
        </TabsContent>
      </Tabs>

      {(openPost || newPost) && <PostDialog postId={openPost} newForClient={newPost} onClose={() => { setOpenPost(null); setNewPost(null); }} />}
    </div>
  );
}

// ── Filter helpers ────────────────────────────────────────────────────────────

function MultiFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [string, string][];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant={value.length ? "default" : "outline"}
          className="h-7 gap-1 text-xs"
        >
          {label}
          {value.length > 0 && (
            <span className="ml-0.5 rounded-full bg-background/25 px-1.5 text-[10px] font-bold leading-4">
              {value.length}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        {options.map(([k, v]) => (
          <DropdownMenuCheckboxItem
            key={k}
            checked={value.includes(k)}
            onCheckedChange={() => toggle(k)}
          >
            {v}
          </DropdownMenuCheckboxItem>
        ))}
        {value.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onChange([])}>
              <X className="mr-1.5 h-3 w-3" /> Limpar
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TagFilter({
  tags,
  value,
  onChange,
}: {
  tags: Tag[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  if (!tags.length) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant={value.length ? "default" : "outline"}
          className="h-7 gap-1 text-xs"
        >
          Tags
          {value.length > 0 && (
            <span className="ml-0.5 rounded-full bg-background/25 px-1.5 text-[10px] font-bold leading-4">
              {value.length}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[160px]">
        {tags.map((t) => (
          <DropdownMenuCheckboxItem
            key={t.id}
            checked={value.includes(t.id)}
            onCheckedChange={() => toggle(t.id)}
          >
            <span
              className="mr-2 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: t.color }}
            />
            {t.name}
          </DropdownMenuCheckboxItem>
        ))}
        {value.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onChange([])}>
              <X className="mr-1.5 h-3 w-3" /> Limpar
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── CalendarView ──────────────────────────────────────────────────────────────

function CalendarView({
  posts,
  clientId,
  workspaceId,
  onOpen,
  onNew,
}: {
  posts: PostWithTags[];
  clientId: string;
  workspaceId: string;
  onOpen: (id: string) => void;
  onNew: (date: string) => void;
}) {
  const qc = useQueryClient();
  const [activePost, setActivePost] = useState<PostWithTags | null>(null);
  const [view, setView] = useState<"month" | "week" | "feed">("month");
  const [currentDate, setCurrentDate] = useState(() => new Date());

  // ── Filter state ──────────────────────────────────────────────────────────
  const [fPlatform, setFPlatform]     = useState<string[]>([]);
  const [fFormatType, setFFormatType] = useState<string[]>([]);
  const [fVeiculacao, setFVeiculacao] = useState<string[]>([]);
  const [fStatus, setFStatus]         = useState<string[]>([]);
  const [fTagIds, setFTagIds]         = useState<string[]>([]);

  const hasFilters = fPlatform.length + fFormatType.length + fVeiculacao.length + fStatus.length + fTagIds.length > 0;

  const clearFilters = () => {
    setFPlatform([]); setFFormatType([]); setFVeiculacao([]); setFStatus([]); setFTagIds([]);
  };

  // ── Tags for filter options ───────────────────────────────────────────────
  const { data: clientTags = [] } = useQuery<Tag[]>({
    queryKey: ["tags", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tags")
        .select("*")
        .or(`client_id.eq.${clientId},client_id.is.null`)
        .order("name");
      return (data ?? []) as Tag[];
    },
  });

  // ── Post → tag_ids map from embedded join ─────────────────────────────────
  const postTagsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const p of posts) {
      map[p.id] = p.post_tags?.map((pt) => pt.tag_id) ?? [];
    }
    return map;
  }, [posts]);

  // ── Filtered posts ────────────────────────────────────────────────────────
  const filteredPosts = useMemo(() => {
    return posts.filter((p) => {
      if (fPlatform.length && !fPlatform.includes(p.platform)) return false;

      if (fFormatType.length) {
        const ft = p.format_type ?? (p.format === "story" ? "stories" : "feed");
        if (!fFormatType.includes(ft)) return false;
      }

      if (fVeiculacao.length) {
        if (!p.veiculacao || !fVeiculacao.includes(p.veiculacao)) return false;
      }

      if (fStatus.length && !fStatus.includes(p.status)) return false;

      if (fTagIds.length) {
        const tags = postTagsMap[p.id] ?? [];
        if (!fTagIds.some((t) => tags.includes(t))) return false;
      }

      return true;
    });
  }, [posts, fPlatform, fFormatType, fVeiculacao, fStatus, fTagIds, postTagsMap]);

  // ── Calendar config ───────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const iso = (d: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const monthCells: (number | null)[] = [
    ...Array(startDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const weekStart = new Date(currentDate);
  weekStart.setDate(currentDate.getDate() - currentDate.getDay());
  const weekCells = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const handleDragStart = (event: DragStartEvent) => {
    const post = posts.find((p) => p.id === event.active.id);
    if (post) setActivePost(post);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActivePost(null);
    const { active, over } = event;
    if (!over) return;
    const postId = active.id as string;
    const newDate = over.id as string;
    const post = posts.find((p) => p.id === postId);
    if (!post || post.scheduled_date === newDate) return;
    if (["approved", "scheduled"].includes(post.status)) {
      const ok = window.confirm("Este post já foi aprovado. Deseja reagendar mesmo assim?");
      if (!ok) return;
    }
    if (post.status === "published") return;

    const { error } = await supabase
      .from("posts")
      .update({ scheduled_date: newDate })
      .eq("id", postId);
    if (error) {
      toast.error("Erro ao reagendar");
      return;
    }
    qc.invalidateQueries({ queryKey: ["posts", clientId] });
    toast.success(`Post reagendado para ${newDate.split("-").reverse().join("/")}`);
  };

  const goPrev = () => {
    const d = new Date(currentDate);
    if (view === "month") d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };

  const goNext = () => {
    const d = new Date(currentDate);
    if (view === "month") d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };

  const header = view === "month"
    ? currentDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    : `${weekCells[0].toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} – ${weekCells[6].toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}`;

  // ── Shared UI pieces ──────────────────────────────────────────────────────
  const viewToggle = (
    <div className="flex gap-1">
      <Button size="sm" variant={view === "month" ? "default" : "outline"} onClick={() => setView("month")}>Mês</Button>
      <Button size="sm" variant={view === "week" ? "default" : "outline"} onClick={() => setView("week")}>Semana</Button>
      <Button size="sm" variant={view === "feed" ? "default" : "outline"} onClick={() => setView("feed")}>Feed</Button>
    </div>
  );

  const filterBar = (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <MultiFilter
        label="Canal"
        options={Object.entries(PLATFORM_LABELS) as [string, string][]}
        value={fPlatform}
        onChange={setFPlatform}
      />
      <MultiFilter
        label="Formato"
        options={Object.entries(FORMAT_TYPE_LABELS) as [string, string][]}
        value={fFormatType}
        onChange={setFFormatType}
      />
      <MultiFilter
        label="Veiculação"
        options={Object.entries(VEICULACAO_LABELS) as [string, string][]}
        value={fVeiculacao}
        onChange={setFVeiculacao}
      />
      <MultiFilter
        label="Status"
        options={[
          ["draft", "Rascunho"],
          ["in_approval", "Em aprovação"],
          ["adjustment_requested", "Ajuste solicitado"],
          ["approved", "Aprovado"],
          ["scheduled", "Agendado"],
          ["published", "Publicado"],
        ]}
        value={fStatus}
        onChange={setFStatus}
      />
      <TagFilter tags={clientTags} value={fTagIds} onChange={setFTagIds} />
      {hasFilters && (
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground" onClick={clearFilters}>
          <X className="h-3 w-3" /> Limpar filtros
        </Button>
      )}
    </div>
  );

  // ── Feed view (outside DndContext to avoid nested contexts) ───────────────
  if (view === "feed") {
    return (
      <div>
        {filterBar}
        <div className="mb-3 flex items-center justify-end">{viewToggle}</div>
        <FeedPreview posts={filteredPosts} clientId={clientId} onOpen={onOpen} />
      </div>
    );
  }

  // ── Month / Week view ─────────────────────────────────────────────────────
  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="rounded-xl border bg-card p-3">
        {filterBar}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={goPrev}><ChevronLeft className="h-4 w-4" /></Button>
            <p className="font-semibold capitalize">{header}</p>
            <Button size="icon" variant="ghost" onClick={goNext}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          {viewToggle}
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <div key={d} className="py-1">{d}</div>)}
        </div>

        {view === "month" ? (
          <div className="grid grid-cols-7 gap-1">
            {monthCells.map((d, i) => (
              <DayCell
                key={i}
                day={d}
                dateStr={d ? iso(d) : ""}
                posts={d ? filteredPosts.filter((p) => p.scheduled_date === iso(d)) : []}
                onOpen={onOpen}
                onNew={onNew}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {weekCells.map((d, i) => {
              const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              return (
                <DayCell
                  key={i}
                  day={d.getDate()}
                  dateStr={dateStr}
                  posts={filteredPosts.filter((p) => p.scheduled_date === dateStr)}
                  onOpen={onOpen}
                  onNew={onNew}
                />
              );
            })}
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activePost ? (
          <div className="pointer-events-none opacity-90">
            <StatusBadge status={activePost.status} flowStage={activePost.flow_stage} approvalMode={activePost.approval_mode} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function DayCell({ day, dateStr, posts: dayPosts, onOpen, onNew }: { day: number | null; dateStr: string; posts: Post[]; onOpen: (id: string) => void; onNew: (date: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: dateStr, disabled: !day });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group min-h-20 rounded-md border p-1 text-xs transition-colors",
        isOver && "bg-accent/60 ring-2 ring-primary"
      )}
    >
      {day && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{day}</span>
            <button onClick={() => onNew(dateStr)} className="opacity-0 transition group-hover:opacity-100"><Plus className="h-3 w-3" /></button>
          </div>
          <div className="mt-1 space-y-1">
            {dayPosts.map((p) => (
              <DraggablePost key={p.id} post={p} onOpen={onOpen} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DraggablePost({ post, onOpen }: { post: Post; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: post.id,
    disabled: post.status === "published",
    data: { post },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(post.id);
      }}
      className={cn(
        "block w-full truncate rounded px-1 py-0.5 text-left text-[10px]",
        isDragging && "opacity-30",
        post.status === "published" && "cursor-default"
      )}
    >
      <StatusBadge status={post.status} flowStage={post.flow_stage} approvalMode={post.approval_mode} />
    </button>
  );
}

function FeedPreview({ posts, clientId, onOpen }: { posts: PostWithTags[]; clientId: string; onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const [items, setItems] = useState<PostWithTags[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setItems([...posts].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
  }, [posts]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const { data: covers } = useQuery({
    queryKey: ["feed-covers", clientId],
    queryFn: async () => {
      if (!posts.length) return {} as Record<string, string>;
      const { data } = await supabase
        .from("post_media")
        .select("*")
        .in("post_id", posts.map((p) => p.id))
        .order("sort_order");
      const map: Record<string, string> = {};
      for (const m of data ?? []) {
        if (!map[m.post_id]) {
          const { data: s } = await supabase.storage
            .from("post-media")
            .createSignedUrl(m.storage_path, 3600);
          if (s?.signedUrl) map[m.post_id] = s.signedUrl;
        }
      }
      return map;
    },
    enabled: posts.length > 0,
    staleTime: 55 * 60 * 1000,
  });

  const persistOrder = async (ordered: PostWithTags[]) => {
    const results = await Promise.all(
      ordered.map((p, i) => supabase.from("posts").update({ position: i }).eq("id", p.id))
    );
    if (results.find((r) => r.error)) { toast.error("Erro ao atualizar ordem"); return false; }
    qc.invalidateQueries({ queryKey: ["posts", clientId] });
    return true;
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((p) => p.id === active.id);
    const newIndex = items.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered);
    if (await persistOrder(reordered)) toast.success("Ordem do feed atualizada");
  };

  const resetByDate = async () => {
    const sorted = [...items].sort((a, b) => {
      const da = a.scheduled_date ?? ""; const db = b.scheduled_date ?? "";
      if (!da && !db) return 0;
      if (!da) return 1; if (!db) return -1;
      return da.localeCompare(db);
    });
    setItems(sorted);
    if (await persistOrder(sorted)) toast.success("Ordem do feed atualizada");
  };

  const activePost = items.find((p) => p.id === activeId);
  const visibleCount = items.filter((p) => p.status !== "draft").length;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full max-w-[320px] items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Grid3x3 className="h-3.5 w-3.5" />
          {visibleCount} post{visibleCount !== 1 ? "s" : ""} no preview
        </span>
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs" onClick={resetByDate}>
          <ArrowUpDown className="h-3 w-3" /> Ordenar por data
        </Button>
      </div>

      <div className="relative w-[320px] rounded-[2.5rem] border-[6px] border-foreground/10 bg-foreground/5 shadow-2xl overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-6 bg-background/80 backdrop-blur flex items-center justify-center">
          <div className="h-1.5 w-12 rounded-full bg-foreground/20" />
        </div>

        <div className="mt-6 flex items-center justify-between border-b border-border/40 bg-background px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 p-0.5">
              <div className="h-full w-full rounded-full bg-background flex items-center justify-center text-[10px] font-bold text-foreground">
                {posts[0] ? "A" : "—"}
              </div>
            </div>
            <span className="text-xs font-semibold">preview</span>
          </div>
          <div className="flex gap-3 text-foreground/70">
            <div className="h-4 w-4 rounded-sm border border-current opacity-60" />
            <div className="h-4 w-4 rounded-full border border-current opacity-60" />
          </div>
        </div>

        <div className="bg-background">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={(e) => setActiveId(e.active.id as string)}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <SortableContext items={items.map((p) => p.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-3 gap-px bg-border/30">
                {items.map((p) => (
                  <SortableTile key={p.id} post={p} cover={covers?.[p.id]} onOpen={onOpen} />
                ))}
                {items.length === 0 && (
                  <div className="col-span-3 py-16 text-center text-xs text-muted-foreground">
                    Nenhum post ainda
                  </div>
                )}
              </div>
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {activePost ? (
                <FeedTileContent post={activePost} cover={covers?.[activePost.id]} dragging />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

        <div className="flex items-center justify-around border-t border-border/40 bg-background px-4 py-3">
          {["⌂", "🔍", "＋", "♡", "👤"].map((icon, i) => (
            <span key={i} className="text-base opacity-60">{icon}</span>
          ))}
        </div>

        <div className="flex justify-center bg-background pb-2 pt-1">
          <div className="h-1 w-24 rounded-full bg-foreground/20" />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Arraste os posts para reordenar o feed
      </p>
    </div>
  );
}

function FeedTileContent({ post, cover, dragging }: { post: Post; cover?: string; dragging?: boolean }) {
  return (
    <div
      className={cn(
        "relative aspect-square w-full overflow-hidden bg-muted",
        post.status === "draft" && "opacity-40",
        dragging && "ring-2 ring-primary shadow-lg opacity-90",
      )}
    >
      {cover ? (
        <img src={cover} alt={post.title} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full items-center justify-center p-1 text-center text-[9px] leading-tight text-muted-foreground">
          {post.title}
        </span>
      )}
    </div>
  );
}

function seededInt(seed: string, min: number, max: number) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return min + (Math.abs(h) % (max - min));
}

function SortableTile({ post, cover, onOpen }: { post: Post; cover?: string; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: post.id });
  const [hovered, setHovered] = useState(false);

  const likes    = seededInt(post.id, 100, 2000);
  const comments = seededInt(post.id + "c", 5, 120);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(post.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative touch-none block w-full"
    >
      <FeedTileContent post={post} cover={cover} />
      {hovered && post.status !== "draft" && (
        <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/40 text-white">
          <span className="flex items-center gap-1 text-xs font-semibold drop-shadow">
            <Heart className="h-4 w-4 fill-white" /> {likes}
          </span>
          <span className="flex items-center gap-1 text-xs font-semibold drop-shadow">
            <MessageCircle className="h-4 w-4 fill-white" /> {comments}
          </span>
        </div>
      )}
    </button>
  );
}

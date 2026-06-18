import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { TaskBoard } from "@/components/task-board";
import { BrandCore } from "@/components/brand-core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { PostDialog } from "@/components/post-dialog";
import { Plus, ChevronLeft, ChevronRight, Heart, MessageCircle, Grid3x3, ArrowUpDown } from "lucide-react";
import { FORMAT_LABELS, type Post, type Client } from "@/lib/content";
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

function ClientSpace() {
  const { id } = Route.useParams();
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [newPost, setNewPost] = useState<{ clientId: string; workspaceId: string; date?: string } | null>(null);

  const { data } = useQuery({
    queryKey: ["posts", id],
    queryFn: async () => {
      const [client, posts] = await Promise.all([
        supabase.from("clients").select("*").eq("id", id).single(),
        supabase.from("posts").select("*").eq("client_id", id).order("scheduled_date"),
      ]);
      const c = client.data as Client | null;
      const media: Record<string, string> = {};
      const paths = [c?.avatar_url, c?.cover_url].filter((p): p is string => !!p && !p.startsWith("http"));
      if (paths.length) {
        const { data: signed } = await supabase.storage.from("client-media").createSignedUrls(paths, 3600);
        for (const s of signed ?? []) if (s.path && s.signedUrl) media[s.path] = s.signedUrl;
      }
      return { client: c as Client, posts: (posts.data ?? []) as Post[], media };
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
            <TabsTrigger value="feed">Feed Preview</TabsTrigger>
            <TabsTrigger value="content">Conteúdos</TabsTrigger>
            <TabsTrigger value="tasks">Tarefas</TabsTrigger>
            <TabsTrigger value="brand">Brand Core</TabsTrigger>
          </TabsList>
        </div>


        <TabsContent value="calendar" className="pt-4">
          <CalendarView posts={posts} clientId={id} onOpen={setOpenPost} onNew={(d) => client && setNewPost({ clientId: client.id, workspaceId: client.workspace_id, date: d })} />
        </TabsContent>

        <TabsContent value="feed" className="pt-4">
          <FeedPreview posts={posts} clientId={id} onOpen={setOpenPost} />
        </TabsContent>

        <TabsContent value="content" className="pt-4">
          <div className="grid gap-3">
            {posts.map((p) => (
              <Card key={p.id} className="cursor-pointer hover:bg-accent" onClick={() => setOpenPost(p.id)}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{FORMAT_LABELS[p.format]} · {p.scheduled_date ?? "Sem data"}</p>
                  </div>
                  <StatusBadge status={p.status} flowStage={p.flow_stage} approvalMode={p.approval_mode} />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="pt-4">
          <TaskBoard fixedClientId={id} />
        </TabsContent>

        <TabsContent value="brand" className="pt-4">
          {client && <BrandCore clientId={id} workspaceId={client.workspace_id} />}
        </TabsContent>
      </Tabs>

      {(openPost || newPost) && <PostDialog postId={openPost} newForClient={newPost} onClose={() => { setOpenPost(null); setNewPost(null); }} />}
    </div>
  );
}

function CalendarView({ posts, clientId, onOpen, onNew }: { posts: Post[]; clientId: string; onOpen: (id: string) => void; onNew: (date: string) => void }) {
  const qc = useQueryClient();
  const [activePost, setActivePost] = useState<Post | null>(null);
  const [view, setView] = useState<"month" | "week">("month");
  const [currentDate, setCurrentDate] = useState(() => new Date());

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

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="rounded-xl border bg-card p-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={goPrev}><ChevronLeft className="h-4 w-4" /></Button>
            <p className="font-semibold capitalize">{header}</p>
            <Button size="icon" variant="ghost" onClick={goNext}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant={view === "month" ? "default" : "outline"} onClick={() => setView("month")}>Mês</Button>
            <Button size="sm" variant={view === "week" ? "default" : "outline"} onClick={() => setView("week")}>Semana</Button>
          </div>
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
                posts={d ? posts.filter((p) => p.scheduled_date === iso(d)) : []}
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
                  posts={posts.filter((p) => p.scheduled_date === dateStr)}
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

function FeedPreview({ posts, clientId, onOpen }: { posts: Post[]; clientId: string; onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const [items, setItems] = useState<Post[]>([]);
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

  const persistOrder = async (ordered: Post[]) => {
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
      {/* Toolbar */}
      <div className="flex w-full max-w-[320px] items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Grid3x3 className="h-3.5 w-3.5" />
          {visibleCount} post{visibleCount !== 1 ? "s" : ""} no preview
        </span>
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs" onClick={resetByDate}>
          <ArrowUpDown className="h-3 w-3" /> Ordenar por data
        </Button>
      </div>

      {/* Phone frame */}
      <div className="relative w-[320px] rounded-[2.5rem] border-[6px] border-foreground/10 bg-foreground/5 shadow-2xl overflow-hidden">
        {/* Status bar notch */}
        <div className="absolute top-0 left-0 right-0 h-6 bg-background/80 backdrop-blur flex items-center justify-center">
          <div className="h-1.5 w-12 rounded-full bg-foreground/20" />
        </div>

        {/* Instagram-style header */}
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

        {/* Feed grid */}
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

        {/* Instagram-style nav bar */}
        <div className="flex items-center justify-around border-t border-border/40 bg-background px-4 py-3">
          {["⌂", "🔍", "＋", "♡", "👤"].map((icon, i) => (
            <span key={i} className="text-base opacity-60">{icon}</span>
          ))}
        </div>

        {/* Home indicator */}
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

/** Stable pseudo-random number seeded from a string (deterministic per post). */
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

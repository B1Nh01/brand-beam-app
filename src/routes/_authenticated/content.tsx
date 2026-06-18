import { useState, useMemo, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { PostDialog } from "@/components/post-dialog";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List, ArrowUpDown, CalendarDays, User } from "lucide-react";
import {
  STATUS_LABELS, FORMAT_LABELS,
  type Post, type Client, type PostStatus,
} from "@/lib/content";
import { cn } from "@/lib/utils";
import { RouteError } from "@/components/route-error";

export const Route = createFileRoute("/_authenticated/content")({
  component: ContentBoard,
  head: () => ({ meta: [{ title: "Visão central — Stúdio" }] }),
  errorComponent: ({ error, reset }) => <RouteError error={error as Error} reset={reset} />,
});

type GroupBy = "status" | "client" | "format" | "date";
type ViewMode = "kanban" | "list";
type SortCol = "client" | "title" | "format" | "status" | "date";

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "status",  label: "Status" },
  { value: "client",  label: "Cliente" },
  { value: "format",  label: "Formato" },
  { value: "date",    label: "Data" },
];

const STATUS_ORDER: PostStatus[] = [
  "draft", "in_approval", "adjustment_requested", "approved", "scheduled", "published",
];

const STATUS_COLORS: Record<PostStatus, string> = {
  draft:                "#9ca3af",
  in_approval:          "#f59e0b",
  adjustment_requested: "#ef4444",
  approved:             "#22c55e",
  scheduled:            "#6366f1",
  published:            "#10b981",
};

function dateGroup(date: string | null): string {
  if (!date) return "Sem data";
  const d = new Date(date + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "Atrasados";
  if (diff === 0) return "Hoje";
  if (diff <= 6) return "Esta semana";
  if (diff <= 13) return "Próxima semana";
  return "Mais tarde";
}

const DATE_ORDER = ["Atrasados", "Hoje", "Esta semana", "Próxima semana", "Mais tarde", "Sem data"];

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

// ── Main component ────────────────────────────────────────────────────────────

function ContentBoard() {
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    try { return (localStorage.getItem("content-group-by") as GroupBy) ?? "status"; } catch { return "status"; }
  });
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem("content-view-mode") as ViewMode) ?? "kanban"; } catch { return "kanban"; }
  });
  const [sortCol, setSortCol] = useState<SortCol>("date");
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    try { localStorage.setItem("content-group-by", groupBy); } catch {}
  }, [groupBy]);
  useEffect(() => {
    try { localStorage.setItem("content-view-mode", viewMode); } catch {}
  }, [viewMode]);

  const { data, isLoading } = useQuery({
    queryKey: ["content-board"],
    queryFn: async () => {
      const [posts, clients] = await Promise.all([
        supabase.from("posts").select("*").order("scheduled_date"),
        supabase.from("clients").select("*"),
      ]);
      return {
        posts:   (posts.data   ?? []) as Post[],
        clients: (clients.data ?? []) as Client[],
      };
    },
  });

  const clientMap = useMemo(() => {
    const m: Record<string, Client> = {};
    for (const c of data?.clients ?? []) m[c.id] = c;
    return m;
  }, [data?.clients]);

  const filtered = useMemo(() => {
    return (data?.posts ?? []).filter((p) => {
      if (clientFilter !== "all" && p.client_id !== clientFilter) return false;
      if (formatFilter !== "all" && p.format !== formatFilter) return false;
      return true;
    });
  }, [data?.posts, clientFilter, formatFilter]);

  const groups = useMemo(() => {
    const map: Map<string, Post[]> = new Map();
    for (const p of filtered) {
      let key = "";
      if (groupBy === "status")  key = p.status;
      if (groupBy === "client")  key = clientMap[p.client_id]?.name ?? "Sem cliente";
      if (groupBy === "format")  key = FORMAT_LABELS[p.format] ?? p.format;
      if (groupBy === "date")    key = dateGroup(p.scheduled_date);
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    let keys = Array.from(map.keys());
    if (groupBy === "status") keys = STATUS_ORDER.filter((s) => map.has(s));
    if (groupBy === "date")   keys = DATE_ORDER.filter((k) => map.has(k));
    if (groupBy === "client" || groupBy === "format") keys = keys.sort();
    return keys.map((key) => ({
      key,
      posts: map.get(key)!,
      client: groupBy === "client" ? Object.values(clientMap).find((c) => c.name === key) : undefined,
    }));
  }, [filtered, groupBy, clientMap]);

  const sortedList = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      if (sortCol === "client") return dir * (clientMap[a.client_id]?.name ?? "").localeCompare(clientMap[b.client_id]?.name ?? "");
      if (sortCol === "title")  return dir * a.title.localeCompare(b.title);
      if (sortCol === "format") return dir * a.format.localeCompare(b.format);
      if (sortCol === "status") return dir * a.status.localeCompare(b.status);
      if (sortCol === "date")   return dir * ((a.scheduled_date ?? "").localeCompare(b.scheduled_date ?? ""));
      return 0;
    });
  }, [filtered, sortCol, sortAsc, clientMap]);

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortAsc((v) => !v);
    else { setSortCol(col); setSortAsc(true); }
  };

  const SortHeader = ({ col, label }: { col: SortCol; label: string }) => (
    <th
      className="cursor-pointer select-none whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
      onClick={() => toggleSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortCol === col && <ArrowUpDown className="h-3 w-3" />}
      </span>
    </th>
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-4 overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-1 flex-shrink-0">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">Visão central</h1>
          <p className="text-sm text-muted-foreground">Todos os posts de todos os clientes.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Client filter */}
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Todos os clientes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {data?.clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Format filter */}
          <Select value={formatFilter} onValueChange={setFormatFilter}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue placeholder="Formato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Formatos</SelectItem>
              {(["static", "carousel", "reels", "story"] as const).map((f) => (
                <SelectItem key={f} value={f}>{FORMAT_LABELS[f]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Group-by toggle pills */}
          <div className="flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5">
            {GROUP_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setGroupBy(o.value)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  groupBy === o.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>

          {/* View mode */}
          <div className="flex rounded-lg border bg-muted/40 p-0.5 gap-0.5">
            <Button
              size="sm"
              variant={viewMode === "kanban" ? "secondary" : "ghost"}
              className="h-7 rounded-md px-2"
              onClick={() => setViewMode("kanban")}
              title="Kanban"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant={viewMode === "list" ? "secondary" : "ghost"}
              className="h-7 rounded-md px-2"
              onClick={() => setViewMode("list")}
              title="Lista"
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Content area ── */}
      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-3 px-1">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={LayoutGrid}
            title="Nenhum post por aqui"
            description="Crie posts no espaço de cada cliente para acompanhá-los neste quadro."
          />
        </div>
      ) : viewMode === "list" ? (

        /* ── LIST VIEW ── */
        <div className="flex-1 overflow-auto rounded-xl border bg-card mx-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 border-b bg-muted/60 backdrop-blur">
              <tr>
                <SortHeader col="client" label="Cliente" />
                <SortHeader col="title"  label="Post" />
                <SortHeader col="format" label="Formato" />
                <SortHeader col="status" label="Status" />
                <SortHeader col="date"   label="Data" />
              </tr>
            </thead>
            <tbody>
              {sortedList.map((p) => {
                const client = clientMap[p.client_id];
                const brand = client?.brand_color ?? "#6b7280";
                return (
                  <tr
                    key={p.id}
                    className="cursor-pointer border-b last:border-0 hover:bg-accent/40 transition-colors"
                    onClick={() => setOpenPost(p.id)}
                  >
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 text-sm">
                        <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: brand }} />
                        <span className="truncate max-w-[120px]">{client?.name ?? "—"}</span>
                      </span>
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-2.5 font-medium">{p.title}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{FORMAT_LABELS[p.format]}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={p.status} flowStage={p.flow_stage} approvalMode={p.approval_mode} />
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        {p.scheduled_date && <CalendarDays className="h-3 w-3" />}
                        {fmtDate(p.scheduled_date)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      ) : (

        /* ── KANBAN VIEW ── */
        <div className="flex flex-1 gap-3 overflow-x-auto pb-2 px-1">
          {groups.map(({ key, posts: groupPosts, client: groupClient }) => {
            const brand = groupClient?.brand_color ?? "#6b7280";
            const statusColor = groupBy === "status" ? STATUS_COLORS[key as PostStatus] : undefined;

            return (
              <div key={key} className="flex w-56 flex-shrink-0 flex-col rounded-xl border bg-muted/20 overflow-hidden">
                {/* Column header — sticky within column */}
                <div className="flex flex-shrink-0 items-center justify-between border-b bg-card/80 px-3 py-2.5 backdrop-blur">
                  <div className="flex min-w-0 items-center gap-2">
                    {statusColor && (
                      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: statusColor }} />
                    )}
                    {groupBy === "client" && groupClient && (
                      <span
                        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                        style={{ backgroundColor: brand }}
                      >
                        {groupClient.name.charAt(0)}
                      </span>
                    )}
                    {groupBy === "format" && (
                      <LayoutGrid className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    )}
                    {groupBy === "date" && (
                      <CalendarDays className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    )}
                    <p className="truncate text-xs font-semibold">
                      {groupBy === "status" ? STATUS_LABELS[key as PostStatus] : key}
                    </p>
                  </div>
                  <span className="ml-1.5 flex-shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {groupPosts.length}
                  </span>
                </div>

                {/* Scrollable card list */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                  {groupPosts.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                      Nenhum post
                    </p>
                  ) : (
                    groupPosts.map((p) => (
                      <KanbanCard
                        key={p.id}
                        post={p}
                        client={clientMap[p.client_id]}
                        groupBy={groupBy}
                        onClick={() => setOpenPost(p.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}

          {groups.length === 0 && (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Nenhum resultado para os filtros selecionados.
            </div>
          )}
        </div>
      )}

      {openPost && <PostDialog postId={openPost} onClose={() => setOpenPost(null)} />}
    </div>
  );
}

// ── Kanban card ───────────────────────────────────────────────────────────────

function KanbanCard({
  post: p,
  client,
  groupBy,
  onClick,
}: {
  post: Post;
  client: Client | undefined;
  groupBy: GroupBy;
  onClick: () => void;
}) {
  const brand = client?.brand_color ?? "#6b7280";

  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border bg-card text-left transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{ borderLeftColor: brand, borderLeftWidth: 3 }}
    >
      <div className="p-2.5 space-y-1.5">
        {groupBy !== "client" && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: brand }} />
            <span className="truncate">{client?.name ?? "—"}</span>
          </div>
        )}
        <p className="text-xs font-medium leading-snug line-clamp-2">{p.title}</p>
        <div className="flex flex-wrap items-center gap-1">
          {groupBy !== "status" && (
            <StatusBadge status={p.status} flowStage={p.flow_stage} approvalMode={p.approval_mode} />
          )}
          {groupBy !== "format" && (
            <span className="text-[10px] text-muted-foreground">{FORMAT_LABELS[p.format]}</span>
          )}
        </div>
        {p.scheduled_date && groupBy !== "date" && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <CalendarDays className="h-3 w-3" />
            {fmtDate(p.scheduled_date)}
          </div>
        )}
      </div>
    </button>
  );
}

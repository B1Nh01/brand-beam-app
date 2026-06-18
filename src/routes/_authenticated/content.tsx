import { useState, useMemo, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { PostDialog } from "@/components/post-dialog";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List, ArrowUpDown } from "lucide-react";
import {
  STATUS_LABELS, FORMAT_LABELS,
  type Post, type Client, type PostStatus,
} from "@/lib/content";
import { RouteError } from "@/components/route-error";

export const Route = createFileRoute("/_authenticated/content")({
  component: ContentBoard,
  head: () => ({ meta: [{ title: "Visão central — Stúdio" }] }),
  errorComponent: ({ error, reset }) => <RouteError error={error as Error} reset={reset} />,
});

type GroupBy = "status" | "client" | "format" | "date" | "assignee";
type ViewMode = "kanban" | "list";
type SortCol = "client" | "title" | "format" | "status" | "date" | "assignee";

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "status",   label: "Status" },
  { value: "client",   label: "Cliente" },
  { value: "format",   label: "Formato" },
  { value: "date",     label: "Data" },
  { value: "assignee", label: "Responsável" },
];

const STATUS_ORDER: PostStatus[] = [
  "draft", "in_approval", "adjustment_requested", "approved", "scheduled", "published",
];

function dateGroup(date: string | null): string {
  if (!date) return "Sem data";
  const d = new Date(date);
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

  // Build groups based on groupBy
  const groups = useMemo(() => {
    const map: Map<string, Post[]> = new Map();

    for (const p of filtered) {
      let key = "";
      if (groupBy === "status")   key = p.status;
      if (groupBy === "client")   key = clientMap[p.client_id]?.name ?? "Sem cliente";
      if (groupBy === "format")   key = FORMAT_LABELS[p.format] ?? p.format;
      if (groupBy === "date")     key = dateGroup(p.scheduled_date);
      if (groupBy === "assignee") key = "Sem responsável"; // posts don't have assignee — placeholder

      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }

    // Sort group keys
    let keys = Array.from(map.keys());
    if (groupBy === "status")   keys = STATUS_ORDER.filter((s) => map.has(s));
    if (groupBy === "date")     keys = DATE_ORDER.filter((k) => map.has(k));
    if (groupBy === "client" || groupBy === "format") keys = keys.sort();

    return keys.map((key) => ({
      key,
      posts: map.get(key)!,
      client: groupBy === "client" ? Object.values(clientMap).find((c) => c.name === key) : undefined,
    }));
  }, [filtered, groupBy, clientMap]);

  // Sorted list for list view
  const sortedList = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      if (sortCol === "client")   return dir * (clientMap[a.client_id]?.name ?? "").localeCompare(clientMap[b.client_id]?.name ?? "");
      if (sortCol === "title")    return dir * a.title.localeCompare(b.title);
      if (sortCol === "format")   return dir * a.format.localeCompare(b.format);
      if (sortCol === "status")   return dir * a.status.localeCompare(b.status);
      if (sortCol === "date")     return dir * ((a.scheduled_date ?? "").localeCompare(b.scheduled_date ?? ""));
      return 0;
    });
  }, [filtered, sortCol, sortAsc, clientMap]);

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortAsc((v) => !v);
    else { setSortCol(col); setSortAsc(true); }
  };

  const SortHeader = ({ col, label }: { col: SortCol; label: string }) => (
    <th
      className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase text-muted-foreground hover:text-foreground"
      onClick={() => toggleSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortCol === col && <ArrowUpDown className="h-3 w-3" />}
      </span>
    </th>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Visão central</h1>
          <p className="text-muted-foreground">Todos os posts de todos os clientes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Todos os clientes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {data?.clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={formatFilter} onValueChange={setFormatFilter}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Formato" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(["static", "carousel", "reels", "story"] as const).map((f) => (
                <SelectItem key={f} value={f}>{FORMAT_LABELS[f]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1 rounded-md border p-0.5">
            <span className="px-2 text-xs text-muted-foreground">Agrupar:</span>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
              <SelectTrigger className="h-7 w-36 border-0 text-xs shadow-none"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GROUP_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex rounded-md border">
            <Button
              size="sm"
              variant={viewMode === "kanban" ? "secondary" : "ghost"}
              className="h-8 rounded-r-none px-2"
              onClick={() => setViewMode("kanban")}
              title="Kanban"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={viewMode === "list" ? "secondary" : "ghost"}
              className="h-8 rounded-l-none px-2"
              onClick={() => setViewMode("list")}
              title="Lista"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="Nenhum post por aqui"
          description="Crie posts no espaço de cada cliente para acompanhá-los neste quadro."
        />
      ) : viewMode === "list" ? (
        /* ── LIST VIEW ── */
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <SortHeader col="client"  label="Cliente" />
                <SortHeader col="title"   label="Post" />
                <SortHeader col="format"  label="Formato" />
                <SortHeader col="status"  label="Status" />
                <SortHeader col="date"    label="Data" />
              </tr>
            </thead>
            <tbody>
              {sortedList.map((p) => (
                <tr
                  key={p.id}
                  className="cursor-pointer border-b last:border-0 hover:bg-accent/50"
                  onClick={() => setOpenPost(p.id)}
                >
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5">
                      {clientMap[p.client_id] && (
                        <span
                          className="h-2 w-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: clientMap[p.client_id]?.brand_color ?? "#6b7280" }}
                        />
                      )}
                      {clientMap[p.client_id]?.name ?? "—"}
                    </span>
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2 font-medium">{p.title}</td>
                  <td className="px-3 py-2 text-muted-foreground">{FORMAT_LABELS[p.format]}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={p.status} flowStage={p.flow_stage} approvalMode={p.approval_mode} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{p.scheduled_date ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── KANBAN VIEW ── */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {groups.map(({ key, posts: groupPosts, client: groupClient }) => (
            <div key={key} className="w-64 flex-shrink-0 space-y-2">
              {/* Column header */}
              <div className="flex items-center justify-between rounded-lg px-2 py-1.5"
                style={groupBy === "client" && groupClient?.brand_color
                  ? { backgroundColor: `${groupClient.brand_color}22`, borderLeft: `3px solid ${groupClient.brand_color}` }
                  : {}
                }
              >
                <div className="flex items-center gap-2 min-w-0">
                  {groupBy === "client" && groupClient && (
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                      style={{ backgroundColor: groupClient.brand_color ?? "#6b7280" }}
                    >
                      {groupClient.name.charAt(0)}
                    </span>
                  )}
                  <p className="truncate text-xs font-semibold uppercase text-muted-foreground">
                    {groupBy === "status" ? STATUS_LABELS[key as PostStatus] : key}
                  </p>
                </div>
                <span className="ml-2 flex-shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {groupPosts.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2">
                {groupPosts.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    {groupBy === "date" ? `Nenhum post ${key.toLowerCase()}` : "Nenhum post"}
                  </p>
                ) : (
                  groupPosts.map((p) => (
                    <Card key={p.id} className="cursor-pointer hover:bg-accent" onClick={() => setOpenPost(p.id)}>
                      <CardContent className="space-y-1 p-3">
                        <p className="text-sm font-medium leading-snug line-clamp-2">{p.title}</p>
                        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                          {groupBy !== "client" && (
                            <span>{clientMap[p.client_id]?.name ?? "—"}</span>
                          )}
                          {groupBy !== "format" && (
                            <span className="opacity-60">· {FORMAT_LABELS[p.format]}</span>
                          )}
                          {groupBy !== "date" && p.scheduled_date && (
                            <span className="opacity-60">· {p.scheduled_date}</span>
                          )}
                        </div>
                        {groupBy !== "status" && (
                          <StatusBadge status={p.status} flowStage={p.flow_stage} approvalMode={p.approval_mode} />
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {openPost && <PostDialog postId={openPost} onClose={() => setOpenPost(null)} />}
    </div>
  );
}

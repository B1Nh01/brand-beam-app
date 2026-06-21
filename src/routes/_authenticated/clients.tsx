import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog, type ConfirmState } from "@/components/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Plus, MoreVertical, Copy, RefreshCw, Pause, Archive, UsersRound, Pencil, Play,
  Search, Instagram, Music2, Eye, ExternalLink,
} from "lucide-react";
import { type Client, type Post } from "@/lib/content";
import { type FinancialRevenue, monthRange } from "@/lib/financial";
import { ClientFormDialog } from "@/components/client-form-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { RouteError } from "@/components/route-error";

const GRADIENT_PALETTE: [string, string][] = [
  ["#7c3aed", "#4f46e5"],
  ["#6d28d9", "#db2777"],
  ["#4f46e5", "#0891b2"],
  ["#7c3aed", "#9333ea"],
  ["#8b5cf6", "#06b6d4"],
  ["#6366f1", "#ec4899"],
  ["#a855f7", "#6366f1"],
  ["#7c3aed", "#2563eb"],
  ["#9333ea", "#f43f5e"],
  ["#6d28d9", "#4ade80"],
  ["#8b5cf6", "#f59e0b"],
  ["#4f46e5", "#10b981"],
];

function clientGradient(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  const [c1, c2] = GRADIENT_PALETTE[Math.abs(h) % GRADIENT_PALETTE.length];
  return `linear-gradient(135deg, ${c1}, ${c2})`;
}

export const Route = createFileRoute("/_authenticated/clients")({
  component: Clients,
  head: () => ({ meta: [{ title: "Clientes — Stúdio" }] }),
  errorComponent: ({ error, reset }) => <RouteError error={error as Error} reset={reset} />,
});

type ClientsData = {
  clients: Client[];
  posts: Pick<Post, "id" | "client_id" | "status">[];
  revenues: Pick<FinancialRevenue, "client_id" | "status">[];
  media: Record<string, string>;
};

type StatusFilter = "all" | Client["status"];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Ativo" },
  { value: "paused", label: "Pausado" },
  { value: "archived", label: "Arquivado" },
];

const STATUS_BADGE: Record<Client["status"], { label: string; cls: string }> = {
  active: { label: "Ativo", cls: "bg-success/15 text-success-foreground" },
  paused: { label: "Pausado", cls: "bg-warning/20 text-warning-foreground" },
  archived: { label: "Arquivado", cls: "bg-muted text-muted-foreground" },
};

function Clients() {
  const qc = useQueryClient();
  const { data: ws } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data, isLoading } = useQuery<ClientsData>({
    queryKey: ["clients-page"],
    queryFn: async () => {
      const now = new Date();
      const { start, end } = monthRange(now.getFullYear(), now.getMonth() + 1);
      const [clients, posts, revenues] = await Promise.all([
        supabase.from("clients").select("*").order("created_at"),
        supabase.from("posts").select("id,client_id,status"),
        supabase
          .from("financial_revenues")
          .select("client_id,status")
          .gte("due_date", start)
          .lte("due_date", end)
          .neq("status", "cancelled"),
      ]);

      const clientRows = (clients.data ?? []) as Client[];

      // Batch-create signed URLs for avatars
      const paths = clientRows
        .map((c) => c.avatar_url)
        .filter((p): p is string => !!p && !p.startsWith("http"));
      const media: Record<string, string> = {};
      if (paths.length) {
        const { data: signed } = await supabase.storage.from("client-media").createSignedUrls(paths, 3600);
        for (const s of signed ?? []) {
          if (s.path && s.signedUrl) media[s.path] = s.signedUrl;
        }
      }

      return {
        clients: clientRows,
        posts: (posts.data ?? []) as Pick<Post, "id" | "client_id" | "status">[],
        revenues: (revenues.data ?? []) as Pick<FinancialRevenue, "client_id" | "status">[],
        media,
      };
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["clients-page"] });
  const imgUrl = (path: string | null) =>
    !path ? null : path.startsWith("http") ? path : data?.media[path] ?? null;

  const copyLink = (c: Client) => {
    navigator.clipboard.writeText(`${window.location.origin}/portal/${c.portal_token}`);
    toast.success("Link do portal copiado");
  };
  const regen = async (c: Client) => {
    const { error } = await supabase.rpc("regenerate_portal_token", { _client_id: c.id });
    if (error) return toast.error("Não foi possível regenerar o token");
    toast.success("Token regenerado"); refresh();
  };
  const setStatus = async (c: Client, status: Client["status"]) => {
    const { error } = await supabase.from("clients").update({ status }).eq("id", c.id);
    if (error) return toast.error("Não foi possível atualizar o cliente");
    toast.success(status === "archived" ? "Cliente arquivado" : status === "paused" ? "Cliente pausado" : "Cliente reativado");
    refresh();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.clients ?? []).filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (q && !`${c.name} ${c.instagram_handle ?? ""} ${c.tiktok_handle ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data?.clients, search, statusFilter]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Header */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">Clientes</h1>
          <p className="truncate text-sm text-muted-foreground">Gerencie seus clientes.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Novo cliente</span>
        </Button>
      </div>

      {/* Toolbar: search + status filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                statusFilter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button onClick={() => setOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4" /> Novo Cliente
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-52" />)}
        </div>
      ) : data?.clients.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Nenhum cliente cadastrado"
          description="Adicione seu primeiro cliente para criar o espaço de aprovação dele."
          actionLabel="Adicionar cliente"
          onAction={() => setOpen(true)}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nenhum cliente encontrado"
          description="Tente ajustar a busca ou os filtros."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const clientPosts = data!.posts.filter((p) => p.client_id === c.id);
            const total = clientPosts.length;
            const pending = clientPosts.filter((p) => p.status === "in_approval" || p.status === "adjustment_requested").length;
            const published = clientPosts.filter((p) => p.status === "published").length;
            const avatar = imgUrl(c.avatar_url);
            const brand = c.brand_color ?? undefined;
            const gradient = clientGradient(c.id);
            const badge = STATUS_BADGE[c.status];

            return (
              <div
                key={c.id}
                className="relative flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md"
              >
                {/* Brand color top bar */}
                <div className="h-1.5 w-full" style={{ background: brand ?? gradient }} />

                <div className="flex flex-1 flex-col p-4">
                  {/* Header row: avatar + name + status + menu */}
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl text-base font-bold text-white"
                      style={{ background: brand ?? gradient }}
                    >
                      {avatar ? (
                        <img src={avatar} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        c.name.slice(0, 2).toUpperCase()
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold">{c.name}</p>
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", badge.cls)}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {c.instagram_handle && (
                          <span className="flex items-center gap-1">
                            <Instagram className="h-3 w-3" /> {c.instagram_handle}
                          </span>
                        )}
                        {c.tiktok_handle && (
                          <span className="flex items-center gap-1">
                            <Music2 className="h-3 w-3" /> {c.tiktok_handle}
                          </span>
                        )}
                        {!c.instagram_handle && !c.tiktok_handle && <span>—</span>}
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="-mr-1 -mt-1 h-7 w-7 shrink-0 text-muted-foreground">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /> Editar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyLink(c)}><Copy className="h-4 w-4" /> Copiar link do portal</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setConfirm({
                          title: "Regenerar token do portal?",
                          description: `O link atual do portal de ${c.name} deixará de funcionar imediatamente. Você precisará enviar o novo link ao cliente.`,
                          confirmLabel: "Regenerar",
                          onConfirm: async () => { await regen(c); },
                        })}><RefreshCw className="h-4 w-4" /> Regenerar token</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setStatus(c, c.status === "paused" ? "active" : "paused")}>
                          {c.status === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />} {c.status === "paused" ? "Reativar" : "Pausar"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setConfirm({
                          title: "Arquivar cliente?",
                          description: `${c.name} será arquivado e deixará de aparecer entre os clientes ativos. Você pode reativá-lo depois.`,
                          confirmLabel: "Arquivar",
                          onConfirm: async () => { await setStatus(c, "archived"); },
                        })}><Archive className="h-4 w-4" /> Arquivar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Stats */}
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xl font-bold leading-none">{total}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Total</p>
                    </div>
                    <div>
                      <p className={cn("text-xl font-bold leading-none", pending > 0 && "text-warning-foreground")}>{pending}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Pendentes</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold leading-none">{published}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Publicados</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex items-center gap-2">
                    <Button asChild variant="secondary" className="flex-1 bg-primary/10 text-primary hover:bg-primary/20">
                      <Link to="/clients/$id" params={{ id: c.id }}>
                        <Eye className="h-4 w-4" /> Ver conteúdos
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="shrink-0">
                      <a href={`/portal/${c.portal_token}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" /> Portal
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {ws && (
        <ClientFormDialog
          workspaceId={ws.id}
          open={open}
          onOpenChange={setOpen}
        />
      )}
      {ws && editing && (
        <ClientFormDialog
          workspaceId={ws.id}
          client={editing}
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}

      <ConfirmDialog state={confirm} onOpenChange={(o) => !o && setConfirm(null)} />
    </div>
  );
}

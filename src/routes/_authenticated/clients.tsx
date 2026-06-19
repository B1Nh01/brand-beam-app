import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog, type ConfirmState } from "@/components/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, MoreVertical, Copy, RefreshCw, Pause, Archive, UsersRound, Pencil, Play, DollarSign } from "lucide-react";
import { type Client, type Post } from "@/lib/content";
import { type FinancialRevenue, formatBRL, monthRange } from "@/lib/financial";
import { ClientFormDialog } from "@/components/client-form-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { RouteError } from "@/components/route-error";
import { useRole } from "@/hooks/use-role";

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

function Clients() {
  const qc = useQueryClient();
  const { data: ws } = useWorkspace();
  const role = useRole();
  const isOwner = role === "owner";
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

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

      // Batch-create signed URLs for avatars + covers
      const paths = clientRows
        .flatMap((c) => [c.avatar_url, c.cover_url])
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">Clientes</h1>
          <p className="truncate text-sm text-muted-foreground">Gerencie os espaços dos seus clientes.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Novo cliente</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : data?.clients.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Nenhum cliente cadastrado"
          description="Adicione seu primeiro cliente para criar o espaço de aprovação dele."
          actionLabel="Adicionar cliente"
          onAction={() => setOpen(true)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.clients.map((c) => {
            const pending = data.posts.filter((p) => p.client_id === c.id && (p.status === "in_approval" || p.status === "adjustment_requested")).length;
            const fee = Number((c as Client & { monthly_fee?: number }).monthly_fee ?? 0);
            const monthRevenue = data.revenues.find((r) => r.client_id === c.id);
            const payStatus = monthRevenue?.status;
            const cover = imgUrl(c.cover_url);
            const avatar = imgUrl(c.avatar_url);
            const brand = c.brand_color ?? "#2563eb";

            const clientPosts = data.posts.filter((p) => p.client_id === c.id);
            const draftCount = clientPosts.filter((p) => p.status === "draft").length;
            const adjustCount = clientPosts.filter((p) => p.status === "adjustment_requested").length;
            const approvalCount = clientPosts.filter((p) => p.status === "in_approval").length;
            const approvedCount = clientPosts.filter((p) => p.status === "approved").length;
            const gradient = clientGradient(c.id);

            return (
              <div
                key={c.id}
                className={cn("relative overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md", c.status !== "active" && "opacity-60")}
              >
                {/* Clickable area — uses Link for reliable navigation */}
                <Link to="/clients/$id" params={{ id: c.id }} className="block">
                  {/* Gradient strip */}
                  <div className="relative h-20" style={{ background: gradient }}>
                    {cover && (
                      <img src={cover} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-60" />
                    )}
                    {isOwner && fee > 0 && (
                      <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                        <DollarSign className="h-2.5 w-2.5" />
                        {formatBRL(fee)}
                        {payStatus === "paid" ? " ✓" : payStatus ? " ●" : ""}
                      </div>
                    )}
                  </div>

                  <div className="p-4 pt-0">
                    <div className="-mt-7 mb-2 flex items-end justify-between gap-2">
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-card text-base font-bold text-white" style={{ background: gradient }}>
                        {avatar ? <img src={avatar} alt="" loading="lazy" className="h-full w-full object-cover" /> : c.name.charAt(0)}
                      </span>
                      {pending > 0 && (
                        <span className="mb-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs text-warning-foreground">{pending} pendente{pending !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.instagram_handle ?? "—"}</p>

                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {draftCount > 0 && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{draftCount} rascunho{draftCount !== 1 ? "s" : ""}</span>
                      )}
                      {adjustCount > 0 && (
                        <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] text-destructive">{adjustCount} ajuste{adjustCount !== 1 ? "s" : ""}</span>
                      )}
                      {approvalCount > 0 && (
                        <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] text-warning-foreground">{approvalCount} aprovação</span>
                      )}
                      {approvedCount > 0 && (
                        <span className="rounded-full bg-success/20 px-2 py-0.5 text-[10px] text-success-foreground">{approvedCount} aprovado{approvedCount !== 1 ? "s" : ""}</span>
                      )}
                      {clientPosts.length === 0 && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">Sem posts</span>
                      )}
                    </div>
                  </div>
                </Link>

                {/* Dropdown — absolutely positioned above the Link so clicks don't navigate */}
                <div className="absolute right-2 top-2 z-10">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="secondary" size="icon" className="h-7 w-7 bg-black/30 text-white backdrop-blur hover:bg-black/50">
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

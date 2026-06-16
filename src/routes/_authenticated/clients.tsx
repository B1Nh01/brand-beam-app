import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog, type ConfirmState } from "@/components/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, MoreVertical, Copy, RefreshCw, Pause, Archive, UsersRound } from "lucide-react";
import { type Client, type Post } from "@/lib/content";
import { type FinancialRevenue, formatBRL, monthRange } from "@/lib/financial";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/clients")({
  component: Clients,
  head: () => ({ meta: [{ title: "Clientes — Aprova" }] }),
});

function Clients() {
  const qc = useQueryClient();
  const { data: ws } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [ig, setIg] = useState("");
  const [feeStr, setFeeStr] = useState("0,00");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const { data, isLoading } = useQuery({
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
      return {
        clients:  (clients.data ?? []) as Client[],
        posts:    (posts.data ?? []) as Pick<Post, "id" | "client_id" | "status">[],
        revenues: (revenues.data ?? []) as Pick<FinancialRevenue, "client_id" | "status">[],
      };
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["clients-page"] });

  const handleFeeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "");
    const num = digits ? parseInt(digits, 10) / 100 : 0;
    setFeeStr(num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  };

  const create = async () => {
    if (!ws || !name.trim()) return;
    const fee = parseFloat(feeStr.replace(/\./g, "").replace(",", ".")) || 0;
    const { data: created, error } = await supabase
      .from("clients")
      .insert({ workspace_id: ws.id, name, instagram_handle: ig || null, monthly_fee: fee || null })
      .select()
      .single();
    if (error) return toast.error(error.message);
    toast.success("Cliente criado");
    setName(""); setIg(""); setFeeStr("0,00"); setOpen(false); refresh();
    // Auto-generate revenue if fee set
    if (fee > 0 && created) {
      await supabase.rpc("generate_monthly_revenues", { _workspace_id: ws.id });
    }
  };

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">Gerencie os espaços dos seus clientes.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Novo cliente</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-2"><Label>Instagram</Label><Input value={ig} onChange={(e) => setIg(e.target.value)} placeholder="@cliente" /></div>
              <div className="space-y-2">
                <Label>Mensalidade (R$)</Label>
                <Input value={feeStr} onChange={handleFeeChange} inputMode="numeric" placeholder="0,00" />
              </div>
              <Button onClick={create} className="w-full">Criar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
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
            return (
              <Card key={c.id} className={c.status !== "active" ? "opacity-60" : ""}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <Link to="/clients/$id" params={{ id: c.id }} className="flex min-w-0 items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-primary-foreground" style={{ backgroundColor: c.brand_color ?? "#7c3aed" }}>{c.name.charAt(0)}</span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{c.instagram_handle ?? "—"}</p>
                      </div>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => copyLink(c)}><Copy className="h-4 w-4" /> Copiar link do portal</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setConfirm({
                          title: "Regenerar token do portal?",
                          description: `O link atual do portal de ${c.name} deixará de funcionar imediatamente. Você precisará enviar o novo link ao cliente.`,
                          confirmLabel: "Regenerar",
                          onConfirm: async () => { await regen(c); },
                        })}><RefreshCw className="h-4 w-4" /> Regenerar token</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setStatus(c, c.status === "paused" ? "active" : "paused")}><Pause className="h-4 w-4" /> {c.status === "paused" ? "Reativar" : "Pausar"}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setConfirm({
                          title: "Arquivar cliente?",
                          description: `${c.name} será arquivado e deixará de aparecer entre os clientes ativos. Você pode reativá-lo depois.`,
                          confirmLabel: "Arquivar",
                          onConfirm: async () => { await setStatus(c, "archived"); },
                        })}><Archive className="h-4 w-4" /> Arquivar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Pendentes</span>
                    <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs text-warning-foreground">{pending}</span>
                  </div>
                  {fee > 0 && (
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="font-medium text-muted-foreground">{formatBRL(fee)}/mês</span>
                      {payStatus === "paid" ? (
                        <span title="Mensalidade paga">✅</span>
                      ) : payStatus ? (
                        <span title="Mensalidade pendente">🟡</span>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog state={confirm} onOpenChange={(o) => !o && setConfirm(null)} />
    </div>
  );
}

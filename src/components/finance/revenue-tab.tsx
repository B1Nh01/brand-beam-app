import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog, type ConfirmState } from "@/components/confirm-dialog";
import { RevenueDialog } from "./revenue-dialog";
import { Plus, RefreshCw, Check, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  type FinancialRevenue,
  FIN_STATUS_LABELS,
  FIN_STATUS_CLASSES,
  formatBRL,
  formatDateBR,
} from "@/lib/financial";
import { cn } from "@/lib/utils";

type Client = { id: string; name: string };

type Props = {
  revenues: FinancialRevenue[];
  clients: Client[];
  workspaceId: string;
  year: number;
  month: number;
  onRefresh: () => void;
};

const STATUS_ORDER = ["overdue", "pending", "paid", "cancelled"] as const;

export function RevenueTab({ revenues, clients, workspaceId, onRefresh }: Props) {
  const qc = useQueryClient();
  const [filterClient, setFilterClient] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [editRevenue, setEditRevenue]   = useState<FinancialRevenue | null>(null);
  const [newOpen, setNewOpen]           = useState(false);
  const [confirm, setConfirm]           = useState<ConfirmState | null>(null);
  const [payDates, setPayDates]         = useState<Record<string, string>>({});
  const [payOpen, setPayOpen]           = useState<Record<string, boolean>>({});

  const clientName = (id: string | null) =>
    id ? (clients.find((c) => c.id === id)?.name ?? "—") : "Avulso";

  const filtered = revenues.filter((r) => {
    if (filterClient !== "all" && r.client_id !== filterClient) return false;
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    return true;
  });

  const grouped = STATUS_ORDER.map((s) => ({
    status: s,
    items: filtered.filter((r) => r.status === s),
  })).filter((g) => g.items.length > 0);

  const markPaid = async (r: FinancialRevenue) => {
    const paidAt = payDates[r.id] || new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from("financial_revenues")
      .update({ status: "paid", paid_at: paidAt })
      .eq("id", r.id);
    if (error) return toast.error("Erro ao marcar como pago");
    toast.success("Receita marcada como paga");
    setPayOpen((p) => ({ ...p, [r.id]: false }));
    onRefresh();
    qc.invalidateQueries({ queryKey: ["finance-overdue"] });
  };

  const deleteRevenue = async (r: FinancialRevenue) => {
    const { error } = await supabase.from("financial_revenues").delete().eq("id", r.id);
    if (error) return toast.error("Erro ao excluir receita");
    toast.success("Receita excluída");
    onRefresh();
    qc.invalidateQueries({ queryKey: ["finance-overdue"] });
  };

  const generateRevenues = async () => {
    const { data: result, error } = await supabase.rpc("generate_monthly_revenues", {
      _workspace_id: workspaceId,
    });
    if (error) return toast.error("Erro ao gerar mensalidades");
    const res = result as { geradas: number; ja_existiam: number };
    toast.success(`${res.geradas} mensalidade(s) gerada(s). ${res.ja_existiam} já existiam.`);
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" /> Nova receita
        </Button>
        <Button variant="outline" size="sm" onClick={generateRevenues}>
          <RefreshCw className="h-4 w-4" /> Gerar mensalidades
        </Button>
        <div className="ml-auto flex gap-2">
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="paid">Pago</SelectItem>
              <SelectItem value="overdue">Vencido</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      {grouped.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma receita encontrada para os filtros selecionados.
        </p>
      ) : (
        grouped.map(({ status, items }) => (
          <div key={status} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {FIN_STATUS_LABELS[status]}
            </h3>
            {items.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-lg border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium truncate">{r.description}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs", FIN_STATUS_CLASSES[r.status])}>
                      {FIN_STATUS_LABELS[r.status]}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>{clientName(r.client_id)}</span>
                    <span>Vence {formatDateBR(r.due_date)}</span>
                    {r.paid_at && <span>Pago em {formatDateBR(r.paid_at)}</span>}
                    {r.category && <span>{r.category}</span>}
                  </div>
                </div>

                <span className="shrink-0 font-semibold tabular-nums">{formatBRL(r.amount)}</span>

                <div className="flex shrink-0 items-center gap-1">
                  {r.status !== "paid" && r.status !== "cancelled" && (
                    <Popover
                      open={payOpen[r.id] ?? false}
                      onOpenChange={(v) => setPayOpen((p) => ({ ...p, [r.id]: v }))}
                    >
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" title="Marcar como pago">
                          <Check className="h-4 w-4 text-success" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 space-y-3">
                        <p className="text-sm font-medium">Data do pagamento</p>
                        <Input
                          type="date"
                          value={payDates[r.id] ?? new Date().toISOString().slice(0, 10)}
                          onChange={(e) => setPayDates((p) => ({ ...p, [r.id]: e.target.value }))}
                        />
                        <Button size="sm" className="w-full" onClick={() => markPaid(r)}>
                          Confirmar pagamento
                        </Button>
                      </PopoverContent>
                    </Popover>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => setEditRevenue(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setConfirm({
                        title: "Excluir receita?",
                        description: `"${r.description}" será excluída permanentemente.`,
                        confirmLabel: "Excluir",
                        onConfirm: async () => deleteRevenue(r),
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ))
      )}

      <RevenueDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        workspaceId={workspaceId}
        clients={clients}
        onSaved={onRefresh}
      />
      <RevenueDialog
        open={!!editRevenue}
        onOpenChange={(v) => !v && setEditRevenue(null)}
        workspaceId={workspaceId}
        clients={clients}
        revenue={editRevenue}
        onSaved={() => { setEditRevenue(null); onRefresh(); }}
      />
      <ConfirmDialog state={confirm} onOpenChange={(v) => !v && setConfirm(null)} />
    </div>
  );
}

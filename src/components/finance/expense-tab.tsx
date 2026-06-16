import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { ExpenseDialog } from "./expense-dialog";
import { Plus, Check, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  type FinancialExpense,
  type ExpenseCategory,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  FIN_STATUS_LABELS,
  FIN_STATUS_CLASSES,
  formatBRL,
  formatDateBR,
} from "@/lib/financial";
import { cn } from "@/lib/utils";

type Props = {
  expenses: FinancialExpense[];
  workspaceId: string;
  onRefresh: () => void;
};

export function ExpenseTab({ expenses, workspaceId, onRefresh }: Props) {
  const [filterCat, setFilterCat]     = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [editExpense, setEditExpense]  = useState<FinancialExpense | null>(null);
  const [newOpen, setNewOpen]          = useState(false);
  const [confirm, setConfirm]          = useState<ConfirmState | null>(null);
  const [payDates, setPayDates]        = useState<Record<string, string>>({});
  const [payOpen, setPayOpen]          = useState<Record<string, boolean>>({});

  const filtered = expenses.filter((e) => {
    if (filterCat !== "all" && e.category !== filterCat) return false;
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    return true;
  });

  const grouped = EXPENSE_CATEGORIES.map((cat) => ({
    cat,
    items: filtered.filter((e) => e.category === cat),
  })).filter((g) => g.items.length > 0);

  const markPaid = async (e: FinancialExpense) => {
    const paidAt = payDates[e.id] || new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from("financial_expenses")
      .update({ status: "paid", paid_at: paidAt })
      .eq("id", e.id);
    if (error) return toast.error("Erro ao marcar como pago");
    toast.success("Despesa marcada como paga");
    setPayOpen((p) => ({ ...p, [e.id]: false }));
    onRefresh();
  };

  const deleteExpense = async (e: FinancialExpense) => {
    const { error } = await supabase.from("financial_expenses").delete().eq("id", e.id);
    if (error) return toast.error("Erro ao excluir despesa");
    toast.success("Despesa excluída");
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" /> Nova despesa
        </Button>
        <div className="ml-auto flex gap-2">
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {EXPENSE_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>{EXPENSE_CATEGORY_LABELS[cat as ExpenseCategory]}</SelectItem>
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
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List grouped by category */}
      {grouped.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma despesa encontrada para os filtros selecionados.
        </p>
      ) : (
        grouped.map(({ cat, items }) => (
          <div key={cat} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {EXPENSE_CATEGORY_LABELS[cat as ExpenseCategory]}
            </h3>
            {items.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 rounded-lg border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium truncate">{e.description}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs", FIN_STATUS_CLASSES[e.status])}>
                      {FIN_STATUS_LABELS[e.status]}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>Vence {formatDateBR(e.due_date)}</span>
                    {e.paid_at && <span>Pago em {formatDateBR(e.paid_at)}</span>}
                  </div>
                </div>

                <span className="shrink-0 font-semibold tabular-nums">{formatBRL(e.amount)}</span>

                <div className="flex shrink-0 items-center gap-1">
                  {e.status !== "paid" && e.status !== "cancelled" && (
                    <Popover
                      open={payOpen[e.id] ?? false}
                      onOpenChange={(v) => setPayOpen((p) => ({ ...p, [e.id]: v }))}
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
                          value={payDates[e.id] ?? new Date().toISOString().slice(0, 10)}
                          onChange={(ev) => setPayDates((p) => ({ ...p, [e.id]: ev.target.value }))}
                        />
                        <Button size="sm" className="w-full" onClick={() => markPaid(e)}>
                          Confirmar pagamento
                        </Button>
                      </PopoverContent>
                    </Popover>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => setEditExpense(e)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setConfirm({
                        title: "Excluir despesa?",
                        description: `"${e.description}" será excluída permanentemente.`,
                        confirmLabel: "Excluir",
                        onConfirm: async () => { await deleteExpense(e); },
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

      <ExpenseDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        workspaceId={workspaceId}
        onSaved={onRefresh}
      />
      <ExpenseDialog
        open={!!editExpense}
        onOpenChange={(v) => !v && setEditExpense(null)}
        workspaceId={workspaceId}
        expense={editExpense}
        onSaved={() => { setEditExpense(null); onRefresh(); }}
      />
      <ConfirmDialog state={confirm} onOpenChange={(v) => !v && setConfirm(null)} />
    </div>
  );
}

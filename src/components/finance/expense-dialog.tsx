import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  type FinancialExpense,
  type ExpenseCategory,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  amountToMask,
  parseBRLString,
} from "@/lib/financial";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  expense?: FinancialExpense | null;
  onSaved: () => void;
};

export function ExpenseDialog({
  open,
  onOpenChange,
  workspaceId,
  expense,
  onSaved,
}: Props) {
  const editing = !!expense;

  const [description, setDescription] = useState("");
  const [amountStr, setAmountStr]      = useState("0,00");
  const [dueDate, setDueDate]          = useState("");
  const [category, setCategory]        = useState<ExpenseCategory>("outros");
  const [notes, setNotes]              = useState("");
  const [loading, setLoading]          = useState(false);

  useEffect(() => {
    if (open) {
      setDescription(expense?.description ?? "");
      setAmountStr(expense ? amountToMask(expense.amount) : "0,00");
      setDueDate(expense?.due_date ?? new Date().toISOString().slice(0, 10));
      setCategory(expense?.category ?? "outros");
      setNotes(expense?.notes ?? "");
    }
  }, [open, expense]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "");
    const num = digits ? parseInt(digits, 10) / 100 : 0;
    setAmountStr(amountToMask(num));
  };

  const submit = async () => {
    const amount = parseBRLString(amountStr);
    if (!description.trim()) return toast.error("Informe a descrição");
    if (amount <= 0) return toast.error("Valor deve ser maior que zero");
    if (!dueDate) return toast.error("Informe o vencimento");

    setLoading(true);
    const payload = {
      workspace_id: workspaceId,
      description:  description.trim(),
      amount,
      due_date:     dueDate,
      category,
      notes:        notes.trim() || null,
    };

    const { error } = editing
      ? await supabase.from("financial_expenses").update(payload).eq("id", expense!.id)
      : await supabase.from("financial_expenses").insert(payload);

    setLoading(false);
    if (error) return toast.error("Erro ao salvar despesa");
    toast.success(editing ? "Despesa atualizada" : "Despesa criada");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar despesa" : "Nova despesa"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Assinatura Canva" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input value={amountStr} onChange={handleAmountChange} inputMode="numeric" />
            </div>
            <div className="space-y-2">
              <Label>Vencimento</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {EXPENSE_CATEGORY_LABELS[cat]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Salvando…" : editing ? "Salvar alterações" : "Criar despesa"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

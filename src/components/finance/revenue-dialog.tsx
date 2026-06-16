import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  type FinancialRevenue,
  amountToMask,
  parseBRLString,
} from "@/lib/financial";

type Client = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  clients: Client[];
  revenue?: FinancialRevenue | null;
  onSaved: () => void;
};

export function RevenueDialog({
  open,
  onOpenChange,
  workspaceId,
  clients,
  revenue,
  onSaved,
}: Props) {
  const editing = !!revenue;

  const [description, setDescription]   = useState("");
  const [amountStr, setAmountStr]        = useState("0,00");
  const [dueDate, setDueDate]            = useState("");
  const [category, setCategory]          = useState("Mensalidade");
  const [clientId, setClientId]          = useState<string>("none");
  const [notes, setNotes]                = useState("");
  const [isRecurring, setIsRecurring]    = useState(false);
  const [recurrenceDay, setRecurrenceDay]= useState("1");
  const [loading, setLoading]            = useState(false);

  useEffect(() => {
    if (open) {
      setDescription(revenue?.description ?? "");
      setAmountStr(revenue ? amountToMask(revenue.amount) : "0,00");
      setDueDate(revenue?.due_date ?? new Date().toISOString().slice(0, 10));
      setCategory(revenue?.category ?? "Mensalidade");
      setClientId(revenue?.client_id ?? "none");
      setNotes(revenue?.notes ?? "");
      setIsRecurring(revenue?.is_recurring ?? false);
      setRecurrenceDay(String(revenue?.recurrence_day ?? 1));
    }
  }, [open, revenue]);

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
      workspace_id:   workspaceId,
      client_id:      clientId === "none" ? null : clientId,
      description:    description.trim(),
      amount,
      due_date:       dueDate,
      category:       category.trim() || "Mensalidade",
      notes:          notes.trim() || null,
      is_recurring:   isRecurring,
      recurrence_day: isRecurring ? parseInt(recurrenceDay, 10) : null,
    };

    const { error } = editing
      ? await supabase.from("financial_revenues").update(payload).eq("id", revenue!.id)
      : await supabase.from("financial_revenues").insert(payload);

    setLoading(false);
    if (error) return toast.error("Erro ao salvar receita");
    toast.success(editing ? "Receita atualizada" : "Receita criada");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar receita" : "Nova receita"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Mensalidade — Cliente X" />
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Mensalidade" />
            </div>
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Avulso" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Avulso</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Recorrente</p>
              <p className="text-xs text-muted-foreground">Gera receita todo mês</p>
            </div>
            <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
          </div>

          {isRecurring && (
            <div className="space-y-2">
              <Label>Dia de vencimento (1–28)</Label>
              <Input
                type="number"
                min={1}
                max={28}
                value={recurrenceDay}
                onChange={(e) => setRecurrenceDay(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Salvando…" : editing ? "Salvar alterações" : "Criar receita"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

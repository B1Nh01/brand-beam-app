import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Download } from "lucide-react";
import {
  type FinancialRevenue,
  type FinancialExpense,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  FIN_STATUS_LABELS,
  formatBRL,
  formatDateBR,
  monthRange,
  MONTH_NAMES,
} from "@/lib/financial";

type Client = { id: string; name: string };

type Props = {
  workspaceId: string;
  year: number;
  month: number;
  revenues: FinancialRevenue[];
  expenses: FinancialExpense[];
  clients: Client[];
};

export function ReportTab({ workspaceId, year, month, revenues, expenses, clients }: Props) {
  const clientName = (id: string | null) =>
    id ? (clients.find((c) => c.id === id)?.name ?? "—") : "Avulso";

  // Last 6 months data for chart
  const { data: historyData } = useQuery({
    queryKey: ["finance-history", workspaceId, year, month],
    enabled: !!workspaceId,
    queryFn: async () => {
      const months: { label: string; start: string; end: string }[] = [];
      for (let i = 5; i >= 0; i--) {
        let m = month - i;
        let y = year;
        while (m <= 0) { m += 12; y--; }
        const { start, end } = monthRange(y, m);
        months.push({ label: MONTH_NAMES[m - 1].slice(0, 3), start, end });
      }

      const [revRes, expRes] = await Promise.all([
        supabase
          .from("financial_revenues")
          .select("due_date,amount,status")
          .eq("workspace_id", workspaceId)
          .gte("due_date", months[0].start)
          .lte("due_date", months[5].end),
        supabase
          .from("financial_expenses")
          .select("due_date,amount,status")
          .eq("workspace_id", workspaceId)
          .gte("due_date", months[0].start)
          .lte("due_date", months[5].end),
      ]);

      const revs = (revRes.data ?? []) as Pick<FinancialRevenue, "due_date" | "amount" | "status">[];
      const exps = (expRes.data ?? []) as Pick<FinancialExpense, "due_date" | "amount" | "status">[];

      return months.map(({ label, start, end }) => {
        const mRevs = revs.filter((r) => r.due_date >= start && r.due_date <= end && r.status !== "cancelled");
        const mExps = exps.filter((e) => e.due_date >= start && e.due_date <= end && e.status !== "cancelled");
        return {
          mes: label,
          Receitas: parseFloat(mRevs.reduce((s, r) => s + r.amount, 0).toFixed(2)),
          Despesas: parseFloat(mExps.reduce((s, e) => s + e.amount, 0).toFixed(2)),
        };
      });
    },
    staleTime: 5 * 60 * 1000,
  });

  // Revenue by client for the selected month
  const byClient = clients.map((c) => {
    const cRevs = revenues.filter((r) => r.client_id === c.id && r.status !== "cancelled");
    if (cRevs.length === 0) return null;
    return {
      client: c.name,
      previsto: cRevs.reduce((s, r) => s + r.amount, 0),
      recebido: cRevs.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount, 0),
      status: cRevs.every((r) => r.status === "paid")
        ? "paid"
        : cRevs.some((r) => r.status === "overdue")
        ? "overdue"
        : "pending",
    };
  }).filter(Boolean) as { client: string; previsto: number; recebido: number; status: string }[];

  // Expenses by category for the selected month
  const byCategory = EXPENSE_CATEGORIES.map((cat) => {
    const items = expenses.filter((e) => e.category === cat && e.status !== "cancelled");
    if (items.length === 0) return null;
    return {
      cat: EXPENSE_CATEGORY_LABELS[cat],
      total: items.reduce((s, e) => s + e.amount, 0),
      pago:  items.filter((e) => e.status === "paid").reduce((s, e) => s + e.amount, 0),
    };
  }).filter(Boolean) as { cat: string; total: number; pago: number }[];

  const exportCSV = () => {
    const rows: string[][] = [
      ["Tipo", "Descrição", "Cliente", "Categoria", "Valor", "Vencimento", "Pagamento", "Status"],
    ];
    for (const r of revenues) {
      rows.push([
        "Receita",
        r.description,
        clientName(r.client_id),
        r.category,
        r.amount.toFixed(2).replace(".", ","),
        formatDateBR(r.due_date),
        r.paid_at ? formatDateBR(r.paid_at) : "",
        FIN_STATUS_LABELS[r.status],
      ]);
    }
    for (const e of expenses) {
      rows.push([
        "Despesa",
        e.description,
        "",
        EXPENSE_CATEGORY_LABELS[e.category],
        e.amount.toFixed(2).replace(".", ","),
        formatDateBR(e.due_date),
        e.paid_at ? formatDateBR(e.paid_at) : "",
        FIN_STATUS_LABELS[e.status],
      ]);
    }

    const csv = "﻿" + rows.map((r) => r.map((cell) => `"${cell}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financeiro-${MONTH_NAMES[month - 1].toLowerCase()}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Bar chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Receitas vs Despesas — últimos 6 meses</CardTitle>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          {historyData && historyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={historyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                  }
                />
                <Tooltip
                  formatter={(value: number) => formatBRL(value)}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Receitas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Despesas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando histórico…</p>
          )}
        </CardContent>
      </Card>

      {/* Revenue by client */}
      {byClient.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Receitas por cliente — {MONTH_NAMES[month - 1]} {year}</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Cliente</th>
                  <th className="pb-2 text-right font-medium">Previsto</th>
                  <th className="pb-2 text-right font-medium">Recebido</th>
                  <th className="pb-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {byClient.map((row) => (
                  <tr key={row.client}>
                    <td className="py-2 font-medium">{row.client}</td>
                    <td className="py-2 text-right tabular-nums">{formatBRL(row.previsto)}</td>
                    <td className="py-2 text-right tabular-nums">{formatBRL(row.recebido)}</td>
                    <td className="py-2 text-right">
                      <span className="text-xs text-muted-foreground">
                        {FIN_STATUS_LABELS[row.status as keyof typeof FIN_STATUS_LABELS] ?? row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Expenses by category */}
      {byCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Despesas por categoria — {MONTH_NAMES[month - 1]} {year}</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Categoria</th>
                  <th className="pb-2 text-right font-medium">Total previsto</th>
                  <th className="pb-2 text-right font-medium">Já pago</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {byCategory.map((row) => (
                  <tr key={row.cat}>
                    <td className="py-2 font-medium">{row.cat}</td>
                    <td className="py-2 text-right tabular-nums">{formatBRL(row.total)}</td>
                    <td className="py-2 text-right tabular-nums">{formatBRL(row.pago)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

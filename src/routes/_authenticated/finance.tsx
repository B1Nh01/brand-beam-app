import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  type FinancialRevenue,
  type FinancialExpense,
  formatBRL,
  monthRange,
  MONTH_NAMES,
} from "@/lib/financial";
import { RevenueTab } from "@/components/finance/revenue-tab";
import { ExpenseTab } from "@/components/finance/expense-tab";
import { ReportTab } from "@/components/finance/report-tab";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/finance")({
  component: Finance,
  head: () => ({ meta: [{ title: "Financeiro — Aprova" }] }),
});

function Finance() {
  const qc = useQueryClient();
  const { data: ws } = useWorkspace();

  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { start, end } = monthRange(year, month);
  const today = now.toISOString().slice(0, 10);

  // Mark overdue once when workspace is known
  useEffect(() => {
    if (!ws) return;
    supabase
      .from("financial_revenues")
      .update({ status: "overdue" })
      .eq("workspace_id", ws.id)
      .eq("status", "pending")
      .lt("due_date", today)
      .then(() => {});
    supabase
      .from("financial_expenses")
      .update({ status: "overdue" })
      .eq("workspace_id", ws.id)
      .eq("status", "pending")
      .lt("due_date", today)
      .then(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws?.id]);

  const { data } = useQuery({
    queryKey: ["finance", ws?.id, year, month],
    enabled: !!ws,
    queryFn: async () => {
      const [revRes, expRes, clientsRes] = await Promise.all([
        supabase
          .from("financial_revenues")
          .select("*")
          .eq("workspace_id", ws!.id)
          .gte("due_date", start)
          .lte("due_date", end)
          .order("due_date"),
        supabase
          .from("financial_expenses")
          .select("*")
          .eq("workspace_id", ws!.id)
          .gte("due_date", start)
          .lte("due_date", end)
          .order("due_date"),
        supabase
          .from("clients")
          .select("id,name")
          .eq("workspace_id", ws!.id)
          .neq("status", "archived"),
      ]);
      return {
        revenues: (revRes.data ?? []) as FinancialRevenue[],
        expenses: (expRes.data ?? []) as FinancialExpense[],
        clients:  (clientsRes.data ?? []) as { id: string; name: string }[],
      };
    },
  });

  const revenues = data?.revenues ?? [];
  const expenses = data?.expenses ?? [];
  const clients  = data?.clients  ?? [];

  const totalRevExpected = revenues.filter((r) => r.status !== "cancelled").reduce((s, r) => s + Number(r.amount), 0);
  const totalRevReceived = revenues.filter((r) => r.status === "paid").reduce((s, r) => s + Number(r.amount), 0);
  const totalExpenses    = expenses.filter((e) => e.status !== "cancelled").reduce((s, e) => s + Number(e.amount), 0);
  const totalExpPaid     = expenses.filter((e) => e.status === "paid").reduce((s, e) => s + Number(e.amount), 0);
  const resultado        = totalRevReceived - totalExpPaid;

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["finance"] });
    qc.invalidateQueries({ queryKey: ["finance-overdue"] });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Financeiro</h1>
          <p className="text-muted-foreground">Receitas e despesas da agência.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="w-44 text-center font-semibold">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <Button variant="outline" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Receitas previstas" value={totalRevExpected} />
        <SummaryCard label="Receitas recebidas" value={totalRevReceived} positive />
        <SummaryCard label="Despesas do mês"    value={totalExpenses}    negative />
        <SummaryCard
          label="Resultado"
          value={resultado}
          positive={resultado > 0}
          negative={resultado < 0}
          signed
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="revenues">
        <TabsList>
          <TabsTrigger value="revenues">Receitas</TabsTrigger>
          <TabsTrigger value="expenses">Despesas</TabsTrigger>
          <TabsTrigger value="report">Relatório</TabsTrigger>
        </TabsList>

        <TabsContent value="revenues" className="pt-4">
          <RevenueTab
            revenues={revenues}
            clients={clients}
            workspaceId={ws?.id ?? ""}
            year={year}
            month={month}
            onRefresh={refresh}
          />
        </TabsContent>

        <TabsContent value="expenses" className="pt-4">
          <ExpenseTab
            expenses={expenses}
            workspaceId={ws?.id ?? ""}
            onRefresh={refresh}
          />
        </TabsContent>

        <TabsContent value="report" className="pt-4">
          <ReportTab
            workspaceId={ws?.id ?? ""}
            year={year}
            month={month}
            revenues={revenues}
            expenses={expenses}
            clients={clients}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  positive,
  negative,
  signed,
}: {
  label: string;
  value: number;
  positive?: boolean;
  negative?: boolean;
  signed?: boolean;
}) {
  const formatted = signed
    ? (value > 0 ? "+" : "") + formatBRL(Math.abs(value))
    : formatBRL(value);

  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-1 text-2xl font-bold tabular-nums",
            positive && "text-emerald-600 dark:text-emerald-400",
            negative && "text-destructive",
          )}
        >
          {formatted}
        </p>
      </CardContent>
    </Card>
  );
}

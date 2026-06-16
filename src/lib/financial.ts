export type FinStatus = "pending" | "paid" | "overdue" | "cancelled";
export type ExpenseCategory =
  | "ferramentas"
  | "trafego_pago"
  | "freelancer"
  | "infraestrutura"
  | "impostos"
  | "outros";

export type FinancialRevenue = {
  id: string;
  workspace_id: string;
  client_id: string | null;
  description: string;
  amount: number;
  due_date: string;
  paid_at: string | null;
  status: FinStatus;
  is_recurring: boolean;
  recurrence_day: number | null;
  category: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FinancialExpense = {
  id: string;
  workspace_id: string;
  description: string;
  amount: number;
  due_date: string;
  paid_at: string | null;
  status: FinStatus;
  category: ExpenseCategory;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FinancialSettings = {
  id: string;
  workspace_id: string;
  auto_generate_revenues: boolean;
  revenue_generation_day: number;
  default_revenue_category: string;
  currency: string;
};

export const FIN_STATUS_LABELS: Record<FinStatus, string> = {
  pending:   "Pendente",
  paid:      "Pago",
  overdue:   "Vencido",
  cancelled: "Cancelado",
};

export const FIN_STATUS_CLASSES: Record<FinStatus, string> = {
  pending:   "bg-warning/20 text-warning-foreground border border-warning/40",
  paid:      "bg-success/20 text-success-foreground border border-success/40",
  overdue:   "bg-destructive/15 text-destructive border border-destructive/30",
  cancelled: "bg-muted text-muted-foreground",
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  ferramentas:   "Ferramentas",
  trafego_pago:  "Tráfego pago",
  freelancer:    "Freelancer",
  infraestrutura:"Infraestrutura",
  impostos:      "Impostos",
  outros:        "Outros",
};

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "ferramentas", "trafego_pago", "freelancer",
  "infraestrutura", "impostos", "outros",
];

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function parseBRLString(s: string): number {
  const digits = s.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) / 100 : 0;
}

export function amountToMask(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function monthRange(year: number, month: number): { start: string; end: string } {
  const m = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${m}-01`,
    end:   `${year}-${m}-${String(lastDay).padStart(2, "0")}`,
  };
}

export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

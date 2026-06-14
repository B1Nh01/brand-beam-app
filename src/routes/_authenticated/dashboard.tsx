import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Clock, AlertTriangle, CheckCircle2, Users, ArrowRight, Activity } from "lucide-react";
import { type Post, type Client, type ActivityLog } from "@/lib/content";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — Aprova" }] }),
});

function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [posts, clients, activity] = await Promise.all([
        supabase.from("posts").select("*"),
        supabase.from("clients").select("*"),
        supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(8),
      ]);
      return {
        posts: (posts.data ?? []) as Post[],
        clients: (clients.data ?? []) as Client[],
        activity: (activity.data ?? []) as ActivityLog[],
      };
    },
  });


  const posts = data?.posts ?? [];
  const weekAgo = Date.now() - 7 * 864e5;
  const inApproval = posts.filter((p) => p.status === "in_approval").length;
  const adjustments = posts.filter((p) => p.status === "adjustment_requested").length;
  const approvedWeek = posts.filter((p) => p.status === "approved" && new Date(p.updated_at).getTime() > weekAgo).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral da produção e aprovações.</p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat icon={Clock} label="Em aprovação" value={inApproval} tone="warning" />
          <Stat icon={AlertTriangle} label="Ajustes pendentes" value={adjustments} tone="destructive" />
          <Stat icon={CheckCircle2} label="Aprovados na semana" value={approvedWeek} tone="success" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Atividade recente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-8" />)}
            {!isLoading && data?.activity.length === 0 && (
              <EmptyState icon={Activity} title="Nenhuma atividade ainda" description="As ações da equipe e dos clientes aparecerão aqui." className="border-0 p-6" />
            )}
            {data?.activity.map((a) => (
              <div key={a.id} className="flex items-center justify-between border-b pb-2 last:border-0 text-sm">
                <span>
                  <span className="font-medium">{a.actor}</span> · {a.action}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Clientes</CardTitle>
            <Link to="/clients" className="text-sm text-primary inline-flex items-center gap-1">Ver todos <ArrowRight className="h-3 w-3" /></Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading && [0, 1].map((i) => <Skeleton key={i} className="h-14" />)}
            {!isLoading && data?.clients.length === 0 && (
              <EmptyState icon={Users} title="Nenhum cliente cadastrado" description="Adicione um cliente para começar." actionLabel="Adicionar cliente" onAction={() => navigate({ to: "/clients" })} className="border-0 p-6" />
            )}
            {data?.clients.map((c) => {
              const pending = posts.filter((p) => p.client_id === c.id && (p.status === "in_approval" || p.status === "adjustment_requested")).length;
              return (
                <Link key={c.id} to="/clients/$id" params={{ id: c.id }} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-primary-foreground" style={{ backgroundColor: c.brand_color ?? "#7c3aed" }}>
                      {c.name.charAt(0)}
                    </span>
                    <span className="text-sm font-medium">{c.name}</span>
                  </div>
                  {pending > 0 && <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs text-warning-foreground">{pending} pendentes</span>}
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: string }) {
  const toneClass = tone === "warning" ? "bg-warning/15 text-warning-foreground" : tone === "destructive" ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success-foreground";
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${toneClass}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-3xl font-extrabold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

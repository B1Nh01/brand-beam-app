import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { type FinancialSettings } from "@/lib/financial";
import { RouteError } from "@/components/route-error";

export const Route = createFileRoute("/_authenticated/settings")({
  component: Settings,
  head: () => ({ meta: [{ title: "Configurações — Stúdio" }] }),
  errorComponent: ({ error, reset }) => <RouteError error={error as Error} reset={reset} />,
});

function Settings() {
  const qc = useQueryClient();
  const { data: ws } = useWorkspace();
  const [name, setName] = useState("");

  const saveName = async () => {
    if (!ws) return;
    await supabase.from("workspaces").update({ name: name || ws.name }).eq("id", ws.id);
    toast.success("Workspace atualizado");
    qc.invalidateQueries({ queryKey: ["workspace"] });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Gerencie seu workspace.</p>
      </div>

      <Tabs defaultValue="workspace">
        <TabsList>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="financial">Financeiro</TabsTrigger>
        </TabsList>

        <TabsContent value="workspace" className="pt-4">
          <Card>
            <CardHeader><CardTitle>Workspace</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do workspace</Label>
                <Input value={name || ws?.name || ""} onChange={(e) => setName(e.target.value)} />
              </div>
              <Button onClick={saveName}>Salvar</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financial" className="pt-4">
          <FinancialSettingsTab workspaceId={ws?.id ?? ""} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FinancialSettingsTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [genDay, setGenDay]     = useState("1");
  const [defCat, setDefCat]     = useState("Mensalidade");
  const [autoGen, setAutoGen]   = useState(true);
  const [loading, setLoading]   = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  const { data: settings } = useQuery<FinancialSettings | null>({
    queryKey: ["financial-settings", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_settings")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      return data as FinancialSettings | null;
    },
  });

  useEffect(() => {
    if (settings) {
      setGenDay(String(settings.revenue_generation_day));
      setDefCat(settings.default_revenue_category);
      setAutoGen(settings.auto_generate_revenues);
      setSettingsId(settings.id);
    }
  }, [settings]);

  const save = async () => {
    const day = Math.max(1, Math.min(28, parseInt(genDay, 10) || 1));
    setLoading(true);
    const payload = {
      workspace_id:             workspaceId,
      revenue_generation_day:   day,
      default_revenue_category: defCat.trim() || "Mensalidade",
      auto_generate_revenues:   autoGen,
    };
    const { error } = settingsId
      ? await supabase.from("financial_settings").update(payload).eq("id", settingsId)
      : await supabase.from("financial_settings").insert(payload);
    setLoading(false);
    if (error) return toast.error("Erro ao salvar configurações");
    toast.success("Configurações financeiras salvas");
    qc.invalidateQueries({ queryKey: ["financial-settings", workspaceId] });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Configurações financeiras</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Dia do mês para geração de receitas (1–28)</Label>
          <Input
            type="number"
            min={1}
            max={28}
            value={genDay}
            onChange={(e) => setGenDay(e.target.value)}
            className="w-28"
          />
          <p className="text-xs text-muted-foreground">
            Data de vencimento padrão das mensalidades geradas automaticamente.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Categoria padrão de receita</Label>
          <Input
            value={defCat}
            onChange={(e) => setDefCat(e.target.value)}
            placeholder="Mensalidade"
            className="w-64"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">Gerar receita ao cadastrar cliente</p>
            <p className="text-xs text-muted-foreground">
              Cria automaticamente a mensalidade do mês atual ao salvar um
              cliente com mensalidade preenchida.
            </p>
          </div>
          <Switch checked={autoGen} onCheckedChange={setAutoGen} />
        </div>

        <Button onClick={save} disabled={loading}>
          {loading ? "Salvando…" : "Salvar configurações"}
        </Button>
      </CardContent>
    </Card>
  );
}

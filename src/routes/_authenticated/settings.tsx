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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog, type ConfirmState } from "@/components/confirm-dialog";
import { Copy, Trash2, UserPlus, Clock } from "lucide-react";
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
  const [me, setMe] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);


  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const isOwner = ws?.owner_id === me;

  const { data: members } = useQuery({
    queryKey: ["members", ws?.id],
    enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_workspace_members", { _workspace_id: ws!.id });
      if (error) { console.error("[members query]", error); return []; }
      return data ?? [];
    },
  });

  const { data: invites } = useQuery({
    queryKey: ["invites", ws?.id],
    enabled: !!ws,
    queryFn: async () => {
      const { data } = await supabase
        .from("workspace_invites")
        .select("*")
        .eq("workspace_id", ws!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const saveName = async () => {
    if (!ws) return;
    await supabase.from("workspaces").update({ name: name || ws.name }).eq("id", ws.id);
    toast.success("Workspace atualizado");
    qc.invalidateQueries({ queryKey: ["workspace"] });
  };

  const removeMember = async (userId: string) => {
    if (!ws) return;
    const { error } = await supabase.rpc("remove_workspace_member", {
      _workspace_id: ws.id,
      _user_id: userId,
    });
    if (error) return toast.error("Não foi possível remover o membro");
    toast.success("Membro removido");
    qc.invalidateQueries({ queryKey: ["members", ws.id] });
  };

  const inviteLink = (token: string) => `${window.location.origin}/invite/${token}`;
  const copyLink = (token: string) => {
    navigator.clipboard.writeText(inviteLink(token));
    toast.success("Link copiado!");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Gerencie seu workspace e equipe.</p>
      </div>

      <Tabs defaultValue="workspace">
        <TabsList>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="team">Equipe</TabsTrigger>
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

        <TabsContent value="team" className="space-y-6 pt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Membros</CardTitle>
              {isOwner && (
                <InviteDialog
                  workspaceId={ws!.id}
                  onCreated={() => qc.invalidateQueries({ queryKey: ["invites", ws!.id] })}
                  inviteLink={inviteLink}
                />
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {members?.map((m) => (
                <div key={m.user_id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                      {m.role === "owner" ? "Dono" : "Membro"}
                    </span>
                    {isOwner && m.role !== "owner" && (
                      <Button variant="ghost" size="icon" onClick={() => setConfirm({
                        title: "Remover membro?",
                        description: `${m.name} perderá o acesso a este workspace. Esta ação não pode ser desfeita, mas você pode convidá-lo novamente depois.`,
                        confirmLabel: "Remover",
                        onConfirm: async () => { await removeMember(m.user_id); },
                      })}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {isOwner && invites && invites.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Convites pendentes</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {invites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{inv.email}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" /> expira {new Date(inv.expires_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => copyLink(inv.token)}>
                      <Copy className="h-3.5 w-3.5" /> Copiar link
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="financial" className="pt-4">
          <FinancialSettingsTab workspaceId={ws?.id ?? ""} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog state={confirm} onOpenChange={(o) => !o && setConfirm(null)} />
    </div>
  );
}

function InviteDialog({
  workspaceId,
  onCreated,
  inviteLink,
}: {
  workspaceId: string;
  onCreated: () => void;
  inviteLink: (token: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase
      .from("workspace_invites")
      .insert({ workspace_id: workspaceId, email })
      .select("token")
      .single();
    setLoading(false);
    if (error || !data) return toast.error("Não foi possível criar o convite");
    setCreatedToken(data.token);
    toast.success("Convite criado");
    onCreated();
  };

  const reset = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setEmail("");
      setCreatedToken(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" /> Convidar membro
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar membro</DialogTitle>
          <DialogDescription>
            {createdToken
              ? "Copie o link abaixo e envie para a pessoa."
              : "Informe o e-mail do novo membro."}
          </DialogDescription>
        </DialogHeader>
        {createdToken ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input readOnly value={inviteLink(createdToken)} />
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(inviteLink(createdToken));
                  toast.success("Link copiado!");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" className="w-full" onClick={() => reset(false)}>
              Fechar
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="pessoa@exemplo.com"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              Gerar convite
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
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

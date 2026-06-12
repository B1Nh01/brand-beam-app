import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  component: Settings,
  head: () => ({ meta: [{ title: "Configurações — Aprova" }] }),
});

function Settings() {
  const qc = useQueryClient();
  const { data: ws } = useWorkspace();
  const [name, setName] = useState("");

  const { data: members } = useQuery({
    queryKey: ["members", ws?.id],
    enabled: !!ws,
    queryFn: async () => {
      const { data } = await supabase.from("workspace_members").select("*").eq("workspace_id", ws!.id);
      return data ?? [];
    },
  });

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
        <p className="text-muted-foreground">Gerencie seu workspace e equipe.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Workspace</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nome do workspace</Label>
            <Input defaultValue={ws?.name} value={name || ws?.name || ""} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button onClick={saveName}>Salvar</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Membros</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {members?.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
              <span className="font-mono text-xs">{m.user_id.slice(0, 8)}…</span>
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">{m.role === "owner" ? "Dono" : "Membro"}</span>
            </div>
          ))}
          <p className="pt-2 text-xs text-muted-foreground">Convite de membros por e-mail estará disponível em breve.</p>
        </CardContent>
      </Card>
    </div>
  );
}

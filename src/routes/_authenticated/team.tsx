import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { useRole } from "@/hooks/use-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { RouteError } from "@/components/route-error";

export const Route = createFileRoute("/_authenticated/team")({
  component: Team,
  head: () => ({ meta: [{ title: "Equipe — Stúdio" }] }),
  errorComponent: ({ error, reset }) => <RouteError error={error as Error} reset={reset} />,
});

function Team() {
  const qc = useQueryClient();
  const { data: ws } = useWorkspace();
  const isOwner = useRole() === "owner";
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

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
        <h1 className="text-2xl font-extrabold tracking-tight">Equipe</h1>
        <p className="text-muted-foreground">Gerencie os membros do seu workspace.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Membros</CardTitle>
          {isOwner && ws && (
            <InviteDialog
              workspaceId={ws.id}
              onCreated={() => qc.invalidateQueries({ queryKey: ["invites", ws.id] })}
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

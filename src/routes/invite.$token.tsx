import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
  head: () => ({ meta: [{ title: "Convite — Aprova" }] }),
});

type State =
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "needs-auth"; workspace: string; email: string }
  | { kind: "accepting" };

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: inviteRows, error } = await supabase.rpc("get_invite", { _token: token });
      const invite = inviteRows?.[0];
      if (!active) return;
      if (error || !invite) {
        setState({ kind: "invalid", message: "Convite não encontrado." });
        return;
      }
      if (invite.status === "accepted") {
        setState({ kind: "invalid", message: "Este convite já foi utilizado." });
        return;
      }
      if (invite.status === "expired") {
        setState({ kind: "invalid", message: "Este convite expirou." });
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!active) return;
      if (!userData.user) {
        localStorage.setItem("pending_invite", token);
        setState({ kind: "needs-auth", workspace: invite.workspace_name, email: invite.email });
        return;
      }

      setState({ kind: "accepting" });
      const { error: acceptErr } = await supabase.rpc("accept_invite", { _token: token });
      if (!active) return;
      if (acceptErr) {
        const msg = acceptErr.message?.includes("email_mismatch")
          ? "Este convite foi enviado para outro e-mail. Entre com o e-mail correto."
          : "Não foi possível aceitar o convite.";
        setState({ kind: "invalid", message: msg });
        return;
      }
      localStorage.removeItem("pending_invite");
      toast.success("Você entrou no workspace!");
      navigate({ to: "/dashboard" });
    })();
    return () => {
      active = false;
    };
  }, [token, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">Aprova</h1>
        </div>
        <Card>
          {state.kind === "loading" || state.kind === "accepting" ? (
            <CardContent className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Processando convite…
            </CardContent>
          ) : state.kind === "invalid" ? (
            <>
              <CardHeader>
                <CardTitle>Convite inválido</CardTitle>
                <CardDescription>{state.message}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full">
                  <Link to="/auth">Voltar</Link>
                </Button>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Você foi convidado!</CardTitle>
                <CardDescription>
                  Entre ou crie uma conta para participar de <strong>{state.workspace}</strong>.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-muted-foreground">
                  Convite enviado para <strong>{state.email}</strong>. Após entrar, você será adicionado
                  automaticamente.
                </p>
                <Button asChild className="w-full">
                  <Link to="/auth">Entrar ou criar conta</Link>
                </Button>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

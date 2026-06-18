import { useRouter } from "@tanstack/react-router";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

type Props = {
  error: Error;
  reset: () => void;
  /** If true, renders without AppShell (for pre-auth pages) */
  fullPage?: boolean;
};

export function RouteError({ error, reset, fullPage }: Props) {
  const router = useRouter();

  useEffect(() => {
    console.error("[RouteError boundary]", {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    });
  }, [error]);

  const inner = (
    <div className="flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">Algo deu errado nesta página</h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-xs mx-auto">
          {error?.message || "Ocorreu um erro inesperado. Tente novamente."}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          <RefreshCw className="h-4 w-4" /> Tentar novamente
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a href="/dashboard">
            <Home className="h-4 w-4" /> Dashboard
          </a>
        </Button>
      </div>
    </div>
  );

  if (fullPage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        {inner}
      </div>
    );
  }

  return inner;
}

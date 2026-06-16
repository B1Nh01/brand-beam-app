import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { PostDialog } from "@/components/post-dialog";
import { LayoutGrid } from "lucide-react";
import { STATUS_LABELS, STATUS_ORDER, type Post, type Client } from "@/lib/content";

export const Route = createFileRoute("/_authenticated/content")({
  component: ContentBoard,
  head: () => ({ meta: [{ title: "Visão central — Stúdio" }] }),
});

function ContentBoard() {
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [client, setClient] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["content-board"],
    queryFn: async () => {
      const [posts, clients] = await Promise.all([
        supabase.from("posts").select("*").order("scheduled_date"),
        supabase.from("clients").select("*"),
      ]);
      return { posts: (posts.data ?? []) as Post[], clients: (clients.data ?? []) as Client[] };
    },
  });

  const posts = (data?.posts ?? []).filter((p) => client === "all" || p.client_id === client);
  const clientName = (id: string) => data?.clients.find((c) => c.id === id)?.name ?? "";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Visão central</h1>
          <p className="text-muted-foreground">Todos os posts de todos os clientes.</p>
        </div>
        <Select value={client} onValueChange={setClient}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os clientes</SelectItem>
            {data?.clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {STATUS_ORDER.map((s) => <Skeleton key={s} className="h-24" />)}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="Nenhum post por aqui"
          description="Crie posts no espaço de cada cliente para acompanhá-los neste quadro."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {STATUS_ORDER.map((status) => (
            <div key={status} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">{STATUS_LABELS[status]}</p>
                <span className="text-xs text-muted-foreground">{posts.filter((p) => p.status === status).length}</span>
              </div>
              <div className="space-y-2">
                {posts.filter((p) => p.status === status).map((p) => (
                  <Card key={p.id} className="cursor-pointer hover:bg-accent" onClick={() => setOpenPost(p.id)}>
                    <CardContent className="space-y-1 p-3">
                      <p className="text-sm font-medium leading-snug">{p.title}</p>
                      <p className="text-xs text-muted-foreground">{clientName(p.client_id)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {openPost && <PostDialog postId={openPost} onClose={() => setOpenPost(null)} />}
    </div>
  );
}

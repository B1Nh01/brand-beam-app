import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { PostDialog } from "@/components/post-dialog";
import { Plus } from "lucide-react";
import { STATUS_LABELS, STATUS_ORDER, FORMAT_LABELS, type Post, type Client } from "@/lib/content";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  component: ClientSpace,
});

function ClientSpace() {
  const { id } = Route.useParams();
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [newPost, setNewPost] = useState<{ clientId: string; workspaceId: string; date?: string } | null>(null);

  const { data } = useQuery({
    queryKey: ["posts", id],
    queryFn: async () => {
      const [client, posts] = await Promise.all([
        supabase.from("clients").select("*").eq("id", id).single(),
        supabase.from("posts").select("*").eq("client_id", id).order("scheduled_date"),
      ]);
      return { client: client.data as Client, posts: (posts.data ?? []) as Post[] };
    },
  });

  const client = data?.client;
  const posts = data?.posts ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {client && <span className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-primary-foreground" style={{ backgroundColor: client.brand_color ?? "#7c3aed" }}>{client.name.charAt(0)}</span>}
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{client?.name}</h1>
            <p className="text-muted-foreground">{client?.instagram_handle}</p>
          </div>
        </div>
        {client && <Button onClick={() => setNewPost({ clientId: client.id, workspaceId: client.workspace_id })}><Plus className="h-4 w-4" /> Novo post</Button>}
      </div>

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">Calendário</TabsTrigger>
          <TabsTrigger value="feed">Feed Preview</TabsTrigger>
          <TabsTrigger value="content">Conteúdos</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="pt-4">
          <CalendarView posts={posts} onOpen={setOpenPost} onNew={(d) => client && setNewPost({ clientId: client.id, workspaceId: client.workspace_id, date: d })} />
        </TabsContent>

        <TabsContent value="feed" className="pt-4">
          <FeedPreview posts={posts} clientId={id} onOpen={setOpenPost} />
        </TabsContent>

        <TabsContent value="content" className="pt-4">
          <div className="grid gap-3">
            {posts.map((p) => (
              <Card key={p.id} className="cursor-pointer hover:bg-accent" onClick={() => setOpenPost(p.id)}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{FORMAT_LABELS[p.format]} · {p.scheduled_date ?? "Sem data"}</p>
                  </div>
                  <StatusBadge status={p.status} flowStage={p.flow_stage} approvalMode={p.approval_mode} />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {(openPost || newPost) && <PostDialog postId={openPost} newForClient={newPost} onClose={() => { setOpenPost(null); setNewPost(null); }} />}
    </div>
  );
}

function CalendarView({ posts, onOpen, onNew }: { posts: Post[]; onOpen: (id: string) => void; onNew: (date: string) => void }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startDay).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const iso = (d: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="mb-3 font-semibold capitalize">{now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => (
          <div key={i} className="group min-h-20 rounded-md border p-1 text-xs">
            {d && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{d}</span>
                  <button onClick={() => onNew(iso(d))} className="opacity-0 transition group-hover:opacity-100"><Plus className="h-3 w-3" /></button>
                </div>
                <div className="mt-1 space-y-1">
                  {posts.filter((p) => p.scheduled_date === iso(d)).map((p) => (
                    <button key={p.id} onClick={() => onOpen(p.id)} className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px]">
                      <StatusBadge status={p.status} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedPreview({ posts, clientId, onOpen }: { posts: Post[]; clientId: string; onOpen: (id: string) => void }) {
  const { data: covers } = useQuery({
    queryKey: ["feed-covers", clientId],
    queryFn: async () => {
      const { data } = await supabase.from("post_media").select("*").in("post_id", posts.map((p) => p.id)).order("sort_order");
      const map: Record<string, string> = {};
      for (const m of data ?? []) {
        if (!map[m.post_id]) {
          const { data: s } = await supabase.storage.from("post-media").createSignedUrl(m.storage_path, 3600);
          if (s?.signedUrl) map[m.post_id] = s.signedUrl;
        }
      }
      return map;
    },
    enabled: posts.length > 0,
  });

  const ordered = [...posts].sort((a, b) => a.position - b.position);
  return (
    <div className="mx-auto max-w-md rounded-xl border bg-card p-2">
      <div className="grid grid-cols-3 gap-1">
        {ordered.map((p) => (
          <button key={p.id} onClick={() => onOpen(p.id)} className="relative aspect-square overflow-hidden rounded bg-muted" style={{ backgroundColor: covers?.[p.id] ? undefined : "var(--muted)" }}>
            {covers?.[p.id] ? <img src={covers[p.id]} alt={p.title} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center p-1 text-center text-[10px] text-muted-foreground">{p.title}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

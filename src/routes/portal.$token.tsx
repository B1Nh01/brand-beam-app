import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { FLOW_LABELS, type Post, type PostComment } from "@/lib/content";
import { Check, Pencil, Send, Sparkles, CheckCircle2, PencilLine, Inbox, PartyPopper, Layers, FileText, Download } from "lucide-react";
import { type BrandModule, type BrandFile, type BrandFolder, MODULE_META, MODULE_ORDER, formatFileSize } from "@/lib/brand-core";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/$token")({
  component: Portal,
  head: () => ({ meta: [{ title: "Portal do cliente — Aprova" }] }),
});

function Portal() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const [openPost, setOpenPost] = useState<Post | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["portal", token],
    queryFn: async () => {
      const [client, posts, brandModules, brandFolders, brandFiles] = await Promise.all([
        supabase.rpc("portal_get_client", { _token: token }),
        supabase.rpc("portal_get_posts", { _token: token }),
        supabase.rpc("portal_get_brand_modules", { _token: token }),
        supabase.rpc("portal_get_brand_folders", { _token: token }),
        supabase.rpc("portal_get_brand_files", { _token: token }),
      ]);
      return {
        client: client.data?.[0] ?? null,
        posts: (posts.data ?? []) as Post[],
        brandModules: (brandModules.data ?? []) as BrandModule[],
        brandFolders: (brandFolders.data ?? []) as BrandFolder[],
        brandFiles: (brandFiles.data ?? []) as BrandFile[],
      };
    },
  });

  if (isLoading)
    return (
      <div className="min-h-screen bg-gradient-to-br from-accent via-background to-secondary">
        <div className="mx-auto max-w-3xl space-y-4 p-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  if (!data?.client)
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-muted-foreground">
        Link inválido ou desativado.
      </div>
    );

  const client = data.client;
  const posts = data.posts;
  const brandModules = data.brandModules ?? [];
  const brandFolders = data.brandFolders ?? [];
  const brandFiles = data.brandFiles ?? [];
  const hasBrandCore = brandModules.length > 0 || brandFiles.length > 0;
  const pending = posts.filter((p) => p.status === "in_approval" || p.status === "adjustment_requested");

  return (
    <div className="min-h-screen bg-gradient-to-br from-accent via-background to-secondary">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-primary-foreground" style={{ backgroundColor: client.brand_color ?? "#7c3aed" }}>{client.name.charAt(0)}</span>
          <div className="min-w-0">
            <p className="truncate font-extrabold">{client.name}</p>
            <p className="truncate text-xs text-muted-foreground">{client.instagram_handle}</p>
          </div>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Sparkles className="h-3 w-3" /> Aprova</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 p-4">
        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-10 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Inbox className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="font-semibold">Nenhum post para revisar ainda</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">Assim que a equipe enviar conteúdos, eles aparecerão aqui para sua aprovação.</p>
          </div>
        ) : (
          <>
            <section>
              <h2 className="mb-2 font-semibold">Aguardando você ({pending.length})</h2>
              <div className="space-y-2">
                {pending.length === 0 && (
                  <div className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                    <PartyPopper className="h-4 w-4 text-primary" /> Tudo aprovado por aqui!
                  </div>
                )}
                {pending.map((p) => (
                  <Card key={p.id} className="cursor-pointer hover:bg-accent" onClick={() => setOpenPost(p)}>
                    <CardContent className="flex items-center justify-between gap-2 p-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{p.scheduled_date}</p>
                      </div>
                      <StatusBadge status={p.status} flowStage={p.flow_stage} approvalMode={p.approval_mode} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <section>
              <h2 className="mb-2 font-semibold">Todos os posts</h2>
              <div className="grid gap-2">
                {posts.map((p) => (
                  <button key={p.id} onClick={() => setOpenPost(p)} className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3 text-left hover:bg-accent">
                    <span className="min-w-0 truncate text-sm font-medium">{p.title}</span>
                    <StatusBadge status={p.status} flowStage={p.flow_stage} approvalMode={p.approval_mode} />
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      {hasBrandCore && (
        <PortalBrandCore
          token={token}
          modules={brandModules}
          folders={brandFolders}
          files={brandFiles}
        />
      )}

      {openPost && (
        <PortalPostDialog
          token={token}
          post={openPost}
          onClose={() => setOpenPost(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: ["portal", token] })}
        />
      )}
    </div>
  );
}

function PortalPostDialog({ token, post, onClose, onChanged }: { token: string; post: Post; onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(() => (typeof localStorage !== "undefined" ? localStorage.getItem("portal_name") ?? "" : ""));
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<null | "adjust">(null);
  const [result, setResult] = useState<null | "approved" | "adjusted">(null);

  const { data: media } = useQuery({
    queryKey: ["portal-media", token, post.id],
    queryFn: async () => {
      const { data } = await supabase.rpc("portal_get_media", { _token: token });
      const all = (data ?? []).filter((m: any) => m.post_id === post.id);
      return all;
    },
  });
  const { data: comments } = useQuery({
    queryKey: ["portal-comments", token, post.id],
    queryFn: async () => {
      const { data } = await supabase.rpc("portal_get_comments", { _token: token, _post_id: post.id });
      return (data ?? []) as PostComment[];
    },
  });

  const ensureName = () => {
    if (!name.trim()) { toast.error("Informe seu nome primeiro"); return false; }
    localStorage.setItem("portal_name", name);
    return true;
  };

  const approve = async () => {
    if (!ensureName()) return;
    const { error } = await supabase.rpc("portal_approve", { _token: token, _post_id: post.id, _author_name: name });
    if (error) return toast.error("Não foi possível aprovar");
    toast.success("Post aprovado!");
    onChanged();
    setResult("approved");
  };
  const requestAdjust = async () => {
    if (!ensureName()) return;
    if (!body.trim()) return toast.error("Descreva o ajuste");
    const { error } = await supabase.rpc("portal_request_adjustment", { _token: token, _post_id: post.id, _author_name: name, _body: body });
    if (error) return toast.error("Não foi possível enviar");
    toast.success("Ajuste solicitado");
    onChanged();
    setResult("adjusted");
  };
  const sendComment = async () => {
    if (!ensureName() || !body.trim()) return;
    await supabase.rpc("portal_add_comment", { _token: token, _post_id: post.id, _author_name: name, _body: body });
    setBody(""); qc.invalidateQueries({ queryKey: ["portal-comments", token, post.id] });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        {result ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <div className={`flex h-16 w-16 items-center justify-center rounded-full ${result === "approved" ? "bg-success/15 text-success-foreground" : "bg-warning/15 text-warning-foreground"}`}>
              {result === "approved" ? <CheckCircle2 className="h-8 w-8" /> : <PencilLine className="h-8 w-8" />}
            </div>
            <h3 className="text-lg font-bold">
              {result === "approved" ? "✅ Post aprovado!" : "✏️ Ajuste solicitado!"}
            </h3>
            <p className="max-w-xs text-sm text-muted-foreground">
              {result === "approved"
                ? "A equipe foi notificada e seguirá com a produção."
                : "Enviamos seu pedido para a equipe. Aguarde o retorno com a nova versão."}
            </p>
            <Button className="mt-2 w-full" onClick={onClose}>Voltar aos posts</Button>
          </div>
        ) : (
        <>
        <DialogHeader><DialogTitle className="flex items-center gap-2">{post.title} <StatusBadge status={post.status} flowStage={post.flow_stage} approvalMode={post.approval_mode} /></DialogTitle></DialogHeader>
        <div className="space-y-4">
          {post.approval_mode === "flow" && post.status !== "approved" && (
            <div className="rounded-lg bg-accent p-3 text-sm">Etapa em aprovação: <strong>{FLOW_LABELS[post.flow_stage]}</strong></div>
          )}
          {media && media.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {media.map((m: any) => <PortalMedia key={m.id} path={m.storage_path} type={m.type} />)}
            </div>
          )}
          {post.caption && <p className="whitespace-pre-wrap rounded-lg border p-3 text-sm">{post.caption}</p>}

          <div className="space-y-2">
            <Input placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="max-h-40 space-y-2 overflow-auto">
              {comments?.map((c) => (
                <div key={c.id} className={`rounded-lg p-2 text-sm ${c.author_type === "team" ? "bg-primary/10" : "bg-muted"}`}>
                  <p className="text-xs font-semibold">{c.author_type === "team" ? "Equipe" : c.author_name}</p>{c.body}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input placeholder={mode === "adjust" ? "Descreva o ajuste…" : "Comentar…"} value={body} onChange={(e) => setBody(e.target.value)} />
              <Button size="icon" variant="secondary" onClick={sendComment}><Send className="h-4 w-4" /></Button>
            </div>
          </div>

          {(post.status === "in_approval" || post.status === "adjustment_requested") && (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={approve}><Check className="h-4 w-4" /> Aprovar</Button>
              {mode === "adjust" ? (
                <Button className="flex-1" variant="destructive" onClick={requestAdjust}>Enviar ajuste</Button>
              ) : (
                <Button className="flex-1" variant="outline" onClick={() => setMode("adjust")}><Pencil className="h-4 w-4" /> Solicitar ajuste</Button>
              )}
            </div>
          )}
        </div>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PortalMedia({ path, type }: { path: string; type: string }) {
  const { data } = useQuery({
    queryKey: ["signed", path],
    queryFn: async () => {
      const { data } = await supabase.storage.from("post-media").createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    },
  });
  if (!data) return <div className="aspect-square rounded bg-muted" />;
  return type === "video" ? <video src={data} controls className="aspect-square w-full rounded object-cover" /> : <img src={data} alt="mídia" className="aspect-square w-full rounded object-cover" />;
}

// ── Brand Core (portal read-only) ─────────────────────────────────────────────

function PortalBrandCore({ token, modules, folders, files }: {
  token: string;
  modules: BrandModule[];
  folders: BrandFolder[];
  files: BrandFile[];
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Documentos da Marca</h2>
      </div>

      {modules.length > 0 && (
        <div className="space-y-3">
          {MODULE_ORDER.filter((t) => modules.some((m) => m.type === t)).map((type) => {
            const mod = modules.find((m) => m.type === type)!;
            return <PortalModuleCard key={type} mod={mod} />;
          })}
        </div>
      )}

      {files.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="px-4 py-3 border-b">
            <p className="text-sm font-semibold">Arquivos</p>
          </div>
          <div className="divide-y">
            {folders.map((folder) => {
              const folderFiles = files.filter((f) => f.folder_id === folder.id);
              if (folderFiles.length === 0) return null;
              return (
                <div key={folder.id}>
                  <div className="px-4 py-2 bg-muted/30">
                    <p className="text-xs font-medium text-muted-foreground">{folder.name}</p>
                  </div>
                  {folderFiles.map((file) => (
                    <PortalFileRow key={file.id} file={file} />
                  ))}
                </div>
              );
            })}
            {files.filter((f) => f.folder_id === null).map((file) => (
              <PortalFileRow key={file.id} file={file} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function PortalModuleCard({ mod }: { mod: BrandModule }) {
  const meta = MODULE_META[mod.type];
  const c = mod.content as Record<string, unknown>;

  const renderFields = () => {
    if (mod.type === "diagnosis") {
      const rows = [
        ["Segmento", c.segmento], ["Tempo no mercado", c.tempo_mercado],
        ["Tom de voz", c.tom_voz], ["Diferenciais", c.diferenciais],
        ["Desafios", c.desafios], ["Objetivos nas redes", c.objetivos_redes],
        ["Referências visuais", c.referencias_visuais], ["Palavras a evitar", c.palavras_proibidas],
      ].filter(([, v]) => v);
      return rows.map(([label, value]) => (
        <div key={label as string}>
          <p className="text-xs font-semibold text-muted-foreground mb-0.5">{label as string}</p>
          <p className="text-sm whitespace-pre-wrap">{value as string}</p>
        </div>
      ));
    }
    if (mod.type === "positioning") {
      const rows = [
        ["Proposta de valor", c.proposta_valor], ["Missão", c.missao],
        ["Visão", c.visao], ["Valores", c.valores],
        ["Arquétipo", c.arquetipo], ["Mensagem central", c.mensagem_central],
        ["Hashtags", c.hashtags],
      ].filter(([, v]) => v);
      return rows.map(([label, value]) => (
        <div key={label as string}>
          <p className="text-xs font-semibold text-muted-foreground mb-0.5">{label as string}</p>
          <p className="text-sm whitespace-pre-wrap">{value as string}</p>
        </div>
      ));
    }
    if (mod.type === "persona") {
      return (c.personas as Record<string, string>[] ?? []).map((p, i) => (
        <div key={i} className="rounded-lg border p-3 space-y-1">
          <p className="font-semibold text-sm">{p.nome || `Persona ${i + 1}`}</p>
          {p.profissao && <p className="text-xs text-muted-foreground">{p.profissao} · {p.idade}</p>}
          {p.dores && <p className="text-xs"><strong>Dores:</strong> {p.dores}</p>}
          {p.desejos && <p className="text-xs"><strong>Desejos:</strong> {p.desejos}</p>}
        </div>
      ));
    }
    if (mod.type === "competitors") {
      return (c.competitors as Record<string, string>[] ?? []).map((comp, i) => (
        <div key={i} className="rounded-lg border p-3 space-y-1">
          <p className="font-semibold text-sm">{comp.nome || `Concorrente ${i + 1}`}</p>
          {comp.instagram && <p className="text-xs text-muted-foreground">{comp.instagram}</p>}
          {comp.pontos_fortes && <p className="text-xs"><strong>Pontos fortes:</strong> {comp.pontos_fortes}</p>}
          {comp.diferencial_nosso && <p className="text-xs"><strong>Nosso diferencial:</strong> {comp.diferencial_nosso}</p>}
        </div>
      ));
    }
    if (mod.type === "product_ladder") {
      return (c.products as Record<string, string>[] ?? []).map((prod, i) => (
        <div key={i} className="rounded-lg border p-3 space-y-0.5">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm flex-1">{prod.nome || `Produto ${i + 1}`}</p>
            {prod.tipo && <span className="text-[10px] bg-muted rounded px-1.5 py-0.5">{prod.tipo}</span>}
            {prod.preco && <span className="text-xs font-medium text-primary">{prod.preco}</span>}
          </div>
          {prod.descricao && <p className="text-xs text-muted-foreground">{prod.descricao}</p>}
        </div>
      ));
    }
    return null;
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <p className="font-semibold text-sm">{meta.title}</p>
      <div className="space-y-3">{renderFields()}</div>
    </div>
  );
}

function PortalFileRow({ file }: { file: BrandFile }) {
  const download = async () => {
    const { data } = await supabase.storage
      .from("brand-files")
      .createSignedUrl(file.storage_path, 3600, { download: file.name });
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const isImage = file.mime_type.startsWith("image/");

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30">
      {isImage
        ? <PortalImagePreview path={file.storage_path} />
        : <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      }
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{file.name}</p>
        <p className="text-[10px] text-muted-foreground">{formatFileSize(file.size_bytes)}</p>
      </div>
      <button
        onClick={download}
        className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
      >
        <Download className="h-3 w-3" /> Baixar
      </button>
    </div>
  );
}

function PortalImagePreview({ path }: { path: string }) {
  const { data: url } = useQuery({
    queryKey: ["brand-preview-portal", path],
    queryFn: async () => {
      const { data } = await supabase.storage.from("brand-files").createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    },
    staleTime: 55 * 60 * 1000,
  });
  if (!url) return <FileText className="h-4 w-4 text-muted-foreground shrink-0" />;
  return <img src={url} alt="" className="h-8 w-8 rounded object-cover shrink-0 border" />;
}

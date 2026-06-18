import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { type Client } from "@/lib/content";
import { cn } from "@/lib/utils";
import { useRole } from "@/hooks/use-role";

type Props = {
  workspaceId: string;
  client?: Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export function ClientFormDialog({ workspaceId, client, open, onOpenChange, onSaved }: Props) {
  const qc = useQueryClient();
  const isEdit = !!client;
  const role = useRole();
  const isOwner = role === "owner";

  const [name, setName] = useState(client?.name ?? "");
  const [ig, setIg] = useState(client?.instagram_handle ?? "");
  const [description, setDescription] = useState(client?.description ?? "");
  const [feeStr, setFeeStr] = useState(
    client?.monthly_fee != null
      ? Number(client.monthly_fee).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "0,00",
  );

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(client?.avatar_url ?? null);
  const [coverPreview, setCoverPreview] = useState<string | null>(client?.cover_url ?? null);
  const [saving, setSaving] = useState(false);

  const avatarRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const handleFeeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "");
    const num = digits ? parseInt(digits, 10) / 100 : 0;
    setFeeStr(num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  };

  const pick = (file: File | null, kind: "avatar" | "cover") => {
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) return toast.error("Use uma imagem JPG, PNG, WEBP ou GIF");
    if (file.size > 5 * 1024 * 1024) return toast.error("Imagem muito grande (máx. 5MB)");
    const url = URL.createObjectURL(file);
    if (kind === "avatar") { setAvatarFile(file); setAvatarPreview(url); }
    else { setCoverFile(file); setCoverPreview(url); }
  };

  const uploadImage = async (file: File, clientId: string, kind: "avatar" | "cover") => {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${workspaceId}/${clientId}/${kind}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("client-media").upload(path, file, { upsert: true });
    if (error) throw error;
    return path;
  };

  const save = async () => {
    if (!name.trim()) return toast.error("Informe o nome do cliente");
    setSaving(true);
    try {
      const fee = parseFloat(feeStr.replace(/\./g, "").replace(",", ".")) || 0;
      let clientId = client?.id;

      if (!isEdit) {
        const { data: created, error } = await supabase
          .from("clients")
          .insert({
            workspace_id: workspaceId,
            name: name.trim(),
            instagram_handle: ig || null,
            description: description || null,
            monthly_fee: fee || null,
          })
          .select()
          .single();
        if (error) throw error;
        clientId = created.id;
      }

      const updates: Partial<Client> = {
        name: name.trim(),
        instagram_handle: ig || null,
        description: description || null,
        monthly_fee: fee || null,
      };

      if (avatarFile && clientId) updates.avatar_url = await uploadImage(avatarFile, clientId, "avatar");
      if (coverFile && clientId) updates.cover_url = await uploadImage(coverFile, clientId, "cover");

      const { error: upErr } = await supabase.from("clients").update(updates).eq("id", clientId!);
      if (upErr) throw upErr;

      if (!isEdit && fee > 0) {
        await supabase.rpc("generate_monthly_revenues", { _workspace_id: workspaceId });
      }

      toast.success(isEdit ? "Cliente atualizado" : "Cliente criado");
      qc.invalidateQueries({ queryKey: ["clients-page"] });
      qc.invalidateQueries({ queryKey: ["posts", clientId] });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar cliente");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle>{isEdit ? "Editar cliente" : "Novo cliente"}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto">
          {/* Cover + avatar */}
          <div className="relative">
            <button
              type="button"
              onClick={() => coverRef.current?.click()}
              className={cn(
                "group relative flex h-28 w-full items-center justify-center overflow-hidden bg-muted",
                "border-b",
              )}
            >
              {coverPreview ? (
                <img src={coverPreview} alt="Capa" className="h-full w-full object-cover" />
              ) : null}
              <span className="absolute inset-0 flex items-center justify-center gap-2 bg-foreground/30 text-xs font-medium text-background opacity-0 transition group-hover:opacity-100">
                <ImagePlus className="h-4 w-4" /> Alterar capa
              </span>
              {!coverPreview && (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ImagePlus className="h-4 w-4" /> Adicionar capa de fundo
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => avatarRef.current?.click()}
              className="group absolute -bottom-7 left-5 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-muted shadow"
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="Foto" className="h-full w-full object-cover" />
              ) : (
                <Camera className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-foreground/40 opacity-0 transition group-hover:opacity-100">
                <Camera className="h-4 w-4 text-background" />
              </span>
            </button>
          </div>

          <input ref={avatarRef} type="file" accept={ACCEPT} className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? null, "avatar")} />
          <input ref={coverRef} type="file" accept={ACCEPT} className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? null, "cover")} />

          <div className="space-y-4 px-5 pb-5 pt-10">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do cliente" />
            </div>
            <div className="space-y-2">
              <Label>Instagram</Label>
              <Input value={ig} onChange={(e) => setIg(e.target.value)} placeholder="@cliente" />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Sobre o cliente, observações, contexto…"
              />
            </div>
            {isOwner && (
              <div className="space-y-2">
                <Label>Mensalidade (R$)</Label>
                <Input value={feeStr} onChange={handleFeeChange} inputMode="numeric" placeholder="0,00" />
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

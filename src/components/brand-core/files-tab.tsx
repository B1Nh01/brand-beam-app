import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog, type ConfirmState } from "@/components/confirm-dialog";
import {
  FolderOpen, Folder, FileText, FileImage, FileVideo, FileArchive, File,
  ChevronDown, ChevronRight, Plus, Upload, Download, Trash2, Pencil, Eye, EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  type BrandFile, type BrandFolder,
  ALLOWED_BRAND_MIME, MAX_BRAND_FILE_BYTES, formatFileSize,
} from "@/lib/brand-core";

type Props = { clientId: string; workspaceId: string };

function mimeIcon(mime: string) {
  if (mime.startsWith("image/")) return FileImage;
  if (mime.startsWith("video/")) return FileVideo;
  if (mime.includes("pdf") || mime.includes("word") || mime.includes("sheet") || mime.includes("presentation")) return FileText;
  if (mime.includes("zip")) return FileArchive;
  return File;
}

export function FilesTab({ clientId, workspaceId }: Props) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<{ id: string; name: string } | null>(null);
  const [renamingFile, setRenamingFile] = useState<{ id: string; name: string } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const { data: folders = [] } = useQuery<BrandFolder[]>({
    queryKey: ["brand-folders", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from("brand_folders").select("*").eq("client_id", clientId).order("name");
      if (error) throw error;
      return (data ?? []) as BrandFolder[];
    },
  });

  const { data: files = [] } = useQuery<BrandFile[]>({
    queryKey: ["brand-files", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from("brand_files").select("*").eq("client_id", clientId).order("name");
      if (error) throw error;
      return (data ?? []) as BrandFile[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["brand-folders", clientId] });
    qc.invalidateQueries({ queryKey: ["brand-files", clientId] });
  };

  const toggleExpand = (id: string) => setExpanded((prev) => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  // ── Folder CRUD ──────────────────────────────────────────────────────────────

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    const { error } = await supabase.from("brand_folders").insert({
      workspace_id: workspaceId, client_id: clientId, name: newFolderName.trim(),
    });
    if (error) return toast.error(error.message);
    setNewFolderName(""); setShowNewFolder(false);
    invalidate(); toast.success("Pasta criada");
  };

  const renameFolder = async (id: string, name: string) => {
    if (!name.trim()) return;
    const { error } = await supabase.from("brand_folders").update({ name: name.trim() }).eq("id", id);
    if (error) return toast.error(error.message);
    setRenamingFolder(null); invalidate();
  };

  const deleteFolder = (folder: BrandFolder) => {
    const fileCount = files.filter((f) => f.folder_id === folder.id).length;
    setConfirm({
      title: `Excluir pasta "${folder.name}"?`,
      description: fileCount > 0
        ? `Esta pasta contém ${fileCount} arquivo(s). Os arquivos serão movidos para a raiz e permanecerão no storage.`
        : "A pasta será removida permanentemente.",
      confirmLabel: "Excluir pasta",
      onConfirm: async () => {
        await supabase.from("brand_folders").delete().eq("id", folder.id);
        invalidate();
      },
    });
  };

  const toggleFolderPortal = async (folder: BrandFolder) => {
    await supabase.from("brand_folders").update({ visible_in_portal: !folder.visible_in_portal }).eq("id", folder.id);
    invalidate();
  };

  // ── File CRUD ────────────────────────────────────────────────────────────────

  const uploadFiles = async (fileList: FileList | null, folderId: string | null) => {
    if (!fileList) return;
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const ext = ALLOWED_BRAND_MIME[file.type];
      if (!ext) { toast.error(`Tipo não permitido: ${file.name}`); continue; }
      if (file.size > MAX_BRAND_FILE_BYTES) { toast.error(`Arquivo muito grande (máx 100 MB): ${file.name}`); continue; }
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const path = `${workspaceId}/${clientId}/${safeName}`;
      const { error: upErr } = await supabase.storage.from("brand-files").upload(path, file, { contentType: file.type });
      if (upErr) { toast.error(upErr.message); continue; }
      const { error: dbErr } = await supabase.from("brand_files").insert({
        workspace_id: workspaceId, client_id: clientId, folder_id: folderId,
        name: file.name, storage_path: path, mime_type: file.type,
        size_bytes: file.size, uploaded_by: currentUserId,
      });
      if (dbErr) { toast.error(dbErr.message); continue; }
    }
    invalidate(); toast.success("Upload concluído");
  };

  const renameFile = async (id: string, name: string) => {
    if (!name.trim()) return;
    const { error } = await supabase.from("brand_files").update({ name: name.trim() }).eq("id", id);
    if (error) return toast.error(error.message);
    setRenamingFile(null); invalidate();
  };

  const deleteFile = (file: BrandFile) => {
    setConfirm({
      title: `Excluir "${file.name}"?`,
      description: "O arquivo será removido do storage e não poderá ser recuperado.",
      confirmLabel: "Excluir arquivo",
      onConfirm: async () => {
        await supabase.storage.from("brand-files").remove([file.storage_path]);
        await supabase.from("brand_files").delete().eq("id", file.id);
        invalidate();
      },
    });
  };

  const downloadFile = async (file: BrandFile) => {
    const { data, error } = await supabase.storage
      .from("brand-files")
      .createSignedUrl(file.storage_path, 3600, { download: file.name });
    if (error || !data?.signedUrl) return toast.error("Não foi possível gerar o link de download");
    window.open(data.signedUrl, "_blank");
  };

  const toggleFilePortal = async (file: BrandFile) => {
    const next = !file.visible_in_portal;
    const { error } = await supabase.from("brand_files").update({ visible_in_portal: next }).eq("id", file.id);
    if (error) return toast.error(error.message);
    if (next) {
      await supabase.from("activity_log").insert({
        workspace_id: workspaceId, client_id: clientId,
        action: `Brand Core: arquivo "${file.name}" tornado visível no portal`,
        actor: "Equipe",
      });
      const folder = folders.find((fo) => fo.id === file.folder_id);
      if (folder && !folder.visible_in_portal) {
        toast.info(`Atenção: a pasta "${folder.name}" precisa estar visível para o arquivo aparecer no portal.`);
      }
    }
    invalidate();
  };

  const rootFiles = files.filter((f) => f.folder_id === null);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowNewFolder((v) => !v)}>
          <Plus className="h-3.5 w-3.5" /> Nova pasta
        </Button>
        <UploadButton onFiles={(fl) => uploadFiles(fl, null)} label="Upload na raiz" />
      </div>

      {showNewFolder && (
        <div className="flex gap-2">
          <Input
            autoFocus
            placeholder="Nome da pasta…"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createFolder()}
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={createFolder}>Criar</Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowNewFolder(false); setNewFolderName(""); }}>✕</Button>
        </div>
      )}

      {/* Folders */}
      {folders.map((folder) => {
        const folderFiles = files.filter((f) => f.folder_id === folder.id);
        const isOpen = expanded.has(folder.id);

        return (
          <div key={folder.id} className="rounded-lg border overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors">
              <button className="flex items-center gap-2 flex-1 min-w-0 text-left" onClick={() => toggleExpand(folder.id)}>
                {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                {isOpen ? <FolderOpen className="h-4 w-4 text-yellow-500 shrink-0" /> : <Folder className="h-4 w-4 text-yellow-500 shrink-0" />}
                {renamingFolder?.id === folder.id ? (
                  <Input
                    autoFocus
                    className="h-6 text-sm py-0 px-1"
                    value={renamingFolder.name}
                    onChange={(e) => setRenamingFolder({ id: folder.id, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") renameFolder(folder.id, renamingFolder.name);
                      if (e.key === "Escape") setRenamingFolder(null);
                    }}
                    onBlur={() => renameFolder(folder.id, renamingFolder.name)}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="text-sm font-medium truncate">{folder.name}</span>
                )}
                <span className="text-xs text-muted-foreground shrink-0">({folderFiles.length})</span>
              </button>

              <div className="flex items-center gap-1.5 shrink-0">
                <Switch
                  checked={folder.visible_in_portal}
                  onCheckedChange={() => toggleFolderPortal(folder)}
                  title={folder.visible_in_portal ? "Visível no portal" : "Oculto no portal"}
                />
                {folder.visible_in_portal && <Eye className="h-3 w-3 text-primary" />}
                <button onClick={() => setRenamingFolder({ id: folder.id, name: folder.name })} className="p-1 rounded hover:bg-muted">
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </button>
                <button onClick={() => deleteFolder(folder)} className="p-1 rounded hover:bg-muted">
                  <Trash2 className="h-3 w-3 text-destructive" />
                </button>
              </div>
            </div>

            {isOpen && (
              <div className="divide-y">
                {folderFiles.length === 0 && (
                  <p className="px-4 py-3 text-xs text-muted-foreground">Pasta vazia.</p>
                )}
                {folderFiles.map((file) => (
                  <FileRow
                    key={file.id}
                    file={file}
                    folderVisible={folder.visible_in_portal}
                    renamingFile={renamingFile}
                    setRenamingFile={setRenamingFile}
                    renameFile={renameFile}
                    deleteFile={deleteFile}
                    downloadFile={downloadFile}
                    toggleFilePortal={toggleFilePortal}
                  />
                ))}
                <div className="px-3 py-2">
                  <UploadButton onFiles={(fl) => uploadFiles(fl, folder.id)} label="Upload aqui" size="xs" />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Root files */}
      {rootFiles.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="px-3 py-2 bg-muted/20">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Raiz</p>
          </div>
          <div className="divide-y">
            {rootFiles.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                folderVisible={true}
                renamingFile={renamingFile}
                setRenamingFile={setRenamingFile}
                renameFile={renameFile}
                deleteFile={deleteFile}
                downloadFile={downloadFile}
                toggleFilePortal={toggleFilePortal}
              />
            ))}
          </div>
        </div>
      )}

      {folders.length === 0 && files.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Nenhum arquivo ainda</p>
          <p className="text-xs text-muted-foreground mt-1">Crie uma pasta ou faça upload direto na raiz.</p>
        </div>
      )}

      <ConfirmDialog state={confirm} onOpenChange={(open) => !open && setConfirm(null)} />
    </div>
  );
}

// ── FileRow ───────────────────────────────────────────────────────────────────

function FileRow({
  file, folderVisible, renamingFile, setRenamingFile, renameFile, deleteFile, downloadFile, toggleFilePortal,
}: {
  file: BrandFile;
  folderVisible: boolean;
  renamingFile: { id: string; name: string } | null;
  setRenamingFile: React.Dispatch<React.SetStateAction<{ id: string; name: string } | null>>;
  renameFile: (id: string, name: string) => void;
  deleteFile: (file: BrandFile) => void;
  downloadFile: (file: BrandFile) => void;
  toggleFilePortal: (file: BrandFile) => void;
}) {
  const Icon = mimeIcon(file.mime_type);
  const isImage = file.mime_type.startsWith("image/");
  const date = new Date(file.created_at).toLocaleDateString("pt-BR");

  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />

      <div className="flex-1 min-w-0">
        {renamingFile?.id === file.id ? (
          <Input
            autoFocus
            className="h-6 text-sm py-0 px-1 w-full max-w-xs"
            value={renamingFile.name}
            onChange={(e) => setRenamingFile({ id: file.id, name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") renameFile(file.id, renamingFile.name);
              if (e.key === "Escape") setRenamingFile(null);
            }}
            onBlur={() => renameFile(file.id, renamingFile.name)}
          />
        ) : (
          <p className="text-sm truncate font-medium">{file.name}</p>
        )}
        <p className="text-[10px] text-muted-foreground">
          {formatFileSize(file.size_bytes)} · {date}
          {!folderVisible && file.visible_in_portal && (
            <span className="ml-1 text-warning-foreground">· pasta invisível no portal</span>
          )}
        </p>
      </div>

      {isImage && <ImagePreview path={file.storage_path} />}

      <div className="flex items-center gap-1 shrink-0">
        {file.visible_in_portal && folderVisible && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary hidden sm:flex">
            Visível
          </Badge>
        )}
        <Switch
          checked={file.visible_in_portal}
          onCheckedChange={() => toggleFilePortal(file)}
          title={file.visible_in_portal ? "Visível no portal" : "Oculto no portal"}
        />
        <button onClick={() => setRenamingFile({ id: file.id, name: file.name })} className="p-1 rounded hover:bg-muted">
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </button>
        <button onClick={() => downloadFile(file)} className="p-1 rounded hover:bg-muted">
          <Download className="h-3 w-3 text-muted-foreground" />
        </button>
        <button onClick={() => deleteFile(file)} className="p-1 rounded hover:bg-muted">
          <Trash2 className="h-3 w-3 text-destructive" />
        </button>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function UploadButton({ onFiles, label, size = "sm" }: { onFiles: (fl: FileList | null) => void; label: string; size?: "sm" | "xs" }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        size={size === "xs" ? "sm" : "sm"}
        variant="ghost"
        className={cn("text-muted-foreground", size === "xs" && "h-6 text-xs px-2")}
        onClick={() => ref.current?.click()}
      >
        <Upload className="h-3 w-3" /> {label}
      </Button>
      <input
        ref={ref}
        type="file"
        multiple
        className="hidden"
        accept={Object.keys(ALLOWED_BRAND_MIME).join(",")}
        onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }}
      />
    </>
  );
}

function ImagePreview({ path }: { path: string }) {
  const { data: url } = useQuery({
    queryKey: ["brand-preview", path],
    queryFn: async () => {
      const { data } = await supabase.storage.from("brand-files").createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    },
    staleTime: 55 * 60 * 1000,
  });
  if (!url) return null;
  return <img src={url} alt="preview" className="h-8 w-8 rounded object-cover shrink-0 border" />;
}

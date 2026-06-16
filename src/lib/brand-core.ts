export type BrandModuleType =
  | "diagnosis"
  | "persona"
  | "competitors"
  | "positioning"
  | "product_ladder";

export type BrandModule = {
  id: string;
  workspace_id: string;
  client_id: string;
  type: BrandModuleType;
  title: string;
  content: Record<string, unknown>;
  visible_in_portal: boolean;
  created_at: string;
  updated_at: string;
};

export type BrandFolder = {
  id: string;
  workspace_id: string;
  client_id: string;
  name: string;
  visible_in_portal: boolean;
  created_at: string;
};

export type BrandFile = {
  id: string;
  workspace_id: string;
  client_id: string;
  folder_id: string | null;
  name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  visible_in_portal: boolean;
  uploaded_by: string | null;
  created_at: string;
};

export const MODULE_ORDER: BrandModuleType[] = [
  "diagnosis",
  "persona",
  "competitors",
  "positioning",
  "product_ladder",
];

export const MODULE_META: Record<
  BrandModuleType,
  { title: string; description: string }
> = {
  diagnosis: {
    title: "Diagnóstico de Perfil",
    description: "Segmento, diferenciais, tom de voz e objetivos nas redes",
  },
  persona: {
    title: "Estudo de Persona",
    description: "Personas com dores, desejos e comportamento de consumo",
  },
  competitors: {
    title: "Análise de Concorrência",
    description: "Mapeamento de concorrentes, pontos fortes e diferenciais",
  },
  positioning: {
    title: "Posicionamento de Marca",
    description: "Proposta de valor, missão, visão, arquétipo e mensagem central",
  },
  product_ladder: {
    title: "Esteira de Produtos",
    description: "Portfólio ordenado por valor crescente",
  },
};

export const ALLOWED_BRAND_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "application/zip": "zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

export const MAX_BRAND_FILE_BYTES = 100 * 1024 * 1024;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isModuleFilled(m: BrandModule): boolean {
  const c = m.content as Record<string, unknown>;
  if (!c) return false;
  if (Array.isArray(c.personas)) return c.personas.length > 0;
  if (Array.isArray(c.competitors)) return c.competitors.length > 0;
  if (Array.isArray(c.products)) return c.products.length > 0;
  return Object.values(c).some((v) => typeof v === "string" && v.trim() !== "");
}

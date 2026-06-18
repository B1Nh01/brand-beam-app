import type { Database } from "@/integrations/supabase/types";

// ─── Task types (not yet in generated types) ───────────────────
export type TaskStatus   = "backlog" | "todo" | "in_progress" | "in_review" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type Task = {
  id: string;
  workspace_id: string;
  client_id: string | null;
  post_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  due_date: string | null;
  position: number;
  column_id: string | null;
  created_by: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskComment = {
  id: string;
  task_id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
};

export const TASK_STATUS_ORDER: TaskStatus[] = ["backlog", "todo", "in_progress", "in_review", "done"];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog:     "Backlog",
  todo:        "A fazer",
  in_progress: "Em progresso",
  in_review:   "Em revisão",
  done:        "Concluído",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low:    "Baixa",
  medium: "Média",
  high:   "Alta",
  urgent: "Urgente",
};

export const TASK_PRIORITY_CLASSES: Record<TaskPriority, string> = {
  low:    "bg-muted text-muted-foreground",
  medium: "bg-primary/10 text-primary border border-primary/20",
  high:   "bg-warning/20 text-warning-foreground border border-warning/40",
  urgent: "bg-destructive/15 text-destructive border border-destructive/30",
};

export type Client = Database["public"]["Tables"]["clients"]["Row"];
export type Post = Database["public"]["Tables"]["posts"]["Row"];
export type PostMedia = Database["public"]["Tables"]["post_media"]["Row"];
export type PostComment = Database["public"]["Tables"]["post_comments"]["Row"];
export type ActivityLog = Database["public"]["Tables"]["activity_log"]["Row"];
export type PostStatus = Database["public"]["Enums"]["post_status"];
export type FlowStage = Database["public"]["Enums"]["flow_stage"];
export type PostFormat = Database["public"]["Enums"]["post_format"];
export type PostPlatform = Database["public"]["Enums"]["post_platform"];
export type ApprovalMode = Database["public"]["Enums"]["approval_mode"];

export const STATUS_LABELS: Record<PostStatus, string> = {
  draft: "Rascunho",
  in_approval: "Em aprovação",
  adjustment_requested: "Ajuste solicitado",
  approved: "Aprovado",
  scheduled: "Agendado",
  published: "Publicado",
};

export const STATUS_ORDER: PostStatus[] = [
  "draft",
  "in_approval",
  "adjustment_requested",
  "approved",
  "scheduled",
  "published",
];

// tailwind classes per status (chips / badges)
export const STATUS_CLASSES: Record<PostStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  in_approval: "bg-warning/20 text-warning-foreground border border-warning/40",
  adjustment_requested: "bg-destructive/15 text-destructive border border-destructive/30",
  approved: "bg-success/20 text-success-foreground border border-success/40",
  scheduled: "bg-accent text-accent-foreground border border-primary/20",
  published: "bg-primary/15 text-primary border border-primary/30",
};

export const FLOW_LABELS: Record<FlowStage, string> = {
  tema: "Tema",
  conteudo: "Conteúdo",
  midia: "Mídia",
  legenda: "Legenda",
};

export const FLOW_ORDER: FlowStage[] = ["tema", "conteudo", "midia", "legenda"];

export const FORMAT_LABELS: Record<PostFormat, string> = {
  static: "Estático",
  carousel: "Carrossel",
  reels: "Reels",
  story: "Story",
};

export const PLATFORM_LABELS: Record<PostPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  both: "Ambos",
};

export const APPROVAL_LABELS: Record<ApprovalMode, string> = {
  fast: "Content Fast",
  flow: "Content Flow",
};

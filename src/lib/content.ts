import type { Database } from "@/integrations/supabase/types";

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
  idea: "Ideia",
  copy: "Copy",
  media: "Mídia",
  final: "Final",
};

export const FLOW_ORDER: FlowStage[] = ["idea", "copy", "media", "final"];

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

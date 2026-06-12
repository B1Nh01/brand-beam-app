import { cn } from "@/lib/utils";
import { STATUS_CLASSES, STATUS_LABELS, type PostStatus, FLOW_LABELS, type FlowStage } from "@/lib/content";

export function StatusBadge({ status, flowStage, approvalMode }: { status: PostStatus; flowStage?: FlowStage; approvalMode?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_CLASSES[status])}>
      {STATUS_LABELS[status]}
      {approvalMode === "flow" && status !== "draft" && status !== "approved" && status !== "published" && flowStage
        ? ` · ${FLOW_LABELS[flowStage]}`
        : ""}
    </span>
  );
}

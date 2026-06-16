import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList, Users, ShieldAlert, Target, TrendingUp, Pencil, PlusCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  type BrandModule, type BrandModuleType,
  MODULE_META, MODULE_ORDER, isModuleFilled,
} from "@/lib/brand-core";
import { ModuleDialog } from "./module-dialog";
import { cn } from "@/lib/utils";

const ICONS: Record<BrandModuleType, React.ElementType> = {
  diagnosis:      ClipboardList,
  persona:        Users,
  competitors:    ShieldAlert,
  positioning:    Target,
  product_ladder: TrendingUp,
};

type Props = { clientId: string; workspaceId: string };

export function StrategyTab({ clientId, workspaceId }: Props) {
  const qc = useQueryClient();
  const [openType, setOpenType] = useState<BrandModuleType | null>(null);

  const { data: modules = [] } = useQuery<BrandModule[]>({
    queryKey: ["brand-modules", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_modules")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as BrandModule[];
    },
  });

  const byType = Object.fromEntries(modules.map((m) => [m.type, m])) as Partial<Record<BrandModuleType, BrandModule>>;

  const togglePortal = async (m: BrandModule, visible: boolean) => {
    const { error } = await supabase
      .from("brand_modules")
      .update({ visible_in_portal: visible })
      .eq("id", m.id);
    if (error) return toast.error(error.message);
    if (visible) {
      await supabase.from("activity_log").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        action: `Brand Core: ${m.title} tornado visível no portal`,
        actor: "Equipe",
      });
    }
    qc.invalidateQueries({ queryKey: ["brand-modules", clientId] });
  };

  const openModule = byType[openType ?? "diagnosis"];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {MODULE_ORDER.map((type) => {
          const meta = MODULE_META[type];
          const mod = byType[type];
          const filled = mod ? isModuleFilled(mod) : false;
          const Icon = ICONS[type];

          return (
            <div
              key={type}
              className={cn(
                "flex flex-col rounded-xl border bg-card p-4 gap-3 transition-shadow hover:shadow-sm",
                filled && "border-primary/20",
              )}
            >
              <div className="flex items-start gap-3">
                <span className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  filled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight">{meta.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-snug line-clamp-2">
                    {meta.description}
                  </p>
                </div>
              </div>

              {filled && mod && (
                <ModulePreview mod={mod} />
              )}

              <div className="mt-auto flex items-center justify-between gap-2">
                {filled && mod ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={mod.visible_in_portal}
                        onCheckedChange={(v) => togglePortal(mod, v)}
                        id={`portal-${type}`}
                      />
                      <label htmlFor={`portal-${type}`} className="text-xs text-muted-foreground cursor-pointer select-none">
                        Portal
                      </label>
                      {mod.visible_in_portal && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary">
                          Visível
                        </Badge>
                      )}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setOpenType(type)}>
                      <Pencil className="h-3 w-3" /> Editar
                    </Button>
                  </>
                ) : (
                  <Button size="sm" className="w-full" onClick={() => setOpenType(type)}>
                    <PlusCircle className="h-3.5 w-3.5" /> Preencher
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {openType && (
        <ModuleDialog
          clientId={clientId}
          workspaceId={workspaceId}
          type={openType}
          module={openModule}
          onClose={() => {
            setOpenType(null);
            qc.invalidateQueries({ queryKey: ["brand-modules", clientId] });
          }}
        />
      )}
    </>
  );
}

function ModulePreview({ mod }: { mod: BrandModule }) {
  const c = mod.content as Record<string, unknown>;
  let preview = "";

  if (mod.type === "diagnosis") {
    const parts = [c.segmento, c.tom_voz].filter(Boolean);
    preview = parts.join(" · ");
  } else if (mod.type === "persona") {
    const n = (c.personas as unknown[])?.length ?? 0;
    preview = `${n} persona${n !== 1 ? "s" : ""} definida${n !== 1 ? "s" : ""}`;
  } else if (mod.type === "competitors") {
    const n = (c.competitors as unknown[])?.length ?? 0;
    preview = `${n} concorrente${n !== 1 ? "s" : ""} mapeado${n !== 1 ? "s" : ""}`;
  } else if (mod.type === "positioning") {
    preview = (c.proposta_valor as string)?.slice(0, 80) ?? "";
  } else if (mod.type === "product_ladder") {
    const n = (c.products as unknown[])?.length ?? 0;
    preview = `${n} produto${n !== 1 ? "s" : ""} na esteira`;
  }

  if (!preview) return null;
  return (
    <p className="text-xs text-muted-foreground line-clamp-2 bg-muted/50 rounded-md px-2.5 py-1.5">
      {preview}
    </p>
  );
}

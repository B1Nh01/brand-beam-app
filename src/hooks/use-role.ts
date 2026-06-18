import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "./use-workspace";

/** Returns "owner" | "member" | null (null = still loading) */
export function useRole(): "owner" | "member" | null {
  const { data: ws } = useWorkspace();
  const [role, setRole] = useState<"owner" | "member" | null>(null);

  useEffect(() => {
    if (!ws) return;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return setRole("member");
      setRole(data.user.id === ws.owner_id ? "owner" : "member");
    });
  }, [ws?.id, ws?.owner_id]);

  return role;
}

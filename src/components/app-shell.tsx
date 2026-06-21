import { ReactNode, useEffect } from "react";
import { toast } from "sonner";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Users2,
  KanbanSquare,
  Settings,
  LogOut,
  Sparkles,
  Clock,
  ListChecks,
  Wallet,
  Bell,
  CalendarClock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "@/hooks/use-workspace";
import { useRole } from "@/hooks/use-role";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const mainItems = [
  { title: "Dashboard",    url: "/dashboard", icon: LayoutDashboard },
  { title: "Clientes",     url: "/clients",   icon: Users },
  { title: "Visão central",url: "/content",   icon: KanbanSquare },
  { title: "Tarefas",      url: "/tasks",     icon: ListChecks },
  { title: "Equipe",       url: "/team",      icon: Users2 },
  { title: "Financeiro",   url: "/finance",   icon: Wallet },
  { title: "Configurações",url: "/settings",  icon: Settings },
];

const soonItems = [
  { title: "Notificações",icon: Bell },
  { title: "Agendamento", icon: CalendarClock },
];

function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { data: ws } = useWorkspace();
  const role = useRole();
  const isOwner = role === "owner";

  const { data: openTaskCount = 0 } = useQuery<number>({
    queryKey: ["my-open-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_open_task_count");
      if (error) return 0;
      return (data as number) ?? 0;
    },
    retry: false,
    refetchInterval: 60_000,
  });

  const { data: overdueCount = 0 } = useQuery<number>({
    queryKey: ["finance-overdue", ws?.id],
    enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("overdue_revenue_count", {
        _workspace_id: ws!.id,
      });
      if (error) return 0;
      return (data as number) ?? 0;
    },
    retry: false,
    refetchInterval: 5 * 60_000,
  });

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-3 px-3 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight text-sidebar-foreground">Stúdio Social</p>
            <p className="text-[11px] text-sidebar-foreground/50">Gestão de conteúdo</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems
                .filter((item) => item.url !== "/finance" || isOwner)
                .map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={pathname.startsWith(item.url)}>
                      <Link to={item.url} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1">{item.title}</span>
                        {item.url === "/tasks" && openTaskCount > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                            {openTaskCount > 99 ? "99+" : openTaskCount}
                          </span>
                        )}
                        {item.url === "/finance" && overdueCount > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                            {overdueCount > 99 ? "99+" : overdueCount}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Em breve</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {soonItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton disabled className="opacity-60">
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                    <Clock className="ml-auto h-3 w-3" />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground" onClick={logout}>
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    const pending = localStorage.getItem("pending_invite");
    if (!pending) return;
    (async () => {
      const { error } = await supabase.rpc("accept_invite", { _token: pending });
      localStorage.removeItem("pending_invite");
      if (!error) toast.success("Você entrou no workspace!");
    })();
  }, []);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
          </header>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

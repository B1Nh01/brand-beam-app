import { ReactNode, useEffect } from "react";
import { toast } from "sonner";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  KanbanSquare,
  Settings,
  LogOut,
  Sparkles,
  Clock,
  ListChecks,
  Wallet,
  Bell,
  CalendarClock,
  Layers,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
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
  { title: "Brand Core",   url: "/clients",   icon: Layers },
  { title: "Visão central",url: "/content",   icon: KanbanSquare },
  { title: "Tarefas",      url: "/tasks",     icon: ListChecks },
  { title: "Configurações",url: "/settings",  icon: Settings },
];

const soonItems = [
  { title: "Financeiro",  icon: Wallet },
  { title: "Notificações",icon: Bell },
  { title: "Agendamento", icon: CalendarClock },
];

function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  const { data: openTaskCount = 0 } = useQuery<number>({
    queryKey: ["my-open-tasks"],
    queryFn: async () => {
      const { data } = await supabase.rpc("my_open_task_count");
      return (data as number) ?? 0;
    },
    refetchInterval: 60_000,
  });

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="font-extrabold tracking-tight">Aprova</p>
            <p className="text-xs text-muted-foreground">Gestão de conteúdo</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(item.url)}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      <span className="flex-1">{item.title}</span>
                      {item.url === "/tasks" && openTaskCount > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                          {openTaskCount > 99 ? "99+" : openTaskCount}
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
        <Button variant="ghost" className="justify-start" onClick={logout}>
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
          <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
            <SidebarTrigger />
            <span className="text-sm font-medium text-muted-foreground">Workspace</span>
          </header>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

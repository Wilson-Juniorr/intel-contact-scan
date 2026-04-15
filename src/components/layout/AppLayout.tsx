import {
  LayoutDashboard,
  Users,
  Columns3,
  Bot,
  Menu,
  LogOut,
  MessageCircle,
  Clock,
  Zap,
  Brain,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { useCadence } from "@/hooks/useCadence";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Central do Dia", url: "/today", icon: Zap },
  { title: "Leads", url: "/leads", icon: Users },
  { title: "Funil", url: "/funnel", icon: Columns3 },
  { title: "WhatsApp", url: "/whatsapp", icon: MessageCircle },
  { title: "Follow-Up", url: "/follow-up", icon: Clock },
  { title: "Assistente IA", url: "/assistant", icon: Bot },
  { title: "Uso de IA", url: "/ai-usage", icon: Brain },
];

function AppSidebarContent() {
  const { state } = useSidebar();
  const { signOut, user } = useAuth();
  const { pendingCount } = useCadence();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar-background">
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 py-5">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shadow-sm">
              <span className="text-primary-foreground font-bold text-sm">CS</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-sidebar-foreground tracking-tight">
                CRM Saúde
              </h1>
              <p className="text-[10px] text-sidebar-foreground/50 truncate max-w-[140px]">
                {user?.email}
              </p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center mx-auto shadow-sm">
            <span className="text-primary-foreground font-bold text-sm">CS</span>
          </div>
        )}
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-150"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold"
                    >
                      <item.icon className="h-4.5 w-4.5 shrink-0" />
                      <span className="text-sm">{item.title}</span>
                      {item.url === "/today" && pendingCount > 0 && (
                        <span className="ml-auto bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                          {pendingCount}
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <div className="mt-auto p-3">
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          onClick={signOut}
          className="w-full justify-start gap-2 text-sidebar-foreground/40 hover:text-destructive hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="text-sm">Sair</span>}
        </Button>
      </div>
    </Sidebar>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebarContent />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 border-b border-border flex items-center px-4 gap-3 bg-background/80 backdrop-blur-md sticky top-0 z-20">
            <SidebarTrigger>
              <Menu className="h-4.5 w-4.5 text-muted-foreground" />
            </SidebarTrigger>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

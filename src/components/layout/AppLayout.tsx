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
  Settings,
  ClipboardList,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { useCadence } from "@/hooks/useCadence";
import { useIsMobile } from "@/hooks/use-mobile";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { Button } from "@/components/ui/button";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { motion } from "framer-motion";
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
  { title: "Configurações", url: "/settings", icon: Settings },
  { title: "Atividades", url: "/activity", icon: ClipboardList },
];

function AppSidebarContent() {
  const { state } = useSidebar();
  const { signOut, user } = useAuth();
  const { pendingCount } = useCadence();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar-background">
      <div className="flex items-center gap-3 px-4 py-5">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center shadow-md shadow-primary/20">
              <span className="text-primary-foreground font-extrabold text-sm">J</span>
            </div>
            <div>
              <h1 className="text-sm font-bold gradient-text tracking-tight">È o JOTA.</h1>
              <p className="text-[10px] text-sidebar-foreground/50 truncate max-w-[140px]">{user?.email}</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center mx-auto shadow-md shadow-primary/20">
            <span className="text-primary-foreground font-extrabold text-sm">J</span>
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
                      className="relative flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground hover:translate-x-0.5 transition-all duration-200"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold"
                    >
                      {({ isActive }: { isActive: boolean }) => (
                        <>
                          {isActive && (
                            <motion.div
                              layoutId="activeNav"
                              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full"
                              transition={{ type: "spring", stiffness: 500, damping: 30 }}
                            />
                          )}
                          <item.icon className="h-4.5 w-4.5 shrink-0" />
                          <span className="text-sm">{item.title}</span>
                          {item.url === "/today" && pendingCount > 0 && (
                            <span className="ml-auto bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 animate-pulse-glow">
                              {pendingCount}
                            </span>
                          )}
                        </>
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
          className="w-full justify-start gap-2 text-sidebar-foreground/40 hover:text-destructive hover:bg-destructive/10 btn-press"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="text-sm">Sair</span>}
        </Button>
      </div>
    </Sidebar>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="min-h-screen flex flex-col w-full bg-background">
        <header className="h-12 glass border-b border-border/50 flex items-center justify-between px-4 sticky top-0 z-20 shadow-sm">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center">
            <span className="text-primary-foreground font-extrabold text-[10px]">J</span>
          </div>
          <NotificationBell />
        </header>
        <main className="flex-1 p-4 pb-20 overflow-auto">{children}</main>
        <MobileBottomNav />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebarContent />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 glass border-b border-border/50 flex items-center justify-between px-4 sticky top-0 z-20 shadow-sm">
            <SidebarTrigger>
              <Menu className="h-4.5 w-4.5 text-muted-foreground" />
            </SidebarTrigger>
            <NotificationBell />
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Zap, Users, MessageCircle, MoreHorizontal, Columns3, Clock, Bot, Settings, ClipboardList } from "lucide-react";
import { useCadence } from "@/hooks/useCadence";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

const mainItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Central", icon: Zap, path: "/today", badge: true },
  { label: "Leads", icon: Users, path: "/leads" },
  { label: "WhatsApp", icon: MessageCircle, path: "/whatsapp" },
  { label: "Mais", icon: MoreHorizontal, path: "__more__" },
];

const moreItems = [
  { label: "Funil", icon: Columns3, path: "/funnel" },
  { label: "Follow-Up", icon: Clock, path: "/follow-up" },
  { label: "Assistente IA", icon: Bot, path: "/assistant" },
  { label: "Configurações", icon: Settings, path: "/settings" },
  { label: "Atividades", icon: ClipboardList, path: "/activity" },
];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { pendingCount } = useCadence();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const isMoreActive = moreItems.some(i => isActive(i.path));

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="flex items-center justify-around h-16">
          {mainItems.map(item => {
            const active = item.path === "__more__" ? isMoreActive || drawerOpen : isActive(item.path);
            return (
              <button
                key={item.label}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
                onClick={() => {
                  if (item.path === "__more__") {
                    setDrawerOpen(true);
                  } else {
                    navigate(item.path);
                  }
                }}
              >
                <div className="relative">
                  <item.icon className="h-5 w-5" />
                  {item.badge && pendingCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                      {pendingCount}
                    </span>
                  )}
                </div>
                {active && <span className="text-[10px] font-medium">{item.label}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Menu</DrawerTitle>
          </DrawerHeader>
          <div className="p-4 space-y-1 pb-8">
            {moreItems.map(item => (
              <button
                key={item.label}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                  isActive(item.path) ? "bg-accent text-primary font-medium" : "hover:bg-accent/50"
                }`}
                onClick={() => { setDrawerOpen(false); navigate(item.path); }}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

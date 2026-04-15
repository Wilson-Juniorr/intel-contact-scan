import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { MessageCircle, ArrowRightLeft, CheckCircle2, Sparkles, AlertTriangle, UserPlus } from "lucide-react";

const TYPE_ICONS: Record<string, typeof MessageCircle> = {
  inbound_message: MessageCircle,
  lead_stage_changed: ArrowRightLeft,
  task_due: CheckCircle2,
  closing_step_ready: Sparkles,
  follow_up_sent: AlertTriangle,
  lead_created: UserPlus,
};

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  lead_id: string | null;
  read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) {
      setNotifications(data as Notification[]);
      setUnreadCount(data.filter((n: any) => !n.read).length);
    }
  }, [user]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications-bell")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const newNotif = payload.new as Notification;
        setNotifications(prev => [newNotif, ...prev].slice(0, 20));
        setUnreadCount(prev => prev + 1);

        // Browser push if tab inactive and permission granted
        if (document.hidden && Notification.permission === "granted") {
          new window.Notification(newNotif.title, { body: newNotif.body });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Request push permission once
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      // Don't auto-request, wait for user interaction
    }
  }, []);

  const requestPermission = () => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  };

  const markAllRead = async () => {
    if (!user) return;
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const handleClick = (notif: Notification) => {
    if (!notif.read) {
      supabase.from("notifications").update({ read: true }).eq("id", notif.id).then();
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    if (notif.lead_id) {
      navigate("/leads");
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" onClick={requestPermission}>
          <Bell className="h-4.5 w-4.5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 text-[10px] bg-destructive text-destructive-foreground border-0">
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h4 className="text-sm font-semibold">Notificações</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllRead}>
              Marcar todas como lidas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma notificação</p>
          ) : (
            notifications.map(notif => {
              const Icon = TYPE_ICONS[notif.type] || Bell;
              return (
                <button
                  key={notif.id}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors border-b border-border/50 ${
                    !notif.read ? "bg-accent/20" : ""
                  }`}
                  onClick={() => handleClick(notif)}
                >
                  <Icon className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!notif.read ? "font-medium" : ""}`}>{notif.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{notif.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                  {!notif.read && <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                </button>
              );
            })
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

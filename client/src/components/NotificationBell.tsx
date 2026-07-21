import { Bell, Heart, MessageCircle, Share2, TrendingUp, Plane, Mail } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications, type AppNotification, type NotificationType } from "@/contexts/NotificationContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

const ICONS: Record<NotificationType, typeof Heart> = {
  like: Heart,
  comment: MessageCircle,
  share: Share2,
  popular: TrendingUp,
  "trip-d3": Plane,
  "trip-dday": Plane,
  "inquiry-answer": Mail,
  "inquiry-new": Mail,
};

function messageFor(n: AppNotification, t: (key: string, params?: Record<string, string | number>) => string): string {
  switch (n.type) {
    case "like":
      return t("notifications.like", { actor: n.actorName || "", title: n.diaryTitle || "" });
    case "comment":
      return t("notifications.comment", { actor: n.actorName || "", title: n.diaryTitle || "" });
    case "share":
      return t("notifications.share", { actor: n.actorName || "", title: n.diaryTitle || "" });
    case "popular":
      return t("notifications.popular", { title: n.diaryTitle || "" });
    case "trip-d3":
      return t("notifications.tripD3", { title: n.planTitle || "" });
    case "trip-dday":
      return t("notifications.tripDDay", { title: n.planTitle || "" });
    case "inquiry-answer":
      return t("notifications.inquiryAnswer");
    case "inquiry-new":
      return t("notifications.inquiryNew", { actor: n.actorName || "", title: n.inquiryTitle || "" });
    default:
      return "";
  }
}

function relativeTime(iso: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t("notifications.justNow");
  if (minutes < 60) return t("notifications.minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("notifications.hoursAgo", { n: hours });
  const days = Math.floor(hours / 24);
  return t("notifications.daysAgo", { n: days });
}

export default function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const { t } = useLanguage();
  const [, setLocation] = useLocation();

  const handleNotificationClick = (n: AppNotification) => {
    markAsRead(n.id);
    if (n.type === "inquiry-answer") {
      setLocation("/mypage?tab=activity");
    } else if (n.type === "inquiry-new") {
      setLocation("/admin");
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative hidden sm:flex w-9 h-9 rounded-full items-center justify-center text-muted-foreground hover:bg-secondary transition-all border border-border"
          aria-label={t("notifications.title")}
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0 overflow-hidden flex flex-col max-h-[min(28rem,80vh)]"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <span className="font-bold text-sm">{t("notifications.title")}</span>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {t("notifications.markAllRead")}
            </button>
          )}
        </div>
        {notifications.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {t("notifications.empty")}
          </div>
        ) : (
          <ScrollArea className="h-[min(24rem,70vh)]">
            <div className="py-1">
              {notifications.map(n => {
                const Icon = ICONS[n.type];
                return (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={cn(
                      "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-secondary transition-colors",
                      !n.isRead && "bg-primary/5"
                    )}
                  >
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground leading-snug">{messageFor(n, t)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{relativeTime(n.createdAt, t)}</p>
                    </div>
                    {!n.isRead && (
                      <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}

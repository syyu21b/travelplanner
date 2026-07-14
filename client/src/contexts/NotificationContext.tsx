import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";

export type NotificationType =
  | "like"
  | "comment"
  | "share"
  | "popular"
  | "trip-d3"
  | "trip-dday"
  | "inquiry-answer";

export interface AppNotification {
  id: string;
  recipientId: string;
  type: NotificationType;
  actorName?: string;
  diaryId?: string;
  diaryTitle?: string;
  planId?: string;
  planTitle?: string;
  inquiryId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationSettings {
  tripD3: boolean;
  tripDDay: boolean;
  likes: boolean;
  comments: boolean;
  shares: boolean;
  popularPost: boolean;
  inquiryAnswer: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  tripD3: true,
  tripDDay: true,
  likes: true,
  comments: true,
  shares: true,
  popularPost: true,
  inquiryAnswer: true,
};

type NotifyPayload = Omit<AppNotification, "id" | "isRead" | "createdAt">;

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  settings: NotificationSettings;
  updateSettings: (updates: Partial<NotificationSettings>) => void;
  notify: (payload: NotifyPayload) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

interface TravelPlan {
  id: string;
  userId: string;
  title: string;
  startDate: string;
}

function getAllNotifications(): AppNotification[] {
  try {
    return JSON.parse(localStorage.getItem("notifications") || "[]");
  } catch {
    return [];
  }
}

function saveAllNotifications(list: AppNotification[]) {
  localStorage.setItem("notifications", JSON.stringify(list));
}

function getAllSettings(): Record<string, NotificationSettings> {
  try {
    return JSON.parse(localStorage.getItem("notificationSettings") || "{}");
  } catch {
    return {};
  }
}

function saveAllSettings(map: Record<string, NotificationSettings>) {
  localStorage.setItem("notificationSettings", JSON.stringify(map));
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setSettings(DEFAULT_SETTINGS);
      return;
    }
    setNotifications(getAllNotifications().filter(n => n.recipientId === user.id));
    setSettings(getAllSettings()[user.id] || DEFAULT_SETTINGS);
  }, [user]);

  const notify = useCallback((payload: NotifyPayload) => {
    const recipientSettings = getAllSettings()[payload.recipientId] || DEFAULT_SETTINGS;
    const settingKeyMap: Record<NotificationType, keyof NotificationSettings> = {
      like: "likes",
      comment: "comments",
      share: "shares",
      popular: "popularPost",
      "trip-d3": "tripD3",
      "trip-dday": "tripDDay",
      "inquiry-answer": "inquiryAnswer",
    };
    if (!recipientSettings[settingKeyMap[payload.type]]) return;

    const all = getAllNotifications();

    // 인기글/여행 알림은 동일 대상에 중복 생성하지 않음
    if (payload.type === "popular" && payload.diaryId) {
      if (all.some(n => n.type === "popular" && n.diaryId === payload.diaryId)) return;
    }
    if ((payload.type === "trip-d3" || payload.type === "trip-dday") && payload.planId) {
      if (all.some(n => n.type === payload.type && n.planId === payload.planId)) return;
    }

    const newNotification: AppNotification = {
      ...payload,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    const updated = [newNotification, ...all];
    saveAllNotifications(updated);
    if (user && payload.recipientId === user.id) {
      setNotifications(updated.filter(n => n.recipientId === user.id));
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let plans: TravelPlan[] = [];
    try {
      plans = JSON.parse(localStorage.getItem("travelPlans") || "[]");
    } catch {
      plans = [];
    }
    plans
      .filter(p => p.userId === user.id && p.startDate)
      .forEach(plan => {
        const diff = daysUntil(plan.startDate);
        if (diff === 3) {
          notify({ recipientId: user.id, type: "trip-d3", planId: plan.id, planTitle: plan.title });
        } else if (diff === 0) {
          notify({ recipientId: user.id, type: "trip-dday", planId: plan.id, planTitle: plan.title });
        }
      });
  }, [user, notify]);

  const updateSettings = (updates: Partial<NotificationSettings>) => {
    if (!user) return;
    const merged = { ...settings, ...updates };
    setSettings(merged);
    const all = getAllSettings();
    all[user.id] = merged;
    saveAllSettings(all);
  };

  const markAsRead = (id: string) => {
    const all = getAllNotifications().map(n => n.id === id ? { ...n, isRead: true } : n);
    saveAllNotifications(all);
    if (user) setNotifications(all.filter(n => n.recipientId === user.id));
  };

  const markAllAsRead = () => {
    if (!user) return;
    const all = getAllNotifications().map(n => n.recipientId === user.id ? { ...n, isRead: true } : n);
    saveAllNotifications(all);
    setNotifications(all.filter(n => n.recipientId === user.id));
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, settings, updateSettings, notify, markAsRead, markAllAsRead }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
}

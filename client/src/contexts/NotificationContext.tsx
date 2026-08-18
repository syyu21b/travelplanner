import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { notificationsApi } from "@/lib/api/notifications";
import type { AppNotification, NotificationSettings, NotificationType } from "@shared/types";

export type { NotificationType, AppNotification, NotificationSettings };

const DEFAULT_SETTINGS: NotificationSettings = {
  tripD3: true,
  tripDDay: true,
  likes: true,
  comments: true,
  shares: true,
  popularPost: true,
  inquiryAnswer: true,
  inquiryNew: true,
};

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  settings: NotificationSettings;
  updateSettings: (updates: Partial<NotificationSettings>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  refresh: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);

  const refresh = useCallback(() => {
    if (!user) { setNotifications([]); return; }
    notificationsApi.list().then(setNotifications).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setSettings(DEFAULT_SETTINGS);
      return;
    }
    notificationsApi.list().then(setNotifications).catch(() => {});
    notificationsApi.getSettings().then(setSettings).catch(() => {});
  }, [user]);

  const updateSettings = (updates: Partial<NotificationSettings>) => {
    if (!user) return;
    const merged = { ...settings, ...updates };
    setSettings(merged);
    notificationsApi.updateSettings(updates).catch(() => setSettings(settings));
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    notificationsApi.markAsRead(id).catch(() => {});
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    notificationsApi.markAllAsRead().catch(() => {});
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, settings, updateSettings, markAsRead, markAllAsRead, refresh }}
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

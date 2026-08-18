import { api } from "../api";
import type { AppNotification, NotificationSettings } from "@shared/types";

export const notificationsApi = {
  list: () => api.get<{ notifications: AppNotification[] }>("/notifications").then((r) => r.notifications),
  getSettings: () => api.get<{ settings: NotificationSettings }>("/notifications/settings").then((r) => r.settings),
  updateSettings: (updates: Partial<NotificationSettings>) =>
    api.patch<{ settings: NotificationSettings }>("/notifications/settings", updates).then((r) => r.settings),
  markAsRead: (id: string) => api.post<{ success: boolean }>(`/notifications/${id}/read`),
  markAllAsRead: () => api.post<{ success: boolean }>("/notifications/read-all"),
  share: (diaryId: string) => api.post<{ success: boolean }>("/notifications/share", { diaryId }),
};

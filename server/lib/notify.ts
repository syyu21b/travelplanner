import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db/client";
import { notifications, notificationSettings } from "../db/schema";
import type { Env } from "../env";
import type { NotificationType, NotificationSettings } from "../../shared/types";

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

const SETTING_KEY_BY_TYPE: Record<NotificationType, keyof NotificationSettings> = {
  like: "likes",
  comment: "comments",
  share: "shares",
  popular: "popularPost",
  "trip-d3": "tripD3",
  "trip-dday": "tripDDay",
  "inquiry-answer": "inquiryAnswer",
  "inquiry-new": "inquiryNew",
};

export async function getNotificationSettings(env: Env, userId: string): Promise<NotificationSettings> {
  const db = getDb(env);
  const row = (await db.select().from(notificationSettings).where(eq(notificationSettings.userId, userId)).limit(1))[0];
  if (!row) return DEFAULT_SETTINGS;
  return {
    tripD3: row.tripD3,
    tripDDay: row.tripDDay,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    popularPost: row.popularPost,
    inquiryAnswer: row.inquiryAnswer,
    inquiryNew: row.inquiryNew,
  };
}

export interface NotifyPayload {
  recipientId: string;
  type: NotificationType;
  actorName?: string;
  diaryId?: string;
  diaryTitle?: string;
  planId?: string;
  planTitle?: string;
  inquiryId?: string;
  inquiryTitle?: string;
}

// 좋아요/댓글/인기글/여행 알림 등을 생성하는 단일 지점 — 수신자 알림 설정을 확인하고,
// 인기글/여행 알림은 동일 대상에 중복 생성하지 않는다 (기존 client notify()와 동일한 규칙).
export async function notify(env: Env, payload: NotifyPayload): Promise<void> {
  const settings = await getNotificationSettings(env, payload.recipientId);
  if (!settings[SETTING_KEY_BY_TYPE[payload.type]]) return;

  const db = getDb(env);

  if (payload.type === "popular" && payload.diaryId) {
    const existing = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.type, "popular"), eq(notifications.diaryId, payload.diaryId)))
      .limit(1);
    if (existing.length > 0) return;
  }
  if ((payload.type === "trip-d3" || payload.type === "trip-dday") && payload.planId) {
    const existing = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.type, payload.type), eq(notifications.planId, payload.planId)))
      .limit(1);
    if (existing.length > 0) return;
  }

  await db.insert(notifications).values({
    id: nanoid(),
    recipientId: payload.recipientId,
    type: payload.type,
    actorName: payload.actorName,
    diaryId: payload.diaryId,
    diaryTitle: payload.diaryTitle,
    planId: payload.planId,
    planTitle: payload.planTitle,
    inquiryId: payload.inquiryId,
    inquiryTitle: payload.inquiryTitle,
    isRead: false,
    createdAt: new Date().toISOString(),
  });
}

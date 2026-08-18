import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db/client";
import { notifications, notificationSettings, travelPlans, travelDiaries } from "../db/schema";
import { attachUser, requireAuth, type AppEnv } from "../lib/middleware";
import { notify, getNotificationSettings } from "../lib/notify";
import type { AppNotification, NotificationSettings } from "../../shared/types";

function toClientNotification(row: typeof notifications.$inferSelect): AppNotification {
  return {
    id: row.id,
    recipientId: row.recipientId,
    type: row.type as AppNotification["type"],
    actorName: row.actorName ?? undefined,
    diaryId: row.diaryId ?? undefined,
    diaryTitle: row.diaryTitle ?? undefined,
    planId: row.planId ?? undefined,
    planTitle: row.planTitle ?? undefined,
    inquiryId: row.inquiryId ?? undefined,
    inquiryTitle: row.inquiryTitle ?? undefined,
    isRead: row.isRead,
    createdAt: row.createdAt,
  };
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

const notificationsApi = new Hono<AppEnv>();

notificationsApi.use("*", attachUser);
notificationsApi.use("*", requireAuth);

notificationsApi.get("/", async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env);

  // D-3/D-day 여행 리마인더는 별도 크론 없이, 목록을 조회하는 시점에 계산해 필요하면 생성한다.
  const myPlans = await db.select().from(travelPlans).where(eq(travelPlans.userId, user.id));
  for (const plan of myPlans) {
    if (!plan.startDate) continue;
    const diff = daysUntil(plan.startDate);
    if (diff === 3) {
      await notify(c.env, { recipientId: user.id, type: "trip-d3", planId: plan.id, planTitle: plan.title }).catch(() => {});
    } else if (diff === 0) {
      await notify(c.env, { recipientId: user.id, type: "trip-dday", planId: plan.id, planTitle: plan.title }).catch(() => {});
    }
  }

  const rows = await db.select().from(notifications).where(eq(notifications.recipientId, user.id)).orderBy(desc(notifications.createdAt));
  return c.json({ notifications: rows.map(toClientNotification) });
});

notificationsApi.get("/settings", async (c) => {
  const user = c.get("user")!;
  const settings = await getNotificationSettings(c.env, user.id);
  return c.json({ settings });
});

notificationsApi.patch("/settings", async (c) => {
  const user = c.get("user")!;
  const body = (await c.req.json().catch(() => ({}))) as Partial<NotificationSettings>;
  const current = await getNotificationSettings(c.env, user.id);
  const merged: NotificationSettings = { ...current, ...body };

  const db = getDb(c.env);
  await db
    .insert(notificationSettings)
    .values({
      userId: user.id,
      tripD3: merged.tripD3,
      tripDDay: merged.tripDDay,
      likes: merged.likes,
      comments: merged.comments,
      shares: merged.shares,
      popularPost: merged.popularPost,
      inquiryAnswer: merged.inquiryAnswer,
      inquiryNew: merged.inquiryNew,
    })
    .onConflictDoUpdate({
      target: notificationSettings.userId,
      set: {
        tripD3: merged.tripD3,
        tripDDay: merged.tripDDay,
        likes: merged.likes,
        comments: merged.comments,
        shares: merged.shares,
        popularPost: merged.popularPost,
        inquiryAnswer: merged.inquiryAnswer,
        inquiryNew: merged.inquiryNew,
      },
    });
  return c.json({ settings: merged });
});

notificationsApi.post("/:id/read", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const db = getDb(c.env);
  await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, id), eq(notifications.recipientId, user.id)));
  return c.json({ success: true });
});

notificationsApi.post("/read-all", async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env);
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.recipientId, user.id));
  return c.json({ success: true });
});

// 커뮤니티 게시글 공유하기 버튼 전용 — 별도 데이터 변경 없이 알림만 생성
notificationsApi.post("/share", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const diaryId = typeof body.diaryId === "string" ? body.diaryId : "";
  if (!diaryId) return c.json({ error: "diaryId가 필요합니다." }, 400);

  const db = getDb(c.env);
  const diary = (await db.select().from(travelDiaries).where(eq(travelDiaries.id, diaryId)).limit(1))[0];
  if (!diary || !diary.isPublic) return c.json({ error: "게시글을 찾을 수 없습니다." }, 404);
  if (diary.userId !== user.id) {
    await notify(c.env, { recipientId: diary.userId, type: "share", actorName: user.nickname, diaryId: diary.id, diaryTitle: diary.title });
  }
  return c.json({ success: true });
});

export default notificationsApi;

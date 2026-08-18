import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db/client";
import { travelDiaries, diaryTags } from "../db/schema";
import { attachUser, requireAuth, type AppEnv } from "../lib/middleware";
import { mediaUrl } from "../lib/media-url";
import type { DiaryEntry, DiaryPhoto, DiaryBlock } from "../../shared/types";

type DiaryRow = typeof travelDiaries.$inferSelect;

const MEDIA_PREFIX = "/api/media/";
function keyToUrl(key: string): string {
  return key.startsWith(MEDIA_PREFIX) || key.startsWith("http") ? key : (mediaUrl(key) ?? key);
}
function urlToKey(url: string | undefined | null): string {
  if (!url) return "";
  return url.startsWith(MEDIA_PREFIX) ? url.slice(MEDIA_PREFIX.length) : url;
}

function photoToClient(p: DiaryPhoto): DiaryPhoto {
  return { ...p, url: keyToUrl(p.url) };
}
function photoToDb(p: DiaryPhoto): DiaryPhoto {
  return { ...p, url: urlToKey(p.url) };
}
function blockToClient(b: DiaryBlock): DiaryBlock {
  return b.type === "text" ? b : { ...b, content: keyToUrl(b.content) };
}
function blockToDb(b: DiaryBlock): DiaryBlock {
  return b.type === "text" ? b : { ...b, content: urlToKey(b.content) };
}

async function toClientDiary(row: DiaryRow, tags: string[], flags?: { isLikedByMe?: boolean; isBookmarkedByMe?: boolean }): Promise<DiaryEntry> {
  const mainPhoto = row.mainPhotoJson ? (JSON.parse(row.mainPhotoJson) as DiaryPhoto) : undefined;
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    location: row.location,
    startDate: row.startDate,
    endDate: row.endDate,
    content: row.content,
    blocks: (JSON.parse(row.blocksJson) as DiaryBlock[]).map(blockToClient),
    rating: row.rating,
    mainPhoto: mainPhoto ? photoToClient(mainPhoto) : undefined,
    photos: (JSON.parse(row.photosJson) as DiaryPhoto[]).map(photoToClient),
    displayMode: row.displayMode as DiaryEntry["displayMode"],
    tags,
    isPublic: row.isPublic,
    linkedPlanId: row.linkedPlanId ?? undefined,
    linkedPlanTitle: row.linkedPlanTitle ?? undefined,
    linkedPlanSchedules: row.linkedPlanSchedulesJson ? JSON.parse(row.linkedPlanSchedulesJson) : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    likesCount: row.likesCount,
    commentsCount: row.commentsCount,
    bookmarksCount: row.bookmarksCount,
    viewCount: row.viewCount,
    isLikedByMe: flags?.isLikedByMe,
    isBookmarkedByMe: flags?.isBookmarkedByMe,
  };
}

async function loadTags(env: AppEnv["Bindings"], diaryId: string): Promise<string[]> {
  const db = getDb(env);
  const rows = await db.select({ tag: diaryTags.tag }).from(diaryTags).where(eq(diaryTags.diaryId, diaryId));
  return rows.map((r) => r.tag);
}

async function replaceTags(env: AppEnv["Bindings"], diaryId: string, tags: string[]): Promise<void> {
  const db = getDb(env);
  await db.delete(diaryTags).where(eq(diaryTags.diaryId, diaryId));
  const unique = Array.from(new Set(tags.filter((t) => t.trim().length > 0)));
  if (unique.length > 0) {
    await db.insert(diaryTags).values(unique.map((tag) => ({ diaryId, tag })));
  }
}

const diaries = new Hono<AppEnv>();

diaries.use("*", attachUser);
diaries.use("*", requireAuth);

diaries.get("/", async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env);
  const rows = await db.select().from(travelDiaries).where(eq(travelDiaries.userId, user.id));
  const result = await Promise.all(rows.map(async (row) => toClientDiary(row, await loadTags(c.env, row.id))));
  return c.json({ diaries: result });
});

diaries.get("/:id", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  const db = getDb(c.env);
  const row = (await db.select().from(travelDiaries).where(eq(travelDiaries.id, id)).limit(1))[0];
  if (!row) return c.json({ error: "일기를 찾을 수 없습니다." }, 404);
  if (row.userId !== user.id && !row.isPublic) return c.json({ error: "접근 권한이 없습니다." }, 403);
  return c.json({ diary: await toClientDiary(row, await loadTags(c.env, row.id)) });
});

diaries.post("/", async (c) => {
  const user = c.get("user")!;
  const body = (await c.req.json().catch(() => ({}))) as Partial<DiaryEntry>;
  if (!body.title || !body.location || !body.startDate || !body.endDate)
    return c.json({ error: "입력값이 올바르지 않습니다." }, 400);

  const db = getDb(c.env);
  const id = body.id || nanoid();
  const now = new Date().toISOString();
  const values = {
    id,
    userId: user.id,
    title: body.title,
    location: body.location,
    startDate: body.startDate,
    endDate: body.endDate,
    content: body.content ?? "",
    rating: body.rating ?? 0,
    displayMode: (body.displayMode ?? "grid") as "grid" | "slide" | "blog",
    isPublic: body.isPublic ?? false,
    mainPhotoJson: body.mainPhoto ? JSON.stringify(photoToDb(body.mainPhoto)) : null,
    blocksJson: JSON.stringify((body.blocks ?? []).map(blockToDb)),
    photosJson: JSON.stringify((body.photos ?? []).map(photoToDb)),
    linkedPlanId: body.linkedPlanId ?? null,
    linkedPlanTitle: body.linkedPlanTitle ?? null,
    linkedPlanSchedulesJson: body.linkedPlanSchedules ? JSON.stringify(body.linkedPlanSchedules) : null,
    likesCount: 0,
    commentsCount: 0,
    bookmarksCount: 0,
    viewCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(travelDiaries).values(values);
  await replaceTags(c.env, id, body.tags ?? []);
  return c.json({ diary: await toClientDiary(values as DiaryRow, body.tags ?? []) }, 201);
});

diaries.put("/:id", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  const db = getDb(c.env);
  const existing = (await db.select().from(travelDiaries).where(eq(travelDiaries.id, id)).limit(1))[0];
  if (!existing) return c.json({ error: "일기를 찾을 수 없습니다." }, 404);
  if (existing.userId !== user.id && !user.isAdmin) return c.json({ error: "접근 권한이 없습니다." }, 403);

  const body = (await c.req.json().catch(() => ({}))) as Partial<DiaryEntry>;
  const updates = {
    title: body.title ?? existing.title,
    location: body.location ?? existing.location,
    startDate: body.startDate ?? existing.startDate,
    endDate: body.endDate ?? existing.endDate,
    content: body.content ?? existing.content,
    rating: body.rating ?? existing.rating,
    displayMode: (body.displayMode ?? existing.displayMode) as "grid" | "slide" | "blog",
    isPublic: body.isPublic !== undefined ? body.isPublic : existing.isPublic,
    mainPhotoJson: body.mainPhoto !== undefined ? (body.mainPhoto ? JSON.stringify(photoToDb(body.mainPhoto)) : null) : existing.mainPhotoJson,
    blocksJson: body.blocks !== undefined ? JSON.stringify(body.blocks.map(blockToDb)) : existing.blocksJson,
    photosJson: body.photos !== undefined ? JSON.stringify(body.photos.map(photoToDb)) : existing.photosJson,
    linkedPlanId: body.linkedPlanId !== undefined ? body.linkedPlanId : existing.linkedPlanId,
    linkedPlanTitle: body.linkedPlanTitle !== undefined ? body.linkedPlanTitle : existing.linkedPlanTitle,
    linkedPlanSchedulesJson:
      body.linkedPlanSchedules !== undefined ? JSON.stringify(body.linkedPlanSchedules) : existing.linkedPlanSchedulesJson,
    updatedAt: new Date().toISOString(),
  };
  await db.update(travelDiaries).set(updates).where(eq(travelDiaries.id, id));
  if (body.tags !== undefined) await replaceTags(c.env, id, body.tags);
  const tags = body.tags ?? (await loadTags(c.env, id));
  return c.json({ diary: await toClientDiary({ ...existing, ...updates }, tags) });
});

diaries.patch("/:id/visibility", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  const db = getDb(c.env);
  const existing = (await db.select().from(travelDiaries).where(eq(travelDiaries.id, id)).limit(1))[0];
  if (!existing) return c.json({ error: "일기를 찾을 수 없습니다." }, 404);
  if (existing.userId !== user.id && !user.isAdmin) return c.json({ error: "접근 권한이 없습니다." }, 403);
  const body = await c.req.json().catch(() => ({}));
  const isPublic = body.isPublic === true;
  await db.update(travelDiaries).set({ isPublic }).where(eq(travelDiaries.id, id));
  return c.json({ success: true });
});

diaries.delete("/:id", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  const db = getDb(c.env);
  const existing = (await db.select().from(travelDiaries).where(eq(travelDiaries.id, id)).limit(1))[0];
  if (!existing) return c.json({ error: "일기를 찾을 수 없습니다." }, 404);
  if (existing.userId !== user.id) return c.json({ error: "접근 권한이 없습니다." }, 403);
  await db.delete(travelDiaries).where(eq(travelDiaries.id, id));
  return c.json({ success: true });
});

export default diaries;
export { toClientDiary, loadTags, keyToUrl, urlToKey, photoToClient, photoToDb, blockToClient, blockToDb };

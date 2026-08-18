import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db/client";
import { albums } from "../db/schema";
import { attachUser, requireAuth, type AppEnv } from "../lib/middleware";
import { photoToClient, photoToDb } from "./diaries";
import type { Album, AlbumPhoto } from "../../shared/types";

type AlbumRow = typeof albums.$inferSelect;

function toClientAlbum(row: AlbumRow): Album {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    photos: (JSON.parse(row.photosJson) as AlbumPhoto[]).map(photoToClient),
    linkedPlanId: row.linkedPlanId ?? undefined,
    linkedPlanTitle: row.linkedPlanTitle ?? undefined,
    linkedPlanSchedules: row.linkedPlanSchedulesJson ? JSON.parse(row.linkedPlanSchedulesJson) : undefined,
    linkedPlanRegion: (row.linkedPlanRegion ?? undefined) as Album["linkedPlanRegion"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const albumsApi = new Hono<AppEnv>();

albumsApi.use("*", attachUser);
albumsApi.use("*", requireAuth);

albumsApi.get("/", async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env);
  const rows = await db.select().from(albums).where(eq(albums.userId, user.id));
  return c.json({ albums: rows.map(toClientAlbum) });
});

albumsApi.get("/:id", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  const db = getDb(c.env);
  const row = (await db.select().from(albums).where(eq(albums.id, id)).limit(1))[0];
  if (!row) return c.json({ error: "앨범을 찾을 수 없습니다." }, 404);
  if (row.userId !== user.id) return c.json({ error: "접근 권한이 없습니다." }, 403);
  return c.json({ album: toClientAlbum(row) });
});

albumsApi.post("/", async (c) => {
  const user = c.get("user")!;
  const body = (await c.req.json().catch(() => ({}))) as Partial<Album>;
  if (!body.title) return c.json({ error: "입력값이 올바르지 않습니다." }, 400);

  const db = getDb(c.env);
  const id = body.id || nanoid();
  const now = new Date().toISOString();
  const values = {
    id,
    userId: user.id,
    title: body.title,
    photosJson: JSON.stringify((body.photos ?? []).map(photoToDb)),
    linkedPlanId: body.linkedPlanId ?? null,
    linkedPlanTitle: body.linkedPlanTitle ?? null,
    linkedPlanSchedulesJson: body.linkedPlanSchedules ? JSON.stringify(body.linkedPlanSchedules) : null,
    linkedPlanRegion: body.linkedPlanRegion ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(albums).values(values);
  return c.json({ album: toClientAlbum(values as AlbumRow) }, 201);
});

albumsApi.put("/:id", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  const db = getDb(c.env);
  const existing = (await db.select().from(albums).where(eq(albums.id, id)).limit(1))[0];
  if (!existing) return c.json({ error: "앨범을 찾을 수 없습니다." }, 404);
  if (existing.userId !== user.id) return c.json({ error: "접근 권한이 없습니다." }, 403);

  const body = (await c.req.json().catch(() => ({}))) as Partial<Album>;
  const updates = {
    title: body.title ?? existing.title,
    photosJson: body.photos !== undefined ? JSON.stringify(body.photos.map(photoToDb)) : existing.photosJson,
    linkedPlanId: body.linkedPlanId !== undefined ? body.linkedPlanId : existing.linkedPlanId,
    linkedPlanTitle: body.linkedPlanTitle !== undefined ? body.linkedPlanTitle : existing.linkedPlanTitle,
    linkedPlanSchedulesJson:
      body.linkedPlanSchedules !== undefined ? JSON.stringify(body.linkedPlanSchedules) : existing.linkedPlanSchedulesJson,
    linkedPlanRegion: body.linkedPlanRegion !== undefined ? body.linkedPlanRegion : existing.linkedPlanRegion,
    updatedAt: new Date().toISOString(),
  };
  await db.update(albums).set(updates).where(eq(albums.id, id));
  return c.json({ album: toClientAlbum({ ...existing, ...updates }) });
});

albumsApi.delete("/:id", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  const db = getDb(c.env);
  const existing = (await db.select().from(albums).where(eq(albums.id, id)).limit(1))[0];
  if (!existing) return c.json({ error: "앨범을 찾을 수 없습니다." }, 404);
  if (existing.userId !== user.id) return c.json({ error: "접근 권한이 없습니다." }, 403);
  await db.delete(albums).where(eq(albums.id, id));
  return c.json({ success: true });
});

export default albumsApi;

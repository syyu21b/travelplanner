import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db/client";
import { travelDiaries } from "../db/schema";
import { attachUser, requireAuth, type AppEnv } from "../lib/middleware";

const ALLOWED_KINDS = ["diary-photo", "diary-block", "plan-cover", "album-photo", "profile-photo"] as const;
type MediaKind = (typeof ALLOWED_KINDS)[number];

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB (compressImage가 클라에서 이미 1200px/quality 0.7로 줄여서 보냄)

function parseKey(key: string): { kind: MediaKind; ownerUserId: string } | null {
  const [kind, ownerUserId] = key.split("/");
  if (!ALLOWED_KINDS.includes(kind as MediaKind) || !ownerUserId) return null;
  return { kind: kind as MediaKind, ownerUserId };
}

// D1은 큰 TEXT 컬럼에 대한 넓은 LIKE '%...%' 스캔을 "pattern too complex"로 거부하므로,
// SQL LIKE 대신 해당 사용자의 공개 일기들만 가져와 JS 문자열 포함 여부로 판정한다
// (사용자당 공개 일기 수가 많지 않다는 전제 — 대량화되면 별도 media_refs 테이블로 전환 필요).
async function isPublicDiaryPhotoKey(env: AppEnv["Bindings"], ownerUserId: string, key: string): Promise<boolean> {
  const db = getDb(env);
  const rows = await db
    .select({ photosJson: travelDiaries.photosJson, blocksJson: travelDiaries.blocksJson, mainPhotoJson: travelDiaries.mainPhotoJson })
    .from(travelDiaries)
    .where(and(eq(travelDiaries.userId, ownerUserId), eq(travelDiaries.isPublic, true)));
  return rows.some(
    (r) => r.photosJson.includes(key) || r.blocksJson.includes(key) || (r.mainPhotoJson?.includes(key) ?? false),
  );
}

const media = new Hono<AppEnv>();

media.use("*", attachUser);

media.post("/upload", requireAuth, async (c) => {
  const user = c.get("user")!;
  const kind = c.req.header("X-Media-Kind") as MediaKind | undefined;
  if (!kind || !ALLOWED_KINDS.includes(kind)) {
    return c.json({ error: "X-Media-Kind 헤더가 올바르지 않습니다." }, 400);
  }
  if (!c.env.MEDIA) {
    return c.json({ error: "미디어 저장소가 아직 설정되지 않았습니다." }, 503);
  }

  const contentType = c.req.header("Content-Type") || "application/octet-stream";
  const ext = EXT_BY_CONTENT_TYPE[contentType] ?? "bin";
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return c.json({ error: "빈 파일은 업로드할 수 없습니다." }, 400);
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return c.json({ error: "파일 용량이 너무 큽니다." }, 413);

  const key = `${kind}/${user.id}/${nanoid(16)}.${ext}`;
  await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType } });
  return c.json({ key, url: `/api/media/${key}` });
});

media.get("/:kind/:userId/:filename", async (c) => {
  if (!c.env.MEDIA) return c.json({ error: "미디어 저장소가 아직 설정되지 않았습니다." }, 503);
  const key = `${c.req.param("kind")}/${c.req.param("userId")}/${c.req.param("filename")}`;
  const parsed = parseKey(key);
  if (!parsed) return c.json({ error: "Not found" }, 404);

  if (parsed.kind !== "profile-photo") {
    const user = c.get("user");
    const isOwner = user?.id === parsed.ownerUserId;
    const isAdmin = user?.isAdmin === true;
    if (!isOwner && !isAdmin) {
      const isPublic = parsed.kind === "diary-photo" || parsed.kind === "diary-block"
        ? await isPublicDiaryPhotoKey(c.env, parsed.ownerUserId, key)
        : false; // plan-cover, album-photo는 항상 소유자 전용
      if (!isPublic) return c.json({ error: "접근 권한이 없습니다." }, 403);
    }
  }

  const object = await c.env.MEDIA.get(key);
  if (!object) return c.json({ error: "Not found" }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
});

media.delete("/:kind/:userId/:filename", requireAuth, async (c) => {
  const user = c.get("user")!;
  if (!c.env.MEDIA) return c.json({ error: "미디어 저장소가 아직 설정되지 않았습니다." }, 503);
  const key = `${c.req.param("kind")}/${c.req.param("userId")}/${c.req.param("filename")}`;
  const parsed = parseKey(key);
  if (!parsed) return c.json({ error: "Not found" }, 404);
  if (parsed.ownerUserId !== user.id && !user.isAdmin) return c.json({ error: "접근 권한이 없습니다." }, 403);
  await c.env.MEDIA.delete(key);
  return c.json({ success: true });
});

export default media;

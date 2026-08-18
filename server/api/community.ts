import { Hono } from "hono";
import { eq, and, desc, sql, like, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db/client";
import {
  travelDiaries, diaryTags, diaryLikes, diaryBookmarks, diaryComments, travelPlans, users,
} from "../db/schema";
import { attachUser, requireAuth, type AppEnv } from "../lib/middleware";
import { toClientDiary, loadTags } from "./diaries";
import { notify } from "../lib/notify";
import type { Comment, LinkedPlanPreview } from "../../shared/types";

const PAGE_SIZE = 10;

function toClientComment(row: typeof diaryComments.$inferSelect): Comment {
  return {
    id: row.id,
    diaryId: row.diaryId,
    userId: row.userId,
    userName: row.userName,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? undefined,
    likes: JSON.parse(row.likesJson),
  };
}

async function namesByUserId(env: AppEnv["Bindings"], userIds: string[]): Promise<Record<string, string>> {
  const db = getDb(env);
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return {};
  const rows = await db.select({ id: users.id, nickname: users.nickname }).from(users).where(inArray(users.id, unique));
  const map: Record<string, string> = {};
  rows.forEach((r) => { map[r.id] = r.nickname; });
  return map;
}

function toLinkedPlanPreview(row: typeof travelPlans.$inferSelect): LinkedPlanPreview {
  return {
    title: row.title,
    startDate: row.startDate,
    endDate: row.endDate,
    schedules: JSON.parse(row.schedulesJson),
    budgets: JSON.parse(row.budgetsJson),
    accommodations: JSON.parse(row.accommodationsJson),
    preparationChecks: JSON.parse(row.preparationChecksJson),
    isSnapshotOnly: false,
    allowClone: row.allowClone,
    ownerId: row.userId,
  };
}

function snapshotLinkedPlanPreview(diary: typeof travelDiaries.$inferSelect): LinkedPlanPreview | null {
  if (!diary.linkedPlanSchedulesJson) return null;
  return {
    title: diary.linkedPlanTitle ?? "",
    startDate: diary.startDate,
    endDate: diary.endDate,
    schedules: JSON.parse(diary.linkedPlanSchedulesJson),
    budgets: [],
    accommodations: [],
    preparationChecks: {},
    isSnapshotOnly: true,
    allowClone: false,
    ownerId: diary.userId,
  };
}

const community = new Hono<AppEnv>();

community.use("*", attachUser);

// ── 피드 (검색/태그/정렬/페이지네이션) ──
community.get("/diaries", async (c) => {
  const db = getDb(c.env);
  const me = c.get("user");
  const search = (c.req.query("search") ?? "").trim();
  const tag = (c.req.query("tag") ?? "").trim();
  const sort = c.req.query("sort") ?? "latest";
  const page = Math.max(1, Number(c.req.query("page") ?? "1") || 1);
  const pageSize = Math.min(50, Math.max(1, Number(c.req.query("pageSize") ?? String(PAGE_SIZE)) || PAGE_SIZE));

  let diaryIds: string[] | null = null;
  if (tag) {
    const rows = await db.select({ diaryId: diaryTags.diaryId }).from(diaryTags).where(eq(diaryTags.tag, tag));
    diaryIds = rows.map((r) => r.diaryId);
    if (diaryIds.length === 0) return c.json({ diaries: [], page, totalPages: 1, total: 0 });
  }

  const conditions = [eq(travelDiaries.isPublic, true)];
  if (search) {
    conditions.push(sql`(${travelDiaries.title} LIKE ${"%" + search + "%"} OR ${travelDiaries.location} LIKE ${"%" + search + "%"} OR ${travelDiaries.content} LIKE ${"%" + search + "%"})`);
  }
  if (diaryIds) conditions.push(inArray(travelDiaries.id, diaryIds));

  const orderBy =
    sort === "popular"
      ? [desc(travelDiaries.likesCount), desc(travelDiaries.createdAt)]
      : sort === "comments"
        ? [desc(travelDiaries.commentsCount), desc(travelDiaries.createdAt)]
        : [desc(travelDiaries.createdAt)];

  const allMatching = await db.select().from(travelDiaries).where(and(...conditions)).orderBy(...orderBy);
  const total = allMatching.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = allMatching.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const likedSet = new Set<string>();
  const savedSet = new Set<string>();
  if (me && pageRows.length > 0) {
    const ids = pageRows.map((r) => r.id);
    const likes = await db.select({ diaryId: diaryLikes.diaryId }).from(diaryLikes).where(and(eq(diaryLikes.userId, me.id), inArray(diaryLikes.diaryId, ids)));
    likes.forEach((l) => likedSet.add(l.diaryId));
    const saves = await db.select({ diaryId: diaryBookmarks.diaryId }).from(diaryBookmarks).where(and(eq(diaryBookmarks.userId, me.id), inArray(diaryBookmarks.diaryId, ids)));
    saves.forEach((s) => savedSet.add(s.diaryId));
  }

  const names = await namesByUserId(c.env, pageRows.map((r) => r.userId));
  const diaries = await Promise.all(
    pageRows.map(async (row) => ({
      ...(await toClientDiary(row, [], { isLikedByMe: likedSet.has(row.id), isBookmarkedByMe: savedSet.has(row.id) })),
      userName: names[row.userId],
    })),
  );
  // 태그는 상세 화면에서만 필요하므로 목록에서는 빈 배열로 두어 N+1 쿼리를 피함(피드 카드가 태그를 표시하지 않음)
  return c.json({ diaries, page: pageSafe, totalPages, total });
});

community.get("/stats", async (c) => {
  const db = getDb(c.env);
  const rows = await db.select({ userId: travelDiaries.userId, location: travelDiaries.location }).from(travelDiaries).where(eq(travelDiaries.isPublic, true));
  return c.json({
    totalReviews: rows.length,
    destinations: new Set(rows.map((r) => r.location)).size,
    travelers: new Set(rows.map((r) => r.userId)).size,
  });
});

community.get("/tags", async (c) => {
  const db = getDb(c.env);
  const rows = await db
    .select({ tag: diaryTags.tag })
    .from(diaryTags)
    .innerJoin(travelDiaries, eq(diaryTags.diaryId, travelDiaries.id))
    .where(eq(travelDiaries.isPublic, true));
  return c.json({ tags: Array.from(new Set(rows.map((r) => r.tag))) });
});

// ── 상세 (연결된 계획 join 포함) ──
community.get("/diaries/:id", async (c) => {
  const db = getDb(c.env);
  const me = c.get("user");
  const id = c.req.param("id")!;
  const row = (await db.select().from(travelDiaries).where(eq(travelDiaries.id, id)).limit(1))[0];
  if (!row) return c.json({ error: "일기를 찾을 수 없습니다." }, 404);
  if (!row.isPublic && row.userId !== me?.id) return c.json({ error: "접근 권한이 없습니다." }, 403);

  const tags = await loadTags(c.env, id);
  let isLikedByMe = false;
  let isBookmarkedByMe = false;
  if (me) {
    isLikedByMe = (await db.select({ x: diaryLikes.diaryId }).from(diaryLikes).where(and(eq(diaryLikes.diaryId, id), eq(diaryLikes.userId, me.id))).limit(1)).length > 0;
    isBookmarkedByMe = (await db.select({ x: diaryBookmarks.diaryId }).from(diaryBookmarks).where(and(eq(diaryBookmarks.diaryId, id), eq(diaryBookmarks.userId, me.id))).limit(1)).length > 0;
  }
  const names = await namesByUserId(c.env, [row.userId]);
  const diary = { ...(await toClientDiary(row, tags, { isLikedByMe, isBookmarkedByMe })), userName: names[row.userId] };

  let linkedPlan: LinkedPlanPreview | null = null;
  if (row.linkedPlanId) {
    const planRow = (await db.select().from(travelPlans).where(eq(travelPlans.id, row.linkedPlanId)).limit(1))[0];
    linkedPlan = planRow ? toLinkedPlanPreview(planRow) : snapshotLinkedPlanPreview(row);
  } else {
    linkedPlan = snapshotLinkedPlanPreview(row);
  }

  return c.json({ diary, linkedPlan });
});

community.post("/diaries/:id/view", async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id")!;
  await db.update(travelDiaries).set({ viewCount: sql`${travelDiaries.viewCount} + 1` }).where(eq(travelDiaries.id, id));
  return c.json({ success: true });
});

// ── 좋아요 ──
community.post("/diaries/:id/like", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const db = getDb(c.env);
  const diary = (await db.select().from(travelDiaries).where(eq(travelDiaries.id, id)).limit(1))[0];
  if (!diary) return c.json({ error: "일기를 찾을 수 없습니다." }, 404);
  const existing = await db.select().from(diaryLikes).where(and(eq(diaryLikes.diaryId, id), eq(diaryLikes.userId, user.id))).limit(1);
  if (existing.length === 0) {
    await db.insert(diaryLikes).values({ diaryId: id, userId: user.id, createdAt: new Date().toISOString() });
    await db.update(travelDiaries).set({ likesCount: sql`${travelDiaries.likesCount} + 1` }).where(eq(travelDiaries.id, id));

    const newCount = diary.likesCount + 1;
    if (diary.likesCount < 5 && newCount >= 5 && diary.userId !== user.id) {
      await notify(c.env, { recipientId: diary.userId, type: "popular", diaryId: diary.id, diaryTitle: diary.title }).catch(() => {});
    } else if (diary.userId !== user.id) {
      await notify(c.env, { recipientId: diary.userId, type: "like", actorName: user.nickname, diaryId: diary.id, diaryTitle: diary.title }).catch(() => {});
    }
  }
  return c.json({ success: true });
});

community.delete("/diaries/:id/like", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const db = getDb(c.env);
  const existing = await db.select().from(diaryLikes).where(and(eq(diaryLikes.diaryId, id), eq(diaryLikes.userId, user.id))).limit(1);
  if (existing.length > 0) {
    await db.delete(diaryLikes).where(and(eq(diaryLikes.diaryId, id), eq(diaryLikes.userId, user.id)));
    await db.update(travelDiaries).set({ likesCount: sql`${travelDiaries.likesCount} - 1` }).where(eq(travelDiaries.id, id));
  }
  return c.json({ success: true });
});

// ── 북마크 ──
community.post("/diaries/:id/bookmark", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const db = getDb(c.env);
  const existing = await db.select().from(diaryBookmarks).where(and(eq(diaryBookmarks.diaryId, id), eq(diaryBookmarks.userId, user.id))).limit(1);
  if (existing.length === 0) {
    await db.insert(diaryBookmarks).values({ diaryId: id, userId: user.id, createdAt: new Date().toISOString() });
    await db.update(travelDiaries).set({ bookmarksCount: sql`${travelDiaries.bookmarksCount} + 1` }).where(eq(travelDiaries.id, id));
  }
  return c.json({ success: true });
});

community.delete("/diaries/:id/bookmark", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const db = getDb(c.env);
  const existing = await db.select().from(diaryBookmarks).where(and(eq(diaryBookmarks.diaryId, id), eq(diaryBookmarks.userId, user.id))).limit(1);
  if (existing.length > 0) {
    await db.delete(diaryBookmarks).where(and(eq(diaryBookmarks.diaryId, id), eq(diaryBookmarks.userId, user.id)));
    await db.update(travelDiaries).set({ bookmarksCount: sql`${travelDiaries.bookmarksCount} - 1` }).where(eq(travelDiaries.id, id));
  }
  return c.json({ success: true });
});

community.get("/bookmarks", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env);
  const rows = await db
    .select({ diary: travelDiaries })
    .from(diaryBookmarks)
    .innerJoin(travelDiaries, eq(diaryBookmarks.diaryId, travelDiaries.id))
    .where(eq(diaryBookmarks.userId, user.id));
  const diaries = await Promise.all(rows.map((r) => toClientDiary(r.diary, [], { isBookmarkedByMe: true })));
  return c.json({ diaries });
});

community.get("/likes", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env);
  const rows = await db
    .select({ diary: travelDiaries })
    .from(diaryLikes)
    .innerJoin(travelDiaries, eq(diaryLikes.diaryId, travelDiaries.id))
    .where(eq(diaryLikes.userId, user.id));
  const diaries = await Promise.all(rows.map((r) => toClientDiary(r.diary, [], { isLikedByMe: true })));
  return c.json({ diaries });
});

// 마이페이지 "내가 쓴 댓글" — 게시글 제목/공개여부를 함께 내려줘 클라이언트에서 별도 조회 없이 이동 가능
community.get("/my-comments", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env);
  const rows = await db
    .select({ comment: diaryComments, diaryTitle: travelDiaries.title, diaryIsPublic: travelDiaries.isPublic })
    .from(diaryComments)
    .innerJoin(travelDiaries, eq(diaryComments.diaryId, travelDiaries.id))
    .where(eq(diaryComments.userId, user.id))
    .orderBy(desc(diaryComments.createdAt));
  const comments = rows.map((r) => ({ ...toClientComment(r.comment), diaryTitle: r.diaryTitle, diaryIsPublic: r.diaryIsPublic }));
  return c.json({ comments });
});

// ── 댓글 ──
community.get("/diaries/:id/comments", async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id")!;
  const rows = await db.select().from(diaryComments).where(eq(diaryComments.diaryId, id)).orderBy(diaryComments.createdAt);
  return c.json({ comments: rows.map(toClientComment) });
});

community.post("/diaries/:id/comments", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const db = getDb(c.env);
  const diary = (await db.select().from(travelDiaries).where(eq(travelDiaries.id, id)).limit(1))[0];
  if (!diary) return c.json({ error: "일기를 찾을 수 없습니다." }, 404);
  const body = await c.req.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) return c.json({ error: "내용을 입력해주세요." }, 400);

  const commentId = nanoid();
  const now = new Date().toISOString();
  await db.insert(diaryComments).values({
    id: commentId, diaryId: id, userId: user.id, userName: user.nickname, content, likesJson: "[]", createdAt: now,
  });
  await db.update(travelDiaries).set({ commentsCount: sql`${travelDiaries.commentsCount} + 1` }).where(eq(travelDiaries.id, id));

  if (diary.userId !== user.id) {
    await notify(c.env, { recipientId: diary.userId, type: "comment", actorName: user.nickname, diaryId: diary.id, diaryTitle: diary.title }).catch(() => {});
  }

  const created = (await db.select().from(diaryComments).where(eq(diaryComments.id, commentId)).limit(1))[0];
  return c.json({ comment: toClientComment(created) }, 201);
});

community.put("/comments/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const db = getDb(c.env);
  const existing = (await db.select().from(diaryComments).where(eq(diaryComments.id, id)).limit(1))[0];
  if (!existing) return c.json({ error: "댓글을 찾을 수 없습니다." }, 404);
  if (existing.userId !== user.id) return c.json({ error: "접근 권한이 없습니다." }, 403);
  const body = await c.req.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) return c.json({ error: "내용을 입력해주세요." }, 400);
  await db.update(diaryComments).set({ content, updatedAt: new Date().toISOString() }).where(eq(diaryComments.id, id));
  return c.json({ success: true });
});

community.delete("/comments/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const db = getDb(c.env);
  const existing = (await db.select().from(diaryComments).where(eq(diaryComments.id, id)).limit(1))[0];
  if (!existing) return c.json({ error: "댓글을 찾을 수 없습니다." }, 404);
  if (existing.userId !== user.id) return c.json({ error: "접근 권한이 없습니다." }, 403);
  await db.delete(diaryComments).where(eq(diaryComments.id, id));
  await db.update(travelDiaries).set({ commentsCount: sql`${travelDiaries.commentsCount} - 1` }).where(eq(travelDiaries.id, existing.diaryId));
  return c.json({ success: true });
});

community.post("/comments/:id/like", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const db = getDb(c.env);
  const existing = (await db.select().from(diaryComments).where(eq(diaryComments.id, id)).limit(1))[0];
  if (!existing) return c.json({ error: "댓글을 찾을 수 없습니다." }, 404);
  const likes: string[] = JSON.parse(existing.likesJson);
  if (!likes.includes(user.id)) likes.push(user.id);
  await db.update(diaryComments).set({ likesJson: JSON.stringify(likes) }).where(eq(diaryComments.id, id));
  return c.json({ success: true });
});

community.delete("/comments/:id/like", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const db = getDb(c.env);
  const existing = (await db.select().from(diaryComments).where(eq(diaryComments.id, id)).limit(1))[0];
  if (!existing) return c.json({ error: "댓글을 찾을 수 없습니다." }, 404);
  const likes: string[] = JSON.parse(existing.likesJson).filter((id_: string) => id_ !== user.id);
  await db.update(diaryComments).set({ likesJson: JSON.stringify(likes) }).where(eq(diaryComments.id, id));
  return c.json({ success: true });
});

// ── 계획 복제 (다른 회원이 공개 일기에 연결된 계획을 자기 계획 목록으로 복사) ──
community.post("/diaries/:id/clone-plan", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const db = getDb(c.env);
  const diary = (await db.select().from(travelDiaries).where(eq(travelDiaries.id, id)).limit(1))[0];
  if (!diary || !diary.isPublic || !diary.linkedPlanId) return c.json({ error: "복제할 계획을 찾을 수 없습니다." }, 404);
  const plan = (await db.select().from(travelPlans).where(eq(travelPlans.id, diary.linkedPlanId)).limit(1))[0];
  if (!plan) return c.json({ error: "복제할 계획을 찾을 수 없습니다." }, 404);
  if (!plan.allowClone) return c.json({ error: "작성자가 복제를 허용하지 않았습니다." }, 403);
  if (plan.userId === user.id) return c.json({ error: "본인 계획은 복제할 수 없습니다." }, 400);

  const newId = nanoid();
  const now = new Date().toISOString();
  await db.insert(travelPlans).values({
    id: newId,
    userId: user.id,
    title: plan.title,
    startDate: plan.startDate,
    endDate: plan.endDate,
    region: plan.region,
    coverPhotoKey: plan.coverPhotoKey,
    schedulesJson: plan.schedulesJson,
    budgetsJson: plan.budgetsJson,
    shoppingListJson: plan.shoppingListJson,
    accommodationsJson: plan.accommodationsJson,
    flightsJson: plan.flightsJson,
    preparationChecksJson: plan.preparationChecksJson,
    totalBudgetAmount: plan.totalBudgetAmount,
    travelers: plan.travelers,
    allowClone: false,
    createdAt: now,
    updatedAt: now,
  });
  return c.json({ planId: newId }, 201);
});

export default community;

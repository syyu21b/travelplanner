import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db/client";
import { inquiries, users } from "../db/schema";
import { attachUser, requireAuth, requireAdmin, type AppEnv } from "../lib/middleware";
import { notify } from "../lib/notify";
import type { Inquiry } from "../../shared/types";

function toClientInquiry(row: typeof inquiries.$inferSelect): Inquiry {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    email: row.email,
    title: row.title,
    content: row.content,
    createdAt: row.createdAt,
    status: row.status,
    answer: row.answer ?? undefined,
    answeredAt: row.answeredAt ?? undefined,
  };
}

const inquiriesApi = new Hono<AppEnv>();

inquiriesApi.use("*", attachUser);

inquiriesApi.post("/", async (c) => {
  const me = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const { name, email, title, content } = body as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim() || typeof email !== "string" || !email.trim() || typeof title !== "string" || !title.trim() || typeof content !== "string" || !content.trim()) {
    return c.json({ error: "입력값이 올바르지 않습니다." }, 400);
  }

  const db = getDb(c.env);
  const id = nanoid();
  const now = new Date().toISOString();
  await db.insert(inquiries).values({
    id,
    userId: me?.id ?? null,
    name: name.trim(),
    email: email.trim(),
    title: title.trim(),
    content: content.trim(),
    status: "pending",
    createdAt: now,
  });

  const admins = await db.select({ id: users.id }).from(users).where(eq(users.isAdmin, true));
  await Promise.all(
    admins.map((admin) =>
      notify(c.env, { recipientId: admin.id, type: "inquiry-new", actorName: name.trim(), inquiryId: id, inquiryTitle: title.trim() }).catch(() => {}),
    ),
  );

  return c.json({ inquiry: { id, userId: me?.id ?? null, name: name.trim(), email: email.trim(), title: title.trim(), content: content.trim(), createdAt: now, status: "pending" as const } }, 201);
});

inquiriesApi.get("/", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env);
  const rows = user.isAdmin
    ? await db.select().from(inquiries).orderBy(desc(inquiries.createdAt))
    : await db.select().from(inquiries).where(eq(inquiries.userId, user.id)).orderBy(desc(inquiries.createdAt));
  return c.json({ inquiries: rows.map(toClientInquiry) });
});

inquiriesApi.post("/:id/answer", requireAdmin, async (c) => {
  const id = c.req.param("id")!;
  const body = await c.req.json().catch(() => ({}));
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (!answer) return c.json({ error: "답변 내용을 입력해주세요." }, 400);

  const db = getDb(c.env);
  const existing = (await db.select().from(inquiries).where(eq(inquiries.id, id)).limit(1))[0];
  if (!existing) return c.json({ error: "문의를 찾을 수 없습니다." }, 404);

  const answeredAt = new Date().toISOString();
  await db.update(inquiries).set({ answer, answeredAt, status: "answered" }).where(eq(inquiries.id, id));

  if (existing.userId) {
    await notify(c.env, { recipientId: existing.userId, type: "inquiry-answer", inquiryId: id, inquiryTitle: existing.title }).catch(() => {});
  }

  return c.json({ success: true });
});

export default inquiriesApi;

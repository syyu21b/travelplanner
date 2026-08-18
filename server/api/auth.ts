import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db/client";
import { users, passportVault, userProfiles } from "../db/schema";
import { hashPassword, verifyPassword as verifyPasswordHash } from "../lib/password";
import { createSession, destroySession, setSessionCookie, clearSessionCookie } from "../lib/session";
import { attachUser, requireAuth, requireAdmin, type AppEnv } from "../lib/middleware";
import { getCookie } from "hono/cookie";
import { COOKIE_NAME } from "../../shared/const";
import type { User } from "../../shared/types";

const ADMIN_ID = "admin-syyu21b";
const ADMIN_SEED_PASSWORD = "astu345Q@";

function toPublicUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    name: row.nickname,
    email: row.email,
    isAdmin: row.isAdmin,
    createdAt: row.createdAt,
  };
}

export async function seedAdmin(env: Parameters<typeof getDb>[0]) {
  const db = getDb(env);
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, ADMIN_ID)).limit(1);
  if (existing.length > 0) return;
  const passwordHash = await hashPassword(ADMIN_SEED_PASSWORD);
  await db.insert(users).values({
    id: ADMIN_ID,
    username: "syyu21b",
    nickname: "관리자",
    email: "admin@travelplanner.com",
    passwordHash,
    isAdmin: true,
    createdAt: new Date().toISOString(),
  });
}

const registerSchema = z.object({
  username: z.string().min(1),
  nickname: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

const auth = new Hono<AppEnv>();

auth.use("*", async (c, next) => {
  await seedAdmin(c.env);
  await next();
});
auth.use("*", attachUser);

auth.get("/me", async (c) => {
  const user = c.get("user");
  return c.json({ user: user ? toPublicUser(user) : null });
});

auth.get("/check-username", async (c) => {
  const value = c.req.query("value") ?? "";
  const db = getDb(c.env);
  const found = await db.select({ id: users.id }).from(users).where(eq(users.username, value)).limit(1);
  return c.json({ available: found.length === 0 });
});

auth.get("/check-nickname", async (c) => {
  const value = c.req.query("value") ?? "";
  const db = getDb(c.env);
  const found = await db.select({ id: users.id }).from(users).where(eq(users.nickname, value)).limit(1);
  return c.json({ available: found.length === 0 });
});

auth.get("/find-username", async (c) => {
  const email = c.req.query("email") ?? "";
  const db = getDb(c.env);
  const found = await db.select({ username: users.username }).from(users).where(eq(users.email, email)).limit(1);
  return c.json({ username: found[0]?.username ?? null });
});

auth.post("/register", async (c) => {
  const body = registerSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ success: false, message: "입력값이 올바르지 않습니다." }, 400);
  const { username, nickname, email, password } = body.data;

  const db = getDb(c.env);
  if ((await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1)).length > 0)
    return c.json({ success: false, message: "이미 사용 중인 아이디입니다." }, 409);
  if ((await db.select({ id: users.id }).from(users).where(eq(users.nickname, nickname)).limit(1)).length > 0)
    return c.json({ success: false, message: "이미 사용 중인 닉네임입니다." }, 409);
  if ((await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)).length > 0)
    return c.json({ success: false, message: "이미 사용 중인 이메일입니다." }, 409);

  const id = nanoid();
  const passwordHash = await hashPassword(password);
  const createdAt = new Date().toISOString();
  await db.insert(users).values({ id, username, nickname, email, passwordHash, isAdmin: false, createdAt });

  const sessionId = await createSession(c.env, id);
  setSessionCookie(c, sessionId);
  return c.json({ success: true, message: "회원가입이 완료되었습니다!", user: toPublicUser({ id, username, nickname, email, passwordHash, isAdmin: false, createdAt }) });
});

auth.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  const db = getDb(c.env);
  const found = (await db.select().from(users).where(eq(users.username, username)).limit(1))[0];
  if (!found || !(await verifyPasswordHash(password, found.passwordHash)))
    return c.json({ success: false, message: "아이디 또는 비밀번호가 일치하지 않습니다." }, 401);

  const sessionId = await createSession(c.env, found.id);
  setSessionCookie(c, sessionId);
  return c.json({ success: true, message: "로그인 되었습니다!", user: toPublicUser(found) });
});

auth.post("/logout", async (c) => {
  const sessionId = getCookie(c, COOKIE_NAME);
  if (sessionId) await destroySession(c.env, sessionId);
  clearSessionCookie(c);
  return c.json({ success: true });
});

auth.post("/reset-password", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { username, email, newPassword } = body as Record<string, unknown>;
  if (typeof username !== "string" || typeof email !== "string" || typeof newPassword !== "string" || newPassword.length < 6)
    return c.json({ success: false, message: "입력값이 올바르지 않습니다." }, 400);

  const db = getDb(c.env);
  const found = (await db.select().from(users).where(eq(users.username, username)).limit(1))[0];
  if (!found || found.email !== email)
    return c.json({ success: false, message: "아이디 또는 이메일이 올바르지 않습니다." }, 400);

  await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, found.id));
  return c.json({ success: true, message: "비밀번호가 변경되었습니다." });
});

auth.post("/verify-password", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  return c.json({ valid: await verifyPasswordHash(password, user.passwordHash) });
});

auth.patch("/profile", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const { nickname, email } = body as { nickname?: string; email?: string };
  const db = getDb(c.env);

  const updates: Partial<typeof users.$inferInsert> = {};
  if (nickname && nickname !== user.nickname) {
    if ((await db.select({ id: users.id }).from(users).where(eq(users.nickname, nickname)).limit(1)).length > 0)
      return c.json({ success: false, message: "이미 사용 중인 닉네임입니다." }, 409);
    updates.nickname = nickname;
  }
  if (email && email !== user.email) {
    if ((await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)).length > 0)
      return c.json({ success: false, message: "이미 사용 중인 이메일입니다." }, 409);
    updates.email = email;
  }
  if (Object.keys(updates).length > 0) {
    await db.update(users).set(updates).where(eq(users.id, user.id));
  }
  const updated = { ...user, ...updates };
  return c.json({ success: true, message: "프로필이 업데이트되었습니다.", user: toPublicUser(updated) });
});

auth.post("/change-password", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const { currentPassword, newPassword } = body as { currentPassword?: string; newPassword?: string };
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || newPassword.length < 6)
    return c.json({ success: false, message: "새 비밀번호는 6자 이상이어야 합니다." }, 400);
  if (!(await verifyPasswordHash(currentPassword, user.passwordHash)))
    return c.json({ success: false, message: "현재 비밀번호가 일치하지 않습니다." }, 401);

  const db = getDb(c.env);
  await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, user.id));
  return c.json({ success: true, message: "비밀번호가 변경되었습니다." });
});

auth.post("/withdraw", requireAuth, async (c) => {
  const user = c.get("user")!;
  if (user.isAdmin) return c.json({ success: false, message: "관리자 계정은 탈퇴할 수 없습니다." }, 403);
  const db = getDb(c.env);
  // FK ON DELETE CASCADE가 plans/diaries/comments/likes/bookmarks/notifications 등을 함께 정리한다.
  await db.delete(users).where(eq(users.id, user.id));
  clearSessionCookie(c);
  return c.json({ success: true, message: "회원 탈퇴가 완료되었습니다." });
});

// ── 여권 정보 보관함 (서버는 암호문만 보관, 평문은 절대 보지 않음) ──

auth.get("/passport/status", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env);
  const found = await db.select({ userId: passportVault.userId }).from(passportVault).where(eq(passportVault.userId, user.id)).limit(1);
  return c.json({ exists: found.length > 0 });
});

auth.put("/passport", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const { password, ciphertext, iv, salt } = body as Record<string, unknown>;
  if (typeof password !== "string" || typeof ciphertext !== "string" || typeof iv !== "string" || typeof salt !== "string")
    return c.json({ success: false, message: "입력값이 올바르지 않습니다." }, 400);
  if (!(await verifyPasswordHash(password, user.passwordHash)))
    return c.json({ success: false, message: "비밀번호가 일치하지 않습니다." }, 401);

  const db = getDb(c.env);
  const updatedAt = new Date().toISOString();
  await db
    .insert(passportVault)
    .values({ userId: user.id, ciphertext, iv, salt, updatedAt })
    .onConflictDoUpdate({ target: passportVault.userId, set: { ciphertext, iv, salt, updatedAt } });
  return c.json({ success: true, message: "여권 정보가 안전하게 저장되었습니다." });
});

auth.post("/passport/reveal", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  if (!(await verifyPasswordHash(password, user.passwordHash)))
    return c.json({ success: false, message: "비밀번호가 일치하지 않습니다." }, 401);

  const db = getDb(c.env);
  const entry = (await db.select().from(passportVault).where(eq(passportVault.userId, user.id)).limit(1))[0];
  if (!entry) return c.json({ success: false, message: "저장된 여권 정보가 없습니다." }, 404);
  return c.json({ success: true, message: "확인되었습니다.", payload: { ciphertext: entry.ciphertext, iv: entry.iv, salt: entry.salt } });
});

auth.post("/passport/delete", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  if (!(await verifyPasswordHash(password, user.passwordHash)))
    return c.json({ success: false, message: "비밀번호가 일치하지 않습니다." }, 401);

  const db = getDb(c.env);
  await db.delete(passportVault).where(eq(passportVault.userId, user.id));
  return c.json({ success: true, message: "여권 정보가 삭제되었습니다." });
});

// ── 프로필 사진 (R2 key는 /api/media/upload로 먼저 업로드 후 여기로 연결) ──

auth.get("/profile-photo/:userId", async (c) => {
  const userId = c.req.param("userId");
  const db = getDb(c.env);
  const found = (await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1))[0];
  const photoUrl = found?.photoKey ? `/api/media/${found.photoKey}` : null;
  return c.json({ photoUrl });
});

auth.put("/profile-photo", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const photoKey = typeof body.photoKey === "string" ? body.photoKey : null;
  const db = getDb(c.env);
  if (photoKey === null) {
    await db.delete(userProfiles).where(eq(userProfiles.userId, user.id));
  } else {
    await db
      .insert(userProfiles)
      .values({ userId: user.id, photoKey })
      .onConflictDoUpdate({ target: userProfiles.userId, set: { photoKey } });
  }
  return c.json({ success: true });
});

// ── 관리자 전용 ──

auth.get("/admin/users", requireAdmin, async (c) => {
  const db = getDb(c.env);
  const rows = await db.select().from(users);
  return c.json({ users: rows.map(({ passwordHash: _passwordHash, ...rest }) => rest) });
});

auth.patch("/admin/users/:id", requireAdmin, async (c) => {
  const userId = c.req.param("id")!;
  const body = await c.req.json().catch(() => ({}));
  const { nickname, email, password } = body as { nickname?: string; email?: string; password?: string };
  const db = getDb(c.env);
  const found = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!found) return c.json({ success: false, message: "사용자를 찾을 수 없습니다." }, 404);

  const updates: Partial<typeof users.$inferInsert> = {};
  if (nickname && nickname !== found.nickname) {
    if ((await db.select({ id: users.id }).from(users).where(eq(users.nickname, nickname)).limit(1)).length > 0)
      return c.json({ success: false, message: "이미 사용 중인 닉네임입니다." }, 409);
    updates.nickname = nickname;
  }
  if (email && email !== found.email) {
    if ((await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)).length > 0)
      return c.json({ success: false, message: "이미 사용 중인 이메일입니다." }, 409);
    updates.email = email;
  }
  if (password) updates.passwordHash = await hashPassword(password);
  if (Object.keys(updates).length > 0) await db.update(users).set(updates).where(eq(users.id, userId));
  return c.json({ success: true, message: "회원 정보가 수정되었습니다." });
});

auth.delete("/admin/users/:id", requireAdmin, async (c) => {
  const userId = c.req.param("id")!;
  if (userId === ADMIN_ID) return c.json({ success: false, message: "관리자 계정은 삭제할 수 없습니다." }, 403);
  const db = getDb(c.env);
  const found = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (found.length === 0) return c.json({ success: false, message: "사용자를 찾을 수 없습니다." }, 404);
  await db.delete(users).where(eq(users.id, userId));
  return c.json({ success: true, message: "회원이 삭제되었습니다." });
});

export default auth;

import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db/client";
import { users, passportVault, userProfiles, emailVerifications } from "../db/schema";
import { hashPassword, verifyPassword as verifyPasswordHash } from "../lib/password";
import { createSession, destroySession, setSessionCookie, clearSessionCookie } from "../lib/session";
import { attachUser, requireAuth, requireAdmin, type AppEnv } from "../lib/middleware";
import { sendVerificationEmail } from "../lib/email";
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
    phoneNumber: row.phoneNumber,
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
  phoneNumber: z.string().optional().refine((v) => !v || /^01[0-9]{8,9}$/.test(v), "올바른 휴대전화번호를 입력해주세요."),
});

const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CODE_RESEND_COOLDOWN_MS = 60 * 1000;

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

auth.post("/email/send-code", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ success: false, message: "올바른 이메일을 입력해주세요." }, 400);

  const db = getDb(c.env);
  if ((await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)).length > 0)
    return c.json({ success: false, message: "이미 사용 중인 이메일입니다." }, 409);

  const existing = (await db.select().from(emailVerifications).where(eq(emailVerifications.email, email)).limit(1))[0];
  const now = Date.now();
  if (existing && now - new Date(existing.createdAt).getTime() < EMAIL_CODE_RESEND_COOLDOWN_MS)
    return c.json({ success: false, message: "잠시 후 다시 시도해주세요." }, 429);

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + EMAIL_CODE_TTL_MS).toISOString();
  await db
    .insert(emailVerifications)
    .values({ email, code, verified: false, expiresAt, createdAt })
    .onConflictDoUpdate({ target: emailVerifications.email, set: { code, verified: false, expiresAt, createdAt } });

  const sent = await sendVerificationEmail(c.env, email, code);
  if (!sent) return c.json({ success: false, message: "이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요." }, 502);
  return c.json({ success: true, message: "인증코드가 발송되었습니다." });
});

auth.post("/email/verify-code", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email : "";
  const code = typeof body.code === "string" ? body.code : "";

  const db = getDb(c.env);
  const found = (await db.select().from(emailVerifications).where(eq(emailVerifications.email, email)).limit(1))[0];
  if (!found || found.code !== code || new Date(found.expiresAt).getTime() < Date.now())
    return c.json({ success: false, message: "인증코드가 올바르지 않거나 만료되었습니다." }, 400);

  await db.update(emailVerifications).set({ verified: true }).where(eq(emailVerifications.email, email));
  return c.json({ success: true, message: "이메일 인증이 완료되었습니다!" });
});

auth.post("/register", async (c) => {
  const body = registerSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ success: false, message: "입력값이 올바르지 않습니다." }, 400);
  const { username, nickname, email, password, phoneNumber } = body.data;

  const db = getDb(c.env);
  if ((await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1)).length > 0)
    return c.json({ success: false, message: "이미 사용 중인 아이디입니다." }, 409);
  if ((await db.select({ id: users.id }).from(users).where(eq(users.nickname, nickname)).limit(1)).length > 0)
    return c.json({ success: false, message: "이미 사용 중인 닉네임입니다." }, 409);
  if ((await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)).length > 0)
    return c.json({ success: false, message: "이미 사용 중인 이메일입니다." }, 409);

  const verification = (await db.select().from(emailVerifications).where(eq(emailVerifications.email, email)).limit(1))[0];
  if (!verification?.verified) return c.json({ success: false, message: "이메일 인증을 완료해주세요." }, 400);

  const id = nanoid();
  const passwordHash = await hashPassword(password);
  const createdAt = new Date().toISOString();
  const newUser = { id, username, nickname, email, passwordHash, phoneNumber: phoneNumber ?? null, isAdmin: false, createdAt };
  await db.insert(users).values(newUser);
  await db.delete(emailVerifications).where(eq(emailVerifications.email, email));

  const sessionId = await createSession(c.env, id);
  setSessionCookie(c, sessionId);
  return c.json({ success: true, message: "회원가입이 완료되었습니다!", user: toPublicUser(newUser) });
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

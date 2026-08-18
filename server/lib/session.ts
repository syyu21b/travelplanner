import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const";
import { getDb } from "../db/client";
import { sessions, users } from "../db/schema";
import type { Env } from "../env";

const SESSION_TTL_MS = ONE_YEAR_MS;

export async function createSession(env: Env, userId: string): Promise<string> {
  const db = getDb(env);
  const id = nanoid(32);
  const now = new Date();
  await db.insert(sessions).values({
    id,
    userId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
  });
  return id;
}

export function setSessionCookie(c: Context, sessionId: string) {
  setCookie(c, COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, COOKIE_NAME, { path: "/" });
}

export async function destroySession(env: Env, sessionId: string): Promise<void> {
  const db = getDb(env);
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export type SessionUser = typeof users.$inferSelect;

export async function getUserFromRequest<E extends { Bindings: Env }>(c: Context<E>): Promise<SessionUser | null> {
  const sessionId = getCookie(c, COOKIE_NAME);
  if (!sessionId) return null;
  const db = getDb(c.env);
  const rows = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await destroySession(c.env, sessionId);
    return null;
  }
  return row.user;
}

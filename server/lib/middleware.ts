import type { Context, Next } from "hono";
import type { Env } from "../env";
import { getUserFromRequest, type SessionUser } from "./session";

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser | null } };

// 세션이 있으면 c.get('user')에 채워두고, 없어도 통과시킴 (비회원 허용 라우트용)
export async function attachUser(c: Context<AppEnv>, next: Next) {
  const user = await getUserFromRequest(c);
  c.set("user", user);
  await next();
}

// 로그인 필수 라우트에서 attachUser 다음에 붙여서 사용
export async function requireAuth(c: Context<AppEnv>, next: Next) {
  if (!c.get("user")) {
    return c.json({ error: "로그인이 필요합니다." }, 401);
  }
  await next();
}

export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const user = c.get("user");
  if (!user) return c.json({ error: "로그인이 필요합니다." }, 401);
  if (!user.isAdmin) return c.json({ error: "관리자만 접근할 수 있습니다." }, 403);
  await next();
}

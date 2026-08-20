import { Hono, type Context } from "hono";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { getDb } from "../db/client";
import { users, oauthAccounts } from "../db/schema";
import { hashPassword } from "../lib/password";
import { createSession, setSessionCookie } from "../lib/session";
import { isOAuthProvider, buildAuthorizeUrl, fetchOAuthProfile, type OAuthProvider } from "../lib/oauth";
import type { AppEnv } from "../lib/middleware";

const STATE_COOKIE = "oauth_state";
const BASE_PATH = "/api/auth/oauth";

function redirectUriFor(c: Context<AppEnv>, provider: OAuthProvider): string {
  return `${new URL(c.req.url).origin}${BASE_PATH}/${provider}/callback`;
}

// reason을 쿼리에 실어 보내는 이유: 안드로이드 등 특정 환경에서만 실패할 때, 사용자가 어느
// 단계(동의 거부/취소인지, state 쿠키 유실인지, 프로필 조회 실패인지)에서 막혔는지를 서버 로그
// 없이도 클라이언트 토스트만으로 구분할 수 있게 하기 위함.
function loginErrorRedirect(c: Context<AppEnv>, reason: string = "unknown") {
  const origin = new URL(c.req.url).origin;
  return c.redirect(`${origin}/login?social_error=${reason}`, 302);
}

async function ensureUniqueValue(
  db: ReturnType<typeof getDb>,
  column: typeof users.username | typeof users.nickname,
  base: string,
): Promise<string> {
  let candidate = base;
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.select({ id: users.id }).from(users).where(eq(column, candidate)).limit(1);
    if (existing.length === 0) return candidate;
    candidate = `${base}${nanoid(4)}`;
  }
  return `${base}${nanoid(8)}`;
}

const oauth = new Hono<AppEnv>();

oauth.get("/:provider/start", async (c) => {
  const provider = c.req.param("provider");
  if (!isOAuthProvider(provider)) return c.json({ error: "지원하지 않는 로그인 방식입니다." }, 404);

  const state = nanoid(24);
  setCookie(c, STATE_COOKIE, `${provider}:${state}`, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: BASE_PATH,
    maxAge: 600,
  });

  const authorizeUrl = buildAuthorizeUrl(provider, c.env, redirectUriFor(c, provider), state);
  if (!authorizeUrl) return c.json({ error: "간편 로그인이 아직 설정되지 않았습니다." }, 503);
  return c.redirect(authorizeUrl, 302);
});

oauth.get("/:provider/callback", async (c) => {
  const provider = c.req.param("provider");
  if (!isOAuthProvider(provider)) return loginErrorRedirect(c, "invalid_provider");

  const code = c.req.query("code");
  const state = c.req.query("state");
  const stateCookie = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: BASE_PATH });

  // provider가 code 없이 error 쿼리만 주는 경우(사용자가 동의 화면에서 취소/거부)를 별도로 구분
  if (!code) {
    console.warn(`[oauth:${provider}] no code in callback`, { error: c.req.query("error"), errorDescription: c.req.query("error_description") });
    return loginErrorRedirect(c, "cancelled");
  }
  // state 쿠키가 없거나 불일치 — 안드로이드 인앱 브라우저(카카오톡/네이버 앱 내장 브라우저 등)처럼
  // /start에서 쿠키를 심은 컨텍스트와 콜백을 받는 컨텍스트가 분리되는 환경에서 특히 발생하기 쉬움
  if (!state || !stateCookie || stateCookie !== `${provider}:${state}`) {
    console.warn(`[oauth:${provider}] state mismatch`, { hasState: !!state, hasStateCookie: !!stateCookie });
    return loginErrorRedirect(c, "state_mismatch");
  }

  const profile = await fetchOAuthProfile(provider, code, c.env, redirectUriFor(c, provider));
  if (!profile) return loginErrorRedirect(c, "profile_fetch_failed");

  const db = getDb(c.env);
  const createdAt = new Date().toISOString();

  // 1) 이미 연동된 계정이면 그대로 로그인
  const linked = await db
    .select({ userId: oauthAccounts.userId })
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerUserId, profile.providerUserId)))
    .limit(1);

  let userId = linked[0]?.userId;

  if (!userId) {
    // 2) provider가 실제로 내려준 이메일이 기존 계정과 같으면 자동 연동
    const existingByEmail = profile.email
      ? await db.select({ id: users.id }).from(users).where(eq(users.email, profile.email)).limit(1)
      : [];

    if (existingByEmail[0]) {
      userId = existingByEmail[0].id;
    } else {
      // 3) 새 계정 생성
      const base = `${provider}_${nanoid(8)}`;
      const username = await ensureUniqueValue(db, users.username, base);
      const nickname = await ensureUniqueValue(db, users.nickname, profile.nickname || base);
      const email = profile.email ?? `${provider}-${profile.providerUserId}@oauth.travelplanner.local`;
      const passwordHash = await hashPassword(nanoid(32));
      const id = nanoid();
      await db.insert(users).values({ id, username, nickname, email, passwordHash, isAdmin: false, createdAt });
      userId = id;
    }

    await db.insert(oauthAccounts).values({
      id: nanoid(),
      userId,
      provider,
      providerUserId: profile.providerUserId,
      createdAt,
    });
  }

  const sessionId = await createSession(c.env, userId);
  setSessionCookie(c, sessionId);
  const origin = new URL(c.req.url).origin;
  return c.redirect(`${origin}/login`, 302);
});

export default oauth;

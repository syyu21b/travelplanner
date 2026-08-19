import type { Env } from "../env";

export type OAuthProvider = "naver" | "kakao";

export interface OAuthProfile {
  providerUserId: string;
  email: string | null;
  nickname: string | null;
}

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "naver" || value === "kakao";
}

export function buildAuthorizeUrl(provider: OAuthProvider, env: Env, redirectUri: string, state: string): string | null {
  if (provider === "naver") {
    if (!env.NAVER_CLIENT_ID) return null;
    const url = new URL("https://nid.naver.com/oauth2.0/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", env.NAVER_CLIENT_ID);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return url.toString();
  }
  if (!env.KAKAO_CLIENT_ID) return null;
  const url = new URL("https://kauth.kakao.com/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.KAKAO_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

// 코드 교환 + 프로필 조회를 한 번에 수행해 정규화된 프로필을 돌려준다.
// 실패하면(설정 누락, 네트워크/파싱 오류, provider 에러 응답 등) null을 반환 — 호출부는 무조건
// 안전하게 /login?social_error=1로 리다이렉트하고, 원인은 서버 로그로만 남긴다.
export async function fetchOAuthProfile(
  provider: OAuthProvider,
  code: string,
  env: Env,
  redirectUri: string,
): Promise<OAuthProfile | null> {
  try {
    return provider === "naver"
      ? await fetchNaverProfile(code, env, redirectUri)
      : await fetchKakaoProfile(code, env, redirectUri);
  } catch (err) {
    console.error(`[oauth:${provider}] profile fetch failed`, err);
    return null;
  }
}

async function fetchNaverProfile(code: string, env: Env, redirectUri: string): Promise<OAuthProfile | null> {
  if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) {
    console.error("[oauth:naver] missing NAVER_CLIENT_ID/NAVER_CLIENT_SECRET");
    return null;
  }

  const tokenUrl = new URL("https://nid.naver.com/oauth2.0/token");
  tokenUrl.searchParams.set("grant_type", "authorization_code");
  tokenUrl.searchParams.set("client_id", env.NAVER_CLIENT_ID);
  tokenUrl.searchParams.set("client_secret", env.NAVER_CLIENT_SECRET);
  tokenUrl.searchParams.set("code", code);
  tokenUrl.searchParams.set("redirect_uri", redirectUri);

  const tokenRes = await fetch(tokenUrl.toString());
  const tokenText = await tokenRes.text();
  if (!tokenRes.ok) {
    console.error(`[oauth:naver] token exchange failed (${tokenRes.status})`, tokenText);
    return null;
  }
  const tokenBody = JSON.parse(tokenText) as { access_token?: string; error?: string; error_description?: string };
  if (!tokenBody.access_token) {
    console.error("[oauth:naver] token response missing access_token", tokenBody);
    return null;
  }

  const profileRes = await fetch("https://openapi.naver.com/v1/nid/me", {
    headers: { Authorization: `Bearer ${tokenBody.access_token}` },
  });
  const profileText = await profileRes.text();
  if (!profileRes.ok) {
    console.error(`[oauth:naver] profile fetch failed (${profileRes.status})`, profileText);
    return null;
  }
  const profileBody = JSON.parse(profileText) as {
    resultcode?: string;
    message?: string;
    response?: { id?: string; email?: string; nickname?: string; name?: string };
  };
  const info = profileBody.response;
  if (profileBody.resultcode !== "00" || !info?.id) {
    console.error("[oauth:naver] profile response not ok", profileBody);
    return null;
  }

  return {
    providerUserId: info.id,
    email: info.email ?? null,
    nickname: info.nickname ?? info.name ?? null,
  };
}

async function fetchKakaoProfile(code: string, env: Env, redirectUri: string): Promise<OAuthProfile | null> {
  if (!env.KAKAO_CLIENT_ID) {
    console.error("[oauth:kakao] missing KAKAO_CLIENT_ID");
    return null;
  }

  const form = new URLSearchParams();
  form.set("grant_type", "authorization_code");
  form.set("client_id", env.KAKAO_CLIENT_ID);
  form.set("redirect_uri", redirectUri);
  form.set("code", code);
  if (env.KAKAO_CLIENT_SECRET) form.set("client_secret", env.KAKAO_CLIENT_SECRET);

  const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: form.toString(),
  });
  const tokenText = await tokenRes.text();
  if (!tokenRes.ok) {
    console.error(`[oauth:kakao] token exchange failed (${tokenRes.status})`, tokenText);
    return null;
  }
  const tokenBody = JSON.parse(tokenText) as { access_token?: string; error?: string; error_description?: string };
  if (!tokenBody.access_token) {
    console.error("[oauth:kakao] token response missing access_token", tokenBody);
    return null;
  }

  const profileRes = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: {
      Authorization: `Bearer ${tokenBody.access_token}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
  });
  const profileText = await profileRes.text();
  if (!profileRes.ok) {
    console.error(`[oauth:kakao] profile fetch failed (${profileRes.status})`, profileText);
    return null;
  }
  const profileBody = JSON.parse(profileText) as {
    id?: number;
    kakao_account?: { email?: string; profile?: { nickname?: string } };
  };
  if (profileBody.id === undefined) {
    console.error("[oauth:kakao] profile response missing id", profileBody);
    return null;
  }

  return {
    providerUserId: String(profileBody.id),
    email: profileBody.kakao_account?.email ?? null,
    nickname: profileBody.kakao_account?.profile?.nickname ?? null,
  };
}

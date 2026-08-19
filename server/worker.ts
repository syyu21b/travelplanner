import { Hono } from "hono";
import type { Env } from "./env";
import authApi from "./api/auth";
import oauthApi from "./api/oauth";
import mediaApi from "./api/media";
import plansApi from "./api/plans";
import diariesApi from "./api/diaries";
import albumsApi from "./api/albums";
import communityApi from "./api/community";
import notificationsApi from "./api/notifications";
import inquiriesApi from "./api/inquiries";
import paymentsApi from "./api/payments";
import { getUserFromRequest } from "./lib/session";
import { getDb } from "./db/client";
import { getOrInitCredits, consumeCredit } from "./lib/credits";

const app = new Hono<{ Bindings: Env }>();

// wrangler.jsonc의 assets.run_worker_first가 "/api/*"로 한정되어 있으므로
// 이 Worker는 API 요청만 받는다 (정적 자산 요청은 Worker에 도달하지 않음).
app.route("/api/auth", authApi);
app.route("/api/auth/oauth", oauthApi);
app.route("/api/media", mediaApi);
app.route("/api/plans", plansApi);
app.route("/api/diaries", diariesApi);
app.route("/api/albums", albumsApi);
app.route("/api/community", communityApi);
app.route("/api/notifications", notificationsApi);
app.route("/api/inquiries", inquiriesApi);
app.route("/api/payments", paymentsApi);

// Gemini API를 이 Worker에서 직접 호출하지 않는 이유: Cloudflare Worker는 요청을 받은 곳과
// 가까운 전 세계 엣지 지점 아무 데서나 실행되는데, 가끔 그 지점이 Google이 Gemini API(무료
// 키 방식) 사용을 막아둔 지역으로 아웃바운드 라우팅되어 "User location is not supported"로
// 거부당하는 경우가 있다. 대신 리전이 고정된 Vercel Serverless Function(api/plan-trip.ts)에
// 요청을 그대로 넘겨 그쪽에서 Gemini를 호출하게 하면, 매번 안정적으로 같은(허용된) 리전에서
// 나가게 되어 이 문제가 근본적으로 사라진다. 입력값 검증과 실제 Gemini 호출 로직은
// api/plan-trip.ts(및 그것이 공유하는 server/gemini.ts)에 있고, 이 Worker는 단순 포워딩만 한다.
app.post("/api/plan-trip", async (c) => {
  if (!c.env.PLAN_TRIP_PROXY_URL) {
    return c.json({ error: "서버에 PLAN_TRIP_PROXY_URL이 설정되어 있지 않습니다." }, 500);
  }

  const user = await getUserFromRequest(c);
  if (!user) return c.json({ error: "로그인이 필요합니다." }, 401);

  const db = getDb(c.env);
  const remainingCredits = await getOrInitCredits(db, user.id);
  if (remainingCredits <= 0) {
    return c.json({ error: "AI 일정 생성 크레딧이 없습니다.", code: "no_credits" }, 402);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "요청 본문이 올바른 JSON이 아닙니다." }, 400);
  }

  let proxyResponse: Response;
  try {
    proxyResponse = await fetch(c.env.PLAN_TRIP_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return c.json(
      { error: `일정 생성 프록시 호출에 실패했습니다: ${err instanceof Error ? err.message : String(err)}` },
      502,
    );
  }

  const responseText = await proxyResponse.text();
  // 실제로 일정 생성에 성공했을 때만 크레딧을 차감 — 실패한 시도는 사용자가 손해 보지 않게 함
  if (proxyResponse.ok) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      parsed = null;
    }
    if (parsed && typeof parsed === "object" && "itinerary" in parsed) {
      await consumeCredit(db, user.id);
    }
  }

  return new Response(responseText, {
    status: proxyResponse.status,
    headers: { "Content-Type": "application/json" },
  });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;

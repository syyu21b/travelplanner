interface Env {
  /** Vercel에 배포한 /api/plan-trip 프록시 URL (예: https://your-project.vercel.app/api/plan-trip) */
  PLAN_TRIP_PROXY_URL?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// wrangler.jsonc의 assets.run_worker_first가 "/api/*"로 한정되어 있으므로
// 이 Worker는 API 요청만 받는다 (정적 자산 요청은 Worker에 도달하지 않음).
//
// Gemini API를 이 Worker에서 직접 호출하지 않는 이유: Cloudflare Worker는 요청을 받은 곳과
// 가까운 전 세계 엣지 지점 아무 데서나 실행되는데, 가끔 그 지점이 Google이 Gemini API(무료
// 키 방식) 사용을 막아둔 지역으로 아웃바운드 라우팅되어 "User location is not supported"로
// 거부당하는 경우가 있다. 대신 리전이 고정된 Vercel Serverless Function(api/plan-trip.ts)에
// 요청을 그대로 넘겨 그쪽에서 Gemini를 호출하게 하면, 매번 안정적으로 같은(허용된) 리전에서
// 나가게 되어 이 문제가 근본적으로 사라진다. 입력값 검증과 실제 Gemini 호출 로직은
// api/plan-trip.ts(및 그것이 공유하는 server/gemini.ts)에 있고, 이 Worker는 단순 포워딩만 한다.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/plan-trip" && request.method === "POST") {
      if (!env.PLAN_TRIP_PROXY_URL) {
        return json({ error: "서버에 PLAN_TRIP_PROXY_URL이 설정되어 있지 않습니다." }, 500);
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "요청 본문이 올바른 JSON이 아닙니다." }, 400);
      }

      let proxyResponse: Response;
      try {
        proxyResponse = await fetch(env.PLAN_TRIP_PROXY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (err) {
        return json(
          { error: `일정 생성 프록시 호출에 실패했습니다: ${err instanceof Error ? err.message : String(err)}` },
          502,
        );
      }

      const responseBody = await proxyResponse.text();
      return new Response(responseBody, {
        status: proxyResponse.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    return json({ error: "Not found" }, 404);
  },
};

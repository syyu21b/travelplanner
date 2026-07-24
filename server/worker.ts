import { GeminiError, planTrip, planTripInputSchema } from "./gemini";

interface Env {
  GEMINI_API_KEY?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// wrangler.jsonc의 assets.run_worker_first가 "/api/*"로 한정되어 있으므로
// 이 Worker는 API 요청만 받는다 (정적 자산 요청은 Worker에 도달하지 않음).
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/plan-trip" && request.method === "POST") {
      if (!env.GEMINI_API_KEY) {
        return json({ error: "서버에 GEMINI_API_KEY가 설정되어 있지 않습니다." }, 500);
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "요청 본문이 올바른 JSON이 아닙니다." }, 400);
      }

      const parsed = planTripInputSchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() }, 400);
      }

      try {
        const itinerary = await planTrip(parsed.data, env.GEMINI_API_KEY);
        return json({ itinerary });
      } catch (err) {
        const message = err instanceof GeminiError ? err.message : "일정 생성 중 오류가 발생했습니다.";
        const code = err instanceof GeminiError ? err.code : undefined;
        return json({ error: message, code }, 502);
      }
    }

    return json({ error: "Not found" }, 404);
  },
};

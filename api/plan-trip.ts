import { GeminiError, planTrip, planTripInputSchema } from "../server/gemini.js";

// Vercel Node.js Serverless Function — 고정된 단일 리전에서 실행되므로, 여러 엣지 지점을
// 오가며 가끔 지역 차단에 걸리는 Cloudflare Worker 대신 이 함수가 Gemini API를 대신 호출한다.
// server/worker.ts가 이 엔드포인트로 요청을 그대로 포워딩한다.
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "서버에 GEMINI_API_KEY가 설정되어 있지 않습니다." });
    return;
  }

  const parsed = planTripInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() });
    return;
  }

  try {
    const itinerary = await planTrip(parsed.data, apiKey);
    res.status(200).json({ itinerary });
  } catch (err) {
    const message = err instanceof GeminiError ? err.message : "일정 생성 중 오류가 발생했습니다.";
    const code = err instanceof GeminiError ? err.code : undefined;
    res.status(502).json({ error: message, code });
  }
}

export interface Env {
  DB: D1Database;
  MEDIA?: R2Bucket;
  /** Vercel에 배포한 /api/plan-trip 프록시 URL */
  PLAN_TRIP_PROXY_URL?: string;
  SESSION_SECRET?: string;
  // 네이버/카카오 간편 로그인 — Client ID는 공개값(wrangler.jsonc vars), Secret은
  // 진짜 비밀값이므로 로컬은 .dev.vars, 배포본은 `wrangler secret put`으로 등록한다.
  NAVER_CLIENT_ID?: string;
  NAVER_CLIENT_SECRET?: string;
  KAKAO_CLIENT_ID?: string;
  KAKAO_CLIENT_SECRET?: string;
}

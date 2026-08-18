export interface Env {
  DB: D1Database;
  MEDIA?: R2Bucket;
  /** Vercel에 배포한 /api/plan-trip 프록시 URL */
  PLAN_TRIP_PROXY_URL?: string;
  SESSION_SECRET?: string;
}

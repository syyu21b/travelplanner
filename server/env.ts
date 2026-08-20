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
  // 회원가입 이메일 인증코드 발송 (Brevo REST API, 진짜 비밀값 — .dev.vars / wrangler secret)
  // Resend는 도메인 인증 전에는 발신 계정 소유자 본인에게만 보낼 수 있어(onboarding@resend.dev
  // 샌드박스 제한) 실사용자에게 발송이 막혔었다 — Brevo는 이메일 주소 하나만 검증하면 임의
  // 수신자에게 보낼 수 있어 도메인 없이도 실사용 가능해 이걸로 교체함.
  BREVO_API_KEY?: string;
  BREVO_SENDER_EMAIL?: string;
  // port.one(포트원) 결제 — storeId/channelKey는 클라이언트에도 그대로 노출되는 공개값(vars),
  // API Secret/Webhook Secret은 진짜 비밀값(.dev.vars / wrangler secret)
  PORTONE_STORE_ID?: string;
  PORTONE_CHANNEL_KEY?: string;
  PORTONE_API_SECRET?: string;
  PORTONE_WEBHOOK_SECRET?: string;
}

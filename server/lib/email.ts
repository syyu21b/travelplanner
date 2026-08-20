import type { Env } from "../env";

// Resend 무료 티어는 도메인 인증 전에는 onboarding@resend.dev 발신 주소로 계정 가입 시 등록한
// 본인 이메일에만 보낼 수 있어(샌드박스 제한) 실사용자에게 발송이 막혔다. Brevo는 도메인 없이
// 이메일 주소 하나만 인증(Settings > Senders, Domains, IPs > Senders)하면 임의 수신자에게 보낼
// 수 있어 이걸로 교체함 — 무료 플랜 일 300통.
const DEFAULT_SENDER_NAME = "Travel Planner";

export async function sendVerificationEmail(env: Env, to: string, code: string): Promise<boolean> {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) {
    console.error("[email] missing BREVO_API_KEY/BREVO_SENDER_EMAIL");
    return false;
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: DEFAULT_SENDER_NAME, email: env.BREVO_SENDER_EMAIL },
      to: [{ email: to }],
      subject: "[TravelPlanner] 이메일 인증코드",
      textContent: `인증코드: ${code}\n\n10분 이내에 입력해주세요.`,
      htmlContent: `<p>이메일 인증코드입니다.</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p><p>10분 이내에 입력해주세요.</p>`,
    }),
  });

  if (!res.ok) {
    console.error(`[email] brevo send failed (${res.status})`, await res.text());
    return false;
  }
  return true;
}

import type { Env } from "../env";

// Resend 무료 티어는 도메인 인증 없이도 onboarding@resend.dev 발신 주소로 임의 수신자에게 보낼 수
// 있다(일 100통/월 3,000통 한도). 나중에 실제 도메인을 Cloudflare에 연결하면 이 발신 주소만
// 그 도메인 주소로 바꾸면 된다.
const FROM = "TravelPlanner <onboarding@resend.dev>";

export async function sendVerificationEmail(env: Env, to: string, code: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.error("[email] missing RESEND_API_KEY");
    return false;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: "[TravelPlanner] 이메일 인증코드",
      text: `인증코드: ${code}\n\n10분 이내에 입력해주세요.`,
      html: `<p>이메일 인증코드입니다.</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p><p>10분 이내에 입력해주세요.</p>`,
    }),
  });

  if (!res.ok) {
    console.error(`[email] resend send failed (${res.status})`, await res.text());
    return false;
  }
  return true;
}

import type { Env } from "../env";

export interface PortOnePaymentInfo {
  status: string;
  amountTotal: number;
}

// 브라우저가 보낸 결제 완료 신호는 위변조될 수 있으므로, 서버가 포트원 API로 결제 건을 직접
// 재조회해 실제 상태/금액을 확인한다. 실패하면 null — 호출부는 결제를 확정 처리하지 않는다.
export async function fetchPortOnePayment(env: Env, paymentId: string): Promise<PortOnePaymentInfo | null> {
  if (!env.PORTONE_API_SECRET) {
    console.error("[portone] missing PORTONE_API_SECRET");
    return null;
  }

  const res = await fetch(`https://api.portone.io/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `PortOne ${env.PORTONE_API_SECRET}` },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[portone] payment lookup failed (${res.status})`, text);
    return null;
  }

  const body = JSON.parse(text) as { status?: string; amount?: { total?: number } };
  if (!body.status || typeof body.amount?.total !== "number") {
    console.error("[portone] unexpected payment lookup response", body);
    return null;
  }

  return { status: body.status, amountTotal: body.amount.total };
}

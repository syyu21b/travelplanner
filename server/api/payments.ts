import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db/client";
import { payments } from "../db/schema";
import { attachUser, requireAuth, type AppEnv } from "../lib/middleware";
import { getOrInitCredits, addCredits } from "../lib/credits";
import { fetchPortOnePayment } from "../lib/portone";

// 서버가 유일한 가격 소스 — 클라이언트가 보낸 금액은 절대 신뢰하지 않는다.
const CREDIT_PACKAGES = {
  "1": { credits: 1, amountKrw: 4900, label: "AI 일정 생성 1회권" },
  "5": { credits: 5, amountKrw: 20000, label: "AI 일정 생성 5회권" },
  "10": { credits: 10, amountKrw: 45000, label: "AI 일정 생성 10회권" },
} as const;
type PackageId = keyof typeof CREDIT_PACKAGES;

function isPackageId(value: unknown): value is PackageId {
  return typeof value === "string" && value in CREDIT_PACKAGES;
}

const paymentsApi = new Hono<AppEnv>();
paymentsApi.use("*", attachUser);

paymentsApi.get("/packages", async (c) => {
  return c.json({
    packages: Object.entries(CREDIT_PACKAGES).map(([id, p]) => ({ id, ...p })),
  });
});

paymentsApi.get("/credits", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env);
  const remainingCredits = await getOrInitCredits(db, user.id);
  return c.json({ remainingCredits });
});

paymentsApi.post("/request", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const packageId = body.packageId;
  if (!isPackageId(packageId)) return c.json({ error: "올바르지 않은 상품입니다." }, 400);
  if (!c.env.PORTONE_STORE_ID || !c.env.PORTONE_CHANNEL_KEY) {
    return c.json({ error: "결제가 아직 설정되지 않았습니다." }, 503);
  }

  const pkg = CREDIT_PACKAGES[packageId];
  const db = getDb(c.env);
  const id = `pay_${nanoid(24)}`;
  const createdAt = new Date().toISOString();
  await db.insert(payments).values({
    id,
    userId: user.id,
    packageId,
    credits: pkg.credits,
    amountKrw: pkg.amountKrw,
    status: "pending",
    createdAt,
  });

  return c.json({
    paymentId: id,
    storeId: c.env.PORTONE_STORE_ID,
    channelKey: c.env.PORTONE_CHANNEL_KEY,
    orderName: pkg.label,
    totalAmount: pkg.amountKrw,
    currency: "CURRENCY_KRW",
  });
});

// 결제 확정 로직 — /complete(클라이언트 콜백)와 /webhook(포트원 서버 알림) 양쪽에서 재사용.
// 이미 처리된 건이면 조용히 성공 처리(멱등) — 두 경로가 동시에 들어와도 중복 적립되지 않는다.
async function confirmPayment(db: ReturnType<typeof getDb>, env: AppEnv["Bindings"], paymentId: string): Promise<{ success: boolean; message: string }> {
  const record = (await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1))[0];
  if (!record) return { success: false, message: "결제 정보를 찾을 수 없습니다." };
  if (record.status === "paid") return { success: true, message: "이미 처리된 결제입니다." };

  const info = await fetchPortOnePayment(env, paymentId);
  if (!info || info.status !== "PAID" || info.amountTotal !== record.amountKrw) {
    await db.update(payments).set({ status: "failed" }).where(eq(payments.id, paymentId));
    return { success: false, message: "결제 확인에 실패했습니다." };
  }

  const paidAt = new Date().toISOString();
  await db.update(payments).set({ status: "paid", paidAt }).where(eq(payments.id, paymentId));
  await getOrInitCredits(db, record.userId); // 행이 없으면 먼저 만들어둠(가입 첫 1회 무료 케이스)
  await addCredits(db, record.userId, record.credits);

  return { success: true, message: "결제가 완료되었습니다." };
}

paymentsApi.post("/complete", requireAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json().catch(() => ({}));
  const paymentId = typeof body.paymentId === "string" ? body.paymentId : "";
  const db = getDb(c.env);

  const record = (await db.select({ userId: payments.userId }).from(payments).where(eq(payments.id, paymentId)).limit(1))[0];
  if (!record || record.userId !== user.id) return c.json({ success: false, message: "결제 정보를 찾을 수 없습니다." }, 404);

  const result = await confirmPayment(db, c.env, paymentId);
  return c.json(result, result.success ? 200 : 400);
});

paymentsApi.post("/webhook", async (c) => {
  if (!c.env.PORTONE_WEBHOOK_SECRET) return c.json({ error: "웹훅이 설정되지 않았습니다." }, 501);
  // TODO: @portone/server-sdk의 Webhook.verify()로 서명 검증 후 confirmPayment 호출
  return c.json({ error: "not implemented" }, 501);
});

export default paymentsApi;

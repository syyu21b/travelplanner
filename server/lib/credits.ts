import { and, eq, gt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { userCredits } from "../db/schema";

// 가입 후 첫 1회는 무료 — 별도 플래그 없이, 이 사용자의 크레딧 행을 처음 조회하는 시점에
// remainingCredits: 1로 만들어둔다(server/api/auth.ts의 seedAdmin과 동일한 lazy-init 패턴).
// 기존 가입자도 동일하게 첫 조회 시 1회를 받는다(합리적인 그랜드파더링).
export async function getOrInitCredits(db: Db, userId: string): Promise<number> {
  const found = (await db.select().from(userCredits).where(eq(userCredits.userId, userId)).limit(1))[0];
  if (found) return found.remainingCredits;

  const updatedAt = new Date().toISOString();
  await db
    .insert(userCredits)
    .values({ userId, remainingCredits: 1, updatedAt })
    .onConflictDoNothing({ target: userCredits.userId });
  const row = (await db.select().from(userCredits).where(eq(userCredits.userId, userId)).limit(1))[0];
  return row?.remainingCredits ?? 1;
}

// 실제 생성이 성공했을 때만 호출. 동시 클릭 경합에도 안전하도록 "0보다 클 때만" 조건을 SQL에
// 그대로 넣어 원자적으로 차감한다 — 반환값이 false면 그 사이 다른 요청이 이미 0으로 만든 것.
export async function consumeCredit(db: Db, userId: string): Promise<boolean> {
  const result = (await db
    .update(userCredits)
    .set({ remainingCredits: sql`${userCredits.remainingCredits} - 1`, updatedAt: new Date().toISOString() })
    .where(and(eq(userCredits.userId, userId), gt(userCredits.remainingCredits, 0)))) as D1Result;
  return result.meta.changes > 0;
}

// 결제 완료 시 크레딧 적립 — 호출 전 getOrInitCredits로 행이 반드시 존재하게 만들어둘 것.
export async function addCredits(db: Db, userId: string, amount: number): Promise<void> {
  await db
    .update(userCredits)
    .set({ remainingCredits: sql`${userCredits.remainingCredits} + ${amount}`, updatedAt: new Date().toISOString() })
    .where(eq(userCredits.userId, userId));
}

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db/client";
import { travelPlans } from "../db/schema";
import { attachUser, requireAuth, type AppEnv } from "../lib/middleware";
import { mediaUrl } from "../lib/media-url";
import type { TravelPlan } from "../../shared/types";

type PlanRow = typeof travelPlans.$inferSelect;

function toClientPlan(row: PlanRow): TravelPlan {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    startDate: row.startDate,
    endDate: row.endDate,
    region: row.region as TravelPlan["region"],
    coverPhoto: mediaUrl(row.coverPhotoKey),
    schedules: JSON.parse(row.schedulesJson),
    budgets: JSON.parse(row.budgetsJson),
    shoppingList: JSON.parse(row.shoppingListJson),
    accommodations: JSON.parse(row.accommodationsJson),
    flights: JSON.parse(row.flightsJson),
    preparationChecks: JSON.parse(row.preparationChecksJson),
    totalBudgetAmount: row.totalBudgetAmount ?? undefined,
    travelers: row.travelers ?? undefined,
    allowClone: row.allowClone,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// coverPhoto는 클라이언트에서 /api/media/:key 전체 URL로 오지만 DB에는 key만 저장한다.
function coverPhotoKeyFrom(coverPhoto: string | undefined | null): string | null {
  if (!coverPhoto) return null;
  const prefix = "/api/media/";
  return coverPhoto.startsWith(prefix) ? coverPhoto.slice(prefix.length) : coverPhoto;
}

const plans = new Hono<AppEnv>();

plans.use("*", attachUser);
plans.use("*", requireAuth);

plans.get("/", async (c) => {
  const user = c.get("user")!;
  const db = getDb(c.env);
  const rows = await db.select().from(travelPlans).where(eq(travelPlans.userId, user.id));
  return c.json({ plans: rows.map(toClientPlan) });
});

plans.get("/:id", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  const db = getDb(c.env);
  const row = (await db.select().from(travelPlans).where(eq(travelPlans.id, id)).limit(1))[0];
  if (!row) return c.json({ error: "계획을 찾을 수 없습니다." }, 404);
  if (row.userId !== user.id) return c.json({ error: "접근 권한이 없습니다." }, 403);
  return c.json({ plan: toClientPlan(row) });
});

plans.post("/", async (c) => {
  const user = c.get("user")!;
  const body = (await c.req.json().catch(() => ({}))) as Partial<TravelPlan>;
  if (!body.title || !body.startDate || !body.endDate || !body.region)
    return c.json({ error: "입력값이 올바르지 않습니다." }, 400);

  const db = getDb(c.env);
  const id = body.id || nanoid();
  const now = new Date().toISOString();
  const values = {
    id,
    userId: user.id,
    title: body.title,
    startDate: body.startDate,
    endDate: body.endDate,
    region: body.region,
    coverPhotoKey: coverPhotoKeyFrom(body.coverPhoto),
    schedulesJson: JSON.stringify(body.schedules ?? []),
    budgetsJson: JSON.stringify(body.budgets ?? []),
    shoppingListJson: JSON.stringify(body.shoppingList ?? []),
    accommodationsJson: JSON.stringify(body.accommodations ?? []),
    flightsJson: JSON.stringify(body.flights ?? []),
    preparationChecksJson: JSON.stringify(body.preparationChecks ?? {}),
    totalBudgetAmount: body.totalBudgetAmount ?? null,
    travelers: body.travelers ?? null,
    allowClone: body.allowClone ?? false,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(travelPlans).values(values);
  return c.json({ plan: toClientPlan(values as PlanRow) }, 201);
});

plans.put("/:id", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  const db = getDb(c.env);
  const existing = (await db.select().from(travelPlans).where(eq(travelPlans.id, id)).limit(1))[0];
  if (!existing) return c.json({ error: "계획을 찾을 수 없습니다." }, 404);
  if (existing.userId !== user.id) return c.json({ error: "접근 권한이 없습니다." }, 403);

  const body = (await c.req.json().catch(() => ({}))) as Partial<TravelPlan>;
  const updates = {
    title: body.title ?? existing.title,
    startDate: body.startDate ?? existing.startDate,
    endDate: body.endDate ?? existing.endDate,
    region: body.region ?? existing.region,
    coverPhotoKey: body.coverPhoto !== undefined ? coverPhotoKeyFrom(body.coverPhoto) : existing.coverPhotoKey,
    schedulesJson: JSON.stringify(body.schedules ?? JSON.parse(existing.schedulesJson)),
    budgetsJson: JSON.stringify(body.budgets ?? JSON.parse(existing.budgetsJson)),
    shoppingListJson: JSON.stringify(body.shoppingList ?? JSON.parse(existing.shoppingListJson)),
    accommodationsJson: JSON.stringify(body.accommodations ?? JSON.parse(existing.accommodationsJson)),
    flightsJson: JSON.stringify(body.flights ?? JSON.parse(existing.flightsJson)),
    preparationChecksJson: JSON.stringify(body.preparationChecks ?? JSON.parse(existing.preparationChecksJson)),
    totalBudgetAmount: body.totalBudgetAmount !== undefined ? body.totalBudgetAmount : existing.totalBudgetAmount,
    travelers: body.travelers !== undefined ? body.travelers : existing.travelers,
    allowClone: body.allowClone !== undefined ? body.allowClone : existing.allowClone,
    updatedAt: new Date().toISOString(),
  };
  await db.update(travelPlans).set(updates).where(eq(travelPlans.id, id));
  return c.json({ plan: toClientPlan({ ...existing, ...updates }) });
});

plans.patch("/:id/allow-clone", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  const db = getDb(c.env);
  const existing = (await db.select().from(travelPlans).where(eq(travelPlans.id, id)).limit(1))[0];
  if (!existing) return c.json({ error: "계획을 찾을 수 없습니다." }, 404);
  if (existing.userId !== user.id) return c.json({ error: "접근 권한이 없습니다." }, 403);
  const body = await c.req.json().catch(() => ({}));
  const allowClone = body.allowClone === true;
  await db.update(travelPlans).set({ allowClone }).where(eq(travelPlans.id, id));
  return c.json({ success: true });
});

plans.delete("/:id", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  const db = getDb(c.env);
  const existing = (await db.select().from(travelPlans).where(eq(travelPlans.id, id)).limit(1))[0];
  if (!existing) return c.json({ error: "계획을 찾을 수 없습니다." }, 404);
  if (existing.userId !== user.id) return c.json({ error: "접근 권한이 없습니다." }, 403);
  await db.delete(travelPlans).where(eq(travelPlans.id, id));
  return c.json({ success: true });
});

export default plans;

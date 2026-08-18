import { api } from "../api";
import type { TravelPlan } from "@shared/types";

export const plansApi = {
  list: () => api.get<{ plans: TravelPlan[] }>("/plans").then((r) => r.plans),
  get: (id: string) => api.get<{ plan: TravelPlan }>(`/plans/${id}`).then((r) => r.plan),
  create: (plan: Partial<TravelPlan>) => api.post<{ plan: TravelPlan }>("/plans", plan).then((r) => r.plan),
  update: (id: string, plan: Partial<TravelPlan>) => api.put<{ plan: TravelPlan }>(`/plans/${id}`, plan).then((r) => r.plan),
  setAllowClone: (id: string, allowClone: boolean) => api.patch<{ success: boolean }>(`/plans/${id}/allow-clone`, { allowClone }),
  remove: (id: string) => api.del<{ success: boolean }>(`/plans/${id}`),
};

import { api } from "../api";
import type { DiaryEntry } from "@shared/types";

export const diariesApi = {
  list: () => api.get<{ diaries: DiaryEntry[] }>("/diaries").then((r) => r.diaries),
  get: (id: string) => api.get<{ diary: DiaryEntry }>(`/diaries/${id}`).then((r) => r.diary),
  create: (diary: Partial<DiaryEntry>) => api.post<{ diary: DiaryEntry }>("/diaries", diary).then((r) => r.diary),
  update: (id: string, diary: Partial<DiaryEntry>) => api.put<{ diary: DiaryEntry }>(`/diaries/${id}`, diary).then((r) => r.diary),
  setVisibility: (id: string, isPublic: boolean) => api.patch<{ success: boolean }>(`/diaries/${id}/visibility`, { isPublic }),
  remove: (id: string) => api.del<{ success: boolean }>(`/diaries/${id}`),
};

import { api } from "../api";
import type { DiaryEntry, LinkedPlanPreview, Comment } from "@shared/types";

export interface FeedPage {
  diaries: DiaryEntry[];
  page: number;
  totalPages: number;
  total: number;
}

export interface MyComment extends Comment {
  diaryTitle: string;
  diaryIsPublic: boolean;
}

export const communityApi = {
  listDiaries: (params: { search?: string; tag?: string; sort?: "latest" | "popular" | "comments"; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.tag) qs.set("tag", params.tag);
    if (params.sort) qs.set("sort", params.sort);
    if (params.page) qs.set("page", String(params.page));
    if (params.pageSize) qs.set("pageSize", String(params.pageSize));
    return api.get<FeedPage>(`/community/diaries?${qs.toString()}`);
  },
  tags: () => api.get<{ tags: string[] }>("/community/tags").then((r) => r.tags),
  stats: () => api.get<{ totalReviews: number; destinations: number; travelers: number }>("/community/stats"),
  getDiary: (id: string) => api.get<{ diary: DiaryEntry; linkedPlan: LinkedPlanPreview | null }>(`/community/diaries/${id}`),
  view: (id: string) => api.post<{ success: boolean }>(`/community/diaries/${id}/view`),
  like: (id: string) => api.post<{ success: boolean }>(`/community/diaries/${id}/like`),
  unlike: (id: string) => api.del<{ success: boolean }>(`/community/diaries/${id}/like`),
  bookmark: (id: string) => api.post<{ success: boolean }>(`/community/diaries/${id}/bookmark`),
  unbookmark: (id: string) => api.del<{ success: boolean }>(`/community/diaries/${id}/bookmark`),
  bookmarks: () => api.get<{ diaries: DiaryEntry[] }>("/community/bookmarks").then((r) => r.diaries),
  likes: () => api.get<{ diaries: DiaryEntry[] }>("/community/likes").then((r) => r.diaries),
  myComments: () => api.get<{ comments: MyComment[] }>("/community/my-comments").then((r) => r.comments),
  comments: (diaryId: string) => api.get<{ comments: Comment[] }>(`/community/diaries/${diaryId}/comments`).then((r) => r.comments),
  addComment: (diaryId: string, content: string) => api.post<{ comment: Comment }>(`/community/diaries/${diaryId}/comments`, { content }).then((r) => r.comment),
  updateComment: (id: string, content: string) => api.put<{ success: boolean }>(`/community/comments/${id}`, { content }),
  deleteComment: (id: string) => api.del<{ success: boolean }>(`/community/comments/${id}`),
  likeComment: (id: string) => api.post<{ success: boolean }>(`/community/comments/${id}/like`),
  unlikeComment: (id: string) => api.del<{ success: boolean }>(`/community/comments/${id}/like`),
  clonePlan: (diaryId: string) => api.post<{ planId: string }>(`/community/diaries/${diaryId}/clone-plan`),
};

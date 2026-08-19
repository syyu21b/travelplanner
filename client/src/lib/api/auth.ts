import { api } from "../api";
import type { User } from "@shared/types";

interface Result {
  success: boolean;
  message: string;
}

export interface PublicUser {
  id: string;
  username: string;
  nickname: string;
  email: string;
  isAdmin?: boolean;
  createdAt: string;
}

export interface PassportPayload {
  ciphertext: string;
  iv: string;
  salt: string;
}

export const authApi = {
  me: () => api.get<{ user: User | null }>("/auth/me"),

  checkUsername: (value: string) => api.get<{ available: boolean }>(`/auth/check-username?value=${encodeURIComponent(value)}`),
  checkNickname: (value: string) => api.get<{ available: boolean }>(`/auth/check-nickname?value=${encodeURIComponent(value)}`),
  findUsernameByEmail: (email: string) => api.get<{ username: string | null }>(`/auth/find-username?email=${encodeURIComponent(email)}`),

  register: (data: { username: string; nickname: string; email: string; password: string; phoneNumber?: string }) =>
    api.post<Result & { user?: User }>("/auth/register", data),

  login: (username: string, password: string) =>
    api.post<Result & { user?: User }>("/auth/login", { username, password }),

  logout: () => api.post<{ success: boolean }>("/auth/logout"),

  resetPassword: (username: string, email: string, newPassword: string) =>
    api.post<Result>("/auth/reset-password", { username, email, newPassword }),

  sendEmailCode: (email: string) => api.post<Result>("/auth/email/send-code", { email }),
  verifyEmailCode: (email: string, code: string) => api.post<Result>("/auth/email/verify-code", { email, code }),

  withdrawAccount: () => api.post<Result>("/auth/withdraw"),

  updateProfile: (updates: { nickname?: string; email?: string }) =>
    api.patch<Result & { user?: User }>("/auth/profile", updates),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<Result>("/auth/change-password", { currentPassword, newPassword }),

  verifyPassword: (password: string) => api.post<{ valid: boolean }>("/auth/verify-password", { password }),

  passportStatus: () => api.get<{ exists: boolean }>("/auth/passport/status"),
  savePassport: (password: string, payload: PassportPayload) =>
    api.put<Result>("/auth/passport", { password, ...payload }),
  revealPassport: (password: string) =>
    api.post<Result & { payload?: PassportPayload }>("/auth/passport/reveal", { password }),
  deletePassport: (password: string) => api.post<Result>("/auth/passport/delete", { password }),

  getProfilePhotoUrl: (userId: string) => api.get<{ photoUrl: string | null }>(`/auth/profile-photo/${userId}`),
  setProfilePhoto: (photoKey: string | null) => api.put<Result>("/auth/profile-photo", { photoKey }),

  getAllUsers: () => api.get<{ users: PublicUser[] }>("/auth/admin/users"),
  adminUpdateUser: (userId: string, updates: { nickname?: string; email?: string; password?: string }) =>
    api.patch<Result>(`/auth/admin/users/${userId}`, updates),
  adminDeleteUser: (userId: string) => api.del<Result>(`/auth/admin/users/${userId}`),
};

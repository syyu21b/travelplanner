import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  encryptPassportInfo, decryptPassportInfo,
  type PassportInfo,
} from '@/lib/passportCrypto';
import { authApi, type PublicUser } from '@/lib/api/auth';
import { ApiError } from '@/lib/api';
import type { User } from '@shared/types';

export interface RegisterData {
  username: string;
  nickname: string;
  email: string;
  password: string;
  phoneNumber?: string;
}

export type { PublicUser };

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
  checkUsername: (username: string) => Promise<boolean>;
  checkNickname: (nickname: string) => Promise<boolean>;
  findUsernameByEmail: (email: string) => Promise<string | null>;
  resetPassword: (username: string, email: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  sendEmailCode: (email: string) => Promise<{ success: boolean; message: string }>;
  verifyEmailCode: (email: string, code: string) => Promise<{ success: boolean; message: string }>;
  withdrawAccount: () => Promise<{ success: boolean; message: string }>;
  updateProfile: (updates: { nickname?: string; email?: string; phoneNumber?: string }) => Promise<{ success: boolean; message: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  getProfilePhoto: (userId: string) => Promise<string | null>;
  setProfilePhoto: (photoKey: string | null) => Promise<void>;
  verifyPassword: (password: string) => Promise<boolean>;
  hasPassportInfo: () => Promise<boolean>;
  savePassportInfo: (password: string, data: PassportInfo) => Promise<{ success: boolean; message: string }>;
  loadPassportInfo: (password: string) => Promise<{ success: boolean; message: string; data?: PassportInfo }>;
  deletePassportInfo: (password: string) => Promise<{ success: boolean; message: string }>;
  // 관리자 전용
  getAllUsers: () => Promise<PublicUser[]>;
  adminUpdateUser: (userId: string, updates: { nickname?: string; email?: string; password?: string }) => Promise<{ success: boolean; message: string }>;
  adminDeleteUser: (userId: string) => Promise<{ success: boolean; message: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const GENERIC_ERROR_MESSAGE = '알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : GENERIC_ERROR_MESSAGE;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    authApi.me()
      .then(({ user: sessionUser }) => setUser(sessionUser))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const checkUsername = async (username: string): Promise<boolean> => {
    try {
      return (await authApi.checkUsername(username)).available;
    } catch {
      return false;
    }
  };

  const checkNickname = async (nickname: string): Promise<boolean> => {
    try {
      return (await authApi.checkNickname(nickname)).available;
    } catch {
      return false;
    }
  };

  const register = async (data: RegisterData): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await authApi.register(data);
      if (res.success && res.user) setUser(res.user);
      return { success: res.success, message: res.message };
    } catch (err) {
      return { success: false, message: errorMessage(err) };
    }
  };

  const login = async (username: string, password: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await authApi.login(username, password);
      if (res.success && res.user) setUser(res.user);
      return { success: res.success, message: res.message };
    } catch (err) {
      return { success: false, message: errorMessage(err) };
    }
  };

  const logout = () => {
    setUser(null);
    authApi.logout().catch(() => { /* 로컬 세션은 이미 정리됨 — 서버 세션은 만료되면 자연 정리 */ });
  };

  const findUsernameByEmail = async (email: string): Promise<string | null> => {
    try {
      return (await authApi.findUsernameByEmail(email)).username;
    } catch {
      return null;
    }
  };

  const resetPassword = async (username: string, email: string, newPassword: string): Promise<{ success: boolean; message: string }> => {
    try {
      return await authApi.resetPassword(username, email, newPassword);
    } catch (err) {
      return { success: false, message: errorMessage(err) };
    }
  };

  const sendEmailCode = async (email: string): Promise<{ success: boolean; message: string }> => {
    try {
      return await authApi.sendEmailCode(email);
    } catch (err) {
      return { success: false, message: errorMessage(err) };
    }
  };

  const verifyEmailCode = async (email: string, code: string): Promise<{ success: boolean; message: string }> => {
    try {
      return await authApi.verifyEmailCode(email, code);
    } catch (err) {
      return { success: false, message: errorMessage(err) };
    }
  };

  const withdrawAccount = async (): Promise<{ success: boolean; message: string }> => {
    if (!user) return { success: false, message: '로그인 상태가 아닙니다.' };
    try {
      const res = await authApi.withdrawAccount();
      if (res.success) setUser(null);
      return res;
    } catch (err) {
      return { success: false, message: errorMessage(err) };
    }
  };

  const updateProfile = async (updates: { nickname?: string; email?: string; phoneNumber?: string }): Promise<{ success: boolean; message: string }> => {
    if (!user) return { success: false, message: '로그인 상태가 아닙니다.' };
    try {
      const res = await authApi.updateProfile(updates);
      if (res.success && res.user) setUser(res.user);
      return { success: res.success, message: res.message };
    } catch (err) {
      return { success: false, message: errorMessage(err) };
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> => {
    if (!user) return { success: false, message: '로그인 상태가 아닙니다.' };

    // 여권 정보는 비밀번호로 암호화되어 있으므로, 비밀번호 변경 전에 새 비밀번호로 다시 암호화해 서버에 반영
    try {
      const status = await authApi.passportStatus();
      if (status.exists) {
        const revealed = await authApi.revealPassport(currentPassword);
        if (revealed.success && revealed.payload) {
          const decrypted = await decryptPassportInfo(revealed.payload, currentPassword);
          if (decrypted) {
            const reEncrypted = await encryptPassportInfo(decrypted, newPassword);
            await authApi.savePassport(currentPassword, reEncrypted);
          }
        }
      }
    } catch {
      // 여권 정보 재암호화 실패는 비밀번호 변경 자체를 막지 않음 — 다음 로그인 시 다시 시도 가능
    }

    try {
      return await authApi.changePassword(currentPassword, newPassword);
    } catch (err) {
      return { success: false, message: errorMessage(err) };
    }
  };

  const verifyPassword = async (password: string): Promise<boolean> => {
    if (!user) return false;
    try {
      return (await authApi.verifyPassword(password)).valid;
    } catch {
      return false;
    }
  };

  const hasPassportInfo = async (): Promise<boolean> => {
    if (!user) return false;
    try {
      return (await authApi.passportStatus()).exists;
    } catch {
      return false;
    }
  };

  const savePassportInfo = async (password: string, data: PassportInfo): Promise<{ success: boolean; message: string }> => {
    if (!user) return { success: false, message: '로그인 상태가 아닙니다.' };
    try {
      const encrypted = await encryptPassportInfo(data, password);
      return await authApi.savePassport(password, encrypted);
    } catch (err) {
      return { success: false, message: errorMessage(err) };
    }
  };

  const loadPassportInfo = async (password: string): Promise<{ success: boolean; message: string; data?: PassportInfo }> => {
    if (!user) return { success: false, message: '로그인 상태가 아닙니다.' };
    try {
      const res = await authApi.revealPassport(password);
      if (!res.success || !res.payload) return { success: res.success, message: res.message };
      const data = await decryptPassportInfo(res.payload, password);
      if (!data) return { success: false, message: '복호화에 실패했습니다.' };
      return { success: true, message: '확인되었습니다.', data };
    } catch (err) {
      return { success: false, message: errorMessage(err) };
    }
  };

  const deletePassportInfo = async (password: string): Promise<{ success: boolean; message: string }> => {
    if (!user) return { success: false, message: '로그인 상태가 아닙니다.' };
    try {
      return await authApi.deletePassport(password);
    } catch (err) {
      return { success: false, message: errorMessage(err) };
    }
  };

  const getProfilePhoto = async (userId: string): Promise<string | null> => {
    try {
      return (await authApi.getProfilePhotoUrl(userId)).photoUrl;
    } catch {
      return null;
    }
  };

  const setProfilePhoto = async (photoKey: string | null): Promise<void> => {
    if (!user) return;
    try {
      await authApi.setProfilePhoto(photoKey);
    } catch {
      // 저장 실패해도 앱이 죽지 않도록 무시 (호출부에서 별도 안내 가능)
    }
  };

  // ── 관리자 전용 ──

  const getAllUsers = async (): Promise<PublicUser[]> => {
    try {
      return (await authApi.getAllUsers()).users;
    } catch {
      return [];
    }
  };

  const adminUpdateUser = async (userId: string, updates: { nickname?: string; email?: string; password?: string }): Promise<{ success: boolean; message: string }> => {
    try {
      return await authApi.adminUpdateUser(userId, updates);
    } catch (err) {
      return { success: false, message: errorMessage(err) };
    }
  };

  const adminDeleteUser = async (userId: string): Promise<{ success: boolean; message: string }> => {
    try {
      return await authApi.adminDeleteUser(userId);
    } catch (err) {
      return { success: false, message: errorMessage(err) };
    }
  };

  return (
    <AuthContext.Provider value={{
      user, isLoading,
      login, register, logout,
      checkUsername, checkNickname,
      findUsernameByEmail, resetPassword,
      sendEmailCode, verifyEmailCode,
      withdrawAccount,
      updateProfile, changePassword, getProfilePhoto, setProfilePhoto,
      verifyPassword, hasPassportInfo, savePassportInfo, loadPassportInfo, deletePassportInfo,
      getAllUsers, adminUpdateUser, adminDeleteUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: string;
  username: string;
  nickname: string;
  name: string; // nickname 별칭 (기존 코드 호환)
  email: string;
  isAdmin: boolean;
  createdAt: string;
}

interface StoredUser {
  id: string;
  username: string;
  nickname: string;
  email: string;
  password: string;
  isAdmin?: boolean;
  createdAt: string;
}

export interface RegisterData {
  username: string;
  nickname: string;
  email: string;
  password: string;
}

export type PublicUser = Omit<StoredUser, 'password'>;

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
  checkUsername: (username: string) => boolean;
  checkNickname: (nickname: string) => boolean;
  findUsernameByEmail: (email: string) => string | null;
  resetPassword: (username: string, email: string, newPassword: string) => { success: boolean; message: string };
  withdrawAccount: () => { success: boolean; message: string };
  updateProfile: (updates: { nickname?: string; email?: string }) => { success: boolean; message: string };
  changePassword: (currentPassword: string, newPassword: string) => { success: boolean; message: string };
  getProfilePhoto: (userId: string) => string | null;
  setProfilePhoto: (photo: string | null) => void;
  // 관리자 전용
  getAllUsers: () => PublicUser[];
  adminUpdateUser: (userId: string, updates: { nickname?: string; email?: string; password?: string }) => { success: boolean; message: string };
  adminDeleteUser: (userId: string) => { success: boolean; message: string };
}

const AuthContext = createContext<AuthContextType | null>(null);

const ADMIN_ID = 'admin-syyu21b';

function getStoredUsers(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem('registeredUsers') || '[]');
  } catch {
    return [];
  }
}

function saveStoredUsers(users: StoredUser[]) {
  localStorage.setItem('registeredUsers', JSON.stringify(users));
}

function toPublicUser(stored: StoredUser): User {
  return {
    id: stored.id,
    username: stored.username,
    nickname: stored.nickname,
    name: stored.nickname,
    email: stored.email,
    isAdmin: stored.isAdmin === true,
    createdAt: stored.createdAt,
  };
}

function seedAdmin() {
  const users = getStoredUsers();
  if (!users.some(u => u.id === ADMIN_ID)) {
    users.unshift({
      id: ADMIN_ID,
      username: 'syyu21b',
      nickname: '관리자',
      email: 'admin@travelplanner.com',
      password: 'astu345Q@',
      isAdmin: true,
      createdAt: new Date().toISOString(),
    });
    saveStoredUsers(users);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    seedAdmin();
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        if (!parsed.nickname && parsed.name) parsed.nickname = parsed.name;
        if (!parsed.name && parsed.nickname) parsed.name = parsed.nickname;
        if (!parsed.username) parsed.username = parsed.email;
        if (parsed.isAdmin === undefined) parsed.isAdmin = false;
        setUser(parsed);
      } catch {
        localStorage.removeItem('currentUser');
      }
    }
    setIsLoading(false);
  }, []);

  const checkUsername = (username: string) =>
    !getStoredUsers().some(u => u.username === username);

  const checkNickname = (nickname: string) =>
    !getStoredUsers().some(u => u.nickname === nickname);

  const register = async (data: RegisterData): Promise<{ success: boolean; message: string }> => {
    const users = getStoredUsers();
    if (users.some(u => u.username === data.username))
      return { success: false, message: '이미 사용 중인 아이디입니다.' };
    if (users.some(u => u.nickname === data.nickname))
      return { success: false, message: '이미 사용 중인 닉네임입니다.' };
    if (users.some(u => u.email === data.email))
      return { success: false, message: '이미 사용 중인 이메일입니다.' };

    const newStored: StoredUser = {
      id: Date.now().toString(),
      username: data.username,
      nickname: data.nickname,
      email: data.email,
      password: data.password,
      isAdmin: false,
      createdAt: new Date().toISOString(),
    };
    users.push(newStored);
    saveStoredUsers(users);

    const publicUser = toPublicUser(newStored);
    setUser(publicUser);
    localStorage.setItem('currentUser', JSON.stringify(publicUser));
    return { success: true, message: '회원가입이 완료되었습니다!' };
  };

  const login = async (username: string, password: string): Promise<{ success: boolean; message: string }> => {
    const found = getStoredUsers().find(u => u.username === username && u.password === password);
    if (!found)
      return { success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' };

    const publicUser = toPublicUser(found);
    setUser(publicUser);
    localStorage.setItem('currentUser', JSON.stringify(publicUser));
    return { success: true, message: '로그인 되었습니다!' };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('currentUser');
  };

  const findUsernameByEmail = (email: string): string | null => {
    const found = getStoredUsers().find(u => u.email === email);
    return found ? found.username : null;
  };

  const resetPassword = (username: string, email: string, newPassword: string): { success: boolean; message: string } => {
    const users = getStoredUsers();
    const idx = users.findIndex(u => u.username === username && u.email === email);
    if (idx === -1) return { success: false, message: '아이디 또는 이메일이 올바르지 않습니다.' };
    users[idx].password = newPassword;
    saveStoredUsers(users);
    return { success: true, message: '비밀번호가 변경되었습니다.' };
  };

  const withdrawAccount = (): { success: boolean; message: string } => {
    if (!user) return { success: false, message: '로그인 상태가 아닙니다.' };
    if (user.isAdmin) return { success: false, message: '관리자 계정은 탈퇴할 수 없습니다.' };
    const users = getStoredUsers().filter(u => u.id !== user.id);
    saveStoredUsers(users);
    setUser(null);
    localStorage.removeItem('currentUser');
    return { success: true, message: '회원 탈퇴가 완료되었습니다.' };
  };

  const updateProfile = (updates: { nickname?: string; email?: string }): { success: boolean; message: string } => {
    if (!user) return { success: false, message: '로그인 상태가 아닙니다.' };
    const users = getStoredUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx === -1) return { success: false, message: '사용자를 찾을 수 없습니다.' };

    if (updates.nickname && updates.nickname !== users[idx].nickname) {
      if (users.some(u => u.nickname === updates.nickname))
        return { success: false, message: '이미 사용 중인 닉네임입니다.' };
      users[idx].nickname = updates.nickname;
    }
    if (updates.email && updates.email !== users[idx].email) {
      if (users.some(u => u.email === updates.email))
        return { success: false, message: '이미 사용 중인 이메일입니다.' };
      users[idx].email = updates.email;
    }
    saveStoredUsers(users);
    const updatedUser = toPublicUser(users[idx]);
    setUser(updatedUser);
    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
    return { success: true, message: '프로필이 업데이트되었습니다.' };
  };

  const changePassword = (currentPassword: string, newPassword: string): { success: boolean; message: string } => {
    if (!user) return { success: false, message: '로그인 상태가 아닙니다.' };
    const users = getStoredUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx === -1) return { success: false, message: '사용자를 찾을 수 없습니다.' };
    if (users[idx].password !== currentPassword) return { success: false, message: '현재 비밀번호가 일치하지 않습니다.' };
    if (newPassword.length < 6) return { success: false, message: '새 비밀번호는 6자 이상이어야 합니다.' };
    users[idx].password = newPassword;
    saveStoredUsers(users);
    return { success: true, message: '비밀번호가 변경되었습니다.' };
  };

  const getProfilePhoto = (userId: string): string | null => {
    try {
      const profiles = JSON.parse(localStorage.getItem('userProfiles') || '{}');
      return profiles[userId]?.photo || null;
    } catch { return null; }
  };

  const setProfilePhoto = (photo: string | null): void => {
    if (!user) return;
    const profiles = JSON.parse(localStorage.getItem('userProfiles') || '{}');
    profiles[user.id] = { ...profiles[user.id], photo };
    localStorage.setItem('userProfiles', JSON.stringify(profiles));
  };

  // ── 관리자 전용 ──

  const getAllUsers = (): PublicUser[] =>
    getStoredUsers().map(({ password: _, ...rest }) => rest);

  const adminUpdateUser = (userId: string, updates: { nickname?: string; email?: string; password?: string }): { success: boolean; message: string } => {
    const users = getStoredUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return { success: false, message: '사용자를 찾을 수 없습니다.' };

    if (updates.nickname && updates.nickname !== users[idx].nickname) {
      if (users.some(u => u.nickname === updates.nickname))
        return { success: false, message: '이미 사용 중인 닉네임입니다.' };
      users[idx].nickname = updates.nickname;
    }
    if (updates.email && updates.email !== users[idx].email) {
      if (users.some(u => u.email === updates.email))
        return { success: false, message: '이미 사용 중인 이메일입니다.' };
      users[idx].email = updates.email;
    }
    if (updates.password) {
      users[idx].password = updates.password;
    }

    saveStoredUsers(users);
    return { success: true, message: '회원 정보가 수정되었습니다.' };
  };

  const adminDeleteUser = (userId: string): { success: boolean; message: string } => {
    if (userId === ADMIN_ID) return { success: false, message: '관리자 계정은 삭제할 수 없습니다.' };
    const users = getStoredUsers();
    if (!users.some(u => u.id === userId)) return { success: false, message: '사용자를 찾을 수 없습니다.' };
    saveStoredUsers(users.filter(u => u.id !== userId));
    return { success: true, message: '회원이 삭제되었습니다.' };
  };

  return (
    <AuthContext.Provider value={{
      user, isLoading,
      login, register, logout,
      checkUsername, checkNickname,
      findUsernameByEmail, resetPassword,
      withdrawAccount,
      updateProfile, changePassword, getProfilePhoto, setProfilePhoto,
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

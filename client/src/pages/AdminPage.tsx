import { useState, useMemo } from 'react';
import { useAuth, type PublicUser } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Users, Search, Edit2, Trash2, Shield, ChevronLeft, Crown,
  Eye, EyeOff, X, CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';

export default function AdminPage() {
  const { user, getAllUsers, adminUpdateUser, adminDeleteUser } = useAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');

  // 수정 모달
  const [editTarget, setEditTarget] = useState<PublicUser | null>(null);
  const [editNickname, setEditNickname] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [showEditPw, setShowEditPw] = useState(false);

  // 삭제 확인 모달
  const [deleteTarget, setDeleteTarget] = useState<PublicUser | null>(null);

  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500 font-bold">접근 권한이 없습니다.</p>
      </div>
    );
  }

  const allUsers = getAllUsers();
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allUsers;
    return allUsers.filter(u =>
      u.nickname.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  }, [search, allUsers]);

  const totalUsers = allUsers.length;
  const regularUsers = allUsers.filter(u => !u.isAdmin).length;

  function openEdit(u: PublicUser) {
    setEditTarget(u);
    setEditNickname(u.nickname);
    setEditEmail(u.email);
    setEditPassword('');
    setShowEditPw(false);
  }

  function handleEditSave() {
    if (!editTarget) return;
    if (!editNickname.trim()) { toast.error('닉네임을 입력해주세요.'); return; }
    if (!editEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editEmail)) {
      toast.error('올바른 이메일을 입력해주세요.'); return;
    }
    const updates: { nickname?: string; email?: string; password?: string } = {};
    if (editNickname !== editTarget.nickname) updates.nickname = editNickname;
    if (editEmail !== editTarget.email) updates.email = editEmail;
    if (editPassword) {
      if (editPassword.length < 4) { toast.error('비밀번호는 4자 이상이어야 합니다.'); return; }
      updates.password = editPassword;
    }
    if (Object.keys(updates).length === 0) { toast('변경된 내용이 없습니다.'); return; }

    const result = adminUpdateUser(editTarget.id, updates);
    if (result.success) {
      toast.success(result.message);
      setEditTarget(null);
    } else {
      toast.error(result.message);
    }
  }

  function handleDelete() {
    if (!deleteTarget) return;
    const result = adminDeleteUser(deleteTarget.id);
    if (result.success) {
      toast.success(result.message);
      setDeleteTarget(null);
    } else {
      toast.error(result.message);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  return (
    <div className="min-h-screen bg-[#F9F7F2]">
      {/* 헤더 */}
      <header className="bg-white border-b border-[#DED6CC] shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation('/')}
              className="flex items-center gap-1 text-[#A68B77] hover:text-[#7D6B5D] transition-colors text-sm font-semibold"
            >
              <ChevronLeft className="w-4 h-4" /> 홈으로
            </button>
            <span className="text-[#DED6CC]">|</span>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#A68B77]" />
              <h1 className="text-lg font-bold text-[#7D6B5D]">관리자 패널</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-[#A68B77] bg-[#F9F7F2] px-3 py-1.5 rounded-full border border-[#DED6CC]">
            <Crown className="w-4 h-4 text-amber-500" />
            <span className="font-semibold">{user.nickname}</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* 통계 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          <Card className="p-5 bg-white border-[#DED6CC]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#E8E2D9] rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-[#A68B77]" />
              </div>
              <div>
                <p className="text-xs text-[#A68B77] font-medium">전체 회원</p>
                <p className="text-2xl font-bold text-[#7D6B5D]">{totalUsers}</p>
              </div>
            </div>
          </Card>
          <Card className="p-5 bg-white border-[#DED6CC]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#E8E2D9] rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-[#A68B77] font-medium">일반 회원</p>
                <p className="text-2xl font-bold text-[#7D6B5D]">{regularUsers}</p>
              </div>
            </div>
          </Card>
          <Card className="p-5 bg-white border-[#DED6CC]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                <Crown className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-[#A68B77] font-medium">관리자</p>
                <p className="text-2xl font-bold text-[#7D6B5D]">{totalUsers - regularUsers}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* 회원 목록 */}
        <Card className="bg-white border-[#DED6CC]">
          <div className="p-5 border-b border-[#E8E2D9] flex items-center justify-between gap-4">
            <h2 className="text-base font-bold text-[#7D6B5D] flex-shrink-0">회원 목록</h2>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#A68B77]" />
              <Input
                placeholder="닉네임, 아이디, 이메일 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 border-[#DED6CC] text-sm"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F9F7F2] border-b border-[#E8E2D9]">
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide">닉네임</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide">아이디</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide hidden md:table-cell">이메일</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide hidden lg:table-cell">가입일</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide">등급</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[#A68B77] uppercase tracking-wide">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-[#A68B77]">
                      검색 결과가 없습니다.
                    </td>
                  </tr>
                ) : filtered.map((u, i) => (
                  <tr key={u.id} className={`border-b border-[#F9F7F2] hover:bg-[#FDFCFA] transition-colors ${i % 2 === 0 ? '' : 'bg-[#FDFCFA]'}`}>
                    <td className="px-4 py-3 font-semibold text-[#7D6B5D]">
                      {u.nickname}
                    </td>
                    <td className="px-4 py-3 text-[#7D6B5D] font-mono text-xs">
                      {u.username}
                    </td>
                    <td className="px-4 py-3 text-[#A68B77] hidden md:table-cell text-xs">{u.email}</td>
                    <td className="px-4 py-3 text-[#A68B77] hidden lg:table-cell text-xs">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      {u.isAdmin ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
                          <Crown className="w-3 h-3" /> 관리자
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#E8E2D9] text-[#7D6B5D] rounded-full text-xs font-medium">
                          일반
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => openEdit(u)}
                          className="p-1.5 rounded-lg hover:bg-[#E8E2D9] text-[#A68B77] hover:text-[#7D6B5D] transition-colors"
                          title="수정"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {!u.isAdmin && (
                          <button
                            onClick={() => setDeleteTarget(u)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-[#A68B77] hover:text-red-500 transition-colors"
                            title="삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-[#E8E2D9] text-xs text-[#A68B77]">
              총 {filtered.length}명 {search && `(전체 ${totalUsers}명 중 검색 결과)`}
            </div>
          )}
        </Card>
      </main>

      {/* 수정 모달 */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#7D6B5D] flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-[#A68B77]" />
              회원 정보 수정
            </DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-4 pt-2">
              <div className="bg-[#F9F7F2] rounded-lg px-3 py-2 text-xs text-[#A68B77]">
                아이디: <span className="font-mono font-semibold text-[#7D6B5D]">{editTarget.username}</span>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#7D6B5D] mb-1.5">닉네임</label>
                <Input
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value)}
                  placeholder="닉네임"
                  className="border-[#DED6CC]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#7D6B5D] mb-1.5">이메일</label>
                <Input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="이메일"
                  className="border-[#DED6CC]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#7D6B5D] mb-1.5">
                  비밀번호 초기화 <span className="text-xs font-normal text-[#A68B77]">(변경 시에만 입력)</span>
                </label>
                <div className="relative">
                  <Input
                    type={showEditPw ? 'text' : 'password'}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="새 비밀번호 (선택)"
                    className="pr-10 border-[#DED6CC]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPw(!showEditPw)}
                    className="absolute right-3 top-2.5 text-[#A68B77]"
                  >
                    {showEditPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setEditTarget(null)}
                  className="flex-1 border-[#DED6CC] text-[#7D6B5D]"
                >
                  취소
                </Button>
                <Button
                  onClick={handleEditSave}
                  className="flex-1 bg-[#A68B77] hover:bg-[#8B7355] text-white"
                >
                  <CheckCircle className="w-4 h-4 mr-1.5" />저장
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 모달 */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              회원 삭제
            </DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="pt-2 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <p><span className="font-bold">{deleteTarget.nickname}</span> ({deleteTarget.username}) 회원을 삭제하시겠습니까?</p>
                <p className="text-xs mt-1 text-red-500">이 작업은 되돌릴 수 없습니다.</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 border-[#DED6CC] text-[#7D6B5D]"
                >
                  <X className="w-4 h-4 mr-1" />취소
                </Button>
                <Button
                  onClick={handleDelete}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                >
                  <Trash2 className="w-4 h-4 mr-1" />삭제
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  User, Mail, Lock, Trash2, Camera, Edit2, Check, X, Shield,
  BookOpen, Plane, Bookmark, MessageCircle, Heart, Calendar,
  KeyRound, UserX, ChevronRight, Eye, EyeOff, Star, MapPin, Crown
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';

function compressProfilePhoto(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 400;
        let { width, height } = img;
        if (width > height) {
          if (width > MAX) { height = Math.round(height * MAX / width); width = MAX; }
        } else {
          if (height > MAX) { width = Math.round(width * MAX / height); height = MAX; }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

type TabType = 'info' | 'activity' | 'security' | 'account';

export default function MyPage() {
  const { user, updateProfile, changePassword, withdrawAccount, getProfilePhoto, setProfilePhoto } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>('info');

  // 프로필 사진
  const [profilePhoto, setProfilePhotoState] = useState<string | null>(() =>
    user ? getProfilePhoto(user.id) : null
  );
  const photoInputRef = useRef<HTMLInputElement>(null);

  // 내 정보 편집
  const [editNickname, setEditNickname] = useState(user?.nickname || '');
  const [editEmail, setEditEmail] = useState(user?.email || '');
  const [infoSaving, setInfoSaving] = useState(false);

  // 비밀번호 변경
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // 회원 탈퇴
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawConfirm, setWithdrawConfirm] = useState('');

  // 활동 데이터
  const myDiaries = (() => {
    try {
      return (JSON.parse(localStorage.getItem('travelDiaries') || '[]') as any[])
        .filter(d => d.userId === user?.id);
    } catch { return []; }
  })();
  const myPublicDiaries = myDiaries.filter(d => d.isPublic);
  const myPlans = (() => {
    try {
      return (JSON.parse(localStorage.getItem('travelPlans') || '[]') as any[])
        .filter(p => p.userId === user?.id);
    } catch { return []; }
  })();
  const savedIds: string[] = (() => {
    try {
      const all = JSON.parse(localStorage.getItem('savedDiaries') || '{}');
      return all[user?.id || ''] || [];
    } catch { return []; }
  })();
  const allPublicDiaries = (() => {
    try {
      return (JSON.parse(localStorage.getItem('travelDiaries') || '[]') as any[])
        .filter(d => d.isPublic);
    } catch { return []; }
  })();
  const savedDiaries = allPublicDiaries.filter((d: any) => savedIds.includes(d.id));
  const myComments = (() => {
    try {
      return (JSON.parse(localStorage.getItem('diaryComments') || '[]') as any[])
        .filter(c => c.userId === user?.id);
    } catch { return []; }
  })();
  const totalLikesReceived = myPublicDiaries.reduce((sum: number, d: any) =>
    sum + (d.likes?.length || 0), 0);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('10MB 이하 이미지만 업로드 가능합니다.'); return; }
    try {
      const compressed = await compressProfilePhoto(file);
      setProfilePhotoState(compressed);
      setProfilePhoto(compressed);
      toast.success('프로필 사진이 변경되었습니다!');
    } catch {
      toast.error('이미지 처리 중 오류가 발생했습니다.');
    }
  };

  const handleRemovePhoto = () => {
    setProfilePhotoState(null);
    setProfilePhoto(null);
    toast.success('프로필 사진이 삭제되었습니다.');
  };

  const handleSaveInfo = () => {
    if (!editNickname.trim()) { toast.error('닉네임을 입력해주세요.'); return; }
    if (!editEmail.trim()) { toast.error('이메일을 입력해주세요.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editEmail)) { toast.error('올바른 이메일 형식이 아닙니다.'); return; }
    setInfoSaving(true);
    const result = updateProfile({ nickname: editNickname.trim(), email: editEmail.trim() });
    setInfoSaving(false);
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
  };

  const handleChangePassword = () => {
    if (!currentPw) { toast.error('현재 비밀번호를 입력해주세요.'); return; }
    if (!newPw) { toast.error('새 비밀번호를 입력해주세요.'); return; }
    if (newPw.length < 6) { toast.error('새 비밀번호는 6자 이상이어야 합니다.'); return; }
    if (newPw !== confirmPw) { toast.error('새 비밀번호가 일치하지 않습니다.'); return; }
    const result = changePassword(currentPw, newPw);
    if (result.success) {
      toast.success(result.message);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } else {
      toast.error(result.message);
    }
  };

  const handleWithdraw = () => {
    if (withdrawConfirm !== '탈퇴') { toast.error('"탈퇴"를 입력해주세요.'); return; }
    const result = withdrawAccount();
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
    setShowWithdraw(false);
  };

  const pwStrength = (pw: string): { level: number; label: string; color: string } => {
    if (!pw) return { level: 0, label: '', color: '' };
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { level: 1, label: '약함', color: 'bg-red-400' };
    if (score === 2) return { level: 2, label: '보통', color: 'bg-yellow-400' };
    if (score === 3) return { level: 3, label: '강함', color: 'bg-blue-400' };
    return { level: 4, label: '매우 강함', color: 'bg-green-500' };
  };
  const strength = pwStrength(newPw);

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'info', label: '내 정보', icon: <User className="w-4 h-4" /> },
    { id: 'activity', label: '내 활동', icon: <Star className="w-4 h-4" /> },
    { id: 'security', label: '보안 설정', icon: <KeyRound className="w-4 h-4" /> },
    { id: 'account', label: '계정 관리', icon: <Shield className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#F9F7F2]">
      {/* 프로필 헤더 배너 */}
      <div className="bg-gradient-to-r from-primary via-[#6CA3C8] to-[#8B7355] pt-10 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6">
            {/* 아바타 */}
            <div className="relative flex-shrink-0">
              <div className="w-24 h-24 rounded-full border-4 border-white shadow-xl overflow-hidden bg-white">
                {profilePhoto ? (
                  <img src={profilePhoto} alt="프로필" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary to-[#8B7355] flex items-center justify-center">
                    <span className="text-4xl font-black text-white">{user?.name.charAt(0)}</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => photoInputRef.current?.click()}
                className="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 transition border border-gray-200"
                title="사진 변경"
              >
                <Camera className="w-4 h-4 text-primary" />
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
            </div>

            {/* 이름 & 정보 */}
            <div className="text-center sm:text-left text-white flex-1">
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <h1 className="text-2xl font-black">{user?.nickname}</h1>
                {user?.isAdmin && <Crown className="w-5 h-5 text-amber-300" />}
              </div>
              <p className="text-white/80 text-sm mt-1">@{user?.username}</p>
              <p className="text-white/70 text-xs mt-0.5">{user?.email}</p>
              <p className="text-white/60 text-xs mt-0.5">
                가입일 {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('ko-KR') : ''}
              </p>
            </div>

            {/* 빠른 통계 */}
            <div className="flex gap-4 sm:gap-6 text-center">
              {[
                { label: '여행 계획', value: myPlans.length, icon: <Plane className="w-4 h-4" /> },
                { label: '여행 기록', value: myDiaries.length, icon: <BookOpen className="w-4 h-4" /> },
                { label: '저장한 글', value: savedIds.length, icon: <Bookmark className="w-4 h-4" /> },
              ].map(stat => (
                <div key={stat.label} className="bg-white/20 backdrop-blur rounded-xl px-4 py-3 min-w-[72px]">
                  <div className="flex items-center justify-center gap-1 text-white/80 text-xs mb-1">
                    {stat.icon}
                  </div>
                  <p className="text-xl font-black text-white">{stat.value}</p>
                  <p className="text-white/70 text-xs font-semibold">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 탭 + 콘텐츠 */}
      <div className="container mx-auto px-4 max-w-4xl -mt-6">
        {/* 탭 바 */}
        <Card className="shadow-lg mb-6">
          <div className="flex overflow-x-auto">
            {tabs.map((tab, i) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-5 py-4 text-sm font-bold whitespace-nowrap transition-all border-b-2 flex-1 justify-center",
                  i === 0 ? 'rounded-tl-xl' : '',
                  i === tabs.length - 1 ? 'rounded-tr-xl' : '',
                  activeTab === tab.id
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-gray-50'
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </Card>

        {/* 탭 콘텐츠 */}
        <div className="pb-16">
          {/* ── 내 정보 탭 ── */}
          {activeTab === 'info' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 프로필 사진 카드 */}
              <Card className="p-6 bg-white">
                <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-2">
                  <Camera className="w-5 h-5 text-primary" /> 프로필 사진
                </h3>
                <div className="flex flex-col items-center gap-4">
                  <div className="w-28 h-28 rounded-full border-4 border-primary/20 overflow-hidden bg-secondary shadow-md">
                    {profilePhoto ? (
                      <img src={profilePhoto} alt="프로필" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-primary to-[#8B7355] flex items-center justify-center">
                        <span className="text-5xl font-black text-white">{user?.name.charAt(0)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 w-full">
                    <Button
                      onClick={() => photoInputRef.current?.click()}
                      className="flex-1 bg-primary text-white gap-2"
                    >
                      <Camera className="w-4 h-4" /> 사진 변경
                    </Button>
                    {profilePhoto && (
                      <Button
                        onClick={handleRemovePhoto}
                        variant="outline"
                        className="text-red-500 border-red-200 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    JPG, PNG, GIF 지원 · 최대 10MB
                  </p>
                </div>
              </Card>

              {/* 기본 정보 카드 */}
              <Card className="p-6 bg-white">
                <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" /> 기본 정보
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                      아이디 (변경 불가)
                    </label>
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-secondary border border-border text-sm text-muted-foreground">
                      <User className="w-4 h-4 flex-shrink-0" />
                      {user?.username}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                      가입일 (변경 불가)
                    </label>
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-secondary border border-border text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4 flex-shrink-0" />
                      {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                    </div>
                  </div>
                </div>
              </Card>

              {/* 프로필 편집 카드 */}
              <Card className="p-6 bg-white md:col-span-2">
                <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-primary" /> 프로필 편집
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">닉네임</label>
                    <Input
                      value={editNickname}
                      onChange={e => setEditNickname(e.target.value)}
                      placeholder="닉네임 입력"
                      className="h-11"
                      maxLength={20}
                    />
                    <p className="text-xs text-muted-foreground mt-1">{editNickname.length}/20자</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">이메일</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="email"
                        value={editEmail}
                        onChange={e => setEditEmail(e.target.value)}
                        placeholder="이메일 입력"
                        className="h-11 pl-9"
                      />
                    </div>
                  </div>
                </div>
                <Button
                  onClick={handleSaveInfo}
                  disabled={infoSaving}
                  className="mt-5 bg-primary text-white px-8 h-11 gap-2"
                >
                  <Check className="w-4 h-4" /> 변경 사항 저장
                </Button>
              </Card>
            </div>
          )}

          {/* ── 내 활동 탭 ── */}
          {activeTab === 'activity' && (
            <div className="space-y-6">
              {/* 활동 통계 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: '여행 계획', value: myPlans.length, icon: <Plane className="w-5 h-5 text-sky-500" />, bg: 'bg-sky-50', text: 'text-sky-600' },
                  { label: '여행 기록', value: myDiaries.length, icon: <BookOpen className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50', text: 'text-emerald-600' },
                  { label: '공개 게시글', value: myPublicDiaries.length, icon: <Star className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50', text: 'text-amber-600' },
                  { label: '받은 좋아요', value: totalLikesReceived, icon: <Heart className="w-5 h-5 text-red-500" />, bg: 'bg-red-50', text: 'text-red-600' },
                ].map(stat => (
                  <Card key={stat.label} className={cn("p-4 text-center border-0", stat.bg)}>
                    <div className="flex justify-center mb-2">{stat.icon}</div>
                    <p className={cn("text-2xl font-black", stat.text)}>{stat.value}</p>
                    <p className="text-xs text-muted-foreground font-semibold mt-1">{stat.label}</p>
                  </Card>
                ))}
              </div>

              {/* 최근 여행 기록 */}
              <Card className="p-6 bg-white">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-primary" /> 내 여행 기록
                  </h3>
                  <button
                    onClick={() => setLocation('/diary')}
                    className="text-sm text-primary font-semibold hover:underline flex items-center gap-1"
                  >
                    전체 보기 <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                {myDiaries.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <BookOpen className="w-10 h-10 mx-auto mb-3 text-border" />
                    <p className="text-sm">아직 여행 기록이 없습니다.</p>
                    <button onClick={() => setLocation('/diary')} className="mt-3 text-sm text-primary font-semibold hover:underline">
                      첫 여행 기록 작성하기
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {[...myDiaries]
                      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .slice(0, 5)
                      .map((d: any) => (
                        <div key={d.id} className="flex items-center gap-4 py-3">
                          {d.photos?.[0] ? (
                            <img src={d.photos[0].url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                              <BookOpen className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-foreground text-sm truncate">{d.title}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3" /> {d.location} · {new Date(d.createdAt).toLocaleDateString('ko-KR')}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Heart className="w-3 h-3" /> {d.likes?.length || 0}
                            </span>
                            {d.isPublic ? (
                              <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">공개</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold">비공개</span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </Card>

              {/* 저장한 게시글 */}
              <Card className="p-6 bg-white">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Bookmark className="w-5 h-5 text-primary" /> 저장한 게시글
                  </h3>
                  <button
                    onClick={() => setLocation('/community')}
                    className="text-sm text-primary font-semibold hover:underline flex items-center gap-1"
                  >
                    커뮤니티 가기 <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                {savedDiaries.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Bookmark className="w-10 h-10 mx-auto mb-3 text-border" />
                    <p className="text-sm">아직 저장한 게시글이 없습니다.</p>
                    <button onClick={() => setLocation('/community')} className="mt-3 text-sm text-primary font-semibold hover:underline">
                      커뮤니티에서 인기 게시글 보기
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {savedDiaries.slice(0, 5).map((d: any) => (
                      <div key={d.id} className="flex items-center gap-4 py-3">
                        {d.photos?.[0] ? (
                          <img src={d.photos[0].url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                            <BookOpen className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-foreground text-sm truncate">{d.title}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" /> {d.location} · {new Date(d.createdAt).toLocaleDateString('ko-KR')}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {d.likes?.length || 0}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* 내가 쓴 댓글 */}
              <Card className="p-6 bg-white">
                <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-primary" /> 내가 쓴 댓글
                  <span className="text-sm text-muted-foreground font-normal">({myComments.length}개)</span>
                </h3>
                {myComments.length === 0 ? (
                  <p className="text-center py-6 text-sm text-muted-foreground">아직 작성한 댓글이 없습니다.</p>
                ) : (
                  <div className="space-y-3">
                    {[...myComments]
                      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .slice(0, 5)
                      .map((c: any) => (
                        <div key={c.id} className="p-3 bg-secondary rounded-lg border border-border">
                          <p className="text-sm text-foreground leading-relaxed">{c.content}</p>
                          <p className="text-xs text-muted-foreground mt-1.5">
                            {new Date(c.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ── 보안 설정 탭 ── */}
          {activeTab === 'security' && (
            <div className="max-w-lg">
              <Card className="p-6 bg-white">
                <h3 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
                  <Lock className="w-5 h-5 text-primary" /> 비밀번호 변경
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">현재 비밀번호</label>
                    <div className="relative">
                      <Input
                        type={showCurrentPw ? 'text' : 'password'}
                        value={currentPw}
                        onChange={e => setCurrentPw(e.target.value)}
                        placeholder="현재 비밀번호 입력"
                        className="h-11 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPw(!showCurrentPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">새 비밀번호</label>
                    <div className="relative">
                      <Input
                        type={showNewPw ? 'text' : 'password'}
                        value={newPw}
                        onChange={e => setNewPw(e.target.value)}
                        placeholder="새 비밀번호 입력 (6자 이상)"
                        className="h-11 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPw(!showNewPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {newPw && (
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1 flex-1">
                            {[1, 2, 3, 4].map(i => (
                              <div key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= strength.level ? strength.color : 'bg-gray-200')} />
                            ))}
                          </div>
                          <span className={cn("text-xs font-semibold", strength.level <= 1 ? 'text-red-500' : strength.level === 2 ? 'text-yellow-600' : strength.level === 3 ? 'text-blue-600' : 'text-green-600')}>
                            {strength.label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          대문자, 숫자, 특수문자를 포함하면 보안이 강화됩니다.
                        </p>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">새 비밀번호 확인</label>
                    <div className="relative">
                      <Input
                        type={showConfirmPw ? 'text' : 'password'}
                        value={confirmPw}
                        onChange={e => setConfirmPw(e.target.value)}
                        placeholder="새 비밀번호 재입력"
                        className={cn("h-11 pr-10", confirmPw && (confirmPw === newPw ? 'border-green-400 focus:border-green-400' : 'border-red-400 focus:border-red-400'))}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPw(!showConfirmPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {confirmPw && confirmPw !== newPw && (
                      <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                        <X className="w-3 h-3" /> 비밀번호가 일치하지 않습니다.
                      </p>
                    )}
                    {confirmPw && confirmPw === newPw && (
                      <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                        <Check className="w-3 h-3" /> 비밀번호가 일치합니다.
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={handleChangePassword}
                    className="w-full bg-primary text-white h-11 gap-2 mt-2"
                  >
                    <KeyRound className="w-4 h-4" /> 비밀번호 변경
                  </Button>
                </div>
              </Card>

              <Card className="p-5 mt-4 bg-blue-50 border-blue-200">
                <h4 className="text-sm font-bold text-blue-800 mb-2 flex items-center gap-2">
                  <Shield className="w-4 h-4" /> 비밀번호 보안 안내
                </h4>
                <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                  <li>최소 6자 이상의 비밀번호를 사용하세요.</li>
                  <li>영문 대소문자, 숫자, 특수문자를 조합하면 더욱 안전합니다.</li>
                  <li>다른 사이트와 동일한 비밀번호는 사용하지 마세요.</li>
                  <li>비밀번호는 정기적으로 변경하는 것을 권장합니다.</li>
                </ul>
              </Card>
            </div>
          )}

          {/* ── 계정 관리 탭 ── */}
          {activeTab === 'account' && (
            <div className="max-w-lg space-y-4">
              <Card className="p-6 bg-white">
                <h3 className="text-lg font-bold text-foreground mb-2 flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" /> 계정 정보
                </h3>
                <div className="space-y-3 mt-4">
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">아이디</span>
                    <span className="text-sm font-semibold text-foreground">{user?.username}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">닉네임</span>
                    <span className="text-sm font-semibold text-foreground">{user?.nickname}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">이메일</span>
                    <span className="text-sm font-semibold text-foreground">{user?.email}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-muted-foreground">계정 유형</span>
                    <span className={cn("text-sm font-bold", user?.isAdmin ? 'text-amber-600' : 'text-primary')}>
                      {user?.isAdmin ? '관리자' : '일반 회원'}
                    </span>
                  </div>
                </div>
              </Card>

              {!user?.isAdmin && (
                <Card className="p-6 bg-white border-red-100">
                  <h3 className="text-lg font-bold text-red-600 mb-3 flex items-center gap-2">
                    <UserX className="w-5 h-5" /> 회원 탈퇴
                  </h3>
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 space-y-2">
                    <p className="text-sm font-semibold text-red-700">탈퇴 전 꼭 확인하세요!</p>
                    <ul className="text-xs text-red-600 space-y-1 list-disc list-inside">
                      <li>모든 여행 계획 데이터가 삭제됩니다.</li>
                      <li>모든 여행 기록 및 커뮤니티 게시글이 삭제됩니다.</li>
                      <li>저장한 게시글 목록이 초기화됩니다.</li>
                      <li>탈퇴 후 동일한 아이디로 재가입이 가능합니다.</li>
                      <li>삭제된 데이터는 복구할 수 없습니다.</li>
                    </ul>
                  </div>
                  <Button
                    onClick={() => setShowWithdraw(true)}
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 gap-2 w-full h-11"
                  >
                    <UserX className="w-4 h-4" /> 회원 탈퇴 신청
                  </Button>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 회원 탈퇴 다이얼로그 */}
      <Dialog open={showWithdraw} onOpenChange={(o) => { if (!o) { setShowWithdraw(false); setWithdrawConfirm(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <UserX className="w-5 h-5" /> 회원 탈퇴
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 space-y-1">
              <p className="font-semibold">정말로 탈퇴하시겠습니까?</p>
              <p className="text-xs text-red-500">탈퇴 시 모든 데이터가 삭제되며 복구할 수 없습니다.</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                확인을 위해 <span className="text-red-500 font-bold">"탈퇴"</span>를 입력하세요
              </label>
              <input
                value={withdrawConfirm}
                onChange={e => setWithdrawConfirm(e.target.value)}
                placeholder="탈퇴"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setShowWithdraw(false); setWithdrawConfirm(''); }} className="flex-1">
                취소
              </Button>
              <Button onClick={handleWithdraw} className="flex-1 bg-red-500 hover:bg-red-600 text-white">
                <UserX className="w-4 h-4 mr-1" /> 탈퇴하기
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

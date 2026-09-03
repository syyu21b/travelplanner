import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  User, Mail, Lock, Trash2, Camera, Edit2, Check, X, Shield,
  BookOpen, Plane, Bookmark, MessageCircle, Heart, Calendar,
  KeyRound, UserX, ChevronLeft, ChevronRight, Eye, EyeOff, Star, MapPin, Crown,
  IdCard, Stamp, Globe2, ShieldCheck, Save, Settings, Loader2, Phone, Sparkles,
  Moon, Sun
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { useLocation } from 'wouter';
import type { PassportInfo } from '@/lib/passportCrypto';
import { getInquiries, type Inquiry } from '@/lib/inquiries';
import { diariesApi } from '@/lib/api/diaries';
import { albumsApi } from '@/lib/api/albums';
import { plansApi } from '@/lib/api/plans';
import { communityApi, type MyComment } from '@/lib/api/community';
import { uploadDataUrl } from '@/lib/api/media';
import { paymentsApi } from '@/lib/api/payments';
import { AiCreditsPaywallModal } from '@/components/AiCreditsPaywallModal';
import type { DiaryEntry, Album, TravelPlan } from '@shared/types';

const EMPTY_PASSPORT: PassportInfo = {
  passportNumber: '', fullNameEnglish: '', nationality: '',
  dateOfBirth: '', sex: '', issueDate: '', expiryDate: '', issuingCountry: '',
};

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

type TabType = 'info' | 'activity' | 'security' | 'passport' | 'account' | 'settings';

const INQUIRIES_PER_PAGE = 10;

export default function MyPage() {
  const {
    user, updateProfile, changePassword, withdrawAccount, getProfilePhoto, setProfilePhoto,
    verifyPassword, hasPassportInfo, savePassportInfo, loadPassportInfo, deletePassportInfo,
  } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { settings, updateSettings } = useNotifications();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>('info');
  const dateLocale = language === 'ko' ? 'ko-KR' : 'en-US';

  // 알림에서 "문의 답변 도착" 클릭 시 내 활동 탭으로 바로 이동
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'activity') {
      setActiveTab('activity');
    }
  }, []);

  // 여권 정보
  const [passportExists, setPassportExists] = useState(false);
  useEffect(() => {
    hasPassportInfo().then(setPassportExists);
  }, [hasPassportInfo]);
  const [passportUnlocked, setPassportUnlocked] = useState(false);
  const [passportChecking, setPassportChecking] = useState(false);
  const [passportGatePw, setPassportGatePw] = useState('');
  const [showPassportGatePw, setShowPassportGatePw] = useState(false);
  const [passportSessionPw, setPassportSessionPw] = useState('');
  const [passportForm, setPassportForm] = useState<PassportInfo>(EMPTY_PASSPORT);
  const [passportSaving, setPassportSaving] = useState(false);
  const [showDeletePassport, setShowDeletePassport] = useState(false);

  // 프로필 사진
  const [profilePhoto, setProfilePhotoState] = useState<string | null>(null);
  useEffect(() => {
    if (!user) { setProfilePhotoState(null); return; }
    let cancelled = false;
    getProfilePhoto(user.id).then(photo => { if (!cancelled) setProfilePhotoState(photo); });
    return () => { cancelled = true; };
  }, [user, getProfilePhoto]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // 내 정보 편집
  const [editNickname, setEditNickname] = useState(user?.nickname || '');
  const [editEmail, setEditEmail] = useState(user?.email || '');
  const [editPhoneNumber, setEditPhoneNumber] = useState(user?.phoneNumber || '');
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

  // 내 문의 내역 페이지네이션
  const [inquiryPage, setInquiryPage] = useState(1);

  // 활동 데이터 (서버 D1에서 로드)
  const [myDiaries, setMyDiaries] = useState<DiaryEntry[]>([]);
  const [myAlbums, setMyAlbums] = useState<Album[]>([]);
  const [myPlans, setMyPlans] = useState<TravelPlan[]>([]);
  const [savedDiaries, setSavedDiaries] = useState<DiaryEntry[]>([]);
  const [likedDiaries, setLikedDiaries] = useState<DiaryEntry[]>([]);
  const [myComments, setMyComments] = useState<MyComment[]>([]);
  const [myInquiries, setMyInquiries] = useState<Inquiry[]>([]);
  const [isActivityLoading, setIsActivityLoading] = useState(false);

  // AI 일정 생성 크레딧 (결제/무료 1회 포함) — 서버가 유일한 소스
  const [aiCredits, setAiCredits] = useState<number | null>(null);
  const [showAiCreditsPaywall, setShowAiCreditsPaywall] = useState(false);
  const refreshAiCredits = () => {
    if (!user) { setAiCredits(null); return; }
    paymentsApi.getCredits().then(r => setAiCredits(r.remainingCredits)).catch(() => {});
  };
  useEffect(refreshAiCredits, [user]);

  useEffect(() => {
    if (!user) return;
    setIsActivityLoading(true);
    Promise.allSettled([
      diariesApi.list().then(setMyDiaries),
      albumsApi.list().then(setMyAlbums),
      plansApi.list().then(setMyPlans),
      communityApi.bookmarks().then(setSavedDiaries),
      communityApi.likes().then(setLikedDiaries),
      communityApi.myComments().then(setMyComments),
    ]).finally(() => setIsActivityLoading(false));
    getInquiries().then(setMyInquiries).catch(() => {});
  }, [user]);

  const myPublicDiaries = myDiaries.filter(d => d.isPublic);
  // 커뮤니티의 해당 게시글로 이동 (Home 인기 여행/헤더 검색과 동일한 방식으로 자동 오픈 대상만 표시해 둠)
  const goToDiaryInCommunity = (diaryId: string) => {
    try { sessionStorage.setItem('trendingOpenDiaryId', diaryId); } catch {}
    setLocation('/community');
  };
  const sortedInquiries = [...myInquiries].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const totalInquiryPages = Math.max(1, Math.ceil(sortedInquiries.length / INQUIRIES_PER_PAGE));
  const inquiryPageSafe = Math.min(inquiryPage, totalInquiryPages);
  const pagedInquiries = sortedInquiries.slice(
    (inquiryPageSafe - 1) * INQUIRIES_PER_PAGE,
    inquiryPageSafe * INQUIRIES_PER_PAGE
  );
  const totalLikesReceived = myPublicDiaries.reduce((sum, d) => sum + d.likesCount, 0);

  // 여행 기록 목록의 썸네일 — 대표 사진(mainPhoto)으로 지정한 사진을 우선 사용하고,
  // 지정된 게 없을 때만 게시글에 첨부된 사진 중 첫 번째(영상 제외)로 대체
  const getDiaryThumbnailUrl = (d: DiaryEntry): string | null => {
    if (d.mainPhoto && d.mainPhoto.type !== 'video' && d.mainPhoto.url) return d.mainPhoto.url;
    return d.photos?.find(p => p.type !== 'video')?.url || null;
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error(t('mypage.toast.photoTooLarge')); return; }
    try {
      const compressed = await compressProfilePhoto(file);
      const uploaded = await uploadDataUrl('profile-photo', compressed);
      setProfilePhotoState(uploaded.url);
      await setProfilePhoto(uploaded.key);
      toast.success(t('mypage.toast.photoUpdated'));
    } catch {
      toast.error(t('mypage.toast.photoError'));
    }
  };

  const handleRemovePhoto = () => {
    setProfilePhotoState(null);
    setProfilePhoto(null);
    toast.success(t('mypage.toast.photoRemoved'));
  };

  const handleSaveInfo = async () => {
    if (!editNickname.trim()) { toast.error(t('mypage.toast.nicknameRequired')); return; }
    if (!editEmail.trim()) { toast.error(t('mypage.toast.emailRequired')); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editEmail)) { toast.error(t('mypage.toast.emailInvalid')); return; }
    const normalizedPhone = editPhoneNumber.replace(/-/g, '');
    if (normalizedPhone && !/^01[0-9]{8,9}$/.test(normalizedPhone)) { toast.error(t('mypage.toast.phoneInvalid')); return; }
    setInfoSaving(true);
    const result = await updateProfile({ nickname: editNickname.trim(), email: editEmail.trim(), phoneNumber: normalizedPhone });
    setInfoSaving(false);
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
  };

  const handleChangePassword = async () => {
    if (!currentPw) { toast.error(t('mypage.toast.currentPwRequired')); return; }
    if (!newPw) { toast.error(t('mypage.toast.newPwRequired')); return; }
    if (newPw.length < 6) { toast.error(t('mypage.toast.newPwTooShort')); return; }
    if (newPw !== confirmPw) { toast.error(t('mypage.toast.newPwMismatch')); return; }
    const result = await changePassword(currentPw, newPw);
    if (result.success) {
      toast.success(result.message);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } else {
      toast.error(result.message);
    }
  };

  const handleLockPassport = () => {
    setPassportUnlocked(false);
    setPassportSessionPw('');
    setPassportForm(EMPTY_PASSPORT);
  };

  const handleUnlockOrCreatePassport = async () => {
    if (!passportGatePw) { toast.error(t('mypage.toast.passwordRequired')); return; }
    setPassportChecking(true);
    try {
      if (passportExists) {
        const result = await loadPassportInfo(passportGatePw);
        if (result.success && result.data) {
          setPassportForm(result.data);
          setPassportSessionPw(passportGatePw);
          setPassportUnlocked(true);
          setPassportGatePw('');
        } else {
          toast.error(result.message);
        }
      } else {
        if (!(await verifyPassword(passportGatePw))) {
          toast.error(t('mypage.toast.passportPasswordMismatch'));
        } else {
          setPassportForm(EMPTY_PASSPORT);
          setPassportSessionPw(passportGatePw);
          setPassportUnlocked(true);
          setPassportGatePw('');
        }
      }
    } finally {
      setPassportChecking(false);
    }
  };

  const handleSavePassport = async () => {
    if (!passportForm.passportNumber.trim() || !passportForm.fullNameEnglish.trim()) {
      toast.error(t('mypage.toast.passportRequiredFields'));
      return;
    }
    setPassportSaving(true);
    const result = await savePassportInfo(passportSessionPw, passportForm);
    setPassportSaving(false);
    if (result.success) {
      toast.success(result.message);
      setPassportExists(true);
    } else {
      toast.error(result.message);
      if (result.message.includes('일치하지')) handleLockPassport();
    }
  };

  const handleDeletePassport = async () => {
    const result = await deletePassportInfo(passportSessionPw);
    setShowDeletePassport(false);
    if (result.success) {
      toast.success(result.message);
      setPassportExists(false);
      handleLockPassport();
    } else {
      toast.error(result.message);
    }
  };

  const handleWithdraw = async () => {
    const withdrawKeyword = t('mypage.account.withdrawKeyword');
    if (withdrawConfirm !== withdrawKeyword) { toast.error(t('mypage.toast.withdrawWordRequired', { word: withdrawKeyword })); return; }
    const result = await withdrawAccount();
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
    setShowWithdraw(false);
  };

  // 보안: 여권 정보 탭을 벗어나면 메모리에 올라온 복호화 데이터를 잠금 처리
  useEffect(() => {
    if (activeTab !== 'passport' && passportUnlocked) {
      handleLockPassport();
    }
  }, [activeTab]);

  const pwStrength = (pw: string): { level: number; label: string; color: string } => {
    if (!pw) return { level: 0, label: '', color: '' };
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { level: 1, label: t('mypage.security.strengthWeak'), color: 'bg-red-400' };
    if (score === 2) return { level: 2, label: t('mypage.security.strengthNormal'), color: 'bg-yellow-400' };
    if (score === 3) return { level: 3, label: t('mypage.security.strengthStrong'), color: 'bg-blue-400' };
    return { level: 4, label: t('mypage.security.strengthVeryStrong'), color: 'bg-green-500' };
  };
  const strength = pwStrength(newPw);

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'info', label: t('mypage.tabs.info'), icon: <User className="w-4 h-4" /> },
    { id: 'activity', label: t('mypage.tabs.activity'), icon: <Star className="w-4 h-4" /> },
    { id: 'security', label: t('mypage.tabs.security'), icon: <KeyRound className="w-4 h-4" /> },
    { id: 'passport', label: t('mypage.tabs.passport'), icon: <IdCard className="w-4 h-4" /> },
    { id: 'account', label: t('mypage.tabs.account'), icon: <Shield className="w-4 h-4" /> },
    { id: 'settings', label: t('mypage.tabs.settings'), icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#F9F7F2]">
      {/* 프로필 헤더 배너 */}
      <div
        className="relative overflow-hidden flex items-center py-10 min-h-[260px] sm:min-h-[300px] bg-[#5b4636]"
        style={{ backgroundImage: 'url(/hero-travel.jpg)', backgroundSize: 'cover', backgroundPosition: '75% 24%' }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-black/65 via-black/40 to-black/55" />
        <div className="container mx-auto px-4 max-w-4xl relative">
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6">
            {/* 아바타 */}
            <div className="relative flex-shrink-0">
              <div className="w-24 h-24 rounded-full border-4 border-white shadow-xl overflow-hidden bg-card">
                {profilePhoto ? (
                  <img src={profilePhoto} alt={t('mypage.common.profileAlt')} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary to-[#8B7355] flex items-center justify-center">
                    <span className="text-4xl font-black text-white">{user?.name.charAt(0)}</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => photoInputRef.current?.click()}
                className="absolute bottom-0 right-0 w-8 h-8 bg-card rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 transition border border-gray-200"
                title={t('mypage.common.changePhoto')}
              >
                <Camera className="w-4 h-4 text-primary" />
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
            </div>

            {/* 이름 & 정보 */}
            <div className="text-center sm:text-left text-white flex-1 min-w-0 max-w-full drop-shadow-md">
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <h1 className="text-2xl font-black break-words">{user?.nickname}</h1>
                {user?.isAdmin && <Crown className="w-5 h-5 text-amber-300 flex-shrink-0" />}
              </div>
              <p className="text-white/90 text-sm mt-1 break-words">@{user?.username}</p>
              <p className="text-white/80 text-xs mt-0.5 break-all">{user?.email}</p>
              <p className="text-white/70 text-xs mt-0.5">
                {t('mypage.header.joinedOn')} {user?.createdAt ? new Date(user.createdAt).toLocaleDateString(dateLocale) : ''}
              </p>
            </div>

            {/* 빠른 통계 */}
            <div className="flex gap-4 sm:gap-6 text-center">
              {[
                { label: t('mypage.stats.plans'), value: myPlans.length, icon: <Plane className="w-4 h-4" /> },
                { label: t('mypage.stats.diaries'), value: myDiaries.length, icon: <BookOpen className="w-4 h-4" /> },
                { label: t('mypage.stats.saved'), value: savedDiaries.length, icon: <Bookmark className="w-4 h-4" /> },
              ].map(stat => (
                <div key={stat.label} className="bg-black/25 backdrop-blur-sm ring-1 ring-white/20 shadow-md rounded-xl px-4 py-3 min-w-[72px]">
                  <div className="flex items-center justify-center gap-1 text-white/90 text-xs mb-1">
                    {stat.icon}
                  </div>
                  <p className="text-xl font-black text-white">{stat.value}</p>
                  <p className="text-white/80 text-xs font-semibold">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 탭 + 콘텐츠 */}
      <div className="container mx-auto px-4 max-w-4xl mt-6">
        {/* 탭 바 */}
        <Card className="shadow-lg mb-6">
          <div className="flex overflow-x-auto touch-pan-x overscroll-x-contain [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            {tabs.map((tab, i) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-5 py-4 text-sm font-bold whitespace-nowrap transition-all border-b-2 flex-shrink-0 sm:flex-1 justify-center",
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
              <Card className="p-6 bg-card">
                <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-2">
                  <Camera className="w-5 h-5 text-primary" /> {t('mypage.info.photoTitle')}
                </h3>
                <div className="flex flex-col items-center gap-4">
                  <div className="w-28 h-28 rounded-full border-4 border-primary/20 overflow-hidden bg-secondary shadow-md">
                    {profilePhoto ? (
                      <img src={profilePhoto} alt={t('mypage.common.profileAlt')} className="w-full h-full object-cover" />
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
                      <Camera className="w-4 h-4" /> {t('mypage.common.changePhoto')}
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
                    {t('mypage.info.photoHint')}
                  </p>
                </div>
              </Card>

              {/* 기본 정보 카드 */}
              <Card className="p-6 bg-card">
                <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" /> {t('mypage.info.basicInfoTitle')}
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                      {t('mypage.info.usernameLabel')}
                    </label>
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-secondary border border-border text-sm text-muted-foreground">
                      <User className="w-4 h-4 flex-shrink-0" />
                      {user?.username}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                      {t('mypage.info.joinedLabel')}
                    </label>
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-secondary border border-border text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4 flex-shrink-0" />
                      {user?.createdAt ? new Date(user.createdAt).toLocaleDateString(dateLocale, { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                      {t('mypage.info.aiCreditsLabel')}
                    </label>
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/20">
                      <div className="flex items-center gap-2 text-sm font-bold text-primary">
                        <Sparkles className="w-4 h-4 flex-shrink-0" />
                        {aiCredits === null ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          t('mypage.info.aiCreditsCount', { count: aiCredits })
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAiCreditsPaywall(true)}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        {t('mypage.info.aiCreditsCharge')}
                      </button>
                    </div>
                  </div>
                </div>
              </Card>

              {/* 프로필 편집 카드 */}
              <Card className="p-6 bg-card md:col-span-2">
                <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-primary" /> {t('mypage.info.editTitle')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">{t('mypage.info.nicknameLabel')}</label>
                    <Input
                      value={editNickname}
                      onChange={e => setEditNickname(e.target.value)}
                      placeholder={t('mypage.info.nicknamePlaceholder')}
                      className="h-11"
                      maxLength={20}
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t('mypage.info.nicknameCount', { count: editNickname.length })}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">{t('mypage.info.emailLabel')}</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="email"
                        value={editEmail}
                        onChange={e => setEditEmail(e.target.value)}
                        placeholder={t('mypage.info.emailPlaceholder')}
                        className="h-11 pl-9"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">{t('mypage.info.phoneLabel')}</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="tel"
                        value={editPhoneNumber}
                        onChange={e => setEditPhoneNumber(e.target.value)}
                        placeholder={t('mypage.info.phonePlaceholder')}
                        className="h-11 pl-9"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{t('mypage.info.phoneHint')}</p>
                  </div>
                </div>
                <Button
                  onClick={handleSaveInfo}
                  disabled={infoSaving}
                  className="mt-5 bg-primary text-white px-8 h-11 gap-2"
                >
                  <Check className="w-4 h-4" /> {t('mypage.info.saveButton')}
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
                  { label: t('mypage.stats.plans'), value: myPlans.length, icon: <Plane className="w-5 h-5 text-sky-500" />, bg: 'bg-sky-50', text: 'text-sky-600' },
                  { label: t('mypage.stats.diaries'), value: myDiaries.length, icon: <BookOpen className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50', text: 'text-emerald-600' },
                  { label: t('mypage.stats.publicPosts'), value: myPublicDiaries.length, icon: <Star className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50', text: 'text-amber-600' },
                  { label: t('mypage.stats.likesReceived'), value: totalLikesReceived, icon: <Heart className="w-5 h-5 text-red-500" />, bg: 'bg-red-50', text: 'text-red-600' },
                ].map(stat => (
                  <Card key={stat.label} className={cn("p-4 text-center border-0", stat.bg)}>
                    <div className="flex justify-center mb-2">{stat.icon}</div>
                    <p className={cn("text-2xl font-black", stat.text)}>{stat.value}</p>
                    <p className="text-xs text-muted-foreground font-semibold mt-1">{stat.label}</p>
                  </Card>
                ))}
              </div>

              {/* 최근 여행 기록 */}
              <Card className="p-6 bg-card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-primary" /> {t('mypage.activity.diariesTitle')}
                  </h3>
                  <button
                    onClick={() => setLocation('/diary')}
                    className="text-sm text-primary font-semibold hover:underline flex items-center gap-1"
                  >
                    {t('mypage.activity.viewAll')} <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                {isActivityLoading && myDiaries.length === 0 ? (
                  <div className="flex items-center justify-center py-10 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : myDiaries.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <BookOpen className="w-10 h-10 mx-auto mb-3 text-border" />
                    <p className="text-sm">{t('mypage.activity.noDiaries')}</p>
                    <button onClick={() => setLocation('/diary')} className="mt-3 text-sm text-primary font-semibold hover:underline">
                      {t('mypage.activity.writeFirst')}
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {[...myDiaries]
                      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .slice(0, 5)
                      .map((d: any) => {
                        const thumbUrl = getDiaryThumbnailUrl(d);
                        return (
                        <div key={d.id} className="flex items-center gap-4 py-3">
                          {thumbUrl ? (
                            <img src={thumbUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                              <BookOpen className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-foreground text-sm truncate">{d.title}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3" /> {d.location} · {new Date(d.createdAt).toLocaleDateString(dateLocale)}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Heart className="w-3 h-3" /> {d.likesCount}
                            </span>
                            {d.isPublic ? (
                              <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">{t('mypage.activity.public')}</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold">{t('mypage.activity.private')}</span>
                            )}
                          </div>
                        </div>
                        );
                      })}
                  </div>
                )}
              </Card>

              {/* 내 앨범 */}
              <Card className="p-6 bg-card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Camera className="w-5 h-5 text-primary" /> {t('mypage.activity.albumsTitle')}
                  </h3>
                  <button
                    onClick={() => setLocation('/diary?tab=albums')}
                    className="text-sm text-primary font-semibold hover:underline flex items-center gap-1"
                  >
                    {t('mypage.activity.viewAll')} <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                {isActivityLoading && myAlbums.length === 0 ? (
                  <div className="flex items-center justify-center py-10 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : myAlbums.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Camera className="w-10 h-10 mx-auto mb-3 text-border" />
                    <p className="text-sm">{t('mypage.activity.noAlbums')}</p>
                    <button onClick={() => setLocation('/diary?tab=albums')} className="mt-3 text-sm text-primary font-semibold hover:underline">
                      {t('mypage.activity.createFirstAlbum')}
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {[...myAlbums]
                      .sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
                      .slice(0, 5)
                      .map((a: any) => {
                        const thumbUrl = a.photos?.[0]?.type !== 'video' ? a.photos?.[0]?.url : null;
                        return (
                        <div key={a.id} className="flex items-center gap-4 py-3">
                          {thumbUrl ? (
                            <img src={thumbUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                              <Camera className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-foreground text-sm truncate">{a.title}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              {t('mypage.activity.photoCount', { count: a.photos?.length || 0 })} · {new Date(a.createdAt).toLocaleDateString(dateLocale)}
                            </p>
                          </div>
                        </div>
                        );
                      })}
                  </div>
                )}
              </Card>

              {/* 저장한 게시글 */}
              <Card className="p-6 bg-card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Bookmark className="w-5 h-5 text-primary" /> {t('mypage.activity.savedTitle')}
                  </h3>
                  <button
                    onClick={() => setLocation('/community')}
                    className="text-sm text-primary font-semibold hover:underline flex items-center gap-1"
                  >
                    {t('mypage.activity.goCommunity')} <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                {isActivityLoading && savedDiaries.length === 0 ? (
                  <div className="flex items-center justify-center py-10 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : savedDiaries.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Bookmark className="w-10 h-10 mx-auto mb-3 text-border" />
                    <p className="text-sm">{t('mypage.activity.noSaved')}</p>
                    <button onClick={() => setLocation('/community')} className="mt-3 text-sm text-primary font-semibold hover:underline">
                      {t('mypage.activity.viewPopular')}
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {savedDiaries.slice(0, 5).map((d: any) => {
                      const thumbUrl = getDiaryThumbnailUrl(d);
                      return (
                      <div key={d.id} className="flex items-center gap-4 py-3">
                        {thumbUrl ? (
                          <img src={thumbUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                            <BookOpen className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => goToDiaryInCommunity(d.id)}
                            className="font-bold text-foreground text-sm truncate hover:text-primary hover:underline text-left block w-full"
                          >
                            {d.title}
                          </button>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" /> {d.location} · {new Date(d.createdAt).toLocaleDateString(dateLocale)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {d.likesCount}</span>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* 내가 쓴 댓글 */}
              <Card className="p-6 bg-card">
                <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-primary" /> {t('mypage.activity.commentsTitle')}
                  <span className="text-sm text-muted-foreground font-normal">{t('mypage.activity.commentsCount', { count: myComments.length })}</span>
                </h3>
                {isActivityLoading && myComments.length === 0 ? (
                  <div className="flex items-center justify-center py-6 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : myComments.length === 0 ? (
                  <p className="text-center py-6 text-sm text-muted-foreground">{t('mypage.activity.noComments')}</p>
                ) : (
                  <div className="space-y-3">
                    {[...myComments]
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .slice(0, 5)
                      .map((c) => (
                        <div key={c.id} className="p-3 bg-secondary rounded-lg border border-border">
                          <button
                            type="button"
                            onClick={() => goToDiaryInCommunity(c.diaryId)}
                            disabled={!c.diaryIsPublic}
                            className={cn(
                              'text-xs font-bold mb-1.5 truncate block w-full text-left',
                              c.diaryIsPublic ? 'text-primary hover:underline' : 'text-muted-foreground cursor-default'
                            )}
                          >
                            {c.diaryTitle}
                          </button>
                          <p className="text-sm text-foreground leading-relaxed break-words">{c.content}</p>
                          <p className="text-xs text-muted-foreground mt-1.5">
                            {new Date(c.createdAt).toLocaleDateString(dateLocale, { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      ))}
                  </div>
                )}
              </Card>

              {/* 내가 좋아요 누른 게시글 (관리자는 문의할 일이 없으므로 문의 내역 대신 표시되지만, 일반 회원도 댓글과 문의 내역 사이에 노출) */}
              <Card className="p-6 bg-card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Heart className="w-5 h-5 text-primary" /> {t('mypage.activity.likedTitle')}
                  </h3>
                  <button
                    onClick={() => setLocation('/community')}
                    className="text-sm text-primary font-semibold hover:underline flex items-center gap-1"
                  >
                    {t('mypage.activity.goCommunity')} <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                {isActivityLoading && likedDiaries.length === 0 ? (
                  <div className="flex items-center justify-center py-10 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : likedDiaries.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Heart className="w-10 h-10 mx-auto mb-3 text-border" />
                    <p className="text-sm">{t('mypage.activity.noLiked')}</p>
                    <button onClick={() => setLocation('/community')} className="mt-3 text-sm text-primary font-semibold hover:underline">
                      {t('mypage.activity.viewPopular')}
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {likedDiaries.slice(0, 5).map((d: any) => {
                      const thumbUrl = getDiaryThumbnailUrl(d);
                      return (
                      <div key={d.id} className="flex items-center gap-4 py-3">
                        {thumbUrl ? (
                          <img src={thumbUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                            <BookOpen className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => goToDiaryInCommunity(d.id)}
                            className="font-bold text-foreground text-sm truncate hover:text-primary hover:underline text-left block w-full"
                          >
                            {d.title}
                          </button>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" /> {d.location} · {new Date(d.createdAt).toLocaleDateString(dateLocale)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {d.likesCount}</span>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* 내 문의 내역 (관리자는 문의할 일이 없으므로 숨김) */}
              {!user?.isAdmin && (
              <Card className="p-6 bg-card">
                <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                  <Mail className="w-5 h-5 text-primary" /> {t('mypage.activity.inquiriesTitle')}
                  <span className="text-sm text-muted-foreground font-normal">{t('mypage.activity.commentsCount', { count: myInquiries.length })}</span>
                </h3>
                {myInquiries.length === 0 ? (
                  <p className="text-center py-6 text-sm text-muted-foreground">{t('mypage.activity.noInquiries')}</p>
                ) : (
                  <div className="space-y-3">
                    {pagedInquiries
                      .map(inq => (
                        <div key={inq.id} className="p-4 bg-secondary rounded-lg border border-border">
                          <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                            <p className="font-bold text-foreground text-sm">{inq.title}</p>
                            {inq.status === 'answered' ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex-shrink-0">
                                {t('mypage.activity.inquiryAnswered')}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex-shrink-0">
                                {t('mypage.activity.inquiryPending')}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">{inq.content}</p>
                          <p className="text-xs text-muted-foreground mt-1.5">
                            {new Date(inq.createdAt).toLocaleDateString(dateLocale, { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                          {inq.status === 'answered' && inq.answer && (
                            <div className="mt-3 pt-3 border-t border-border">
                              <p className="text-xs font-bold text-primary mb-1">{t('mypage.activity.inquiryAnswerLabel')}</p>
                              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">{inq.answer}</p>
                              {inq.answeredAt && (
                                <p className="text-xs text-muted-foreground mt-1.5">
                                  {new Date(inq.answeredAt).toLocaleDateString(dateLocale, { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                )}
                {totalInquiryPages > 1 && (
                  <div className="flex items-center justify-center flex-wrap gap-1.5 mt-5">
                    <button
                      type="button"
                      onClick={() => setInquiryPage(p => Math.max(1, p - 1))}
                      disabled={inquiryPageSafe === 1}
                      className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    {Array.from({ length: totalInquiryPages }, (_, idx) => idx + 1).map(page => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setInquiryPage(page)}
                        className={cn(
                          "w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full text-sm font-bold transition",
                          page === inquiryPageSafe ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary"
                        )}
                      >
                        {page}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setInquiryPage(p => Math.min(totalInquiryPages, p + 1))}
                      disabled={inquiryPageSafe === totalInquiryPages}
                      className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </Card>
              )}
            </div>
          )}

          {/* ── 보안 설정 탭 ── */}
          {activeTab === 'security' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <Card className="p-6 bg-card">
                <h3 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
                  <Lock className="w-5 h-5 text-primary" /> {t('mypage.security.changePwTitle')}
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">{t('mypage.security.currentPwLabel')}</label>
                    <div className="relative">
                      <Input
                        type={showCurrentPw ? 'text' : 'password'}
                        value={currentPw}
                        onChange={e => setCurrentPw(e.target.value)}
                        placeholder={t('mypage.security.currentPwPlaceholder')}
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
                    <label className="block text-sm font-semibold text-foreground mb-1.5">{t('mypage.security.newPwLabel')}</label>
                    <div className="relative">
                      <Input
                        type={showNewPw ? 'text' : 'password'}
                        value={newPw}
                        onChange={e => setNewPw(e.target.value)}
                        placeholder={t('mypage.security.newPwPlaceholder')}
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
                          {t('mypage.security.newPwHint')}
                        </p>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">{t('mypage.security.confirmPwLabel')}</label>
                    <div className="relative">
                      <Input
                        type={showConfirmPw ? 'text' : 'password'}
                        value={confirmPw}
                        onChange={e => setConfirmPw(e.target.value)}
                        placeholder={t('mypage.security.confirmPwPlaceholder')}
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
                        <X className="w-3 h-3" /> {t('mypage.security.mismatch')}
                      </p>
                    )}
                    {confirmPw && confirmPw === newPw && (
                      <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                        <Check className="w-3 h-3" /> {t('mypage.security.match')}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={handleChangePassword}
                    className="w-full bg-primary text-white h-11 gap-2 mt-2"
                  >
                    <KeyRound className="w-4 h-4" /> {t('mypage.security.changeButton')}
                  </Button>
                </div>
              </Card>

              <Card className="p-5 bg-blue-50 border-blue-200">
                <h4 className="text-sm font-bold text-blue-800 mb-2 flex items-center gap-2">
                  <Shield className="w-4 h-4" /> {t('mypage.security.guideTitle')}
                </h4>
                <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                  <li>{t('mypage.security.guide1')}</li>
                  <li>{t('mypage.security.guide2')}</li>
                  <li>{t('mypage.security.guide3')}</li>
                  <li>{t('mypage.security.guide4')}</li>
                </ul>
              </Card>
            </div>
          )}

          {/* ── 여권 정보 탭 ── */}
          {activeTab === 'passport' && (
            <div>
              {!passportUnlocked ? (
                <Card className="p-8 bg-card text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Lock className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">
                    {passportExists ? t('mypage.passport.encryptedTitle') : t('mypage.passport.registerTitle')}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    {passportExists
                      ? t('mypage.passport.encryptedDesc')
                      : t('mypage.passport.registerDesc')}
                  </p>
                  <div className="max-w-xs mx-auto space-y-3">
                    <div className="relative">
                      <Input
                        type={showPassportGatePw ? 'text' : 'password'}
                        value={passportGatePw}
                        onChange={e => setPassportGatePw(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleUnlockOrCreatePassport(); }}
                        placeholder={t('mypage.passport.pwPlaceholder')}
                        className="h-11 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassportGatePw(!showPassportGatePw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassportGatePw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <Button
                      onClick={handleUnlockOrCreatePassport}
                      disabled={passportChecking}
                      className="w-full bg-primary text-white h-11 gap-2"
                    >
                      <ShieldCheck className="w-4 h-4" /> {passportExists ? t('mypage.passport.confirmButton') : t('mypage.passport.startButton')}
                    </Button>
                  </div>
                </Card>
              ) : (
                <div className="space-y-4">
                  {/* 여권 스타일 카드 */}
                  <div
                    className="relative rounded-2xl overflow-hidden shadow-xl border border-[#0d1b2e]"
                    style={{ background: 'linear-gradient(135deg, #0d1b2e 0%, #1a3a5c 100%)' }}
                  >
                    <div className="p-6 sm:p-8 text-[#e8dcc0]">
                      <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#e8dcc0]/20">
                        <div className="flex items-center gap-3">
                          <Globe2 className="w-7 h-7 text-[#d4af37] flex-shrink-0" />
                          <div>
                            <p className="text-[10px] tracking-[0.25em] text-[#d4af37] font-bold">TRAVEL PLANNER</p>
                            <p className="text-lg font-black tracking-[0.2em]">PASSPORT</p>
                          </div>
                        </div>
                        <Stamp className="w-8 h-8 text-[#d4af37]/40 flex-shrink-0" />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        {[
                          { key: 'passportNumber' as const, label: t('mypage.passport.fieldPassportNumber'), type: 'text' },
                          { key: 'fullNameEnglish' as const, label: t('mypage.passport.fieldFullName'), type: 'text' },
                          { key: 'nationality' as const, label: t('mypage.passport.fieldNationality'), type: 'text' },
                          { key: 'dateOfBirth' as const, label: t('mypage.passport.fieldDateOfBirth'), type: 'date' },
                          { key: 'issueDate' as const, label: t('mypage.passport.fieldIssueDate'), type: 'date' },
                          { key: 'expiryDate' as const, label: t('mypage.passport.fieldExpiryDate'), type: 'date' },
                          { key: 'issuingCountry' as const, label: t('mypage.passport.fieldIssuingCountry'), type: 'text' },
                        ].map(field => (
                          <div key={field.key}>
                            <label className="block text-[10px] tracking-widest text-[#d4af37]/80 font-bold mb-1">
                              {field.label}
                            </label>
                            <input
                              type={field.type}
                              value={passportForm[field.key]}
                              onChange={e => setPassportForm({ ...passportForm, [field.key]: e.target.value })}
                              className="w-full bg-transparent border-b border-[#e8dcc0]/30 focus:border-[#d4af37] outline-none text-[#f5eee0] text-sm py-1.5 placeholder:text-[#e8dcc0]/30"
                              placeholder="-"
                            />
                          </div>
                        ))}
                        <div>
                          <label className="block text-[10px] tracking-widest text-[#d4af37]/80 font-bold mb-1">
                            {t('mypage.passport.fieldSex')}
                          </label>
                          <select
                            value={passportForm.sex}
                            onChange={e => setPassportForm({ ...passportForm, sex: e.target.value as PassportInfo['sex'] })}
                            className="w-full bg-transparent border-b border-[#e8dcc0]/30 focus:border-[#d4af37] outline-none text-[#f5eee0] text-sm py-1.5 [&>option]:text-black"
                          >
                            <option value="">-</option>
                            <option value="M">M</option>
                            <option value="F">F</option>
                          </select>
                        </div>
                      </div>

                      <div className="mt-6 pt-4 border-t border-[#e8dcc0]/20 font-mono text-[10px] sm:text-xs tracking-[0.15em] text-[#e8dcc0]/30 break-all leading-relaxed select-none">
                        P&lt;{(passportForm.nationality || 'XXX').toUpperCase().slice(0, 3).padEnd(3, '<')}
                        {(passportForm.fullNameEnglish || 'TRAVELER').toUpperCase().replace(/[^A-Z]/g, '<').padEnd(20, '<')}
                        <br />
                        {(passportForm.passportNumber || '0000000000').toUpperCase().padEnd(12, '<')}
                        {(passportForm.nationality || 'XXX').toUpperCase().slice(0, 3).padEnd(3, '<')}
                        {'<'.repeat(20)}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleSavePassport} disabled={passportSaving} className="flex-1 bg-primary text-white h-11 gap-2">
                      <Save className="w-4 h-4" /> {t('mypage.passport.saveButton')}
                    </Button>
                    <Button onClick={handleLockPassport} variant="outline" className="h-11 gap-2">
                      <Lock className="w-4 h-4" /> {t('mypage.passport.lockButton')}
                    </Button>
                    {passportExists && (
                      <Button
                        onClick={() => setShowDeletePassport(true)}
                        variant="outline"
                        className="h-11 gap-2 text-red-500 border-red-200 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <Card className="p-4 bg-blue-50 border-blue-200">
                    <p className="text-xs text-blue-700 flex items-start gap-2">
                      <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      {t('mypage.passport.encryptionNotice')}
                    </p>
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* ── 계정 관리 탭 ── */}
          {activeTab === 'account' && (
            <div className="space-y-4">
              <Card className="p-6 bg-card">
                <h3 className="text-lg font-bold text-foreground mb-2 flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" /> {t('mypage.account.infoTitle')}
                </h3>
                <div className="space-y-3 mt-4">
                  <div className="flex items-center justify-between gap-3 py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground flex-shrink-0">{t('mypage.account.usernameLabel')}</span>
                    <span className="text-sm font-semibold text-foreground text-right break-all">{user?.username}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground flex-shrink-0">{t('mypage.account.nicknameLabel')}</span>
                    <span className="text-sm font-semibold text-foreground text-right break-all">{user?.nickname}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground flex-shrink-0">{t('mypage.account.emailLabel')}</span>
                    <span className="text-sm font-semibold text-foreground text-right break-all">{user?.email}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-muted-foreground">{t('mypage.account.accountTypeLabel')}</span>
                    <span className={cn("text-sm font-bold", user?.isAdmin ? 'text-amber-600' : 'text-primary')}>
                      {user?.isAdmin ? t('mypage.account.admin') : t('mypage.account.normal')}
                    </span>
                  </div>
                </div>
              </Card>

              {!user?.isAdmin && (
                <Card className="p-6 bg-card border-red-100">
                  <h3 className="text-lg font-bold text-red-600 mb-3 flex items-center gap-2">
                    <UserX className="w-5 h-5" /> {t('mypage.account.withdrawTitle')}
                  </h3>
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 space-y-2">
                    <p className="text-sm font-semibold text-red-700">{t('mypage.account.withdrawWarningTitle')}</p>
                    <ul className="text-xs text-red-600 space-y-1 list-disc list-inside">
                      <li>{t('mypage.account.withdrawItem1')}</li>
                      <li>{t('mypage.account.withdrawItem2')}</li>
                      <li>{t('mypage.account.withdrawItem3')}</li>
                      <li>{t('mypage.account.withdrawItem4')}</li>
                      <li>{t('mypage.account.withdrawItem5')}</li>
                    </ul>
                  </div>
                  <Button
                    onClick={() => setShowWithdraw(true)}
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 gap-2 w-full h-11"
                  >
                    <UserX className="w-4 h-4" /> {t('mypage.account.withdrawButton')}
                  </Button>
                </Card>
              )}
            </div>
          )}

          {/* ── 설정 탭 ── */}
          {activeTab === 'settings' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <div className="space-y-6">
              {/* 언어 설정 카드 */}
              <Card className="p-6 bg-card">
                <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-2">
                  <Globe2 className="w-5 h-5 text-primary" /> {t('mypage.settings.languageTitle')}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={() => setLanguage('ko')}
                    variant={language === 'ko' ? 'default' : 'outline'}
                    className={cn("h-11", language === 'ko' && 'bg-primary text-white')}
                  >
                    {t('mypage.settings.korean')}
                  </Button>
                  <Button
                    onClick={() => setLanguage('en')}
                    variant={language === 'en' ? 'default' : 'outline'}
                    className={cn("h-11", language === 'en' && 'bg-primary text-white')}
                  >
                    {t('mypage.settings.english')}
                  </Button>
                </div>
              </Card>

              {/* 화면 테마 카드 */}
              <Card className="p-6 bg-card">
                <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-2">
                  <Moon className="w-5 h-5 text-primary" /> {t('mypage.settings.themeTitle')}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={() => { if (theme !== 'light' && toggleTheme) toggleTheme(); }}
                    variant={theme === 'light' ? 'default' : 'outline'}
                    className={cn("h-11 gap-1.5", theme === 'light' && 'bg-primary text-white')}
                  >
                    <Sun className="w-4 h-4" /> {t('mypage.settings.themeLight')}
                  </Button>
                  <Button
                    onClick={() => { if (theme !== 'dark' && toggleTheme) toggleTheme(); }}
                    variant={theme === 'dark' ? 'default' : 'outline'}
                    className={cn("h-11 gap-1.5", theme === 'dark' && 'bg-primary text-white')}
                  >
                    <Moon className="w-4 h-4" /> {t('mypage.settings.themeDark')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-3">{t('mypage.settings.themeHint')}</p>
              </Card>
              </div>

              {/* 알림 설정 카드 */}
              <Card className="p-6 bg-card">
                <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-primary" /> {t('mypage.settings.notificationTitle')}
                </h3>
                <div className="divide-y divide-border">
                  {[
                    { key: 'tripD3' as const, label: t('mypage.settings.tripD3Label'), desc: t('mypage.settings.tripD3Desc') },
                    { key: 'tripDDay' as const, label: t('mypage.settings.tripDDayLabel'), desc: t('mypage.settings.tripDDayDesc') },
                    { key: 'likes' as const, label: t('mypage.settings.likesLabel'), desc: t('mypage.settings.likesDesc') },
                    { key: 'comments' as const, label: t('mypage.settings.commentsLabel'), desc: t('mypage.settings.commentsDesc') },
                    { key: 'shares' as const, label: t('mypage.settings.sharesLabel'), desc: t('mypage.settings.sharesDesc') },
                    { key: 'popularPost' as const, label: t('mypage.settings.popularPostLabel'), desc: t('mypage.settings.popularPostDesc') },
                    { key: 'inquiryAnswer' as const, label: t('mypage.settings.inquiryAnswerLabel'), desc: t('mypage.settings.inquiryAnswerDesc') },
                    ...(user?.isAdmin ? [{ key: 'inquiryNew' as const, label: t('mypage.settings.inquiryNewLabel'), desc: t('mypage.settings.inquiryNewDesc') }] : []),
                  ].map(item => (
                    <div key={item.key} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{item.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                      </div>
                      <Switch
                        checked={settings[item.key]}
                        onCheckedChange={(checked) => updateSettings({ [item.key]: checked })}
                      />
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* 회원 탈퇴 다이얼로그 */}
      <Dialog open={showWithdraw} onOpenChange={(o) => { if (!o) { setShowWithdraw(false); setWithdrawConfirm(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <UserX className="w-5 h-5" /> {t('mypage.account.withdrawTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 space-y-1">
              <p className="font-semibold">{t('mypage.dialogs.withdrawConfirmQuestion')}</p>
              <p className="text-xs text-red-500">{t('mypage.dialogs.withdrawConfirmDesc')}</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                {t('mypage.dialogs.withdrawTypeLabel', { word: t('mypage.account.withdrawKeyword') })}
              </label>
              <input
                value={withdrawConfirm}
                onChange={e => setWithdrawConfirm(e.target.value)}
                placeholder={t('mypage.account.withdrawKeyword')}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setShowWithdraw(false); setWithdrawConfirm(''); }} className="flex-1">
                {t('mypage.common.cancel')}
              </Button>
              <Button onClick={handleWithdraw} className="flex-1 bg-red-500 hover:bg-red-600 text-white">
                <UserX className="w-4 h-4 mr-1" /> {t('mypage.dialogs.withdrawSubmit')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 여권 정보 삭제 다이얼로그 */}
      <Dialog open={showDeletePassport} onOpenChange={setShowDeletePassport}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> {t('mypage.dialogs.deletePassportTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {t('mypage.dialogs.deletePassportDesc')}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowDeletePassport(false)} className="flex-1">
                {t('mypage.common.cancel')}
              </Button>
              <Button onClick={handleDeletePassport} className="flex-1 bg-red-500 hover:bg-red-600 text-white">
                <Trash2 className="w-4 h-4 mr-1" /> {t('mypage.dialogs.deletePassportSubmit')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AiCreditsPaywallModal
        open={showAiCreditsPaywall}
        onOpenChange={setShowAiCreditsPaywall}
        onPurchased={refreshAiCredits}
      />
    </div>
  );
}

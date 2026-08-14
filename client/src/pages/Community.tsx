import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Heart, MessageCircle, Share2, Search, Globe, MapPin,
  Calendar, Camera, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight,
  Send, Trash2, Flag, TrendingUp, Clock, Users, Star,
  Filter, SortAsc, Plane, BookOpen, Edit2, Check, X, Shield, Copy
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StarRatingDisplay } from '@/components/StarRating';
import { TripPlanPreviewDialog, type TripPlanPreviewData } from '@/components/TripPlanPreviewDialog';
import { toast } from 'sonner';
import { cn, copyToClipboard } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNotifications } from '@/contexts/NotificationContext';

interface DiaryPhoto {
  id: string;
  url: string;
  caption?: string;
  type?: 'photo' | 'video';
}

interface ScheduleItem {
  id: string;
  date: string;
  time: string;
  endTime?: string;
  title: string;
  category: 'accommodation' | 'transport' | 'meal' | 'activity' | 'other';
  location?: string;
  lat?: number;
  lng?: number;
  cost?: number;
  link?: string;
  notes?: string;
  preparations?: string[];
  completed?: boolean;
}

interface PlanAccommodation {
  id: string;
  name: string;
  address?: string;
  checkInDate: string;
  checkInTime?: string;
  checkOutDate: string;
  checkOutTime?: string;
}

interface PlanBudgetItem {
  id: string;
  amount: number;
  category?: string;
  description?: string;
}

interface PlanShoppingItem {
  id: string;
  item: string;
  checked: boolean;
  imageUrl?: string;
  link?: string;
}

interface PlanFlightItem {
  id: string;
  [key: string]: unknown;
}

interface TravelPlan {
  id: string;
  userId: string;
  title: string;
  startDate: string;
  endDate: string;
  region?: 'domestic' | 'overseas';
  coverPhoto?: string;
  schedules: ScheduleItem[];
  budgets?: PlanBudgetItem[];
  shoppingList?: PlanShoppingItem[];
  accommodations?: PlanAccommodation[];
  flights?: PlanFlightItem[];
  preparationChecks?: Record<string, boolean>;
  totalBudgetAmount?: number;
  travelers?: number;
  /** 작성자가 이 계획을 커뮤니티에서 다른 회원이 복제해갈 수 있도록 허용했는지 여부 */
  allowClone?: boolean;
}

interface DiaryEntry {
  id: string;
  userId: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  content: string;
  rating: number;
  mainPhoto?: DiaryPhoto;
  photos: DiaryPhoto[];
  tags: string[];
  isPublic: boolean;
  linkedPlanId?: string;
  linkedPlanTitle?: string;
  linkedPlanSchedules?: ScheduleItem[];
  createdAt: string;
  updatedAt: string;
  likes: string[];
}

interface Comment {
  id: string;
  diaryId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  likes: string[];
}

interface RegisteredUser {
  id: string;
  name: string;
  email: string;
}

// 다른 시점/버전에서 저장된 데이터에는 photos/tags/likes 등의 필드가 없을 수 있어,
// 읽어올 때 항상 안전한 기본값으로 채워 넣어 렌더링 중 크래시를 방지
function normalizeDiary(d: DiaryEntry): DiaryEntry {
  return {
    ...d,
    title: d.title ?? '',
    location: d.location ?? '',
    content: d.content ?? '',
    photos: d.photos ?? [],
    tags: d.tags ?? [],
    likes: d.likes ?? [],
  };
}

type SortType = 'latest' | 'popular' | 'comments';
type FilterType = 'all' | 'following';

export default function Community() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const { notify } = useNotifications();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortType>('latest');
  const [filterBy, setFilterBy] = useState<FilterType>('all');
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const POSTS_PER_PAGE = 12;
  const [selectedDiary, setSelectedDiary] = useState<DiaryEntry | null>(null);
  const [showPlanSchedule, setShowPlanSchedule] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [savedDiaries, setSavedDiaries] = useState<string[]>([]);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  // 관리자 게시글 수정/삭제
  const [editingDiary, setEditingDiary] = useState<DiaryEntry | null>(null);
  const [editDiaryTitle, setEditDiaryTitle] = useState('');
  const [editDiaryContent, setEditDiaryContent] = useState('');
  const [editDiaryLocation, setEditDiaryLocation] = useState('');
  const [deleteDiaryId, setDeleteDiaryId] = useState<string | null>(null);

  const loadDiaries = (): DiaryEntry[] => {
    const raw = JSON.parse(localStorage.getItem('travelDiaries') || '[]') as DiaryEntry[];
    return raw.map(normalizeDiary);
  };

  const loadComments = (): Comment[] => {
    return JSON.parse(localStorage.getItem('diaryComments') || '[]') as Comment[];
  };

  const loadSaved = (): string[] => {
    const all = JSON.parse(localStorage.getItem('savedDiaries') || '{}');
    return all[user?.id || ''] || [];
  };

  const getUsers = (): RegisteredUser[] => {
    return JSON.parse(localStorage.getItem('registeredUsers') || '[]');
  };

  // 원본 계획을 우선 사용하고(예산/숙소/준비물까지 볼 수 있음), 삭제/변경된 경우에만 기록 작성 시점의
  // 일정 스냅샷으로 대체 표시 — 여행 기록 페이지의 계획 미리보기와 동일한 우선순위를 써서, 같은 계획을
  // 어디서 보든(내 기록 vs 커뮤니티) 항상 같은 내용이 보이게 함
  const getLinkedPlan = (diary: DiaryEntry): (TripPlanPreviewData & { allowClone: boolean; ownerId: string }) | null => {
    if (diary.linkedPlanId) {
      const plans = JSON.parse(localStorage.getItem('travelPlans') || '[]') as TravelPlan[];
      const live = plans.find(p => p.id === diary.linkedPlanId);
      if (live) {
        return {
          title: live.title,
          startDate: live.startDate,
          endDate: live.endDate,
          schedules: live.schedules ?? [],
          budgets: live.budgets ?? [],
          accommodations: live.accommodations ?? [],
          preparationChecks: live.preparationChecks ?? {},
          isSnapshotOnly: false,
          // 원본 계획이 살아있을 때만 복제 가능 여부를 신뢰할 수 있음(작성자가 이후 바꿨을 수 있으므로)
          allowClone: live.allowClone === true,
          ownerId: live.userId,
        };
      }
    }
    if (diary.linkedPlanSchedules) {
      return {
        title: diary.linkedPlanTitle || '',
        startDate: diary.startDate,
        endDate: diary.endDate,
        schedules: diary.linkedPlanSchedules,
        budgets: [],
        accommodations: [],
        preparationChecks: {},
        isSnapshotOnly: true,
        // 원본이 삭제되어 스냅샷만 남은 경우 최신 복제 허용 여부를 알 수 없으므로 항상 복제 불가로 취급
        allowClone: false,
        ownerId: diary.userId,
      };
    }
    return null;
  };

  // 커뮤니티에 공개된 다른 회원의 여행 계획을 복제해 내 "여행 계획" 목록에 추가.
  // 원본이 아직 살아있고(원본 삭제 시 스냅샷만 남아 허용 여부를 신뢰할 수 없음) 작성자가
  // 체크박스로 복제를 허용한 경우에만 호출됨 — 하위 항목들은 Home.tsx의 자체 계획 복제 로직과
  // 동일하게 id를 모두 새로 발급해 원본과 완전히 독립된 사본으로 만든다.
  const handleClonePlanToMyPlans = (diary: DiaryEntry) => {
    if (!user) {
      toast.error(t('session.loginRequired'));
      return;
    }
    if (!diary.linkedPlanId) return;

    let plans: TravelPlan[];
    try {
      plans = JSON.parse(localStorage.getItem('travelPlans') || '[]') as TravelPlan[];
    } catch {
      toast.error(t('community.detail.cloneFailed'));
      return;
    }
    const source = plans.find(p => p.id === diary.linkedPlanId);
    if (!source || source.allowClone !== true) {
      toast.error(t('community.detail.cloneNotAllowed'));
      return;
    }
    if (source.userId === user.id) {
      toast.error(t('community.detail.cloneOwnPlan'));
      return;
    }

    const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const cloned: TravelPlan = {
      ...source,
      id: newId(),
      userId: user.id,
      title: `${source.title}${t('home.planList.copySuffix')}`,
      schedules: (source.schedules ?? []).map(s => ({ ...s, id: newId(), completed: false })),
      budgets: (source.budgets ?? []).map(b => ({ ...b, id: newId() })),
      shoppingList: (source.shoppingList ?? []).map(s => ({ ...s, id: newId(), checked: false })),
      accommodations: (source.accommodations ?? []).map(a => ({ ...a, id: newId() })),
      flights: (source.flights ?? []).map(f => ({ ...f, id: newId() })),
      preparationChecks: {},
      allowClone: false,
    };

    try {
      localStorage.setItem('travelPlans', JSON.stringify([...plans, cloned]));
      toast.success(t('community.detail.clonedToMyPlans'));
    } catch (err) {
      console.error('Failed to clone plan to my plans:', err);
      toast.error(t('community.detail.cloneStorageFull'));
    }
  };

  // 댓글 임시 저장 로드
  const loadCommentDraft = (diaryId: string) => {
    const draft = localStorage.getItem(`commentDraft_${diaryId}`);
    if (draft) {
      try {
        return JSON.parse(draft);
      } catch {
        return '';
      }
    }
    return '';
  };

  const [diaries, setDiaries] = useState<DiaryEntry[]>(loadDiaries);
  const [comments, setComments] = useState<Comment[]>(loadComments);

  useEffect(() => {
    setSavedDiaries(loadSaved());
  }, [user]);

  // 조회수 추적
  const trackView = (diaryId: string) => {
    try {
      const views = JSON.parse(localStorage.getItem('diaryViews') || '{}');
      views[diaryId] = (views[diaryId] || 0) + 1;
      localStorage.setItem('diaryViews', JSON.stringify(views));
    } catch {}
  };

  const handleViewDiary = (diary: DiaryEntry) => {
    setSelectedDiary(diary);
    setActivePhotoIndex(0);
    setShowPlanSchedule(false);
    trackView(diary.id);
  };

  // 홈 인기 여행에서 넘어온 다이어리 자동 열기
  useEffect(() => {
    try {
      const openId = sessionStorage.getItem('trendingOpenDiaryId');
      if (openId) {
        sessionStorage.removeItem('trendingOpenDiaryId');
        const target = loadDiaries().find(d => d.id === openId && d.isPublic);
        if (target) {
          setSelectedDiary(target);
          setActivePhotoIndex(0);
          trackView(target.id);
        }
      }
    } catch {}
  }, []);

  // 헤더 검색에서 넘어온 검색어 자동 적용
  useEffect(() => {
    try {
      const pendingQuery = sessionStorage.getItem('communitySearchQuery');
      if (pendingQuery) {
        sessionStorage.removeItem('communitySearchQuery');
        setSearchQuery(pendingQuery);
      }
    } catch {}
  }, []);

  // 검색어로 여행지 검색 추적 (800ms 디바운스)
  useEffect(() => {
    if (searchQuery.trim().length < 2) return;
    const timer = setTimeout(() => {
      const q = searchQuery.trim().toLowerCase();
      const matchedLocations = new Set(
        publicDiaries
          .filter(d => d.location.toLowerCase().includes(q))
          .map(d => d.location)
      );
      if (matchedLocations.size > 0) {
        try {
          const searches = JSON.parse(localStorage.getItem('locationSearches') || '{}');
          matchedLocations.forEach(loc => {
            searches[loc] = (searches[loc] || 0) + 1;
          });
          localStorage.setItem('locationSearches', JSON.stringify(searches));
        } catch {}
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 댓글 텍스트 변경 시 자동 저장
  useEffect(() => {
    if (selectedDiary && commentText.trim()) {
      localStorage.setItem(`commentDraft_${selectedDiary.id}`, JSON.stringify(commentText));
    }
  }, [commentText, selectedDiary]);

  // 검색어/태그/정렬이 바뀌면 1페이지로 돌아감
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedTag, sortBy]);

  const saveSaved = (ids: string[]) => {
    const all = JSON.parse(localStorage.getItem('savedDiaries') || '{}');
    all[user?.id || ''] = ids;
    localStorage.setItem('savedDiaries', JSON.stringify(all));
    setSavedDiaries(ids);
  };

  const publicDiaries = diaries.filter(d => d.isPublic);

  const diaryComments = (diaryId: string) => comments.filter(c => c.diaryId === diaryId);

  const handleToggleLike = (diaryId: string) => {
    if (!user) { toast.error(t('session.loginRequired')); return; }
    const target = diaries.find(d => d.id === diaryId);
    const wasLiked = target ? target.likes.includes(user.id) : false;
    const prevLikeCount = target ? target.likes.length : 0;
    const updated = diaries.map(d => {
      if (d.id !== diaryId) return d;
      const likes = d.likes.includes(user.id)
        ? d.likes.filter(id => id !== user.id)
        : [...d.likes, user.id];
      return { ...d, likes };
    });
    try {
      localStorage.setItem('travelDiaries', JSON.stringify(updated));
    } catch {
      toast.error(t('community.admin.errors.storageFull'));
      return;
    }
    setDiaries(updated);
    if (selectedDiary?.id === diaryId) {
      const found = updated.find(d => d.id === diaryId);
      if (found) setSelectedDiary(found);
    }
    if (target && !wasLiked) {
      const newTarget = updated.find(d => d.id === diaryId);
      if (user.id !== target.userId) {
        notify({ recipientId: target.userId, type: 'like', actorName: user.name, diaryId: target.id, diaryTitle: target.title });
      }
      if (newTarget && prevLikeCount < 5 && newTarget.likes.length >= 5) {
        notify({ recipientId: target.userId, type: 'popular', diaryId: target.id, diaryTitle: target.title });
      }
    }
  };

  const handleToggleSave = (diaryId: string) => {
    if (!user) { toast.error(t('session.loginRequired')); return; }
    const newSaved = savedDiaries.includes(diaryId)
      ? savedDiaries.filter(id => id !== diaryId)
      : [...savedDiaries, diaryId];
    saveSaved(newSaved);
    toast.success(savedDiaries.includes(diaryId) ? t('community.actions.unsaveToast') : t('community.actions.saveToast'));
  };

  const handleAddComment = (diaryId: string) => {
    if (!user) { toast.error(t('session.loginRequired')); return; }
    if (!commentText.trim()) return;
    const comment: Comment = {
      id: Date.now().toString(),
      diaryId,
      userId: user.id,
      userName: user.name,
      content: commentText.trim(),
      createdAt: new Date().toISOString(),
      likes: [],
    };
    const updated = [...comments, comment];
    localStorage.setItem('diaryComments', JSON.stringify(updated));
    setComments(updated);
    setCommentText('');
    localStorage.removeItem(`commentDraft_${diaryId}`);
    toast.success(t('community.comments.addSuccess'));
    const target = diaries.find(d => d.id === diaryId);
    if (target && user.id !== target.userId) {
      notify({ recipientId: target.userId, type: 'comment', actorName: user.name, diaryId: target.id, diaryTitle: target.title });
    }
  };

  const handleDeleteComment = (commentId: string) => {
    const updated = comments.filter(c => c.id !== commentId);
    localStorage.setItem('diaryComments', JSON.stringify(updated));
    setComments(updated);
    toast.success(t('community.comments.deleteSuccess'));
  };

  const handleEditComment = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.content);
  };

  const handleSaveEditComment = (commentId: string) => {
    if (!editingCommentText.trim()) return;
    const updated = comments.map(c =>
      c.id === commentId ? { ...c, content: editingCommentText.trim(), updatedAt: new Date().toISOString() } : c
    );
    localStorage.setItem('diaryComments', JSON.stringify(updated));
    setComments(updated);
    setEditingCommentId(null);
    setEditingCommentText('');
    toast.success(t('community.comments.editSuccess'));
  };

  const handleCancelEditComment = () => {
    setEditingCommentId(null);
    setEditingCommentText('');
  };

  // ── 관리자 게시글 삭제 (커뮤니티 공개만 해제, 작성자의 여행 기록 자체는 보존)
  const handleDeleteDiary = (diaryId: string) => {
    const updated = diaries.map(d => d.id === diaryId ? { ...d, isPublic: false } : d);
    try {
      localStorage.setItem('travelDiaries', JSON.stringify(updated));
    } catch {
      toast.error(t('community.admin.errors.storageFull'));
      return;
    }
    setDiaries(updated);
    if (selectedDiary?.id === diaryId) setSelectedDiary(null);
    setDeleteDiaryId(null);
    toast.success(t('community.admin.deleteSuccess'));
  };

  // ── 관리자 게시글 수정 열기
  const openEditDiary = (diary: DiaryEntry) => {
    setEditingDiary(diary);
    setEditDiaryTitle(diary.title);
    setEditDiaryContent(diary.content);
    setEditDiaryLocation(diary.location);
  };

  // ── 관리자 게시글 수정 저장
  const handleSaveEditDiary = () => {
    if (!editingDiary || !editDiaryTitle.trim() || !editDiaryContent.trim()) {
      toast.error(t('community.admin.saveError')); return;
    }
    const updated = diaries.map(d =>
      d.id === editingDiary.id
        ? { ...d, title: editDiaryTitle.trim(), content: editDiaryContent.trim(), location: editDiaryLocation.trim() || d.location, updatedAt: new Date().toISOString() }
        : d
    );
    try {
      localStorage.setItem('travelDiaries', JSON.stringify(updated));
    } catch {
      toast.error(t('community.admin.errors.storageFull'));
      return;
    }
    setDiaries(updated);
    if (selectedDiary?.id === editingDiary.id) {
      setSelectedDiary(updated.find(d => d.id === editingDiary.id) || null);
    }
    setEditingDiary(null);
    toast.success(t('community.admin.editSuccess'));
  };

  const handleLikeComment = (commentId: string) => {
    if (!user) { toast.error(t('session.loginRequired')); return; }
    const updated = comments.map(c => {
      if (c.id !== commentId) return c;
      const likes = c.likes.includes(user.id)
        ? c.likes.filter(id => id !== user.id)
        : [...c.likes, user.id];
      return { ...c, likes };
    });
    localStorage.setItem('diaryComments', JSON.stringify(updated));
    setComments(updated);
  };

  const getUserName = (userId: string): string => {
    if (userId === user?.id) return user?.name || t('community.userName.me');
    const users = getUsers();
    return users.find(u => u.id === userId)?.name || t('community.userName.traveler');
  };

  // Get all tags from public diaries
  const allTags = [...new Set(publicDiaries.flatMap(d => d.tags))].slice(0, 20);

  // Filter and sort
  let filteredDiaries = publicDiaries;

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filteredDiaries = filteredDiaries.filter(d =>
      d.title.toLowerCase().includes(q) ||
      d.location.toLowerCase().includes(q) ||
      d.content.toLowerCase().includes(q) ||
      d.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  if (selectedTag) {
    filteredDiaries = filteredDiaries.filter(d => d.tags.includes(selectedTag));
  }

  if (sortBy === 'popular') {
    const savedByUser: Record<string, string[]> = JSON.parse(localStorage.getItem('savedDiaries') || '{}');
    const saveCounts = new globalThis.Map<string, number>();
    Object.values(savedByUser).forEach(ids => {
      (ids || []).forEach(id => saveCounts.set(id, (saveCounts.get(id) || 0) + 1));
    });
    filteredDiaries = [...filteredDiaries].sort((a, b) => {
      const scoreA = a.likes.length + diaryComments(a.id).length + (saveCounts.get(a.id) || 0);
      const scoreB = b.likes.length + diaryComments(b.id).length + (saveCounts.get(b.id) || 0);
      return scoreB - scoreA || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  } else if (sortBy === 'comments') {
    filteredDiaries = [...filteredDiaries].sort((a, b) =>
      diaryComments(b.id).length - diaryComments(a.id).length
    );
  } else {
    filteredDiaries = [...filteredDiaries].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  // 페이징: 10개 초과 시 페이지 단위로 나눠서 표시
  const totalPages = Math.max(1, Math.ceil(filteredDiaries.length / POSTS_PER_PAGE));
  const currentPageSafe = Math.min(currentPage, totalPages);
  const paginatedDiaries = filteredDiaries.slice(
    (currentPageSafe - 1) * POSTS_PER_PAGE,
    currentPageSafe * POSTS_PER_PAGE
  );

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return t('community.time.justNow');
    if (mins < 60) return t('community.time.minutesAgo', { n: mins });
    if (hours < 24) return t('community.time.hoursAgo', { n: hours });
    if (days < 7) return t('community.time.daysAgo', { n: days });
    return new Date(dateStr).toLocaleDateString(language === 'en' ? 'en-US' : 'ko-KR');
  };

  if (selectedDiary) {
    const diary = diaries.find(d => d.id === selectedDiary.id) || selectedDiary;
    const cmts = diaryComments(diary.id);
    const isLiked = user ? diary.likes.includes(user.id) : false;
    const isSaved = savedDiaries.includes(diary.id);
    const linkedPlan = getLinkedPlan(diary);
    const canClonePlan = !!linkedPlan && !linkedPlan.isSnapshotOnly && linkedPlan.allowClone && linkedPlan.ownerId !== user?.id;

    // 댓글 임시 저장 로드
    if (!commentText && selectedDiary.id) {
      const draft = loadCommentDraft(selectedDiary.id);
      if (draft && !commentText) {
        setCommentText(draft);
      }
    }

    return (
      <div className="min-h-screen bg-background">
        {/* Back */}
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-border">
          <div className="container mx-auto px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => { setSelectedDiary(null); setActivePhotoIndex(0); setShowPlanSchedule(false); }}
              className="text-primary font-semibold text-sm hover:underline flex items-center gap-1 flex-shrink-0"
            >
              <ChevronLeft className="w-4 h-4" /> {t('community.detail.back')}
            </button>
            <span className="text-border flex-shrink-0">›</span>
            <span className="text-foreground font-semibold text-sm truncate min-w-0 flex-1">{diary.title}</span>
          </div>
        </div>

        <div className="container mx-auto px-4 py-6 max-w-3xl">
          {/* Author info */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-[#8B7355] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {getUserName(diary.userId).charAt(0)}
              </div>
              <div>
                <p className="font-bold text-foreground text-sm">{getUserName(diary.userId)}</p>
                <p className="text-xs text-muted-foreground">{timeAgo(diary.createdAt)}</p>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              {user?.isAdmin && (
                <button
                  onClick={() => openEditDiary(diary)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition text-xs font-semibold"
                  title={t('community.admin.editTooltip')}
                >
                  <Shield className="w-3.5 h-3.5" /><Edit2 className="w-3.5 h-3.5" />
                </button>
              )}
              {(user?.isAdmin || diary.userId === user?.id) && (
                <button
                  onClick={() => setDeleteDiaryId(diary.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition text-xs font-semibold"
                  title={user?.isAdmin ? t('community.admin.deleteTooltip') : t('community.admin.deleteTooltipOwn')}
                >
                  {user?.isAdmin && <Shield className="w-3.5 h-3.5" />}<Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => handleToggleSave(diary.id)}
                className={cn(
                  "p-2 rounded-full border transition",
                  isSaved ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                )}
                title={isSaved ? t('community.actions.unsaveTooltip') : t('community.actions.saveTooltip')}
              >
                {isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Title & meta */}
          <h1 className="text-2xl font-black text-foreground mb-3">{diary.title}</h1>
          <div className="flex flex-wrap gap-3 mb-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><MapPin className="w-4 h-4 text-primary" /> {diary.location}</span>
            <span className="flex items-center gap-1"><Calendar className="w-4 h-4 text-primary" /> {diary.startDate}{diary.endDate !== diary.startDate ? ` ~ ${diary.endDate}` : ''}</span>
            <StarRatingDisplay value={diary.rating} size="sm" showLabel />
          </div>

          {/* Tags */}
          {diary.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {diary.tags.map((tag, i) => (
                <button
                  key={i}
                  onClick={() => { setSelectedDiary(null); setShowPlanSchedule(false); setSelectedTag(tag); }}
                  className="bg-secondary text-primary font-semibold px-3 py-1 rounded-full text-sm border border-border hover:bg-primary hover:text-white transition"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {/* Photos */}
          {diary.photos.length > 0 && (
            <div className="mb-6">
              <div className="relative rounded-2xl overflow-hidden mb-2">
                {diary.photos[activePhotoIndex].type === 'video' ? (
                  <video
                    src={diary.photos[activePhotoIndex].url}
                    controls
                    className="w-full aspect-[4/3] sm:aspect-[16/9] bg-slate-900"
                  />
                ) : (
                <img
                  src={diary.photos[activePhotoIndex].url}
                  alt={diary.photos[activePhotoIndex].caption || ''}
                  className="w-full aspect-[4/3] sm:aspect-[16/9] object-contain bg-slate-900"
                />
                )}
                {diary.photos.length > 1 && (
                  <>
                    <button
                      onClick={() => setActivePhotoIndex(i => Math.max(0, i - 1))}
                      className={cn(
                        "absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-2 hover:bg-black/60 transition",
                        activePhotoIndex === 0 && "opacity-30 pointer-events-none"
                      )}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setActivePhotoIndex(i => Math.min(diary.photos.length - 1, i + 1))}
                      className={cn(
                        "absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-2 hover:bg-black/60 transition",
                        activePhotoIndex === diary.photos.length - 1 && "opacity-30 pointer-events-none"
                      )}
                    >
                      <ChevronLeft className="w-5 h-5 rotate-180" />
                    </button>
                    <span className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
                      {activePhotoIndex + 1}/{diary.photos.length}
                    </span>
                  </>
                )}
                {diary.photos[activePhotoIndex].caption && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                    <p className="text-white text-sm">{diary.photos[activePhotoIndex].caption}</p>
                  </div>
                )}
              </div>
              {diary.photos.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {diary.photos.map((photo, i) => (
                    <button
                      key={photo.id}
                      onClick={() => setActivePhotoIndex(i)}
                      className={cn(
                        "flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition",
                        activePhotoIndex === i ? "border-primary" : "border-transparent"
                      )}
                    >
                      {photo.type === 'video' ? (
                        <video src={photo.url} muted className="w-full h-full object-contain bg-black" />
                      ) : (
                        <img src={photo.url} alt="" className="w-full h-full object-contain bg-gray-100" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Content */}
          <Card className="p-6 mb-6 bg-white border-border shadow-sm">
            <div className="text-foreground leading-relaxed whitespace-pre-wrap text-[15px] break-words">
              {diary.content}
            </div>
          </Card>

          {/* Linked plan */}
          {diary.linkedPlanTitle && (
            <div className="mb-6 space-y-2">
              <button
                onClick={() => setShowPlanSchedule(true)}
                className="w-full p-4 bg-secondary rounded-xl border border-border flex items-center gap-3 text-left hover:border-primary transition"
              >
                <Plane className="w-5 h-5 text-primary flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{t('community.detail.linkedPlan')}</p>
                  <p className="font-semibold text-foreground truncate">{diary.linkedPlanTitle}</p>
                </div>
                <span className="text-xs font-semibold text-primary flex-shrink-0">{t('community.detail.viewSchedule')}</span>
              </button>
              {canClonePlan && (
                <Button
                  onClick={() => handleClonePlanToMyPlans(diary)}
                  variant="outline"
                  className="w-full gap-2 border-primary/40 text-primary hover:bg-primary/10"
                >
                  <Copy className="w-4 h-4" /> {t('community.detail.addToMyPlans')}
                </Button>
              )}
            </div>
          )}

          {/* Interactions */}
          <div className="flex items-center gap-4 py-4 border-t border-b border-border mb-6">
            <button
              onClick={() => handleToggleLike(diary.id)}
              className={cn(
                "flex items-center gap-2 font-semibold text-sm transition",
                isLiked ? "text-red-500" : "text-muted-foreground hover:text-red-400"
              )}
            >
              <Heart className={cn("w-5 h-5", isLiked && "fill-red-500")} />
              {diary.likes.length > 0 ? diary.likes.length : ''} {t('community.detail.likes')}
            </button>
            <button
              className="flex items-center gap-2 font-semibold text-sm text-muted-foreground hover:text-primary transition"
            >
              <MessageCircle className="w-5 h-5" />
              {cmts.length > 0 ? cmts.length : ''} {t('community.detail.comments')}
            </button>
          </div>

          {/* Comments section */}
          <div className="space-y-4">
            <h3 className="font-bold text-foreground text-lg flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary" /> {t('community.detail.commentsHeading', { count: cmts.length })}
            </h3>

            <div className="flex gap-2">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-[#8B7355] flex items-center justify-center text-white font-bold text-sm flex-shrink-0 border border-border">
                {user?.name.charAt(0)}
              </div>
              <div className="flex-1 flex gap-2">
                <Textarea
                  placeholder={t('community.detail.commentPlaceholder')}
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  className="min-h-[80px] resize-none text-sm"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddComment(diary.id);
                  }}
                />
                <Button
                  onClick={() => handleAddComment(diary.id)}
                  className="bg-primary text-white self-end h-10 px-4"
                  disabled={!commentText.trim()}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {cmts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {t('community.detail.noComments')}
              </div>
            ) : (
              <div className="space-y-4">
                {cmts
                  .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                  .map(comment => (
                    <div key={comment.id} className="flex gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-secondary to-muted flex items-center justify-center text-foreground font-bold text-sm flex-shrink-0 border border-border">
                        {comment.userName.charAt(0)}
                      </div>
                      <div className="flex-1">
                        {editingCommentId === comment.id ? (
                          <div className="bg-secondary rounded-2xl rounded-tl-none px-4 py-3 space-y-2">
                            <Textarea
                              value={editingCommentText}
                              onChange={e => setEditingCommentText(e.target.value)}
                              className="min-h-[60px] resize-none text-sm"
                            />
                            <div className="flex gap-2 justify-end">
                              <Button
                                onClick={() => handleSaveEditComment(comment.id)}
                                size="sm"
                                className="bg-primary text-white h-7 px-3 text-xs"
                              >
                                <Check className="w-3 h-3 mr-1" /> {t('community.common.save')}
                              </Button>
                              <Button
                                onClick={handleCancelEditComment}
                                size="sm"
                                variant="outline"
                                className="h-7 px-3 text-xs"
                              >
                                <X className="w-3 h-3 mr-1" /> {t('community.common.cancel')}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-secondary rounded-2xl rounded-tl-none px-4 py-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold text-foreground text-sm">{comment.userName}</span>
                              <span className="text-xs text-muted-foreground">{timeAgo(comment.updatedAt || comment.createdAt)}{comment.updatedAt && comment.updatedAt !== comment.createdAt ? ` ${t('community.detail.edited')}` : ''}</span>
                            </div>
                            <p className="text-foreground text-sm leading-relaxed break-words">{comment.content}</p>
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 px-2">
                          <button
                            onClick={() => handleLikeComment(comment.id)}
                            className={cn(
                              "text-xs font-semibold flex items-center gap-1 transition",
                              (user ? comment.likes.includes(user.id) : false) ? "text-red-500" : "text-muted-foreground hover:text-red-400"
                            )}
                          >
                            <Heart className={cn("w-3 h-3", (user ? comment.likes.includes(user.id) : false) && "fill-red-500")} />
                            {comment.likes.length > 0 && comment.likes.length}
                          </button>
                          {(comment.userId === user?.id || user?.isAdmin) && (
                            <>
                              {user?.isAdmin && comment.userId !== user.id && (
                                <span className="text-xs text-amber-600 flex items-center gap-0.5 font-semibold">
                                  <Shield className="w-3 h-3" /> {t('community.admin.badge')}
                                </span>
                              )}
                              <button
                                onClick={() => handleEditComment(comment)}
                                className={cn(
                                  "text-xs transition flex items-center gap-1",
                                  user?.isAdmin && comment.userId !== user.id
                                    ? "text-amber-600 hover:text-amber-800"
                                    : "text-muted-foreground hover:text-primary"
                                )}
                              >
                                <Edit2 className="w-3 h-3" /> {t('community.common.edit')}
                              </button>
                              <button
                                onClick={() => handleDeleteComment(comment.id)}
                                className="text-xs text-muted-foreground hover:text-red-500 transition flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" /> {t('community.common.delete')}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        </div>

        {/* 관리자: 게시글 수정 모달 */}
        <Dialog open={!!editingDiary} onOpenChange={(o) => { if (!o) setEditingDiary(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-700">
                <Shield className="w-5 h-5" /> {t('community.admin.editModalTitle')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">{t('community.admin.fieldTitle')}</label>
                <input
                  value={editDiaryTitle}
                  onChange={e => setEditDiaryTitle(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">{t('community.admin.fieldLocation')}</label>
                <input
                  value={editDiaryLocation}
                  onChange={e => setEditDiaryLocation(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">{t('community.admin.fieldContent')}</label>
                <textarea
                  value={editDiaryContent}
                  onChange={e => setEditDiaryContent(e.target.value)}
                  rows={8}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" onClick={() => setEditingDiary(null)} className="flex-1">
                  <X className="w-4 h-4 mr-1" /> {t('community.common.cancel')}
                </Button>
                <Button onClick={handleSaveEditDiary} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white">
                  <Check className="w-4 h-4 mr-1" /> {t('community.common.save')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 관리자: 게시글 삭제 확인 모달 */}
        <Dialog open={!!deleteDiaryId} onOpenChange={(o) => { if (!o) setDeleteDiaryId(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="w-5 h-5" /> {t('community.admin.deleteModalTitle')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <p className="font-semibold">{t('community.admin.deleteConfirm')}</p>
                <p className="text-xs mt-1 text-red-500">{t('community.admin.deleteWarning')}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setDeleteDiaryId(null)} className="flex-1">
                  {t('community.common.cancel')}
                </Button>
                <Button onClick={() => deleteDiaryId && handleDeleteDiary(deleteDiaryId)} className="flex-1 bg-red-500 hover:bg-red-600 text-white">
                  <Trash2 className="w-4 h-4 mr-1" /> {t('community.common.delete')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 연결된 여행 계획 미리보기 (여행 기록 페이지와 동일한 컴포넌트 — 항상 같은 내용이 보임) */}
        <TripPlanPreviewDialog
          open={showPlanSchedule}
          onOpenChange={setShowPlanSchedule}
          plan={linkedPlan}
          extraAction={canClonePlan ? (
            <Button
              onClick={() => { handleClonePlanToMyPlans(diary); setShowPlanSchedule(false); }}
              variant="outline"
              className="flex-1 gap-2 border-primary/40 text-primary hover:bg-primary/10"
            >
              <Copy className="w-4 h-4" /> {t('community.detail.addToMyPlans')}
            </Button>
          ) : undefined}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-black text-foreground flex items-center gap-3">
            <Globe className="w-8 h-8 text-primary" /> {t('community.header.title')}
          </h2>
          <p className="text-muted-foreground mt-1">{t('community.header.subtitle')}</p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <Card className="relative overflow-hidden p-5 bg-white border-border group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-amber-400 to-orange-400" />
            <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-amber-300/25 blur-2xl group-hover:bg-amber-300/40 transition-colors duration-500" />
            <div className="relative flex flex-col items-center">
              <div className="w-11 h-11 rounded-2xl bg-amber-50 ring-1 ring-amber-200 text-amber-600 flex items-center justify-center mb-3">
                <BookOpen className="w-5 h-5" />
              </div>
              <p className="text-3xl font-black tracking-tight text-foreground">{publicDiaries.length}</p>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-600/80 mt-1.5">{t('community.stats.totalReviews')}</p>
            </div>
          </Card>
          <Card className="relative overflow-hidden p-5 bg-white border-border group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-emerald-400 to-teal-400" />
            <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-emerald-300/25 blur-2xl group-hover:bg-emerald-300/40 transition-colors duration-500" />
            <div className="relative flex flex-col items-center">
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 text-emerald-600 flex items-center justify-center mb-3">
                <MapPin className="w-5 h-5" />
              </div>
              <p className="text-3xl font-black tracking-tight text-foreground">
                {[...new Set(publicDiaries.map(d => d.location))].length}
              </p>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-600/80 mt-1.5">{t('community.stats.destinations')}</p>
            </div>
          </Card>
          <Card className="relative overflow-hidden p-5 bg-white border-border group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-sky-400 to-blue-400" />
            <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-sky-300/25 blur-2xl group-hover:bg-sky-300/40 transition-colors duration-500" />
            <div className="relative flex flex-col items-center">
              <div className="w-11 h-11 rounded-2xl bg-sky-50 ring-1 ring-sky-200 text-sky-600 flex items-center justify-center mb-3">
                <Users className="w-5 h-5" />
              </div>
              <p className="text-3xl font-black tracking-tight text-foreground">
                {[...new Set(publicDiaries.map(d => d.userId))].length}
              </p>
              <p className="text-xs font-bold uppercase tracking-wider text-sky-600/80 mt-1.5">{t('community.stats.travelers')}</p>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t('community.search.placeholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10 h-11"
              />
            </div>

            {/* Sort */}
            <Card className="p-4 bg-white border-border">
              <h4 className="font-bold text-foreground text-sm mb-3 flex items-center gap-2">
                <SortAsc className="w-4 h-4 text-primary" /> {t('community.sort.title')}
              </h4>
              <div className="space-y-1.5">
                {([
                  { value: 'latest', label: t('community.sort.latest'), icon: Clock, bg: 'bg-sky-50', text: 'text-sky-700', iconBg: 'bg-sky-500', ring: 'ring-1 ring-sky-200' },
                  { value: 'popular', label: t('community.sort.popular'), icon: TrendingUp, bg: 'bg-rose-50', text: 'text-rose-700', iconBg: 'bg-rose-500', ring: 'ring-1 ring-rose-200' },
                  { value: 'comments', label: t('community.sort.comments'), icon: MessageCircle, bg: 'bg-violet-50', text: 'text-violet-700', iconBg: 'bg-violet-500', ring: 'ring-1 ring-violet-200' },
                ] as const).map(({ value, label, icon: Icon, bg, text, iconBg, ring }) => (
                  <button
                    key={value}
                    onClick={() => setSortBy(value)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-semibold transition-all duration-200",
                      sortBy === value
                        ? `${bg} ${text} ${ring}`
                        : "text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    <span className={cn(
                      "w-6 h-6 rounded-lg flex items-center justify-center transition-colors duration-200",
                      sortBy === value ? `${iconBg} text-white` : "bg-secondary text-muted-foreground"
                    )}>
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    {label}
                  </button>
                ))}
              </div>
            </Card>

            {/* Tags */}
            {allTags.length > 0 && (
              <Card className="p-4 bg-white border-border">
                <h4 className="font-bold text-foreground text-sm mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-fuchsia-50 ring-1 ring-fuchsia-200 text-fuchsia-600 flex items-center justify-center">
                    <Filter className="w-3.5 h-3.5" />
                  </span>
                  {t('community.tags.title')}
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedTag && (
                    <button
                      onClick={() => setSelectedTag('')}
                      className="px-3 py-1 rounded-full text-xs font-semibold bg-secondary text-muted-foreground border border-border hover:border-primary transition flex items-center gap-1"
                    >
                      {t('community.common.all')} <span className="text-red-400">×</span>
                    </button>
                  )}
                  {allTags.map((tag, i) => {
                    const palette = [
                      'bg-rose-50 text-rose-600 ring-1 ring-rose-200 hover:bg-rose-500 hover:ring-rose-500',
                      'bg-amber-50 text-amber-600 ring-1 ring-amber-200 hover:bg-amber-500 hover:ring-amber-500',
                      'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200 hover:bg-emerald-500 hover:ring-emerald-500',
                      'bg-sky-50 text-sky-600 ring-1 ring-sky-200 hover:bg-sky-500 hover:ring-sky-500',
                      'bg-violet-50 text-violet-600 ring-1 ring-violet-200 hover:bg-violet-500 hover:ring-violet-500',
                      'bg-teal-50 text-teal-600 ring-1 ring-teal-200 hover:bg-teal-500 hover:ring-teal-500',
                    ];
                    const colorClasses = palette[i % palette.length];
                    return (
                      <button
                        key={tag}
                        onClick={() => setSelectedTag(tag === selectedTag ? '' : tag)}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-semibold transition-all duration-200 hover:text-white hover:shadow-sm",
                          selectedTag === tag
                            ? "bg-primary text-white ring-1 ring-primary shadow-sm"
                            : colorClasses
                        )}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Saved */}
            {savedDiaries.length > 0 && (
              <Card className="p-4 bg-white border-border">
                <h4 className="font-bold text-foreground text-sm mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-pink-50 ring-1 ring-pink-200 text-pink-600 flex items-center justify-center">
                    <Bookmark className="w-3.5 h-3.5 fill-pink-500" />
                  </span>
                  {t('community.saved.title', { count: savedDiaries.length })}
                </h4>
                <div className="space-y-1.5">
                  {publicDiaries
                    .filter(d => savedDiaries.includes(d.id))
                    .slice(0, 3)
                    .map(d => {
                      const thumb = d.mainPhoto || d.photos.find(p => p.type !== 'video');
                      return (
                        <button
                          key={d.id}
                          onClick={() => setSelectedDiary(d)}
                          className="w-full text-left p-1.5 rounded-xl hover:bg-pink-50/60 border border-transparent hover:border-pink-100 transition-all duration-200 flex items-center gap-2.5"
                        >
                          {thumb ? (
                            <img src={thumb.url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 ring-1 ring-border" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-pink-50 ring-1 ring-pink-200 flex items-center justify-center flex-shrink-0">
                              <MapPin className="w-4 h-4 text-pink-500" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{d.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{d.location}</p>
                          </div>
                        </button>
                      );
                    })
                  }
                </div>
              </Card>
            )}
          </div>

          {/* Main feed */}
          <div className="lg:col-span-3">
            {filteredDiaries.length === 0 ? (
              <Card className="p-16 flex flex-col items-center justify-center border-dashed border-2 border-border bg-white/50">
                <Globe className="w-16 h-16 text-border mb-4" />
                <h3 className="text-xl font-bold text-foreground mb-2">
                  {publicDiaries.length === 0 ? t('community.empty.noPostsTitle') : t('community.empty.noResultsTitle')}
                </h3>
                <p className="text-muted-foreground text-center">
                  {publicDiaries.length === 0
                    ? t('community.empty.noPostsSubtitle')
                    : t('community.empty.noResultsSubtitle')}
                </p>
              </Card>
            ) : (
              <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {paginatedDiaries.map(diary => {
                  const cmtCount = diaryComments(diary.id).length;
                  const isLiked = user ? diary.likes.includes(user.id) : false;
                  const isSaved = savedDiaries.includes(diary.id);
                  const coverPhoto = diary.mainPhoto || diary.photos.find(p => p.type !== 'video');

                  return (
                    <Card
                      key={diary.id}
                      className="group relative bg-white border-border shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col p-0 gap-0"
                    >
                      {/* Cover photo */}
                      <button
                        className="relative block w-full aspect-[4/3] bg-gradient-to-br from-secondary to-secondary/60 overflow-hidden flex-shrink-0"
                        onClick={() => handleViewDiary(diary)}
                      >
                        {coverPhoto ? (
                          <img
                            src={coverPhoto.url}
                            alt={diary.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                            <Camera className="w-10 h-10" />
                          </div>
                        )}
                        {diary.rating > 0 && (
                          <span className="absolute top-2 left-2 bg-black/50 text-white text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> {diary.rating}
                          </span>
                        )}
                        {diary.photos.length > 1 && (
                          <span className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Camera className="w-3 h-3" /> {diary.photos.length}
                          </span>
                        )}
                      </button>

                      {/* Overlay: save / delete */}
                      <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
                        {(user?.isAdmin || diary.userId === user?.id) && (
                          <button
                            onClick={e => { e.stopPropagation(); setDeleteDiaryId(diary.id); }}
                            className="p-1.5 rounded-full bg-white/90 text-red-400 hover:bg-white hover:text-red-600 shadow-sm transition"
                            title={user?.isAdmin ? t('community.admin.deleteTooltip') : t('community.admin.deleteTooltipOwn')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); handleToggleSave(diary.id); }}
                          className={cn(
                            "p-1.5 rounded-full bg-white/90 shadow-sm transition",
                            isSaved ? "text-primary" : "text-muted-foreground hover:text-primary"
                          )}
                        >
                          {isSaved ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      <div className="p-4 flex flex-col flex-1 min-w-0">
                        {/* Author */}
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-[#8B7355] flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0">
                            {getUserName(diary.userId).charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-foreground truncate">{getUserName(diary.userId)}</p>
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                              <span className="truncate min-w-0">{diary.location}</span>
                              <span className="flex-shrink-0">· {timeAgo(diary.createdAt)}</span>
                            </p>
                          </div>
                        </div>

                        {/* Title */}
                        <button
                          onClick={() => handleViewDiary(diary)}
                          className="text-left w-full mt-2.5"
                        >
                          <h3 className="text-base font-black text-foreground hover:text-primary transition line-clamp-1">
                            {diary.title}
                          </h3>
                        </button>

                        {/* Content preview */}
                        <p className="text-muted-foreground text-xs mt-1 line-clamp-2 leading-relaxed flex-1">
                          {diary.content}
                        </p>

                        {/* Tags */}
                        {diary.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2.5">
                            {diary.tags.slice(0, 2).map((tag, i) => (
                              <button
                                key={i}
                                onClick={() => setSelectedTag(tag)}
                                className="bg-secondary text-primary text-[11px] px-2 py-0.5 rounded-full hover:bg-primary hover:text-white transition truncate max-w-[100px]"
                              >
                                {tag}
                              </button>
                            ))}
                            {diary.tags.length > 2 && (
                              <span className="text-[11px] text-muted-foreground self-center flex-shrink-0">+{diary.tags.length - 2}</span>
                            )}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border">
                          <button
                            onClick={() => handleToggleLike(diary.id)}
                            className={cn(
                              "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold transition hover:bg-red-50",
                              isLiked ? "text-red-500" : "text-muted-foreground"
                            )}
                          >
                            <Heart className={cn("w-3.5 h-3.5", isLiked && "fill-red-500")} />
                            {diary.likes.length > 0 && diary.likes.length}
                          </button>
                          <button
                            onClick={() => handleViewDiary(diary)}
                            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-primary transition"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            {cmtCount > 0 && cmtCount}
                          </button>
                          <button
                            onClick={async () => {
                              if (!(await copyToClipboard(window.location.href))) return;
                              toast.success(t('community.actions.shareToast'));
                              if (user && user.id !== diary.userId) {
                                notify({ recipientId: diary.userId, type: 'share', actorName: user.name, diaryId: diary.id, diaryTitle: diary.title });
                              }
                            }}
                            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-primary transition ml-auto flex-shrink-0"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center flex-wrap gap-1.5 mt-8">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPageSafe === 1}
                    className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={cn(
                        "w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full text-sm font-bold transition",
                        page === currentPageSafe ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPageSafe === totalPages}
                    className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 관리자: 목록에서 게시글 삭제 확인 모달 */}
      <Dialog open={!!deleteDiaryId} onOpenChange={(o) => { if (!o) setDeleteDiaryId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" /> {t('community.admin.deleteModalTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <p className="font-semibold">{t('community.admin.deleteConfirm')}</p>
              <p className="text-xs mt-1 text-red-500">{t('community.admin.deleteWarning')}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDeleteDiaryId(null)} className="flex-1">{t('community.common.cancel')}</Button>
              <Button onClick={() => deleteDiaryId && handleDeleteDiary(deleteDiaryId)} className="flex-1 bg-red-500 hover:bg-red-600 text-white">
                <Trash2 className="w-4 h-4 mr-1" /> {t('community.common.delete')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

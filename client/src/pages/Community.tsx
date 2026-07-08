import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Heart, MessageCircle, Share2, Search, Globe, MapPin,
  Calendar, Camera, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight,
  Send, Trash2, Flag, TrendingUp, Clock, Users, Star,
  Filter, SortAsc, Plane, BookOpen, Edit2, Check, X, Shield
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNotifications } from '@/contexts/NotificationContext';

interface DiaryPhoto {
  id: string;
  url: string;
  caption?: string;
  type?: 'photo' | 'video';
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

const EMOJI_RATINGS = ['😞', '😐', '🙂', '😊', '🤩'];

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
  const POSTS_PER_PAGE = 10;
  const [selectedDiary, setSelectedDiary] = useState<DiaryEntry | null>(null);
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
    return JSON.parse(localStorage.getItem('travelDiaries') || '[]') as DiaryEntry[];
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
    const target = diaries.find(d => d.id === diaryId);
    const wasLiked = target ? target.likes.includes(user!.id) : false;
    const prevLikeCount = target ? target.likes.length : 0;
    const updated = diaries.map(d => {
      if (d.id !== diaryId) return d;
      const likes = d.likes.includes(user!.id)
        ? d.likes.filter(id => id !== user!.id)
        : [...d.likes, user!.id];
      return { ...d, likes };
    });
    localStorage.setItem('travelDiaries', JSON.stringify(updated));
    setDiaries(updated);
    if (selectedDiary?.id === diaryId) {
      const found = updated.find(d => d.id === diaryId);
      if (found) setSelectedDiary(found);
    }
    if (target && !wasLiked) {
      const newTarget = updated.find(d => d.id === diaryId);
      if (user!.id !== target.userId) {
        notify({ recipientId: target.userId, type: 'like', actorName: user!.name, diaryId: target.id, diaryTitle: target.title });
      }
      if (newTarget && prevLikeCount < 5 && newTarget.likes.length >= 5) {
        notify({ recipientId: target.userId, type: 'popular', diaryId: target.id, diaryTitle: target.title });
      }
    }
  };

  const handleToggleSave = (diaryId: string) => {
    const newSaved = savedDiaries.includes(diaryId)
      ? savedDiaries.filter(id => id !== diaryId)
      : [...savedDiaries, diaryId];
    saveSaved(newSaved);
    toast.success(savedDiaries.includes(diaryId) ? t('community.actions.unsaveToast') : t('community.actions.saveToast'));
  };

  const handleAddComment = (diaryId: string) => {
    if (!commentText.trim()) return;
    const comment: Comment = {
      id: Date.now().toString(),
      diaryId,
      userId: user!.id,
      userName: user!.name,
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
    if (target && user!.id !== target.userId) {
      notify({ recipientId: target.userId, type: 'comment', actorName: user!.name, diaryId: target.id, diaryTitle: target.title });
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

  // ── 관리자 게시글 삭제
  const handleDeleteDiary = (diaryId: string) => {
    const updated = diaries.filter(d => d.id !== diaryId);
    localStorage.setItem('travelDiaries', JSON.stringify(updated));
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
    localStorage.setItem('travelDiaries', JSON.stringify(updated));
    setDiaries(updated);
    if (selectedDiary?.id === editingDiary.id) {
      setSelectedDiary(updated.find(d => d.id === editingDiary.id) || null);
    }
    setEditingDiary(null);
    toast.success(t('community.admin.editSuccess'));
  };

  const handleLikeComment = (commentId: string) => {
    const updated = comments.map(c => {
      if (c.id !== commentId) return c;
      const likes = c.likes.includes(user!.id)
        ? c.likes.filter(id => id !== user!.id)
        : [...c.likes, user!.id];
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
    filteredDiaries = [...filteredDiaries].sort((a, b) => b.likes.length - a.likes.length);
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
    const isLiked = diary.likes.includes(user!.id);
    const isSaved = savedDiaries.includes(diary.id);
    
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
              onClick={() => { setSelectedDiary(null); setActivePhotoIndex(0); }}
              className="text-primary font-semibold text-sm hover:underline flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" /> {t('community.detail.back')}
            </button>
            <span className="text-border">›</span>
            <span className="text-foreground font-semibold text-sm truncate">{diary.title}</span>
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
                <>
                  <button
                    onClick={() => openEditDiary(diary)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition text-xs font-semibold"
                    title={t('community.admin.editTooltip')}
                  >
                    <Shield className="w-3.5 h-3.5" /><Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteDiaryId(diary.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition text-xs font-semibold"
                    title={t('community.admin.deleteTooltip')}
                  >
                    <Shield className="w-3.5 h-3.5" /><Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
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
            <span className="text-xl">{EMOJI_RATINGS[diary.rating - 1]}</span>
          </div>

          {/* Tags */}
          {diary.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {diary.tags.map((tag, i) => (
                <button
                  key={i}
                  onClick={() => { setSelectedDiary(null); setSelectedTag(tag); }}
                  className="bg-secondary text-primary font-semibold px-3 py-1 rounded-full text-sm border border-border hover:bg-primary hover:text-white transition"
                >
                  #{tag}
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
            <div className="text-foreground leading-relaxed whitespace-pre-wrap text-[15px]">
              {diary.content}
            </div>
          </Card>

          {/* Linked plan */}
          {diary.linkedPlanTitle && (
            <div className="mb-6 p-4 bg-secondary rounded-xl border border-border flex items-center gap-3">
              <Plane className="w-5 h-5 text-primary flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{t('community.detail.linkedPlan')}</p>
                <p className="font-semibold text-foreground">{diary.linkedPlanTitle}</p>
              </div>
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
                            <p className="text-foreground text-sm leading-relaxed">{comment.content}</p>
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 px-2">
                          <button
                            onClick={() => handleLikeComment(comment.id)}
                            className={cn(
                              "text-xs font-semibold flex items-center gap-1 transition",
                              comment.likes.includes(user!.id) ? "text-red-500" : "text-muted-foreground hover:text-red-400"
                            )}
                          >
                            <Heart className={cn("w-3 h-3", comment.likes.includes(user!.id) && "fill-red-500")} />
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
          <Card className="p-4 bg-white border-border text-center">
            <p className="text-2xl font-black text-primary">{publicDiaries.length}</p>
            <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1"><BookOpen className="w-3 h-3" /> {t('community.stats.totalReviews')}</p>
          </Card>
          <Card className="p-4 bg-white border-border text-center">
            <p className="text-2xl font-black text-primary">
              {[...new Set(publicDiaries.map(d => d.userId))].length}
            </p>
            <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1"><Users className="w-3 h-3" /> {t('community.stats.travelers')}</p>
          </Card>
          <Card className="p-4 bg-white border-border text-center">
            <p className="text-2xl font-black text-primary">
              {[...new Set(publicDiaries.map(d => d.location))].length}
            </p>
            <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1"><MapPin className="w-3 h-3" /> {t('community.stats.destinations')}</p>
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
              <div className="space-y-2">
                {([
                  { value: 'latest', label: t('community.sort.latest'), icon: Clock },
                  { value: 'popular', label: t('community.sort.popular'), icon: TrendingUp },
                  { value: 'comments', label: t('community.sort.comments'), icon: MessageCircle },
                ] as const).map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setSortBy(value)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition",
                      sortBy === value
                        ? "bg-primary text-white"
                        : "text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    <Icon className="w-4 h-4" /> {label}
                  </button>
                ))}
              </div>
            </Card>

            {/* Tags */}
            {allTags.length > 0 && (
              <Card className="p-4 bg-white border-border">
                <h4 className="font-bold text-foreground text-sm mb-3 flex items-center gap-2">
                  <Filter className="w-4 h-4 text-primary" /> {t('community.tags.title')}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {selectedTag && (
                    <button
                      onClick={() => setSelectedTag('')}
                      className="px-3 py-1 rounded-full text-xs font-semibold bg-secondary text-muted-foreground border border-border hover:border-primary transition flex items-center gap-1"
                    >
                      {t('community.common.all')} <span className="text-red-400">×</span>
                    </button>
                  )}
                  {allTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => setSelectedTag(tag === selectedTag ? '' : tag)}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs font-semibold border transition",
                        selectedTag === tag
                          ? "bg-primary text-white border-primary"
                          : "bg-secondary text-muted-foreground border-border hover:border-primary hover:text-primary"
                      )}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              </Card>
            )}

            {/* Saved */}
            {savedDiaries.length > 0 && (
              <Card className="p-4 bg-white border-border">
                <h4 className="font-bold text-foreground text-sm mb-3 flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-primary" /> {t('community.saved.title', { count: savedDiaries.length })}
                </h4>
                <div className="space-y-2">
                  {publicDiaries
                    .filter(d => savedDiaries.includes(d.id))
                    .slice(0, 3)
                    .map(d => (
                      <button
                        key={d.id}
                        onClick={() => setSelectedDiary(d)}
                        className="w-full text-left p-2 rounded-lg hover:bg-secondary transition"
                      >
                        <p className="text-sm font-semibold text-foreground truncate">{d.title}</p>
                        <p className="text-xs text-muted-foreground">{d.location}</p>
                      </button>
                    ))
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
              <div className="space-y-6">
                {paginatedDiaries.map(diary => {
                  const cmtCount = diaryComments(diary.id).length;
                  const isLiked = diary.likes.includes(user!.id);
                  const isSaved = savedDiaries.includes(diary.id);
                  const coverPhoto = diary.mainPhoto || diary.photos.find(p => p.type !== 'video');

                  return (
                    <Card
                      key={diary.id}
                      className="bg-white border-border shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                    >
                      {/* Author */}
                      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-[#8B7355] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                            {getUserName(diary.userId).charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-foreground text-sm">{getUserName(diary.userId)}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {diary.location} · {timeAgo(diary.createdAt)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{EMOJI_RATINGS[diary.rating - 1]}</span>
                          {user?.isAdmin && (
                            <button
                              onClick={e => { e.stopPropagation(); setDeleteDiaryId(diary.id); }}
                              className="p-1.5 rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition"
                              title={t('community.admin.deleteTooltip')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); handleToggleSave(diary.id); }}
                            className={cn(
                              "p-1.5 rounded-full transition",
                              isSaved ? "text-primary" : "text-muted-foreground hover:text-primary"
                            )}
                          >
                            {isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Cover photo */}
                      {coverPhoto && (
                        <button
                          className="w-full block"
                          onClick={() => handleViewDiary(diary)}
                        >
                          <div className="relative">
                            <img
                              src={coverPhoto.url}
                              alt={diary.title}
                              className="w-full h-64 object-cover bg-gray-100 hover:opacity-95 transition"
                            />
                            {diary.photos.length > 1 && (
                              <span className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Camera className="w-3 h-3" /> {diary.photos.length}
                              </span>
                            )}
                          </div>
                        </button>
                      )}

                      <div className="px-5 pb-5">
                        {/* Title */}
                        <button
                          onClick={() => handleViewDiary(diary)}
                          className="text-left w-full mt-3"
                        >
                          <h3 className="text-lg font-black text-foreground hover:text-primary transition line-clamp-1">
                            {diary.title}
                          </h3>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {diary.startDate}{diary.endDate !== diary.startDate ? ` ~ ${diary.endDate}` : ''}
                          </div>
                        </button>

                        {/* Content preview */}
                        <p className="text-muted-foreground text-sm mt-2 line-clamp-2 leading-relaxed">
                          {diary.content}
                        </p>

                        {/* Tags */}
                        {diary.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {diary.tags.slice(0, 4).map((tag, i) => (
                              <button
                                key={i}
                                onClick={() => setSelectedTag(tag)}
                                className="bg-secondary text-primary text-xs px-2.5 py-0.5 rounded-full hover:bg-primary hover:text-white transition"
                              >
                                #{tag}
                              </button>
                            ))}
                            {diary.tags.length > 4 && (
                              <span className="text-xs text-muted-foreground self-center">+{diary.tags.length - 4}</span>
                            )}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-1 mt-4 pt-3 border-t border-border">
                          <button
                            onClick={() => handleToggleLike(diary.id)}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition hover:bg-red-50",
                              isLiked ? "text-red-500" : "text-muted-foreground"
                            )}
                          >
                            <Heart className={cn("w-4 h-4", isLiked && "fill-red-500")} />
                            {diary.likes.length > 0 && diary.likes.length}
                          </button>
                          <button
                            onClick={() => handleViewDiary(diary)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-primary transition"
                          >
                            <MessageCircle className="w-4 h-4" />
                            {cmtCount > 0 && cmtCount}
                          </button>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(window.location.href);
                              toast.success(t('community.actions.shareToast'));
                              if (user!.id !== diary.userId) {
                                notify({ recipientId: diary.userId, type: 'share', actorName: user!.name, diaryId: diary.id, diaryTitle: diary.title });
                              }
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-primary transition ml-auto"
                          >
                            <Share2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleViewDiary(diary)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold text-primary bg-primary/10 hover:bg-primary hover:text-white transition"
                          >
                            {t('community.card.viewDetail')}
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

import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Plus, Trash2, Edit2, Check, X, Image as ImageIcon,
  BookOpen, Camera, MapPin, Star, Calendar, ChevronLeft,
  Heart, Share2, Globe, Lock, ChevronRight, Plane, Clock, Loader2, Download
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, copyToClipboard } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { StarRatingInput, StarRatingDisplay } from '@/components/StarRating';
import { LocationPickerDialog } from '@/components/LocationPickerDialog';
import { TripPlanPreviewDialog, type TripPlanPreviewData } from '@/components/TripPlanPreviewDialog';
import { MapView, type MapMarker, reverseGeocodeToAddress } from '@/components/Map';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { diariesApi } from '@/lib/api/diaries';
import { albumsApi } from '@/lib/api/albums';
import { plansApi } from '@/lib/api/plans';
import { uploadDataUrl } from '@/lib/api/media';
import { communityApi } from '@/lib/api/community';

// 해외 지도(MapLibre GL)는 용량이 커서, 실제로 해외 계획과 연결된 앨범을 볼 때만 불러오도록 지연 로딩
const OverseasMapView = lazy(() =>
  import('@/components/OverseasMap').then(m => ({ default: m.OverseasMapView }))
);

interface DiaryPhoto {
  id: string;
  url: string;
  caption?: string;
  type?: 'photo' | 'video';
}

interface DiaryBlock {
  id: string;
  type: 'text' | 'image' | 'video';
  content: string;
  caption?: string;
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

interface DiaryEntry {
  id: string;
  userId: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  content: string;
  blocks?: DiaryBlock[];
  rating: number;
  mainPhoto?: DiaryPhoto;
  photos: DiaryPhoto[];
  displayMode?: 'grid' | 'slide' | 'blog';
  tags: string[];
  isPublic: boolean;
  linkedPlanId?: string;
  linkedPlanTitle?: string;
  linkedPlanSchedules?: ScheduleItem[];
  createdAt: string;
  updatedAt: string;
  likesCount: number;
  isLikedByMe?: boolean;
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

interface TravelPlan {
  id: string;
  userId: string;
  title: string;
  startDate: string;
  endDate: string;
  region?: 'domestic' | 'overseas';
  schedules: ScheduleItem[];
  budgets: any[];
  shoppingList: any[];
  accommodations?: PlanAccommodation[];
  preparationChecks?: Record<string, boolean>;
  /** 작성자가 이 계획을 커뮤니티에서 다른 회원이 복제해갈 수 있도록 허용했는지 여부 */
  allowClone?: boolean;
}

interface AlbumPhoto {
  id: string;
  url: string;
  caption?: string;
  type?: 'photo' | 'video';
  lat?: number;
  lng?: number;
  address?: string;
}

interface Album {
  id: string;
  userId: string;
  title: string;
  photos: AlbumPhoto[];
  linkedPlanId?: string;
  linkedPlanTitle?: string;
  linkedPlanSchedules?: ScheduleItem[];
  /** 연결된 계획이 국내/해외 중 어느 쪽이었는지 스냅샷 — 앨범 지도보기에서 어떤 지도를 쓸지 결정 */
  linkedPlanRegion?: 'domestic' | 'overseas';
  createdAt: string;
  updatedAt: string;
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
    likesCount: d.likesCount ?? 0,
  };
}

function normalizeAlbum(a: Album): Album {
  return {
    ...a,
    title: a.title ?? '',
    photos: a.photos ?? [],
  };
}

// 여행 기록/앨범 어느 쪽에서든 계획 미리보기 다이얼로그를 열 수 있도록 하는 공통 스냅샷 형태
interface PlanPreviewSnapshot {
  userId: string;
  title: string;
  startDate: string;
  endDate: string;
  linkedPlanId?: string;
  linkedPlanTitle?: string;
  linkedPlanSchedules?: ScheduleItem[];
}

export default function TravelDiary() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const editBlockFileInputRef = useRef<HTMLInputElement>(null);
  const blockFileInputRef = useRef<HTMLInputElement>(null);
  const mainFileInputRef = useRef<HTMLInputElement>(null);
  const mainEditFileInputRef = useRef<HTMLInputElement>(null);

  // 상태 복구 함수
  const loadDraftForm = () => {
    const draft = localStorage.getItem('diaryFormDraft');
    if (draft) {
      try {
        return JSON.parse(draft);
      } catch {
        return null;
      }
    }
    return null;
  };

  const draft = loadDraftForm();

  const [diaries, setDiaries] = useState<DiaryEntry[]>([]);
  const [userPlans, setUserPlans] = useState<TravelPlan[]>([]);
  const [currentDiary, setCurrentDiary] = useState<DiaryEntry | null>(null);
  const [slidePhotoIndex, setSlidePhotoIndex] = useState(0);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [currentAlbum, setCurrentAlbum] = useState<Album | null>(null);
  const [isDiariesLoading, setIsDiariesLoading] = useState(false);
  const [isAlbumsLoading, setIsAlbumsLoading] = useState(false);

  // 여행 기록/앨범/연결 가능한 계획을 서버(D1)에서 로드
  useEffect(() => {
    if (!user) { setDiaries([]); setAlbums([]); setUserPlans([]); return; }
    let cancelled = false;
    setIsDiariesLoading(true);
    setIsAlbumsLoading(true);
    diariesApi.list().then(list => {
      if (cancelled) return;
      const normalized = list.map(normalizeDiary);
      setDiaries(normalized);
      const savedId = localStorage.getItem('currentDiaryId');
      if (savedId) setCurrentDiary(normalized.find(d => d.id === savedId) || null);
    }).catch(() => toast.error(t('diary.errors.storageFull')))
      .finally(() => { if (!cancelled) setIsDiariesLoading(false); });
    albumsApi.list().then(list => {
      if (cancelled) return;
      const normalized = list.map(normalizeAlbum);
      setAlbums(normalized);
      const savedId = localStorage.getItem('currentAlbumId');
      if (savedId) setCurrentAlbum(normalized.find(a => a.id === savedId) || null);
    }).catch(() => toast.error(t('diary.errors.storageFull')))
      .finally(() => { if (!cancelled) setIsAlbumsLoading(false); });
    plansApi.list().then(list => {
      if (cancelled) return;
      setUserPlans(list.map(p => ({
        ...p,
        schedules: p.schedules ?? [],
        budgets: p.budgets ?? [],
        shoppingList: p.shoppingList ?? [],
        accommodations: p.accommodations ?? [],
        preparationChecks: p.preparationChecks ?? {},
      })));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  // 연결된 여행 계획의 "다른 회원 복제 허용" 여부를 토글 — 다이어리별 설정이 아니라 계획 자체의
  // 속성이므로 서버에 바로 반영하고, 드롭다운이 참조하는 userPlans 캐시도 함께 갱신해
  // 체크 상태가 화면에 즉시 반영되도록 함
  const handleToggleLinkedPlanAllowClone = (planId: string, allowClone: boolean) => {
    setUserPlans(prev => prev.map(p => p.id === planId ? { ...p, allowClone } : p));
    plansApi.setAllowClone(planId, allowClone).catch(() => toast.error(t('diary.errors.storageFull')));
  };
  const [activeTab, setActiveTab] = useState<'records' | 'albums'>(() =>
    new URLSearchParams(window.location.search).get('tab') === 'albums' ? 'albums' : 'records'
  );
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [diaryPage, setDiaryPage] = useState(1);
  const [albumPage, setAlbumPage] = useState(1);

  // New diary form state
  const [newTitle, setNewTitle] = useState(draft?.title || '');
  const [newLocation, setNewLocation] = useState(draft?.location || '');
  const [newStartDate, setNewStartDate] = useState(draft?.startDate || '');
  const [newEndDate, setNewEndDate] = useState(draft?.endDate || '');
  const [newContent, setNewContent] = useState(draft?.content || '');
  const [newRating, setNewRating] = useState(draft?.rating || 5);
  const [newMainPhoto, setNewMainPhoto] = useState<DiaryPhoto | undefined>(draft?.mainPhoto);
  const [newPhotos, setNewPhotos] = useState<DiaryPhoto[]>(draft?.photos || []);
  const [newTags, setNewTags] = useState(draft?.tags || '');
  const [newIsPublic, setNewIsPublic] = useState(draft?.isPublic !== false);
  const [newDisplayMode, setNewDisplayMode] = useState<'grid' | 'slide' | 'blog'>(draft?.displayMode || 'grid');
  const [newBlocks, setNewBlocks] = useState<DiaryBlock[]>(draft?.blocks || [{ id: '1', type: 'text', content: '' }]);
  const [newLinkedPlanId, setNewLinkedPlanId] = useState(draft?.linkedPlanId || '');
  const [activePhotoCaption, setActivePhotoCaption] = useState<string | null>(null);

  // New album form state
  const [showNewAlbumDialog, setShowNewAlbumDialog] = useState(false);
  const [newAlbumTitle, setNewAlbumTitle] = useState('');
  const [newAlbumPhotos, setNewAlbumPhotos] = useState<AlbumPhoto[]>([]);
  const [newAlbumLinkedPlanId, setNewAlbumLinkedPlanId] = useState('');

  // Album edit state
  const [isEditingAlbum, setIsEditingAlbum] = useState(false);
  const [editAlbumData, setEditAlbumData] = useState<Album | null>(null);

  // Album detail view mode
  const [albumViewMode, setAlbumViewMode] = useState<'grid' | 'map'>('grid');
  // 주소가 저장되지 않은 사진의 좌표를 역변환해 임시로 보관 (photo id -> address)
  const [resolvedPhotoAddresses, setResolvedPhotoAddresses] = useState<Record<string, string>>({});

  // 사진 위치 지정 다이얼로그 (새 앨범 / 앨범 수정 공용)
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [locationPickerPhotoId, setLocationPickerPhotoId] = useState<string | null>(null);
  const [locationPickerContext, setLocationPickerContext] = useState<'new' | 'edit' | null>(null);

  const albumFileInputRef = useRef<HTMLInputElement>(null);
  const editAlbumFileInputRef = useRef<HTMLInputElement>(null);
  const albumMapRef = useRef<naver.maps.Map | null>(null);
  const albumOverseasMapRef = useRef<MapLibreMap | null>(null);
  const requestedPhotoAddressesRef = useRef<Set<string>>(new Set());

  // Edit state
  const [editData, setEditData] = useState<DiaryEntry | null>(null);
  const [editPhotoCaption, setEditPhotoCaption] = useState<string | null>(null);
  const [editTagInput, setEditTagInput] = useState('');
  const [showPlanPreview, setShowPlanPreview] = useState(false);
  const [previewPlanId, setPreviewPlanId] = useState<string | null>(null);
  const [previewSnapshot, setPreviewSnapshot] = useState<PlanPreviewSnapshot | null>(null);

  const openPlanPreview = (planId: string | undefined, snapshot?: PlanPreviewSnapshot) => {
    setPreviewPlanId(planId || null);
    setPreviewSnapshot(snapshot || null);
    setShowPlanPreview(true);
  };

  // 연결된 계획이 삭제/변경됐어도 기록 작성 시점에 첨부된 일정 스냅샷으로 대체 표시.
  // 라이브 계획을 우선하는 이유: 스냅샷은 일정만 담고 있어 예산/숙소/준비물을 보여줄 수 없기 때문
  // (커뮤니티의 계획 미리보기도 동일한 우선순위를 쓰도록 맞춰, 같은 계획을 어디서 봐도 같은 내용이 보이게 함)
  const getPreviewPlanData = (): TripPlanPreviewData | null => {
    const live = userPlans.find(p => p.id === previewPlanId);
    if (live) {
      return {
        title: live.title,
        startDate: live.startDate,
        endDate: live.endDate,
        schedules: live.schedules,
        budgets: live.budgets,
        accommodations: live.accommodations ?? [],
        preparationChecks: live.preparationChecks ?? {},
        isSnapshotOnly: false,
      };
    }
    if (previewSnapshot?.linkedPlanSchedules) {
      return {
        title: previewSnapshot.linkedPlanTitle || previewSnapshot.title,
        startDate: previewSnapshot.startDate,
        endDate: previewSnapshot.endDate,
        schedules: previewSnapshot.linkedPlanSchedules,
        budgets: [],
        accommodations: [],
        preparationChecks: {},
        isSnapshotOnly: true,
      };
    }
    return null;
  };

  // 목록/상세/수정 화면 어디서든 열 수 있도록 공통으로 재사용하는 계획 미리보기 다이얼로그
  // (커뮤니티 페이지와 동일한 컴포넌트를 써서 두 곳에서 항상 같은 내용이 보이도록 함)
  const planPreviewDialog = (
    <TripPlanPreviewDialog
      open={showPlanPreview}
      onOpenChange={setShowPlanPreview}
      plan={getPreviewPlanData()}
    />
  );

  const myDiaries = diaries.filter(d => d.userId === user?.id);
  const myAlbums = albums.filter(a => a.userId === user?.id);

  const CARDS_PER_PAGE = 12;
  const sortedMyDiaries = [...myDiaries].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const totalDiaryPages = Math.max(1, Math.ceil(sortedMyDiaries.length / CARDS_PER_PAGE));
  const diaryPageSafe = Math.min(diaryPage, totalDiaryPages);
  const paginatedMyDiaries = sortedMyDiaries.slice((diaryPageSafe - 1) * CARDS_PER_PAGE, diaryPageSafe * CARDS_PER_PAGE);

  const sortedMyAlbums = [...myAlbums].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const totalAlbumPages = Math.max(1, Math.ceil(sortedMyAlbums.length / CARDS_PER_PAGE));
  const albumPageSafe = Math.min(albumPage, totalAlbumPages);
  const paginatedMyAlbums = sortedMyAlbums.slice((albumPageSafe - 1) * CARDS_PER_PAGE, albumPageSafe * CARDS_PER_PAGE);

  // 슬라이드형 사진 인덱스 - 다른 기록을 열면 처음 사진으로 초기화
  useEffect(() => {
    setSlidePhotoIndex(0);
  }, [currentDiary?.id]);

  // 폼 변경 시 자동 저장
  useEffect(() => {
    if (showNewDialog) {
      const draft = {
        title: newTitle,
        location: newLocation,
        startDate: newStartDate,
        endDate: newEndDate,
        content: newContent,
        blocks: newBlocks,
        rating: newRating,
        mainPhoto: newMainPhoto,
        photos: newPhotos,
        tags: newTags,
        isPublic: newIsPublic,
        displayMode: newDisplayMode,
        linkedPlanId: newLinkedPlanId,
      };
      try {
        localStorage.setItem('diaryFormDraft', JSON.stringify(draft));
      } catch {
        // 저장 공간이 부족해 임시 저장에 실패해도 작성 중인 폼은 그대로 유지되므로 조용히 무시
      }
    }
  }, [newTitle, newLocation, newStartDate, newEndDate, newContent, newBlocks, newRating, newMainPhoto, newPhotos, newTags, newIsPublic, newLinkedPlanId, showNewDialog]);

  // 현재 다이어리 저장
  useEffect(() => {
    if (currentDiary) {
      localStorage.setItem('currentDiaryId', currentDiary.id);
    } else {
      localStorage.removeItem('currentDiaryId');
    }
  }, [currentDiary]);

  // 현재 앨범 저장
  useEffect(() => {
    if (currentAlbum) {
      localStorage.setItem('currentAlbumId', currentAlbum.id);
    } else {
      localStorage.removeItem('currentAlbumId');
    }
  }, [currentAlbum]);

  // 앨범 상세를 새로 열 때마다 사진 보기로 초기화
  useEffect(() => {
    setAlbumViewMode('grid');
    setResolvedPhotoAddresses({});
    requestedPhotoAddressesRef.current.clear();
  }, [currentAlbum?.id]);

  // 지도 보기에서 주소가 비어있는 사진은 좌표를 역변환해 채워넣음
  useEffect(() => {
    if (albumViewMode !== 'map' || !currentAlbum) return;
    const album = albums.find(a => a.id === currentAlbum.id) || currentAlbum;
    const missing = album.photos.filter(
      p => p.lat !== undefined && p.lng !== undefined && !p.address && !requestedPhotoAddressesRef.current.has(p.id)
    );
    if (missing.length === 0) return;
    let cancelled = false;
    missing.forEach(p => {
      requestedPhotoAddressesRef.current.add(p.id);
      reverseGeocodeToAddress(p.lat as number, p.lng as number).then(addr => {
        if (cancelled || !addr) return;
        setResolvedPhotoAddresses(prev => ({ ...prev, [p.id]: addr }));
      });
    });
    return () => { cancelled = true; };
  }, [albumViewMode, currentAlbum, albums]);

  // 서버(D1)에 반영: 이전 상태와 diff해서 생성/수정/삭제 API 호출로 변환한다.
  // 호출부가 "새 전체 배열"을 넘기는 기존 패턴을 그대로 유지하기 위한 어댑터.
  const saveDiaries = (updated: DiaryEntry[]) => {
    const prevDiaries = diaries;
    const nextIds = updated.map(d => d.id);
    setDiaries(updated);
    (async () => {
      try {
        for (const diary of updated) {
          const before = prevDiaries.find(d => d.id === diary.id);
          if (!before) await diariesApi.create(diary);
          else if (JSON.stringify(before) !== JSON.stringify(diary)) await diariesApi.update(diary.id, diary);
        }
        for (const before of prevDiaries) {
          if (!nextIds.includes(before.id)) await diariesApi.remove(before.id);
        }
      } catch {
        toast.error(t('diary.errors.storageFull'));
      }
    })();
  };

  const saveAlbums = (updated: Album[]) => {
    const prevAlbums = albums;
    const nextIds = updated.map(a => a.id);
    setAlbums(updated);
    (async () => {
      try {
        for (const album of updated) {
          const before = prevAlbums.find(a => a.id === album.id);
          if (!before) await albumsApi.create(album);
          else if (JSON.stringify(before) !== JSON.stringify(album)) await albumsApi.update(album.id, album);
        }
        for (const before of prevAlbums) {
          if (!nextIds.includes(before.id)) await albumsApi.remove(before.id);
        }
      } catch {
        toast.error(t('diary.errors.storageFull'));
      }
    })();
  };

  const MAX_VIDEO_MB = 15;
  const ALBUM_MAX_PHOTOS = 50;

  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target?.result as string);
      reader.readAsDataURL(file);
    });
  };

  const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); // 압축률 0.7
      };
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean = false) => {
    const files = Array.from(e.target.files || []);
    const currentPhotosCount = isEdit ? (editData?.photos.length || 0) : newPhotos.length;

    if (currentPhotosCount + files.length > 15) {
      toast.error(t('diary.errors.maxUploads'));
      return;
    }

    const toastId = toast.loading(t('diary.toast.processingMedia'));
    let skipped = 0;

    try {
      for (const file of files) {
        const isVideo = file.type.startsWith('video/');
        if (isVideo && file.size > MAX_VIDEO_MB * 1024 * 1024) {
          skipped++;
          continue;
        }

        const base64 = await readFileAsDataURL(file);
        const compressed = isVideo ? base64 : await compressImage(base64);
        const uploaded = await uploadDataUrl('diary-photo', compressed);
        const finalUrl = uploaded.url;
        const photo: DiaryPhoto = {
          id: Date.now().toString() + Math.random(),
          url: finalUrl,
          caption: '',
          type: isVideo ? 'video' : 'photo',
        };

        if (isEdit && editData) {
          const currentPhotos = editData.photos || [];
          const currentBlocks = editData.blocks || (editData.content ? [{ id: '1', type: 'text', content: editData.content }] : []);

          if (editData.displayMode === 'blog') {
            const newBlock: DiaryBlock = { id: Date.now().toString() + Math.random(), type: isVideo ? 'video' : 'image', content: finalUrl };
            setEditData(prev => prev ? {
              ...prev,
              blocks: [...currentBlocks, newBlock],
              photos: [...currentPhotos, photo]
            } : null);
          } else {
            setEditData(prev => prev ? {
              ...prev,
              photos: [...currentPhotos, photo]
            } : null);
          }
        } else {
          setNewPhotos(prev => [...prev, photo]);
        }
      }
      if (skipped > 0) {
        toast.error(t('diary.errors.videoTooLargeSkipped', { maxMb: MAX_VIDEO_MB, skipped }), { id: toastId });
      } else {
        toast.success(t('diary.toast.added'), { id: toastId });
      }
    } catch (error) {
      toast.error(t('diary.errors.uploadError'), { id: toastId });
    }
    e.target.value = '';
  };

  const handleAlbumPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean = false) => {
    const files = Array.from(e.target.files || []);
    const currentPhotosCount = isEdit ? (editAlbumData?.photos.length || 0) : newAlbumPhotos.length;

    if (currentPhotosCount + files.length > ALBUM_MAX_PHOTOS) {
      toast.error(t('diary.album.errors.maxUploads'));
      return;
    }

    const toastId = toast.loading(t('diary.toast.processingMedia'));
    let skipped = 0;

    try {
      for (const file of files) {
        const isVideo = file.type.startsWith('video/');
        if (isVideo && file.size > MAX_VIDEO_MB * 1024 * 1024) {
          skipped++;
          continue;
        }

        const base64 = await readFileAsDataURL(file);
        const compressed = isVideo ? base64 : await compressImage(base64);
        const uploaded = await uploadDataUrl('album-photo', compressed);
        const finalUrl = uploaded.url;
        const photo: AlbumPhoto = {
          id: Date.now().toString() + Math.random(),
          url: finalUrl,
          caption: '',
          type: isVideo ? 'video' : 'photo',
        };

        if (isEdit) {
          setEditAlbumData(prev => prev ? { ...prev, photos: [...prev.photos, photo] } : null);
        } else {
          setNewAlbumPhotos(prev => [...prev, photo]);
        }
      }
      if (skipped > 0) {
        toast.error(t('diary.errors.videoTooLargeSkipped', { maxMb: MAX_VIDEO_MB, skipped }), { id: toastId });
      } else {
        toast.success(t('diary.toast.added'), { id: toastId });
      }
    } catch (error) {
      toast.error(t('diary.errors.uploadError'), { id: toastId });
    }
    e.target.value = '';
  };

  const handleAddBlock = (type: 'text' | 'image' | 'video', imageUrl?: string) => {
    const newBlock: DiaryBlock = {
      id: Date.now().toString() + Math.random(),
      type,
      content: imageUrl || '',
    };
    setNewBlocks(prev => [...prev, newBlock]);
  };

  const handleUpdateBlock = (id: string, content: string) => {
    setNewBlocks(prev => prev.map(b => b.id === id ? { ...b, content } : b));
  };

  const handleDeleteBlock = (id: string) => {
    if (newBlocks.length <= 1) return;
    setNewBlocks(prev => prev.filter(b => b.id !== id));
  };

  const handleBlockImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    if (isVideo && file.size > MAX_VIDEO_MB * 1024 * 1024) {
      toast.error(t('diary.errors.videoTooLarge', { maxMb: MAX_VIDEO_MB }));
      e.target.value = '';
      return;
    }

    const toastId = toast.loading(isVideo ? t('diary.toast.processingVideo') : t('diary.toast.processingImage'));
    try {
      const base64 = await readFileAsDataURL(file);
      const compressed = isVideo ? base64 : await compressImage(base64);
      const uploaded = await uploadDataUrl('diary-block', compressed);
      const finalUrl = uploaded.url;

      const photo: DiaryPhoto = {
        id: Date.now().toString() + Math.random(),
        url: finalUrl,
        caption: '',
        type: isVideo ? 'video' : 'photo',
      };

      setNewPhotos(prev => [...prev, photo]);
      handleAddBlock(isVideo ? 'video' : 'image', finalUrl);

      toast.success(isVideo ? t('diary.toast.videoAdded') : t('diary.toast.imageAdded'), { id: toastId });
    } catch (error) {
      toast.error(t('diary.errors.processingError'), { id: toastId });
    }
    e.target.value = '';
  };

  const handleEditBlockImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    if (isVideo && file.size > MAX_VIDEO_MB * 1024 * 1024) {
      toast.error(t('diary.errors.videoTooLarge', { maxMb: MAX_VIDEO_MB }));
      e.target.value = '';
      return;
    }

    const toastId = toast.loading(isVideo ? t('diary.toast.processingVideo') : t('diary.toast.processingImage'));
    try {
      const base64 = await readFileAsDataURL(file);
      const compressed = isVideo ? base64 : await compressImage(base64);
      const uploaded = await uploadDataUrl('diary-block', compressed);
      const finalUrl = uploaded.url;

      const photo: DiaryPhoto = {
        id: Date.now().toString() + Math.random(),
        url: finalUrl,
        caption: '',
        type: isVideo ? 'video' : 'photo',
      };

      const newBlock: DiaryBlock = {
        id: Date.now().toString() + Math.random(),
        type: isVideo ? 'video' : 'image',
        content: finalUrl,
      };

      setEditData(prev => {
        if (!prev) return null;
        const currentBlocks = prev.blocks || (prev.content ? [{ id: '1', type: 'text' as const, content: prev.content }] : []);
        const currentPhotos = prev.photos || [];
        return {
          ...prev,
          blocks: [...currentBlocks, newBlock],
          photos: [...currentPhotos, photo],
        };
      });

      toast.success(isVideo ? t('diary.toast.videoAdded') : t('diary.toast.imageAdded'), { id: toastId });
    } catch (error) {
      toast.error(t('diary.errors.processingError'), { id: toastId });
    }
    e.target.value = '';
  };

  const handleMainPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith('video/')) {
      toast.error(t('diary.errors.mainPhotoImageOnly'));
      e.target.value = '';
      return;
    }

    const toastId = toast.loading(t('diary.toast.processingMainPhoto'));
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = (event) => resolve(event.target?.result as string);
        reader.readAsDataURL(file);
      });
      const compressed = await compressImage(base64);
      const uploaded = await uploadDataUrl('diary-photo', compressed);
      const photo: DiaryPhoto = {
        id: Date.now().toString(),
        url: uploaded.url,
      };

      if (isEdit && editData) {
        setEditData({ ...editData, mainPhoto: photo });
      } else {
        setNewMainPhoto(photo);
      }
      toast.success(t('diary.toast.mainPhotoSet'), { id: toastId });
    } catch (error) {
      toast.error(t('diary.errors.mainPhotoError'), { id: toastId });
    }
    e.target.value = '';
  };

  const handleCreateDiary = () => {
    if (!user) {
      toast.error(t('session.loginRequired'));
      return;
    }
    if (!newTitle.trim() || !newLocation.trim() || !newStartDate) {
      toast.error(t('diary.errors.requiredFields'));
      return;
    }

    const linkedPlan = userPlans.find(p => p.id === newLinkedPlanId);
    const tags = typeof newTags === 'string' ? newTags.split(',').map(t => t.trim()).filter(Boolean) : newTags;

    const diary: DiaryEntry = {
      id: Date.now().toString(),
      userId: user!.id,
      title: newTitle.trim(),
      location: newLocation.trim(),
      startDate: newStartDate,
      endDate: newEndDate || newStartDate,
      content: newBlocks.filter(b => b.type === 'text').map(b => b.content).join('\n'),
      blocks: newBlocks,
      rating: newRating,
      mainPhoto: newMainPhoto,
      photos: newPhotos,
      displayMode: newDisplayMode,
      tags,
      isPublic: newIsPublic,
      linkedPlanId: newLinkedPlanId || undefined,
      linkedPlanTitle: linkedPlan?.title,
      linkedPlanSchedules: linkedPlan?.schedules,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      likesCount: 0,
    };

    saveDiaries([diary, ...diaries]);
    resetNewForm();
    setNewBlocks([{ id: '1', type: 'text', content: '' }]);
    setShowNewDialog(false);
    localStorage.removeItem('diaryFormDraft');
    toast.success(t('diary.toast.diaryUploaded'));
  };

  const resetNewForm = () => {
    setNewTitle(''); setNewLocation(''); setNewStartDate('');
    setNewEndDate(''); setNewContent(''); setNewRating(5);
    setNewBlocks([{ id: '1', type: 'text', content: '' }]);
    setNewMainPhoto(undefined);
    setNewPhotos([]); setNewTags(''); setNewIsPublic(true); setNewLinkedPlanId('');
    localStorage.removeItem('diaryFormDraft');
  };

  const handleDeleteDiary = (id: string) => {
    saveDiaries(diaries.filter(d => d.id !== id));
    if (currentDiary?.id === id) setCurrentDiary(null);
    toast.success(t('diary.toast.diaryDeleted'));
  };

  const handleSaveEdit = () => {
    if (!editData) return;
    const updated = diaries.map(d => d.id === editData.id ? { ...editData, updatedAt: new Date().toISOString() } : d);
    saveDiaries(updated);
    setCurrentDiary(editData);
    setIsEditing(false);
    toast.success(t('diary.toast.diaryUpdated'));
  };

  const resetNewAlbumForm = () => {
    setNewAlbumTitle('');
    setNewAlbumPhotos([]);
    setNewAlbumLinkedPlanId('');
  };

  const handleCreateAlbum = () => {
    if (!user) {
      toast.error(t('session.loginRequired'));
      return;
    }
    if (!newAlbumTitle.trim()) {
      toast.error(t('diary.errors.requiredFields'));
      return;
    }

    const linkedPlan = userPlans.find(p => p.id === newAlbumLinkedPlanId);

    const album: Album = {
      id: Date.now().toString(),
      userId: user!.id,
      title: newAlbumTitle.trim(),
      photos: newAlbumPhotos,
      linkedPlanId: newAlbumLinkedPlanId || undefined,
      linkedPlanTitle: linkedPlan?.title,
      linkedPlanSchedules: linkedPlan?.schedules,
      linkedPlanRegion: linkedPlan?.region,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveAlbums([album, ...albums]);
    resetNewAlbumForm();
    setShowNewAlbumDialog(false);
    toast.success(t('diary.album.toast.albumCreated'));
  };

  const handleDeleteAlbum = (id: string) => {
    saveAlbums(albums.filter(a => a.id !== id));
    if (currentAlbum?.id === id) setCurrentAlbum(null);
    toast.success(t('diary.album.toast.albumDeleted'));
  };

  const handleSaveAlbumEdit = () => {
    if (!editAlbumData) return;
    const updated = albums.map(a => a.id === editAlbumData.id ? { ...editAlbumData, updatedAt: new Date().toISOString() } : a);
    saveAlbums(updated);
    setCurrentAlbum(editAlbumData);
    setIsEditingAlbum(false);
    toast.success(t('diary.album.toast.albumUpdated'));
  };

  const albumToPreviewSnapshot = (album: Album): PlanPreviewSnapshot => {
    const dates = (album.linkedPlanSchedules || []).map(s => s.date).sort();
    return {
      userId: album.userId,
      title: album.linkedPlanTitle || album.title,
      startDate: dates[0] || '',
      endDate: dates[dates.length - 1] || '',
      linkedPlanId: album.linkedPlanId,
      linkedPlanTitle: album.linkedPlanTitle,
      linkedPlanSchedules: album.linkedPlanSchedules,
    };
  };

  const openLocationPickerForPhoto = (photoId: string, context: 'new' | 'edit') => {
    setLocationPickerPhotoId(photoId);
    setLocationPickerContext(context);
    setShowLocationPicker(true);
  };

  const getLocationPickerTarget = (): AlbumPhoto | undefined => {
    const photos = locationPickerContext === 'edit' ? editAlbumData?.photos : newAlbumPhotos;
    return photos?.find(p => p.id === locationPickerPhotoId);
  };

  const handleLocationConfirm = (lat: number, lng: number, address?: string) => {
    if (!locationPickerPhotoId) return;
    const patch = (photos: AlbumPhoto[]) =>
      photos.map(p => p.id === locationPickerPhotoId ? { ...p, lat, lng, address } : p);

    if (locationPickerContext === 'edit') {
      setEditAlbumData(prev => prev ? { ...prev, photos: patch(prev.photos) } : null);
    } else {
      setNewAlbumPhotos(prev => patch(prev));
    }
  };

  const handleClearPhotoLocation = (photoId: string, context: 'new' | 'edit') => {
    const clear = (photos: AlbumPhoto[]) =>
      photos.map(p => p.id === photoId ? { ...p, lat: undefined, lng: undefined, address: undefined } : p);

    if (context === 'edit') {
      setEditAlbumData(prev => prev ? { ...prev, photos: clear(prev.photos) } : null);
    } else {
      setNewAlbumPhotos(prev => clear(prev));
    }
  };

  // 사진 위치 지정 시 사용할 지도 — 연결된 계획이 해외면 OpenStreetMap, 그 외(연결 안 함 포함)에는 네이버 지도
  const getLocationPickerRegion = (): 'domestic' | 'overseas' => {
    const planId = locationPickerContext === 'edit' ? editAlbumData?.linkedPlanId : newAlbumLinkedPlanId;
    const plan = userPlans.find(p => p.id === planId);
    return plan?.region === 'overseas' ? 'overseas' : 'domestic';
  };

  // 새 앨범/앨범 수정 화면 어디서든 사진 위치를 지정할 수 있도록 공용으로 재사용하는 다이얼로그
  const locationPickerDialog = (
    <LocationPickerDialog
      open={showLocationPicker}
      onOpenChange={setShowLocationPicker}
      initialLat={getLocationPickerTarget()?.lat}
      initialLng={getLocationPickerTarget()?.lng}
      region={getLocationPickerRegion()}
      title={t('diary.album.locationPickerTitle')}
      onConfirm={handleLocationConfirm}
    />
  );

  const handleToggleLike = (diaryId: string) => {
    if (!user) {
      toast.error(t('session.loginRequired'));
      return;
    }
    const target = diaries.find(d => d.id === diaryId);
    if (!target) return;
    const wasLiked = target.isLikedByMe === true;
    const updated = diaries.map(d =>
      d.id !== diaryId ? d : { ...d, isLikedByMe: !wasLiked, likesCount: d.likesCount + (wasLiked ? -1 : 1) }
    );
    setDiaries(updated);
    if (currentDiary?.id === diaryId) {
      const found = updated.find(d => d.id === diaryId);
      if (found) setCurrentDiary(found);
    }
    const apiCall = wasLiked ? communityApi.unlike(diaryId) : communityApi.like(diaryId);
    apiCall.catch(() => toast.error(t('diary.errors.storageFull')));
  };

  // 여행 기록을 PDF로 저장 (브라우저 프린트 기능을 활용한 방식 — Home의 여행 계획 PDF 저장과 동일한 방식이라
  // 팝업 차단 안내, 폰트 폴백 등 데스크톱/모바일 호환성이 이미 검증되어 있음)
  const escapeHtml = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const generateDiaryPDF = (diary: DiaryEntry) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error(t('diary.toast.allowPopups'));
      return;
    }

    const periodText = diary.startDate === diary.endDate
      ? diary.startDate
      : `${diary.startDate} ~ ${diary.endDate}`;

    const tagsHtml = diary.tags.length > 0
      ? `<div style="margin: 12px 0 20px;">${diary.tags.map(tag =>
          `<span style="display:inline-block; background:#f0f9ff; color:#0369a1; font-weight:bold; padding:4px 10px; border-radius:999px; font-size:0.85em; margin:0 6px 6px 0;">${escapeHtml(tag)}</span>`
        ).join('')}</div>`
      : '';

    const contentHtml = diary.displayMode === 'blog' && diary.blocks && diary.blocks.length > 0
      ? diary.blocks.map(block => {
          if (block.type === 'text') {
            return `<div style="white-space:pre-wrap; line-height:1.8; margin:16px 0;">${escapeHtml(block.content)}</div>`;
          }
          if (block.type === 'video') {
            return `<div style="margin:16px 0; padding:14px; background:#f5f5f5; border-radius:8px; color:#888; font-size:0.9em;">🎬 ${t('diary.pdf.videoNotIncluded')}</div>${block.caption ? `<p style="text-align:center; color:#888; font-size:0.85em;">${escapeHtml(block.caption)}</p>` : ''}`;
          }
          return `<div style="margin:16px 0;"><img src="${block.content}" style="width:100%; border-radius:8px;" />${block.caption ? `<p style="text-align:center; color:#888; font-size:0.85em; margin-top:6px;">${escapeHtml(block.caption)}</p>` : ''}</div>`;
        }).join('')
      : `<div style="white-space:pre-wrap; line-height:1.8;">${escapeHtml(diary.content)}</div>`;

    const galleryPhotos = diary.displayMode !== 'blog' ? diary.photos.filter(p => p.type !== 'video') : [];
    const skippedVideoCount = diary.displayMode !== 'blog' ? diary.photos.filter(p => p.type === 'video').length : 0;
    const photosHtml = galleryPhotos.length > 0
      ? `<div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:12px;">${galleryPhotos.map(p => `
          <div style="width:calc(33.333% - 7px);">
            <img src="${p.url}" style="width:100%; aspect-ratio:1; object-fit:cover; border-radius:8px; border:1px solid #eee;" />
            ${p.caption ? `<p style="font-size:0.8em; color:#888; margin-top:4px;">${escapeHtml(p.caption)}</p>` : ''}
          </div>
        `).join('')}</div>`
      : '';

    printWindow.document.write(`
      <html>
        <head>
          <title>${escapeHtml(diary.title)} - ${t('diary.pdf.docTitleSuffix')}</title>
          <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
          <style>
            body { font-family: 'Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; line-height: 1.6; color: #333; padding: 40px; word-break: break-word; }
            h1 { color: #0ea5e9; border-bottom: 3px solid #0ea5e9; padding-bottom: 10px; margin-bottom: 8px; }
            .meta { color: #666; margin: 2px 0; }
            .section-title { background: #f0f9ff; padding: 10px; border-radius: 5px; color: #0369a1; margin-top: 30px; margin-bottom: 12px; font-weight: bold; }
            img { max-width: 100%; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(diary.title)}</h1>
          <p class="meta">📍 ${escapeHtml(diary.location)}</p>
          <p class="meta">🗓 ${periodText}</p>
          <p class="meta" style="color:#f59e0b;">⭐ ${diary.rating} / 5</p>
          ${tagsHtml}

          <div class="section-title">📝 ${t('diary.pdf.contentSection')}</div>
          ${contentHtml}

          ${photosHtml ? `<div class="section-title">📷 ${t('diary.pdf.photoSection')}</div>${photosHtml}` : ''}
          ${skippedVideoCount > 0 ? `<p style="color:#888; font-size:0.85em; margin-top:16px;">🎬 ${t('diary.pdf.videosSkipped', { count: skippedVideoCount })}</p>` : ''}

          <script>
            window.onload = () => {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    toast.success(t('diary.toast.printWindowOpened'));
  };

  if (currentDiary) {
    const diary = diaries.find(d => d.id === currentDiary.id) || currentDiary;
    const isOwner = diary.userId === user?.id;
    const heroPhoto = diary.mainPhoto || diary.photos.find(p => p.type !== 'video') || diary.photos[0];

    if (isEditing && editData) {
      return (
        <div className="min-h-screen bg-background pb-16">
          <div className="container mx-auto px-4 py-8 max-w-3xl">
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => { setIsEditing(false); setEditData(null); }}
                className="text-primary font-semibold text-sm hover:underline flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> {t('diary.common.cancel')}
              </button>
              <h2 className="text-xl font-bold text-foreground">{t('diary.editMode.title')}</h2>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">{t('diary.form.titleLabel')}</label>
                  <Input value={editData.title} onChange={e => setEditData({ ...editData, title: e.target.value })} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">{t('diary.form.locationLabel')}</label>
                  <Input value={editData.location} onChange={e => setEditData({ ...editData, location: e.target.value })} className="h-11" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">{t('diary.form.startDateLabel')}</label>
                  <Input type="date" value={editData.startDate} onChange={e => setEditData({ ...editData, startDate: e.target.value })} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">{t('diary.form.endDateLabel')}</label>
                  <Input type="date" value={editData.endDate} onChange={e => setEditData({ ...editData, endDate: e.target.value })} className="h-11" />
                </div>
              </div>

              {userPlans.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Plane className="w-4 h-4 text-primary" /> {t('diary.newDialog.linkPlan')} <span className="text-muted-foreground font-normal">{t('diary.common.optional')}</span>
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={editData.linkedPlanId || ''}
                      onChange={e => {
                        const plan = userPlans.find(p => p.id === e.target.value);
                        setEditData({
                          ...editData,
                          linkedPlanId: e.target.value || undefined,
                          linkedPlanTitle: plan?.title,
                          linkedPlanSchedules: plan?.schedules,
                        });
                      }}
                      className="flex-1 h-11 px-3 py-2 border border-input rounded-md text-sm bg-background"
                    >
                      <option value="">{t('diary.newDialog.noPlanSelected')}</option>
                      {userPlans.map(plan => (
                        <option key={plan.id} value={plan.id}>{plan.title} ({plan.startDate} ~ {plan.endDate})</option>
                      ))}
                    </select>
                    {editData.linkedPlanId && (
                      <Button
                        onClick={() => openPlanPreview(editData.linkedPlanId, editData)}
                        variant="outline"
                        className="h-11 px-4"
                      >
                        {t('diary.common.preview')}
                      </Button>
                    )}
                  </div>
                  {editData.linkedPlanId && (
                    <label className="flex items-start gap-3 p-3 rounded-xl border border-border bg-secondary/50 cursor-pointer mt-2">
                      <Checkbox
                        checked={!!userPlans.find(p => p.id === editData.linkedPlanId)?.allowClone}
                        onCheckedChange={(checked) => handleToggleLinkedPlanAllowClone(editData.linkedPlanId!, checked === true)}
                        className="mt-0.5"
                      />
                      <span className="text-sm">
                        <span className="font-semibold text-foreground block">{t('diary.newDialog.allowCloneLabel')}</span>
                        <span className="text-muted-foreground text-xs">{t('diary.newDialog.allowCloneDescription')}</span>
                      </span>
                    </label>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">{t('diary.form.contentLabel')}</label>
                {editData.displayMode === 'blog' ? (
                  <div className="space-y-4 border-2 border-dashed border-primary/20 p-4 rounded-xl bg-primary/5">
                    <p className="text-xs text-primary font-bold mb-2">{t('diary.blogEditor.editHint')}</p>
                    {(editData.blocks || [{ id: '1', type: 'text', content: editData.content }]).map((block) => (
                      <div key={block.id} className="relative group bg-card p-3 rounded-lg shadow-sm border border-border">
                        {block.type === 'text' ? (
                          <Textarea
                            placeholder={t('diary.blogEditor.contentPlaceholder')}
                            value={block.content}
                            onChange={e => {
                              const blocks = (editData.blocks || []).map(b => b.id === block.id ? { ...b, content: e.target.value } : b);
                              setEditData({ ...editData, blocks });
                            }}
                            className="min-h-[80px] border-none focus-visible:ring-0 p-0 shadow-none text-sm"
                          />
                        ) : block.type === 'video' ? (
                          <video src={block.content} controls className="w-full max-h-40 rounded-lg bg-slate-50" />
                        ) : (
                          <img src={block.content} alt="" className="w-full max-h-40 object-contain rounded-lg bg-slate-50" />
                        )}
                        <button
                          onClick={() => {
                            const blocks = (editData.blocks || []).filter(b => b.id !== block.id);
                            setEditData({ ...editData, blocks: blocks.length ? blocks : [{ id: '1', type: 'text', content: '' }] });
                          }}
                          className="absolute -right-2 -top-2 bg-red-500 text-white rounded-full p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2 justify-center">
                      <Button variant="outline" size="sm" onClick={() => {
                        const currentBlocks = editData.blocks || (editData.content ? [{ id: '1', type: 'text', content: editData.content }] : []);
                        const newBlock: DiaryBlock = { id: Date.now().toString() + Math.random(), type: 'text', content: '' };
                        setEditData({ ...editData, blocks: [...currentBlocks, newBlock] });
                      }} className="h-8 text-xs"><Plus className="w-3 h-3 mr-1" /> {t('diary.blogEditor.addText')}</Button>
                      <Button variant="outline" size="sm" onClick={() => editBlockFileInputRef.current?.click()} className="h-8 text-xs"><ImageIcon className="w-3 h-3 mr-1" /> {t('diary.blogEditor.addMedia')}</Button>
                      <input ref={editBlockFileInputRef} type="file" accept="image/*,video/*" onChange={handleEditBlockImageUpload} className="hidden" />
                    </div>
                  </div>
                ) : (
                  <Textarea
                    value={editData.content}
                    onChange={e => setEditData({ ...editData, content: e.target.value })}
                    className="min-h-[200px] resize-y"
                    placeholder={t('diary.form.contentPlaceholder')}
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">{t('diary.form.ratingLabel')}</label>
                <div className="flex gap-2 items-center">
                  <StarRatingInput value={editData.rating} onChange={r => setEditData({ ...editData, rating: r })} size="lg" />
                  <span className="ml-1 text-sm text-muted-foreground font-semibold">{editData.rating}/5</span>
                </div>
              </div>

              {/* Photos */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Camera className="w-4 h-4" /> {t('diary.form.photosLabel')}
                  </label>
                  <div className="flex bg-secondary p-1 rounded-lg">
                    <button
                      onClick={() => setEditData({ ...editData, displayMode: 'grid' })}
                      className={cn(
                        "text-[10px] px-2 py-1 rounded-md transition",
                        editData.displayMode === 'grid' ? "bg-card text-primary shadow-sm font-bold" : "text-muted-foreground"
                      )}
                    >
                      {t('diary.displayMode.grid')}
                    </button>
                    <button
                      onClick={() => setEditData({ ...editData, displayMode: 'slide' })}
                      className={cn(
                        "text-[10px] px-2 py-1 rounded-md transition",
                        editData.displayMode === 'slide' ? "bg-card text-primary shadow-sm font-bold" : "text-muted-foreground"
                      )}
                    >
                      {t('diary.displayMode.slide')}
                    </button>
                    <button
                      onClick={() => setEditData({ ...editData, displayMode: 'blog' })}
                      className={cn(
                        "text-[10px] px-2 py-1 rounded-md transition",
                        editData.displayMode === 'blog' ? "bg-card text-primary shadow-sm font-bold" : "text-muted-foreground"
                      )}
                    >
                      {t('diary.displayMode.blog')}
                    </button>
                  </div>
                </div>

                {/* Main Photo (Max 1) - Edit Mode */}
                <div className="space-y-3 p-4 bg-primary/5 rounded-xl border border-primary/10 mb-4">
                  <label className="text-sm font-bold text-primary flex items-center gap-2">
                    <Star className="w-4 h-4 fill-primary" /> {t('diary.form.mainPhotoLabel')}
                  </label>
                  <div className="flex items-center gap-4">
                    {editData.mainPhoto ? (
                      <div className="relative group w-24 h-24">
                        <img src={editData.mainPhoto.url} alt={t('diary.form.mainPhotoAlt')} className="w-full h-full object-cover rounded-lg border-2 border-primary shadow-sm" />
                        <button
                          onClick={() => setEditData({ ...editData, mainPhoto: undefined })}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => mainEditFileInputRef.current?.click()}
                        className="w-24 h-24 border-2 border-dashed border-primary/30 rounded-lg flex flex-col items-center justify-center gap-1 text-primary/60 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
                      >
                        <Plus className="w-5 h-5" />
                        <span className="text-[10px] font-semibold">{t('diary.form.selectPhoto')}</span>
                      </button>
                    )}
                    <input ref={mainEditFileInputRef} type="file" accept="image/*" onChange={e => handleMainPhotoUpload(e, true)} className="hidden" />
                    <div className="flex-1 text-[11px] text-muted-foreground">
                      <p>{t('diary.form.mainPhotoHint')}</p>
                    </div>
                  </div>
                </div>

                {editData.displayMode !== 'blog' ? (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      {editData.photos.map(photo => (
                        <div key={photo.id} className="relative group">
                          {photo.type === 'video' ? (
                            <video src={photo.url} controls className="w-full h-28 object-cover rounded-lg border border-border bg-black" />
                          ) : (
                            <img src={photo.url} alt={photo.caption || ''} className="w-full h-28 object-cover rounded-lg border border-border bg-gray-100" />
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity rounded-lg flex flex-col justify-end p-2">
                            <input
                              type="text"
                              value={photo.caption || ''}
                              onChange={e => {
                                const photos = editData.photos.map(p => p.id === photo.id ? { ...p, caption: e.target.value } : p);
                                setEditData({ ...editData, photos });
                              }}
                              placeholder={t('diary.form.captionPlaceholder')}
                              className="text-xs bg-white/90 rounded px-2 py-1 w-full"
                              onClick={e => e.stopPropagation()}
                            />
                          </div>
                          <button
                            onClick={() => setEditData({ ...editData, photos: editData.photos.filter(p => p.id !== photo.id) })}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => editFileInputRef.current?.click()}
                        className="h-28 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                      >
                        <Plus className="w-5 h-5" />
                        <span className="text-xs">{t('diary.common.add')}</span>
                      </button>
                    </div>
                    <input ref={editFileInputRef} type="file" accept="image/*,video/*" multiple onChange={e => handlePhotoUpload(e, true)} className="hidden" />
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground mt-2 p-3 bg-primary/5 rounded-lg border border-primary/10">
                    {t('diary.form.blogModeHintPrefix')}<strong className="text-primary">{t('diary.blogEditor.addMedia')}</strong>{t('diary.form.blogModeHintSuffix')}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">{t('diary.form.tagsLabel')}</label>
                <div className="flex gap-2">
                  <Input
                    value={editTagInput}
                    onChange={e => setEditTagInput(e.target.value)}
                    placeholder={t('diary.form.tagInputPlaceholder')}
                    className="h-11"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && editTagInput.trim()) {
                        setEditData({ ...editData, tags: [...editData.tags, editTagInput.trim()] });
                        setEditTagInput('');
                      }
                    }}
                  />
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {editData.tags.map((tag, i) => (
                    <span key={i} className="bg-secondary text-muted-foreground px-3 py-1 rounded-full text-sm flex items-center gap-1 border border-border">
                      {tag}
                      <button onClick={() => setEditData({ ...editData, tags: editData.tags.filter((_, idx) => idx !== i) })}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-secondary rounded-xl border border-border">
                <div>
                  <p className="font-semibold text-foreground text-sm">{t('diary.form.publicLabel')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('diary.form.publicHint')}</p>
                </div>
                <button
                  onClick={() => setEditData({ ...editData, isPublic: !editData.isPublic })}
                  className={cn(
                    "w-12 h-6 rounded-full transition-colors relative",
                    editData.isPublic ? "bg-primary" : "bg-gray-300"
                  )}
                >
                  <div className={cn(
                    "w-5 h-5 bg-card rounded-full absolute top-0.5 transition-all shadow",
                    editData.isPublic ? "left-6" : "left-0.5"
                  )} />
                </button>
              </div>

              <div className="flex gap-3">
                <Button onClick={handleSaveEdit} className="flex-1 bg-primary text-white h-11">
                  <Check className="w-4 h-4 mr-2" /> {t('diary.common.save')}
                </Button>
                <Button onClick={() => { setIsEditing(false); setEditData(null); }} variant="outline" className="flex-1 h-11">
                  {t('diary.common.cancel')}
                </Button>
              </div>
            </div>
          </div>
          {planPreviewDialog}
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background pb-16">
        {/* Hero section with first photo */}
        {heroPhoto ? (
          <div className="relative h-[280px] sm:h-[380px] lg:h-[500px] w-full max-w-6xl mx-auto bg-slate-900 overflow-hidden sm:rounded-2xl sm:mt-4">
            {heroPhoto.type === 'video' ? (
              <video src={heroPhoto.url} controls className="w-full h-full object-contain" />
            ) : (
              <img src={heroPhoto.url} alt={diary.title} className="w-full h-full object-contain" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <button
              onClick={() => setCurrentDiary(null)}
              className="absolute top-4 left-4 text-white flex items-center gap-1 font-semibold text-sm bg-black/30 px-3 py-1.5 rounded-full hover:bg-black/50 transition"
            >
              <ChevronLeft className="w-4 h-4" /> {t('diary.common.backToList')}
            </button>
            {isOwner && (
              <div className="absolute top-4 right-4 flex gap-2">
                <button
                  onClick={() => { setEditData({ ...diary }); setIsEditing(true); }}
                  className="bg-white/90 text-foreground p-2 rounded-full hover:bg-white transition"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { handleDeleteDiary(diary.id); }}
                  className="bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="absolute bottom-4 left-4 right-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-white/90 text-sm bg-black/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {diary.location}
                </span>
                <span className="text-white/90 text-sm bg-black/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                  {diary.isPublic ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  {diary.isPublic ? t('diary.common.public') : t('diary.common.private')}
                </span>
              </div>
              <h1 className="text-2xl font-black text-white drop-shadow break-words line-clamp-2">{diary.title}</h1>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-primary/20 to-primary/5 pt-6 pb-8 px-4">
            <div className="container mx-auto max-w-3xl">
              <button
                onClick={() => setCurrentDiary(null)}
                className="text-primary font-semibold text-sm hover:underline flex items-center gap-1 mb-4"
              >
                <ChevronLeft className="w-4 h-4" /> {t('diary.common.backToList')}
              </button>
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-muted-foreground text-sm flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-primary" /> {diary.location}
                    </span>
                    <span className="text-muted-foreground text-sm flex items-center gap-1">
                      {diary.isPublic ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                      {diary.isPublic ? t('diary.common.public') : t('diary.common.private')}
                    </span>
                  </div>
                  <h1 className="text-3xl font-black text-foreground break-words">{diary.title}</h1>
                </div>
                {isOwner && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditData({ ...diary }); setIsEditing(true); }}
                      className="p-2 text-muted-foreground hover:text-primary transition"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => { handleDeleteDiary(diary.id); }}
                      className="p-2 text-muted-foreground hover:text-red-500 transition"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="container mx-auto px-4 py-6 max-w-3xl">
          {/* Meta info */}
          <div className="flex flex-wrap gap-3 mb-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Calendar className="w-4 h-4 text-primary" /> {diary.startDate}{diary.endDate !== diary.startDate ? ` ~ ${diary.endDate}` : ''}</span>
            <StarRatingDisplay value={diary.rating} size="sm" showLabel />
            {diary.linkedPlanTitle && (
              <button
                onClick={() => openPlanPreview(diary.linkedPlanId, diary)}
                className="flex items-center gap-1 text-primary font-semibold hover:underline"
              >
                <Plane className="w-4 h-4" /> {diary.linkedPlanTitle}
              </button>
            )}
            <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {new Date(diary.createdAt).toLocaleDateString(language === 'en' ? 'en-US' : 'ko-KR')}</span>
          </div>

          {/* Tags */}
          {diary.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {diary.tags.map((tag, i) => (
                <span key={i} className="bg-secondary text-primary font-semibold px-3 py-1 rounded-full text-sm border border-border">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Content & Blog Blocks */}
          {diary.displayMode === 'blog' && diary.blocks && diary.blocks.length > 0 ? (
            <div className="space-y-6 mb-8">
              {diary.blocks.map(block => (
                <div key={block.id}>
                  {block.type === 'text' ? (
                    <div className="prose max-w-none text-foreground leading-relaxed whitespace-pre-wrap text-[16px] px-2">
                      {block.content}
                    </div>
                  ) : block.type === 'video' ? (
                    <div className="space-y-2">
                      <video src={block.content} controls className="w-full rounded-2xl shadow-sm border border-border bg-black" />
                      {block.caption && <p className="text-center text-sm text-muted-foreground">{block.caption}</p>}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <img src={block.content} alt={block.caption || ''} className="w-full rounded-2xl shadow-sm border border-border bg-slate-50" />
                      {block.caption && <p className="text-center text-sm text-muted-foreground">{block.caption}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <>
              <Card className="p-6 mb-6 bg-card border-border shadow-sm">
                <div className="prose max-w-none text-foreground leading-relaxed whitespace-pre-wrap text-[15px]">
                  {diary.content}
                </div>
              </Card>
            </>
          )}

          {/* Photo Gallery */}
          {diary.displayMode !== 'blog' && diary.photos.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
                <Camera className="w-5 h-5 text-primary" /> {t('diary.detail.photoCount', { count: diary.photos.length })}
              </h3>

              {diary.displayMode === 'slide' ? (() => {
                const activeIndex = Math.min(slidePhotoIndex, diary.photos.length - 1);
                const activePhoto = diary.photos[activeIndex];
                return (
                  <div>
                    <div className="relative rounded-2xl overflow-hidden shadow-sm border border-border">
                      {activePhoto.type === 'video' ? (
                        <video src={activePhoto.url} controls className="w-full object-contain max-h-[700px] bg-black" />
                      ) : (
                        <img src={activePhoto.url} alt={activePhoto.caption || ''} className="w-full object-contain max-h-[700px] bg-slate-50" />
                      )}
                      {diary.photos.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={() => setSlidePhotoIndex((activeIndex - 1 + diary.photos.length) % diary.photos.length)}
                            aria-label={t('diary.detail.prevPhoto')}
                            className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                          >
                            <ChevronLeft className="w-5 h-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setSlidePhotoIndex((activeIndex + 1) % diary.photos.length)}
                            aria-label={t('diary.detail.nextPhoto')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                          >
                            <ChevronRight className="w-5 h-5" />
                          </button>
                          <span className="absolute bottom-3 right-3 bg-black/50 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                            {activeIndex + 1} / {diary.photos.length}
                          </span>
                        </>
                      )}
                    </div>
                    {activePhoto.caption && (
                      <div className="p-4 bg-card border border-t-0 border-border rounded-b-2xl">
                        <p className="text-sm text-foreground">{activePhoto.caption}</p>
                      </div>
                    )}
                  </div>
                );
              })() : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {diary.photos.map(photo => (
                    <div key={photo.id} className="relative group aspect-square">
                      {photo.type === 'video' ? (
                        <video src={photo.url} controls className="w-full h-full object-cover rounded-xl border border-border bg-black" />
                      ) : (
                        <img src={photo.url} alt={photo.caption || ''} className="w-full h-full object-cover rounded-xl border border-border bg-gray-100" />
                      )}
                      {photo.caption && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] p-2 rounded-b-xl opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          {photo.caption}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Like / Share / PDF 저장 버튼 */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-4 border-t border-border">
            <button
              onClick={() => handleToggleLike(diary.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full border transition-all font-semibold text-sm",
                diary.isLikedByMe
                  ? "bg-red-50 border-red-300 text-red-500"
                  : "bg-card border-border text-muted-foreground hover:border-red-300 hover:text-red-400"
              )}
            >
              <Heart className={cn("w-4 h-4", diary.isLikedByMe && "fill-red-500")} />
              {t('diary.detail.like')} {diary.likesCount > 0 && diary.likesCount}
            </button>
            <div className="flex items-center flex-wrap gap-2">
              <button
                onClick={() => generateDiaryPDF(diary)}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-100 transition font-semibold text-sm"
              >
                <Download className="w-4 h-4" /> {t('diary.detail.savePdf')}
              </button>
              <button
                onClick={async () => {
                  if (await copyToClipboard(window.location.href)) {
                    toast.success(t('diary.toast.linkCopied'));
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-border transition font-semibold text-sm"
              >
                <Share2 className="w-4 h-4" /> {t('diary.detail.share')}
              </button>
            </div>
          </div>
        </div>
        {planPreviewDialog}
      </div>
    );
  }

  if (currentAlbum) {
    const album = albums.find(a => a.id === currentAlbum.id) || currentAlbum;
    const isAlbumOwner = album.userId === user?.id;

    if (isEditingAlbum && editAlbumData) {
      return (
        <div className="min-h-screen bg-background pb-16">
          <div className="container mx-auto px-4 py-8 max-w-3xl">
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => { setIsEditingAlbum(false); setEditAlbumData(null); }}
                className="text-primary font-semibold text-sm hover:underline flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> {t('diary.common.cancel')}
              </button>
              <h2 className="text-xl font-bold text-foreground">{t('diary.album.editMode.title')}</h2>
            </div>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">{t('diary.album.newDialog.titleLabel')}</label>
                <Input value={editAlbumData.title} onChange={e => setEditAlbumData({ ...editAlbumData, title: e.target.value })} className="h-11" />
              </div>

              {userPlans.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Plane className="w-4 h-4 text-primary" /> {t('diary.newDialog.linkPlan')} <span className="text-muted-foreground font-normal">{t('diary.common.optional')}</span>
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={editAlbumData.linkedPlanId || ''}
                      onChange={e => {
                        const plan = userPlans.find(p => p.id === e.target.value);
                        setEditAlbumData({
                          ...editAlbumData,
                          linkedPlanId: e.target.value || undefined,
                          linkedPlanTitle: plan?.title,
                          linkedPlanSchedules: plan?.schedules,
                          linkedPlanRegion: plan?.region,
                        });
                      }}
                      className="flex-1 h-11 px-3 py-2 border border-input rounded-md text-sm bg-background"
                    >
                      <option value="">{t('diary.newDialog.noPlanSelected')}</option>
                      {userPlans.map(plan => (
                        <option key={plan.id} value={plan.id}>{plan.title} ({plan.startDate} ~ {plan.endDate})</option>
                      ))}
                    </select>
                    {editAlbumData.linkedPlanId && (
                      <Button
                        onClick={() => openPlanPreview(editAlbumData.linkedPlanId, albumToPreviewSnapshot(editAlbumData))}
                        variant="outline"
                        className="h-11 px-4"
                      >
                        {t('diary.common.preview')}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Camera className="w-4 h-4" /> {t('diary.album.photosLabel')}
                  </label>
                  <span className="text-xs text-muted-foreground">{t('diary.album.maxPhotosHint')}</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {editAlbumData.photos.map(photo => (
                    <div key={photo.id} className="relative group">
                      {photo.type === 'video' ? (
                        <video src={photo.url} controls className="w-full h-28 object-cover rounded-lg border border-border bg-black" />
                      ) : (
                        <img src={photo.url} alt={photo.caption || ''} className="w-full h-28 object-cover rounded-lg border border-border bg-gray-100" />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity rounded-lg flex flex-col justify-end p-2">
                        <input
                          type="text"
                          value={photo.caption || ''}
                          onChange={e => {
                            const photos = editAlbumData.photos.map(p => p.id === photo.id ? { ...p, caption: e.target.value } : p);
                            setEditAlbumData({ ...editAlbumData, photos });
                          }}
                          placeholder={t('diary.form.captionPlaceholder')}
                          className="text-xs bg-white/90 rounded px-2 py-1 w-full"
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                      <button
                        onClick={() => setEditAlbumData({ ...editAlbumData, photos: editAlbumData.photos.filter(p => p.id !== photo.id) })}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <div className="absolute bottom-1 left-1 flex gap-1">
                        <button
                          onClick={() => openLocationPickerForPhoto(photo.id, 'edit')}
                          title={photo.lat !== undefined ? t('diary.album.locationTagged') : t('diary.album.tagLocation')}
                          className={cn(
                            "rounded-full p-1 transition-opacity",
                            photo.lat !== undefined ? "bg-primary text-white" : "bg-black/50 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                          )}
                        >
                          <MapPin className="w-3 h-3" />
                        </button>
                        {photo.lat !== undefined && (
                          <button
                            onClick={() => handleClearPhotoLocation(photo.id, 'edit')}
                            title={t('diary.album.removeLocation')}
                            className="rounded-full p-1 bg-red-500 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => editAlbumFileInputRef.current?.click()}
                    className="h-28 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                    <span className="text-xs">{t('diary.common.add')}</span>
                  </button>
                </div>
                <input ref={editAlbumFileInputRef} type="file" accept="image/*,video/*" multiple onChange={e => handleAlbumPhotoUpload(e, true)} className="hidden" />
              </div>

              <div className="flex gap-3">
                <Button onClick={handleSaveAlbumEdit} className="flex-1 bg-primary text-white h-11">
                  <Check className="w-4 h-4 mr-2" /> {t('diary.common.save')}
                </Button>
                <Button onClick={() => { setIsEditingAlbum(false); setEditAlbumData(null); }} variant="outline" className="flex-1 h-11">
                  {t('diary.common.cancel')}
                </Button>
              </div>
            </div>
          </div>
          {planPreviewDialog}
          {locationPickerDialog}
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background pb-16">
        <div className="bg-gradient-to-br from-primary/20 to-primary/5 pt-6 pb-8 px-4">
          <div className="container mx-auto max-w-4xl">
            <button
              onClick={() => setCurrentAlbum(null)}
              className="text-primary font-semibold text-sm hover:underline flex items-center gap-1 mb-4"
            >
              <ChevronLeft className="w-4 h-4" /> {t('diary.common.backToList')}
            </button>
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <h1 className="text-3xl font-black text-foreground break-words">{album.title}</h1>
                {album.linkedPlanTitle && (
                  <button
                    onClick={() => openPlanPreview(album.linkedPlanId, albumToPreviewSnapshot(album))}
                    className="mt-2 flex items-center gap-1 text-primary font-semibold hover:underline text-sm"
                  >
                    <Plane className="w-4 h-4" /> {album.linkedPlanTitle}
                  </button>
                )}
              </div>
              {isAlbumOwner && (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditAlbumData({ ...album }); setIsEditingAlbum(true); }}
                    className="p-2 text-muted-foreground hover:text-primary transition"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDeleteAlbum(album.id)}
                    className="p-2 text-muted-foreground hover:text-red-500 transition"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-6 max-w-4xl">
          <div className="flex bg-secondary p-1 rounded-lg w-fit mb-6">
            <button
              onClick={() => setAlbumViewMode('grid')}
              className={cn("text-sm px-4 py-1.5 rounded-md transition font-semibold flex items-center gap-1.5", albumViewMode === 'grid' ? "bg-card text-primary shadow-sm" : "text-muted-foreground")}
            >
              <Camera className="w-4 h-4" /> {t('diary.album.detail.viewGrid')}
            </button>
            <button
              onClick={() => setAlbumViewMode('map')}
              className={cn("text-sm px-4 py-1.5 rounded-md transition font-semibold flex items-center gap-1.5", albumViewMode === 'map' ? "bg-card text-primary shadow-sm" : "text-muted-foreground")}
            >
              <MapPin className="w-4 h-4" /> {t('diary.album.detail.viewMap')}
            </button>
          </div>

          {albumViewMode === 'grid' ? (
            album.photos.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Camera className="w-10 h-10 mx-auto mb-3 text-border" />
                <p className="text-sm">{t('diary.album.emptyState.subtitle')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {album.photos.map(photo => (
                  <div key={photo.id} className="relative group aspect-square">
                    {photo.type === 'video' ? (
                      <video src={photo.url} controls className="w-full h-full object-cover rounded-xl border border-border bg-black" />
                    ) : (
                      <img src={photo.url} alt={photo.caption || ''} className="w-full h-full object-cover rounded-xl border border-border bg-gray-100" />
                    )}
                    {photo.lat !== undefined && (
                      <span className="absolute top-2 left-2 bg-primary text-white rounded-full p-1">
                        <MapPin className="w-3 h-3" />
                      </span>
                    )}
                    {photo.caption && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] p-2 rounded-b-xl opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        {photo.caption}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (() => {
            const geotagged = album.photos.filter(p => p.lat !== undefined && p.lng !== undefined);
            if (geotagged.length === 0) {
              return (
                <div className="text-center py-16 text-muted-foreground">
                  <MapPin className="w-10 h-10 mx-auto mb-3 text-border" />
                  <p className="text-sm">{t('diary.album.detail.mapEmptyState')}</p>
                  <p className="text-xs mt-1">{t('diary.album.detail.mapEmptyStateHint')}</p>
                </div>
              );
            }
            const markers: MapMarker[] = geotagged.map((p, i) => ({
              id: p.id,
              lat: p.lat as number,
              lng: p.lng as number,
              title: p.caption || p.address || String(i + 1),
              draggable: false,
              label: String(i + 1),
            }));
            // 앨범에 저장된 스냅샷(linkedPlanRegion)은 이 기능이 추가되기 전에 연결된 앨범에는 없을 수 있으므로,
            // 연결된 계획이 아직 존재하면 그 계획의 현재 region을 실시간으로 우선 확인
            const currentLinkedPlan = userPlans.find(p => p.id === album.linkedPlanId);
            const isOverseas = currentLinkedPlan ? currentLinkedPlan.region === 'overseas' : album.linkedPlanRegion === 'overseas';
            const panToPhoto = (p: AlbumPhoto) => {
              if (p.lat === undefined || p.lng === undefined) return;
              if (isOverseas) {
                const map = albumOverseasMapRef.current;
                if (!map) return;
                map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 15) });
              } else {
                const map = albumMapRef.current;
                if (!map || !window.naver) return;
                map.morph(new window.naver.maps.LatLng(p.lat, p.lng), Math.max(map.getZoom(), 15));
              }
            };
            return (
              <div>
                <p className="text-sm text-muted-foreground mb-3">{t('diary.album.detail.geotaggedCount', { count: geotagged.length })}</p>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    {isOverseas ? (
                      <Suspense fallback={<div className="relative w-full h-[500px] rounded-xl overflow-hidden bg-secondary flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
                        <OverseasMapView
                          markers={markers}
                          fitToMarkers
                          onMapReady={map => { albumOverseasMapRef.current = map; }}
                        />
                      </Suspense>
                    ) : (
                      <MapView
                        markers={markers}
                        fitToMarkers
                        onMapReady={map => { albumMapRef.current = map; }}
                      />
                    )}
                  </div>
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {geotagged.map((p, i) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => panToPhoto(p)}
                        className="w-full text-left flex items-start gap-3 p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors"
                      >
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          {p.type === 'video' ? (
                            <video src={p.url} className="w-full h-16 object-cover rounded-lg bg-black mb-1" />
                          ) : (
                            <img src={p.url} alt="" className="w-full h-16 object-cover rounded-lg mb-1" />
                          )}
                          {(() => {
                            const address = p.address || resolvedPhotoAddresses[p.id];
                            return address ? (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                                <MapPin className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{address}</span>
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                                <MapPin className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{(p.lat as number).toFixed(6)}, {(p.lng as number).toFixed(6)}</span>
                              </p>
                            );
                          })()}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
        {planPreviewDialog}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-black text-foreground flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-primary" /> {t('diary.header.title')}
            </h2>
            <p className="text-muted-foreground mt-1">{t('diary.header.subtitle', { name: user?.name || '' })}</p>
          </div>
          <Button
            onClick={() => {
              if (!user) {
                toast.error(t('session.loginRequired'));
                return;
              }
              if (activeTab === 'albums') {
                setShowNewAlbumDialog(true);
              } else {
                setShowNewDialog(true);
              }
            }}
            className="gap-2 bg-primary text-white rounded-full px-5"
          >
            <Plus className="w-4 h-4" /> {activeTab === 'albums' ? t('diary.album.newAlbumCta') : t('diary.header.newEntry')}
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'records' | 'albums')}>
          <TabsList className="mb-6">
            <TabsTrigger value="records">{t('diary.tabs.records')}</TabsTrigger>
            <TabsTrigger value="albums">{t('diary.tabs.albums')}</TabsTrigger>
          </TabsList>

          <TabsContent value="records">
            {/* Stats */}
            {myDiaries.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <Card className="relative overflow-hidden p-5 bg-card border-border group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-amber-400 to-orange-400" />
                  <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-amber-300/25 blur-2xl group-hover:bg-amber-300/40 transition-colors duration-500" />
                  <div className="relative flex flex-col items-center">
                    <div className="w-11 h-11 rounded-2xl bg-amber-50 ring-1 ring-amber-200 text-amber-600 flex items-center justify-center mb-3">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <p className="text-3xl font-black tracking-tight text-foreground">{myDiaries.length}</p>
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-600/80 mt-1.5">{t('diary.stats.totalEntries')}</p>
                  </div>
                </Card>
                <Card className="relative overflow-hidden p-5 bg-card border-border group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-emerald-400 to-teal-400" />
                  <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-emerald-300/25 blur-2xl group-hover:bg-emerald-300/40 transition-colors duration-500" />
                  <div className="relative flex flex-col items-center">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 text-emerald-600 flex items-center justify-center mb-3">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <p className="text-3xl font-black tracking-tight text-foreground">
                      {[...new Set(myDiaries.map(d => d.location))].length}
                    </p>
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-600/80 mt-1.5">{t('diary.stats.visitedPlaces')}</p>
                  </div>
                </Card>
                <Card className="relative overflow-hidden p-5 bg-card border-border group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-sky-400 to-blue-400" />
                  <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-sky-300/25 blur-2xl group-hover:bg-sky-300/40 transition-colors duration-500" />
                  <div className="relative flex flex-col items-center">
                    <div className="w-11 h-11 rounded-2xl bg-sky-50 ring-1 ring-sky-200 text-sky-600 flex items-center justify-center mb-3">
                      <Camera className="w-5 h-5" />
                    </div>
                    <p className="text-3xl font-black tracking-tight text-foreground">
                      {myDiaries.reduce((sum, d) => sum + d.photos.length, 0)}
                    </p>
                    <p className="text-xs font-bold uppercase tracking-wider text-sky-600/80 mt-1.5">{t('diary.stats.totalPhotos')}</p>
                  </div>
                </Card>
              </div>
            )}

            {/* Diaries list */}
            {isDiariesLoading && myDiaries.length === 0 ? (
              <div className="py-16 flex items-center justify-center text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : myDiaries.length === 0 ? (
              <Card className="p-16 flex flex-col items-center justify-center border-dashed border-2 border-border bg-card/50">
                <BookOpen className="w-16 h-16 text-border mb-4" />
                <h3 className="text-xl font-bold text-foreground mb-2">{t('diary.emptyState.title')}</h3>
                <p className="text-muted-foreground mb-6 text-center">{t('diary.emptyState.subtitle')}</p>
                <Button
                  onClick={() => {
                    if (!user) {
                      toast.error(t('session.loginRequired'));
                      return;
                    }
                    setShowNewDialog(true);
                  }}
                  className="bg-primary text-white rounded-full px-6"
                >
                  {t('diary.emptyState.cta')}
                </Button>
              </Card>
            ) : (
              <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginatedMyDiaries.map(diary => {
                    const cardThumb = diary.mainPhoto || diary.photos.find(p => p.type !== 'video');
                    return (
                    <Card
                      key={diary.id}
                      className="group cursor-pointer hover:shadow-xl transition-all border-border bg-card overflow-hidden"
                      onClick={() => setCurrentDiary(diary)}
                    >
                      {cardThumb ? (
                        <div className="relative h-48 overflow-hidden">
                          <img
                            src={cardThumb.url}
                            alt={diary.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute top-2 right-2 flex gap-1">
                            {!diary.isPublic && (
                              <span className="bg-black/50 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Lock className="w-3 h-3" /> {t('diary.common.private')}
                              </span>
                            )}
                          </div>
                          {diary.photos.length > 1 && (
                            <span className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Camera className="w-3 h-3" /> {diary.photos.length}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="h-24 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                          <BookOpen className="w-10 h-10 text-primary/30" />
                        </div>
                      )}
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-black text-foreground text-lg group-hover:text-primary transition-colors truncate">{diary.title}</h3>
                            <p className="text-muted-foreground text-sm flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 text-primary flex-shrink-0" /> {diary.location}
                            </p>
                          </div>
                          <span className="ml-2 flex-shrink-0"><StarRatingDisplay value={diary.rating} size="sm" /></span>
                        </div>
                        <p className="text-muted-foreground text-sm line-clamp-2 mb-3">{diary.content}</p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {diary.startDate}
                          </span>
                          <span className="flex items-center gap-1">
                            <Heart className="w-3 h-3" /> {diary.likesCount}
                          </span>
                        </div>
                        {diary.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-3">
                            {diary.tags.slice(0, 3).map((tag, i) => (
                              <span key={i} className="bg-secondary text-primary text-xs px-2 py-0.5 rounded-full">{tag}</span>
                            ))}
                            {diary.tags.length > 3 && <span className="text-xs text-muted-foreground">+{diary.tags.length - 3}</span>}
                          </div>
                        )}
                      </div>
                    </Card>
                    );
                  })}
              </div>

              {totalDiaryPages > 1 && (
                <div className="flex items-center justify-center flex-wrap gap-1.5 mt-8">
                  <button
                    type="button"
                    onClick={() => setDiaryPage(p => Math.max(1, p - 1))}
                    disabled={diaryPageSafe === 1}
                    className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: totalDiaryPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setDiaryPage(page)}
                      className={cn(
                        "w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full text-sm font-bold transition",
                        page === diaryPageSafe ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDiaryPage(p => Math.min(totalDiaryPages, p + 1))}
                    disabled={diaryPageSafe === totalDiaryPages}
                    className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
              </>
            )}
          </TabsContent>

          <TabsContent value="albums">
            {/* Album Stats */}
            {myAlbums.length > 0 && (
              <div className="grid grid-cols-2 gap-4 mb-8">
                <Card className="relative overflow-hidden p-5 bg-card border-border group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-violet-400 to-fuchsia-400" />
                  <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-violet-300/25 blur-2xl group-hover:bg-violet-300/40 transition-colors duration-500" />
                  <div className="relative flex flex-col items-center">
                    <div className="w-11 h-11 rounded-2xl bg-violet-50 ring-1 ring-violet-200 text-violet-600 flex items-center justify-center mb-3">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <p className="text-3xl font-black tracking-tight text-foreground">{myAlbums.length}</p>
                    <p className="text-xs font-bold uppercase tracking-wider text-violet-600/80 mt-1.5">{t('diary.album.stats.totalAlbums')}</p>
                  </div>
                </Card>
                <Card className="relative overflow-hidden p-5 bg-card border-border group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-rose-400 to-orange-400" />
                  <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-rose-300/25 blur-2xl group-hover:bg-rose-300/40 transition-colors duration-500" />
                  <div className="relative flex flex-col items-center">
                    <div className="w-11 h-11 rounded-2xl bg-rose-50 ring-1 ring-rose-200 text-rose-600 flex items-center justify-center mb-3">
                      <Camera className="w-5 h-5" />
                    </div>
                    <p className="text-3xl font-black tracking-tight text-foreground">
                      {myAlbums.reduce((sum, a) => sum + a.photos.length, 0)}
                    </p>
                    <p className="text-xs font-bold uppercase tracking-wider text-rose-600/80 mt-1.5">{t('diary.album.stats.totalMedia')}</p>
                  </div>
                </Card>
              </div>
            )}

            {/* Albums list */}
            {isAlbumsLoading && myAlbums.length === 0 ? (
              <div className="py-16 flex items-center justify-center text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : myAlbums.length === 0 ? (
              <Card className="p-16 flex flex-col items-center justify-center border-dashed border-2 border-border bg-card/50">
                <Camera className="w-16 h-16 text-border mb-4" />
                <h3 className="text-xl font-bold text-foreground mb-2">{t('diary.album.emptyState.title')}</h3>
                <p className="text-muted-foreground mb-6 text-center">{t('diary.album.emptyState.subtitle')}</p>
                <Button
                  onClick={() => {
                    if (!user) {
                      toast.error(t('session.loginRequired'));
                      return;
                    }
                    setShowNewAlbumDialog(true);
                  }}
                  className="bg-primary text-white rounded-full px-6"
                >
                  {t('diary.album.emptyState.cta')}
                </Button>
              </Card>
            ) : (
              <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginatedMyAlbums.map(album => {
                    const cardThumb = album.photos.find(p => p.type !== 'video') || album.photos[0];
                    return (
                    <Card
                      key={album.id}
                      className="group cursor-pointer hover:shadow-xl transition-all border-border bg-card overflow-hidden"
                      onClick={() => setCurrentAlbum(album)}
                    >
                      {cardThumb ? (
                        <div className="relative h-48 overflow-hidden">
                          <img
                            src={cardThumb.url}
                            alt={album.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          {album.photos.length > 0 && (
                            <span className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Camera className="w-3 h-3" /> {album.photos.length}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="h-24 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                          <Camera className="w-10 h-10 text-primary/30" />
                        </div>
                      )}
                      <div className="p-5">
                        <h3 className="font-black text-foreground text-lg group-hover:text-primary transition-colors truncate">{album.title}</h3>
                        {album.linkedPlanTitle && (
                          <p className="text-muted-foreground text-sm flex items-center gap-1 mt-1">
                            <Plane className="w-3 h-3 text-primary flex-shrink-0" /> {album.linkedPlanTitle}
                          </p>
                        )}
                      </div>
                    </Card>
                    );
                  })}
              </div>

              {totalAlbumPages > 1 && (
                <div className="flex items-center justify-center flex-wrap gap-1.5 mt-8">
                  <button
                    type="button"
                    onClick={() => setAlbumPage(p => Math.max(1, p - 1))}
                    disabled={albumPageSafe === 1}
                    className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: totalAlbumPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setAlbumPage(page)}
                      className={cn(
                        "w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full text-sm font-bold transition",
                        page === albumPageSafe ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAlbumPage(p => Math.min(totalAlbumPages, p + 1))}
                    disabled={albumPageSafe === totalAlbumPages}
                    className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* New Diary Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <BookOpen className="w-5 h-5 text-primary" /> {t('diary.newDialog.title')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">{t('diary.form.titleLabel')}</label>
                <Input
                  placeholder={t('diary.newDialog.titlePlaceholder')}
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">{t('diary.form.locationLabel')}</label>
                <Input
                  placeholder={t('diary.newDialog.locationPlaceholder')}
                  value={newLocation}
                  onChange={e => setNewLocation(e.target.value)}
                  className="h-11"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">{t('diary.form.startDateRequiredLabel')}</label>
                <Input type="date" value={newStartDate} onChange={e => setNewStartDate(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">{t('diary.form.endDateLabel')}</label>
                <Input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} className="h-11" />
              </div>
            </div>

            {/* Link to existing plan */}
            {userPlans.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Plane className="w-4 h-4 text-primary" /> {t('diary.newDialog.linkPlan')} <span className="text-muted-foreground font-normal">{t('diary.common.optional')}</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={newLinkedPlanId}
                    onChange={e => setNewLinkedPlanId(e.target.value)}
                    className="flex-1 h-11 px-3 py-2 border border-input rounded-md text-sm bg-background"
                  >
                    <option value="">{t('diary.newDialog.noPlanSelected')}</option>
                    {userPlans.map(plan => (
                      <option key={plan.id} value={plan.id}>{plan.title} ({plan.startDate} ~ {plan.endDate})</option>
                    ))}
                  </select>
                  {newLinkedPlanId && (
                    <Button
                      onClick={() => openPlanPreview(newLinkedPlanId)}
                      variant="outline"
                      className="h-11 px-4"
                    >
                      {t('diary.common.preview')}
                    </Button>
                  )}
                </div>
                {newLinkedPlanId && (
                  <label className="flex items-start gap-3 p-3 rounded-xl border border-border bg-secondary/50 cursor-pointer mt-2">
                    <Checkbox
                      checked={!!userPlans.find(p => p.id === newLinkedPlanId)?.allowClone}
                      onCheckedChange={(checked) => handleToggleLinkedPlanAllowClone(newLinkedPlanId, checked === true)}
                      className="mt-0.5"
                    />
                    <span className="text-sm">
                      <span className="font-semibold text-foreground block">{t('diary.newDialog.allowCloneLabel')}</span>
                      <span className="text-muted-foreground text-xs">{t('diary.newDialog.allowCloneDescription')}</span>
                    </span>
                  </label>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('diary.form.contentLabel')}</label>
              <Textarea
                placeholder={t('diary.newDialog.contentPlaceholder')}
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                className="min-h-[160px] resize-y"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">{t('diary.newDialog.satisfactionLabel')}</label>
              <div className="flex gap-3 items-center">
                <StarRatingInput value={newRating} onChange={setNewRating} size="lg" />
                <span className="ml-1 text-sm text-muted-foreground font-semibold">{newRating}/5</span>
              </div>
            </div>

            {/* Main Photo (Max 1) */}
            <div className="space-y-3 p-4 bg-primary/5 rounded-xl border border-primary/10">
              <label className="text-sm font-bold text-primary flex items-center gap-2">
                <Star className="w-4 h-4 fill-primary" /> {t('diary.form.mainPhotoLabel')}
              </label>
              <div className="flex items-center gap-4">
                {newMainPhoto ? (
                  <div className="relative group w-32 h-32">
                    <img src={newMainPhoto.url} alt={t('diary.form.mainPhotoAlt')} className="w-full h-full object-cover rounded-lg border-2 border-primary shadow-md" />
                    <button
                      onClick={() => setNewMainPhoto(undefined)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => mainFileInputRef.current?.click()}
                    className="w-32 h-32 border-2 border-dashed border-primary/30 rounded-lg flex flex-col items-center justify-center gap-2 text-primary/60 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
                  >
                    <Plus className="w-6 h-6" />
                    <span className="text-xs font-semibold">{t('diary.form.selectPhoto')}</span>
                  </button>
                )}
                <div className="flex-1 text-xs text-muted-foreground space-y-1">
                  <p>{t('diary.newDialog.mainPhotoHint1')}</p>
                  <p>{t('diary.newDialog.mainPhotoHint2')}</p>
                  <p>{t('diary.newDialog.mainPhotoHint3')}</p>
                </div>
              </div>
              <input ref={mainFileInputRef} type="file" accept="image/*" onChange={e => handleMainPhotoUpload(e, false)} className="hidden" />
            </div>

            {/* Photos */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Camera className="w-4 h-4" /> {t('diary.blogEditor.addMedia')}
                </label>
                <div className="flex bg-secondary p-1 rounded-lg">
                  <button
                    onClick={() => setNewDisplayMode('grid')}
                    className={cn(
                      "text-[10px] px-2 py-1 rounded-md transition",
                      newDisplayMode === 'grid' ? "bg-card text-primary shadow-sm font-bold" : "text-muted-foreground"
                    )}
                  >
                    {t('diary.displayMode.grid')}
                  </button>
                  <button
                    onClick={() => setNewDisplayMode('slide')}
                    className={cn(
                      "text-[10px] px-2 py-1 rounded-md transition",
                      newDisplayMode === 'slide' ? "bg-card text-primary shadow-sm font-bold" : "text-muted-foreground"
                    )}
                  >
                    {t('diary.displayMode.slide')}
                  </button>
                  <button
                    onClick={() => setNewDisplayMode('blog')}
                    className={cn(
                      "text-[10px] px-2 py-1 rounded-md transition",
                      newDisplayMode === 'blog' ? "bg-card text-primary shadow-sm font-bold" : "text-muted-foreground"
                    )}
                  >
                    {t('diary.displayMode.blog')}
                  </button>
                </div>
              </div>

              {newDisplayMode === 'blog' ? (
                <div className="space-y-4 border-2 border-dashed border-primary/20 p-4 rounded-xl bg-primary/5">
                  <p className="text-xs text-primary font-bold mb-2">{t('diary.blogEditor.newHint')}</p>
                  {newBlocks.map((block, index) => (
                    <div key={block.id} className="relative group bg-card p-3 rounded-lg shadow-sm border border-border">
                      {block.type === 'text' ? (
                        <Textarea
                          placeholder={t('diary.blogEditor.newContentPlaceholder')}
                          value={block.content}
                          onChange={e => handleUpdateBlock(block.id, e.target.value)}
                          className="min-h-[100px] border-none focus-visible:ring-0 p-0 shadow-none text-sm"
                        />
                      ) : block.type === 'video' ? (
                        <div className="space-y-2">
                          <video src={block.content} controls className="w-full max-h-60 rounded-lg bg-slate-50" />
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <img src={block.content} alt="" className="w-full max-h-60 object-contain rounded-lg bg-slate-50" />
                        </div>
                      )}
                      <div className="absolute -right-2 -top-2 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleDeleteBlock(block.id)}
                          className="bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 justify-center pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddBlock('text')}
                      className="gap-1.5 text-xs h-8"
                    >
                      <Plus className="w-3 h-3" /> {t('diary.blogEditor.addText')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => blockFileInputRef.current?.click()}
                      className="gap-1.5 text-xs h-8"
                    >
                      <ImageIcon className="w-3 h-3" /> {t('diary.blogEditor.addMedia')}
                    </Button>
                    <input ref={blockFileInputRef} type="file" accept="image/*,video/*" onChange={handleBlockImageUpload} className="hidden" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {newPhotos.map(photo => (
                    <div key={photo.id} className="relative group">
                      {photo.type === 'video' ? (
                        <video src={photo.url} controls className="w-full h-20 object-cover rounded-lg border border-border bg-black" />
                      ) : (
                        <img src={photo.url} alt="" className="w-full h-20 object-cover rounded-lg border border-border" />
                      )}
                      <button
                        onClick={() => setNewPhotos(prev => prev.filter(p => p.id !== photo.id))}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="h-20 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                    <span className="text-xs">{t('diary.common.add')}</span>
                  </button>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={e => handlePhotoUpload(e, false)} className="hidden" />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('diary.form.tagsLabel')}</label>
              <Input
                placeholder={t('diary.newDialog.tagsPlaceholder')}
                value={newTags}
                onChange={e => setNewTags(e.target.value)}
                className="h-11"
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-secondary rounded-xl border border-border">
              <div>
                <p className="font-semibold text-foreground text-sm">{t('diary.form.publicLabel')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('diary.form.publicHint')}</p>
              </div>
              <button
                onClick={() => setNewIsPublic(!newIsPublic)}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  newIsPublic ? "bg-primary" : "bg-gray-300"
                )}
              >
                <div className={cn(
                  "w-5 h-5 bg-card rounded-full absolute top-0.5 transition-all shadow",
                  newIsPublic ? "left-6" : "left-0.5"
                )} />
              </button>
            </div>

            <Button onClick={handleCreateDiary} className="w-full bg-primary text-white h-11 text-base font-semibold">
              <BookOpen className="w-4 h-4 mr-2" /> {t('diary.newDialog.submit')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Album Dialog */}
      <Dialog open={showNewAlbumDialog} onOpenChange={setShowNewAlbumDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Camera className="w-5 h-5 text-primary" /> {t('diary.album.newDialog.title')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('diary.album.newDialog.titleLabel')}</label>
              <Input
                placeholder={t('diary.album.newDialog.titlePlaceholder')}
                value={newAlbumTitle}
                onChange={e => setNewAlbumTitle(e.target.value)}
                className="h-11"
              />
            </div>

            {userPlans.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Plane className="w-4 h-4 text-primary" /> {t('diary.newDialog.linkPlan')} <span className="text-muted-foreground font-normal">{t('diary.common.optional')}</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={newAlbumLinkedPlanId}
                    onChange={e => setNewAlbumLinkedPlanId(e.target.value)}
                    className="flex-1 h-11 px-3 py-2 border border-input rounded-md text-sm bg-background"
                  >
                    <option value="">{t('diary.newDialog.noPlanSelected')}</option>
                    {userPlans.map(plan => (
                      <option key={plan.id} value={plan.id}>{plan.title} ({plan.startDate} ~ {plan.endDate})</option>
                    ))}
                  </select>
                  {newAlbumLinkedPlanId && (
                    <Button
                      onClick={() => openPlanPreview(newAlbumLinkedPlanId)}
                      variant="outline"
                      className="h-11 px-4"
                    >
                      {t('diary.common.preview')}
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Camera className="w-4 h-4" /> {t('diary.album.photosLabel')}
                </label>
                <span className="text-xs text-muted-foreground">{t('diary.album.maxPhotosHint')}</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {newAlbumPhotos.map(photo => (
                  <div key={photo.id} className="relative group">
                    {photo.type === 'video' ? (
                      <video src={photo.url} controls className="w-full h-20 object-cover rounded-lg border border-border bg-black" />
                    ) : (
                      <img src={photo.url} alt="" className="w-full h-20 object-cover rounded-lg border border-border" />
                    )}
                    <button
                      onClick={() => setNewAlbumPhotos(prev => prev.filter(p => p.id !== photo.id))}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => openLocationPickerForPhoto(photo.id, 'new')}
                      title={photo.lat !== undefined ? t('diary.album.locationTagged') : t('diary.album.tagLocation')}
                      className={cn(
                        "absolute bottom-1 left-1 rounded-full p-1 transition-colors",
                        photo.lat !== undefined ? "bg-primary text-white" : "bg-black/50 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      )}
                    >
                      <MapPin className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => albumFileInputRef.current?.click()}
                  className="h-20 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-xs">{t('diary.common.add')}</span>
                </button>
              </div>
              <input ref={albumFileInputRef} type="file" accept="image/*,video/*" multiple onChange={e => handleAlbumPhotoUpload(e, false)} className="hidden" />
            </div>

            <Button onClick={handleCreateAlbum} className="w-full bg-primary text-white h-11 text-base font-semibold">
              <Camera className="w-4 h-4 mr-2" /> {t('diary.album.newDialog.submit')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {planPreviewDialog}
      {locationPickerDialog}
    </div>
  );
}

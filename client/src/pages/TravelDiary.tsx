import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus, Trash2, Edit2, Check, X, Image as ImageIcon,
  BookOpen, Camera, MapPin, Star, Calendar, ChevronLeft,
  Heart, Share2, Globe, Lock, ChevronRight, Plane, Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface DiaryPhoto {
  id: string;
  url: string;
  caption?: string;
}

interface DiaryBlock {
  id: string;
  type: 'text' | 'image';
  content: string;
  caption?: string;
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
  createdAt: string;
  updatedAt: string;
  likes: string[];
}

interface TravelPlan {
  id: string;
  userId: string;
  title: string;
  startDate: string;
  endDate: string;
  schedules: any[];
  budgets: any[];
  shoppingList: any[];
}

const EMOJI_RATINGS = ['😞', '😐', '🙂', '😊', '🤩'];

export default function TravelDiary() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const editBlockFileInputRef = useRef<HTMLInputElement>(null);
  const blockFileInputRef = useRef<HTMLInputElement>(null);
  const mainFileInputRef = useRef<HTMLInputElement>(null);
  const mainEditFileInputRef = useRef<HTMLInputElement>(null);

  const loadDiaries = (): DiaryEntry[] => {
    return JSON.parse(localStorage.getItem('travelDiaries') || '[]') as DiaryEntry[];
  };

  const loadUserPlans = (): TravelPlan[] => {
    const all = JSON.parse(localStorage.getItem('travelPlans') || '[]') as TravelPlan[];
    return all.filter(p => p.userId === user?.id);
  };

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

  const loadCurrentDiary = () => {
    const saved = localStorage.getItem('currentDiaryId');
    if (saved) {
      const diaries = JSON.parse(localStorage.getItem('travelDiaries') || '[]') as DiaryEntry[];
      return diaries.find(d => d.id === saved) || null;
    }
    return null;
  };

  const draft = loadDraftForm();

  const [diaries, setDiaries] = useState<DiaryEntry[]>(loadDiaries);
  const [userPlans] = useState<TravelPlan[]>(loadUserPlans);
  const [currentDiary, setCurrentDiary] = useState<DiaryEntry | null>(loadCurrentDiary);
  const [showNewDialog, setShowNewDialog] = useState(draft ? true : false);
  const [isEditing, setIsEditing] = useState(false);

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

  // Edit state
  const [editData, setEditData] = useState<DiaryEntry | null>(null);
  const [editPhotoCaption, setEditPhotoCaption] = useState<string | null>(null);
  const [editTagInput, setEditTagInput] = useState('');
  const [showPlanPreview, setShowPlanPreview] = useState(false);
  const [previewPlanId, setPreviewPlanId] = useState<string | null>(null);

  const myDiaries = diaries.filter(d => d.userId === user?.id);

  
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
      localStorage.setItem('diaryFormDraft', JSON.stringify(draft));
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

  const saveDiaries = (updated: DiaryEntry[]) => {
    localStorage.setItem('travelDiaries', JSON.stringify(updated));
    setDiaries(updated);
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
      toast.error('사진은 최대 15장까지 업로드 가능합니다.');
      return;
    }

    const toastId = toast.loading('사진을 처리 중입니다...');
    
    try {
      for (const file of files) {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.readAsDataURL(file);
        });
        
        const compressed = await compressImage(base64);
        const photo: DiaryPhoto = {
          id: Date.now().toString() + Math.random(),
          url: compressed,
          caption: '',
        };

        if (isEdit && editData) {
          const currentPhotos = editData.photos || [];
          const currentBlocks = editData.blocks || (editData.content ? [{ id: '1', type: 'text', content: editData.content }] : []);
          
          if (editData.displayMode === 'blog') {
            const newBlock: DiaryBlock = { id: Date.now().toString() + Math.random(), type: 'image', content: compressed };
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
      toast.success('사진이 추가되었습니다!', { id: toastId });
    } catch (error) {
      toast.error('사진 업로드 중 에러가 발생했습니다.', { id: toastId });
    }
    e.target.value = '';
  };

  const handleAddBlock = (type: 'text' | 'image', imageUrl?: string) => {
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

    const toastId = toast.loading('이미지를 처리 중입니다...');
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = (event) => resolve(event.target?.result as string);
        reader.readAsDataURL(file);
      });
      const compressed = await compressImage(base64);
      
      const photo: DiaryPhoto = {
        id: Date.now().toString() + Math.random(),
        url: compressed,
        caption: '',
      };
      
      setNewPhotos(prev => [...prev, photo]);
      handleAddBlock('image', compressed);
      
      toast.success('이미지가 추가되었습니다!', { id: toastId });
    } catch (error) {
      toast.error('이미지 처리 중 에러가 발생했습니다.', { id: toastId });
    }
    e.target.value = '';
  };

  const handleEditBlockImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading('이미지를 처리 중입니다...');
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = (event) => resolve(event.target?.result as string);
        reader.readAsDataURL(file);
      });
      const compressed = await compressImage(base64);

      const photo: DiaryPhoto = {
        id: Date.now().toString() + Math.random(),
        url: compressed,
        caption: '',
      };

      const newBlock: DiaryBlock = {
        id: Date.now().toString() + Math.random(),
        type: 'image',
        content: compressed,
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

      toast.success('이미지가 추가되었습니다!', { id: toastId });
    } catch (error) {
      toast.error('이미지 처리 중 에러가 발생했습니다.', { id: toastId });
    }
    e.target.value = '';
  };

  const handleMainPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading('메인 사진을 처리 중입니다...');
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = (event) => resolve(event.target?.result as string);
        reader.readAsDataURL(file);
      });
      const compressed = await compressImage(base64);
      const photo: DiaryPhoto = {
        id: Date.now().toString(),
        url: compressed,
      };

      if (isEdit && editData) {
        setEditData({ ...editData, mainPhoto: photo });
      } else {
        setNewMainPhoto(photo);
      }
      toast.success('메인 사진이 설정되었습니다!', { id: toastId });
    } catch (error) {
      toast.error('메인 사진 처리 중 에러가 발생했습니다.', { id: toastId });
    }
    e.target.value = '';
  };

  const handleCreateDiary = () => {
    if (!newTitle.trim() || !newLocation.trim() || !newStartDate) {
      toast.error('제목, 장소, 날짜는 필수입니다.');
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      likes: [],
    };

    saveDiaries([diary, ...diaries]);
    resetNewForm();
    setNewBlocks([{ id: '1', type: 'text', content: '' }]);
    setShowNewDialog(false);
    localStorage.removeItem('diaryFormDraft');
    toast.success('여행 기록이 업로드되었습니다!');
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
    toast.success('기록이 삭제되었습니다.');
  };

  const handleSaveEdit = () => {
    if (!editData) return;
    const updated = diaries.map(d => d.id === editData.id ? { ...editData, updatedAt: new Date().toISOString() } : d);
    saveDiaries(updated);
    setCurrentDiary(editData);
    setIsEditing(false);
    toast.success('기록이 수정되었습니다!');
  };

  const handleToggleLike = (diaryId: string) => {
    const updated = diaries.map(d => {
      if (d.id !== diaryId) return d;
      const likes = d.likes.includes(user!.id)
        ? d.likes.filter(id => id !== user!.id)
        : [...d.likes, user!.id];
      return { ...d, likes };
    });
    saveDiaries(updated);
    if (currentDiary?.id === diaryId) {
      const found = updated.find(d => d.id === diaryId);
      if (found) setCurrentDiary(found);
    }
  };

  if (currentDiary) {
    const diary = diaries.find(d => d.id === currentDiary.id) || currentDiary;
    const isOwner = diary.userId === user?.id;

    if (isEditing && editData) {
      return (
        <div className="min-h-screen bg-background pb-16">
          <div className="container mx-auto px-4 py-8 max-w-3xl">
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => { setIsEditing(false); setEditData(null); }}
                className="text-primary font-semibold text-sm hover:underline flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> 취소
              </button>
              <h2 className="text-xl font-bold text-foreground">기록 수정</h2>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">제목 *</label>
                  <Input value={editData.title} onChange={e => setEditData({ ...editData, title: e.target.value })} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">여행지 *</label>
                  <Input value={editData.location} onChange={e => setEditData({ ...editData, location: e.target.value })} className="h-11" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">시작일</label>
                  <Input type="date" value={editData.startDate} onChange={e => setEditData({ ...editData, startDate: e.target.value })} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">종료일</label>
                  <Input type="date" value={editData.endDate} onChange={e => setEditData({ ...editData, endDate: e.target.value })} className="h-11" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">여행 후기 *</label>
                {editData.displayMode === 'blog' ? (
                  <div className="space-y-4 border-2 border-dashed border-primary/20 p-4 rounded-xl bg-primary/5">
                    <p className="text-xs text-primary font-bold mb-2">💡 블로그형 에디터: 글과 사진을 자유롭게 수정하세요!</p>
                    {(editData.blocks || [{ id: '1', type: 'text', content: editData.content }]).map((block) => (
                      <div key={block.id} className="relative group bg-white p-3 rounded-lg shadow-sm border border-border">
                        {block.type === 'text' ? (
                          <Textarea
                            placeholder="내용 입력..."
                            value={block.content}
                            onChange={e => {
                              const blocks = (editData.blocks || []).map(b => b.id === block.id ? { ...b, content: e.target.value } : b);
                              setEditData({ ...editData, blocks });
                            }}
                            className="min-h-[80px] border-none focus-visible:ring-0 p-0 shadow-none text-sm"
                          />
                        ) : (
                          <img src={block.content} alt="" className="w-full max-h-40 object-contain rounded-lg bg-slate-50" />
                        )}
                        <button
                          onClick={() => {
                            const blocks = (editData.blocks || []).filter(b => b.id !== block.id);
                            setEditData({ ...editData, blocks: blocks.length ? blocks : [{ id: '1', type: 'text', content: '' }] });
                          }}
                          className="absolute -right-2 -top-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
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
                      }} className="h-8 text-xs"><Plus className="w-3 h-3 mr-1" /> 글 추가</Button>
                      <Button variant="outline" size="sm" onClick={() => editBlockFileInputRef.current?.click()} className="h-8 text-xs"><ImageIcon className="w-3 h-3 mr-1" /> 사진 추가</Button>
                      <input ref={editBlockFileInputRef} type="file" accept="image/*" onChange={handleEditBlockImageUpload} className="hidden" />
                    </div>
                  </div>
                ) : (
                  <Textarea
                    value={editData.content}
                    onChange={e => setEditData({ ...editData, content: e.target.value })}
                    className="min-h-[200px] resize-y"
                    placeholder="여행의 추억을 기록해보세요..."
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">별점</label>
                <div className="flex gap-2">
                  {EMOJI_RATINGS.map((emoji, i) => (
                    <button
                      key={i}
                      onClick={() => setEditData({ ...editData, rating: i + 1 })}
                      className={cn(
                        "text-3xl transition-all hover:scale-110",
                        editData.rating === i + 1 ? "scale-125" : "opacity-50"
                      )}
                    >
                      {emoji}
                    </button>
                  ))}
                  <span className="ml-3 text-sm text-muted-foreground self-center font-semibold">{editData.rating}/5</span>
                </div>
              </div>

              {/* Photos */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Camera className="w-4 h-4" /> 사진
                  </label>
                  <div className="flex bg-secondary p-1 rounded-lg">
                    <button
                      onClick={() => setEditData({ ...editData, displayMode: 'grid' })}
                      className={cn(
                        "text-[10px] px-2 py-1 rounded-md transition",
                        editData.displayMode === 'grid' ? "bg-white text-primary shadow-sm font-bold" : "text-muted-foreground"
                      )}
                    >
                      바둑판형
                    </button>
                    <button
                      onClick={() => setEditData({ ...editData, displayMode: 'slide' })}
                      className={cn(
                        "text-[10px] px-2 py-1 rounded-md transition",
                        editData.displayMode === 'slide' ? "bg-white text-primary shadow-sm font-bold" : "text-muted-foreground"
                      )}
                    >
                      슬라이드형
                    </button>
                    <button
                      onClick={() => setEditData({ ...editData, displayMode: 'blog' })}
                      className={cn(
                        "text-[10px] px-2 py-1 rounded-md transition",
                        editData.displayMode === 'blog' ? "bg-white text-primary shadow-sm font-bold" : "text-muted-foreground"
                      )}
                    >
                      블로그형
                    </button>
                  </div>
                </div>

                {/* Main Photo (Max 1) - Edit Mode */}
                <div className="space-y-3 p-4 bg-primary/5 rounded-xl border border-primary/10 mb-4">
                  <label className="text-sm font-bold text-primary flex items-center gap-2">
                    <Star className="w-4 h-4 fill-primary" /> 메인 사진 (대표 이미지 1장)
                  </label>
                  <div className="flex items-center gap-4">
                    {editData.mainPhoto ? (
                      <div className="relative group w-24 h-24">
                        <img src={editData.mainPhoto.url} alt="메인 사진" className="w-full h-full object-cover rounded-lg border-2 border-primary shadow-sm" />
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
                        <span className="text-[10px] font-semibold">사진 선택</span>
                      </button>
                    )}
                    <input ref={mainEditFileInputRef} type="file" accept="image/*" onChange={e => handleMainPhotoUpload(e, true)} className="hidden" />
                    <div className="flex-1 text-[11px] text-muted-foreground">
                      <p>기록의 썸네일로 사용되는 대표 사진입니다.</p>
                    </div>
                  </div>
                </div>

                {editData.displayMode !== 'blog' ? (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      {editData.photos.map(photo => (
                        <div key={photo.id} className="relative group">
                          <img src={photo.url} alt={photo.caption || ''} className="w-full h-28 object-cover rounded-lg border border-border bg-gray-100" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex flex-col justify-end p-2">
                            <input
                              type="text"
                              value={photo.caption || ''}
                              onChange={e => {
                                const photos = editData.photos.map(p => p.id === photo.id ? { ...p, caption: e.target.value } : p);
                                setEditData({ ...editData, photos });
                              }}
                              placeholder="설명 추가..."
                              className="text-xs bg-white/90 rounded px-2 py-1 w-full"
                              onClick={e => e.stopPropagation()}
                            />
                          </div>
                          <button
                            onClick={() => setEditData({ ...editData, photos: editData.photos.filter(p => p.id !== photo.id) })}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
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
                        <span className="text-xs">추가</span>
                      </button>
                    </div>
                    <input ref={editFileInputRef} type="file" accept="image/*" multiple onChange={e => handlePhotoUpload(e, true)} className="hidden" />
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground mt-2 p-3 bg-primary/5 rounded-lg border border-primary/10">
                    💡 블로그형 모드에서는 위 본문 에디터의 <strong className="text-primary">사진 추가</strong> 버튼으로 사진을 추가할 수 있습니다.
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">태그</label>
                <div className="flex gap-2">
                  <Input
                    value={editTagInput}
                    onChange={e => setEditTagInput(e.target.value)}
                    placeholder="태그 입력 후 엔터"
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
                      #{tag}
                      <button onClick={() => setEditData({ ...editData, tags: editData.tags.filter((_, idx) => idx !== i) })}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-secondary rounded-xl border border-border">
                <div>
                  <p className="font-semibold text-foreground text-sm">커뮤니티 공개</p>
                  <p className="text-xs text-muted-foreground mt-0.5">다른 여행자들과 이 기록을 공유합니다</p>
                </div>
                <button
                  onClick={() => setEditData({ ...editData, isPublic: !editData.isPublic })}
                  className={cn(
                    "w-12 h-6 rounded-full transition-colors relative",
                    editData.isPublic ? "bg-primary" : "bg-gray-300"
                  )}
                >
                  <div className={cn(
                    "w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all shadow",
                    editData.isPublic ? "left-6" : "left-0.5"
                  )} />
                </button>
              </div>

              <div className="flex gap-3">
                <Button onClick={handleSaveEdit} className="flex-1 bg-primary text-white h-11">
                  <Check className="w-4 h-4 mr-2" /> 저장하기
                </Button>
                <Button onClick={() => { setIsEditing(false); setEditData(null); }} variant="outline" className="flex-1 h-11">
                  취소
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background pb-16">
        {/* Hero section with first photo */}
        {diary.mainPhoto || diary.photos.length > 0 ? (
          <div className="relative h-[500px] w-full bg-slate-900 overflow-hidden">
            <img src={diary.mainPhoto ? diary.mainPhoto.url : diary.photos[0].url} alt={diary.title} className="w-full h-full object-contain" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <button
              onClick={() => setCurrentDiary(null)}
              className="absolute top-4 left-4 text-white flex items-center gap-1 font-semibold text-sm bg-black/30 px-3 py-1.5 rounded-full hover:bg-black/50 transition"
            >
              <ChevronLeft className="w-4 h-4" /> 목록으로
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
                  {diary.isPublic ? '공개' : '비공개'}
                </span>
              </div>
              <h1 className="text-2xl font-black text-white drop-shadow">{diary.title}</h1>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-primary/20 to-primary/5 pt-6 pb-8 px-4">
            <div className="container mx-auto max-w-3xl">
              <button
                onClick={() => setCurrentDiary(null)}
                className="text-primary font-semibold text-sm hover:underline flex items-center gap-1 mb-4"
              >
                <ChevronLeft className="w-4 h-4" /> 목록으로
              </button>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-muted-foreground text-sm flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-primary" /> {diary.location}
                    </span>
                    <span className="text-muted-foreground text-sm flex items-center gap-1">
                      {diary.isPublic ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                      {diary.isPublic ? '공개' : '비공개'}
                    </span>
                  </div>
                  <h1 className="text-3xl font-black text-foreground">{diary.title}</h1>
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
            <span className="flex items-center gap-1">
              {EMOJI_RATINGS[diary.rating - 1]} {diary.rating}/5
            </span>
            {diary.linkedPlanTitle && (
              <span className="flex items-center gap-1 text-primary font-semibold">
                <Plane className="w-4 h-4" /> {diary.linkedPlanTitle}
              </span>
            )}
            <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {new Date(diary.createdAt).toLocaleDateString('ko-KR')}</span>
          </div>

          {/* Tags */}
          {diary.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {diary.tags.map((tag, i) => (
                <span key={i} className="bg-secondary text-primary font-semibold px-3 py-1 rounded-full text-sm border border-border">
                  #{tag}
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
              <Card className="p-6 mb-6 bg-white border-border shadow-sm">
                <div className="prose max-w-none text-foreground leading-relaxed whitespace-pre-wrap text-[15px]">
                  {diary.content}
                </div>
              </Card>
            </>
          )}

          {/* Photo Gallery */}
          {diary.displayMode !== 'blog' && diary.photos.length > 1 && (
            <div className="mb-6">
              <h3 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
                <Camera className="w-5 h-5 text-primary" /> 사진 ({diary.photos.length}장)
              </h3>
              
              {diary.displayMode === 'slide' ? (
                <div className="space-y-4">
                  {diary.photos.slice(1).map(photo => (
                    <div key={photo.id} className="relative rounded-2xl overflow-hidden shadow-sm border border-border">
                      <img src={photo.url} alt={photo.caption || ''} className="w-full object-contain max-h-[700px] bg-slate-50" />
                      {photo.caption && (
                        <div className="p-4 bg-white border-t border-border">
                          <p className="text-sm text-foreground">{photo.caption}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {diary.photos.slice(1).map(photo => (
                    <div key={photo.id} className="relative group aspect-square">
                      <img src={photo.url} alt={photo.caption || ''} className="w-full h-full object-cover rounded-xl border border-border bg-gray-100" />
                      {photo.caption && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] p-2 rounded-b-xl opacity-0 group-hover:opacity-100 transition-opacity">
                          {photo.caption}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Like button */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <button
              onClick={() => handleToggleLike(diary.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full border transition-all font-semibold text-sm",
                diary.likes.includes(user!.id)
                  ? "bg-red-50 border-red-300 text-red-500"
                  : "bg-white border-border text-muted-foreground hover:border-red-300 hover:text-red-400"
              )}
            >
              <Heart className={cn("w-4 h-4", diary.likes.includes(user!.id) && "fill-red-500")} />
              좋아요 {diary.likes.length > 0 && diary.likes.length}
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                toast.success('링크가 복사되었습니다!');
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-border text-muted-foreground hover:border-primary hover:text-primary transition font-semibold text-sm"
            >
              <Share2 className="w-4 h-4" /> 공유
            </button>
          </div>
        </div>
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
              <BookOpen className="w-8 h-8 text-primary" /> 여행 기록
            </h2>
            <p className="text-muted-foreground mt-1">{user?.name}님의 소중한 여행 추억</p>
          </div>
          <Button
            onClick={() => setShowNewDialog(true)}
            className="gap-2 bg-primary text-white rounded-full px-5"
          >
            <Plus className="w-4 h-4" /> 새 기록 작성
          </Button>
        </div>

        {/* Stats */}
        {myDiaries.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <Card className="p-4 bg-white border-border text-center">
              <p className="text-3xl font-black text-primary">{myDiaries.length}</p>
              <p className="text-sm text-muted-foreground mt-1">총 기록</p>
            </Card>
            <Card className="p-4 bg-white border-border text-center">
              <p className="text-3xl font-black text-primary">
                {[...new Set(myDiaries.map(d => d.location))].length}
              </p>
              <p className="text-sm text-muted-foreground mt-1">방문 장소</p>
            </Card>
            <Card className="p-4 bg-white border-border text-center">
              <p className="text-3xl font-black text-primary">
                {myDiaries.reduce((sum, d) => sum + d.photos.length, 0)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">총 사진</p>
            </Card>
          </div>
        )}

        {/* Diaries list */}
        {myDiaries.length === 0 ? (
          <Card className="p-16 flex flex-col items-center justify-center border-dashed border-2 border-border bg-white/50">
            <BookOpen className="w-16 h-16 text-border mb-4" />
            <h3 className="text-xl font-bold text-foreground mb-2">아직 여행 기록이 없어요</h3>
            <p className="text-muted-foreground mb-6 text-center">여행을 다녀오셨나요? 소중한 추억을 기록해보세요!</p>
            <Button onClick={() => setShowNewDialog(true)} className="bg-primary text-white rounded-full px-6">
              첫 기록 작성하기
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {myDiaries
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map(diary => (
                <Card
                  key={diary.id}
                  className="group cursor-pointer hover:shadow-xl transition-all border-border bg-white overflow-hidden"
                  onClick={() => setCurrentDiary(diary)}
                >
                  {(diary.mainPhoto || diary.photos.length > 0) ? (
                    <div className="relative h-48 overflow-hidden">
                      <img
                        src={diary.mainPhoto?.url || diary.photos[0].url}
                        alt={diary.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute top-2 right-2 flex gap-1">
                        {!diary.isPublic && (
                          <span className="bg-black/50 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Lock className="w-3 h-3" /> 비공개
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
                      <span className="text-xl ml-2 flex-shrink-0">{EMOJI_RATINGS[diary.rating - 1]}</span>
                    </div>
                    <p className="text-muted-foreground text-sm line-clamp-2 mb-3">{diary.content}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {diary.startDate}
                      </span>
                      <span className="flex items-center gap-1">
                        <Heart className="w-3 h-3" /> {diary.likes.length}
                      </span>
                    </div>
                    {diary.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {diary.tags.slice(0, 3).map((tag, i) => (
                          <span key={i} className="bg-secondary text-primary text-xs px-2 py-0.5 rounded-full">#{tag}</span>
                        ))}
                        {diary.tags.length > 3 && <span className="text-xs text-muted-foreground">+{diary.tags.length - 3}</span>}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
          </div>
        )}
      </div>

      {/* New Diary Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <BookOpen className="w-5 h-5 text-primary" /> 새 여행 기록
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">제목 *</label>
                <Input
                  placeholder="예: 도쿄 3박 4일 - 설렘 가득했던 여행"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">여행지 *</label>
                <Input
                  placeholder="예: 도쿄, 일본"
                  value={newLocation}
                  onChange={e => setNewLocation(e.target.value)}
                  className="h-11"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">시작일 *</label>
                <Input type="date" value={newStartDate} onChange={e => setNewStartDate(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">종료일</label>
                <Input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} className="h-11" />
              </div>
            </div>

            {/* Link to existing plan */}
            {userPlans.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Plane className="w-4 h-4 text-primary" /> 여행 계획 연결 <span className="text-muted-foreground font-normal">(선택)</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={newLinkedPlanId}
                    onChange={e => setNewLinkedPlanId(e.target.value)}
                    className="flex-1 h-11 px-3 py-2 border border-input rounded-md text-sm bg-background"
                  >
                    <option value="">계획 선택 안함</option>
                    {userPlans.map(plan => (
                      <option key={plan.id} value={plan.id}>{plan.title} ({plan.startDate} ~ {plan.endDate})</option>
                    ))}
                  </select>
                  {newLinkedPlanId && (
                    <Button
                      onClick={() => { setPreviewPlanId(newLinkedPlanId); setShowPlanPreview(true); }}
                      variant="outline"
                      className="h-11 px-4"
                    >
                      미리보기
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">여행 후기 *</label>
              <Textarea
                placeholder="여행의 추억, 감동, 팁 등을 자유롭게 작성해보세요..."
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                className="min-h-[160px] resize-y"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">만족도</label>
              <div className="flex gap-3">
                {EMOJI_RATINGS.map((emoji, i) => (
                  <button
                    key={i}
                    onClick={() => setNewRating(i + 1)}
                    className={cn(
                      "text-3xl transition-all hover:scale-110",
                      newRating === i + 1 ? "scale-125" : "opacity-40"
                    )}
                    title={['별로', '그저그래', '괜찮아', '좋아', '최고'][i]}
                  >
                    {emoji}
                  </button>
                ))}
                <span className="ml-2 text-sm text-muted-foreground self-center font-semibold">{newRating}/5</span>
              </div>
            </div>

            {/* Main Photo (Max 1) */}
            <div className="space-y-3 p-4 bg-primary/5 rounded-xl border border-primary/10">
              <label className="text-sm font-bold text-primary flex items-center gap-2">
                <Star className="w-4 h-4 fill-primary" /> 메인 사진 (대표 이미지 1장)
              </label>
              <div className="flex items-center gap-4">
                {newMainPhoto ? (
                  <div className="relative group w-32 h-32">
                    <img src={newMainPhoto.url} alt="메인 사진" className="w-full h-full object-cover rounded-lg border-2 border-primary shadow-md" />
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
                    <span className="text-xs font-semibold">사진 선택</span>
                  </button>
                )}
                <div className="flex-1 text-xs text-muted-foreground space-y-1">
                  <p>• 여행 기록의 썸네일로 사용됩니다.</p>
                  <p>• 최대 1장만 등록 가능합니다.</p>
                  <p>• 등록하지 않으면 기본 이미지가 노출됩니다.</p>
                </div>
              </div>
              <input ref={mainFileInputRef} type="file" accept="image/*" onChange={e => handleMainPhotoUpload(e, false)} className="hidden" />
            </div>

            {/* Photos */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Camera className="w-4 h-4" /> 사진 추가
                </label>
                <div className="flex bg-secondary p-1 rounded-lg">
                  <button
                    onClick={() => setNewDisplayMode('grid')}
                    className={cn(
                      "text-[10px] px-2 py-1 rounded-md transition",
                      newDisplayMode === 'grid' ? "bg-white text-primary shadow-sm font-bold" : "text-muted-foreground"
                    )}
                  >
                    바둑판형
                  </button>
                  <button
                    onClick={() => setNewDisplayMode('slide')}
                    className={cn(
                      "text-[10px] px-2 py-1 rounded-md transition",
                      newDisplayMode === 'slide' ? "bg-white text-primary shadow-sm font-bold" : "text-muted-foreground"
                    )}
                  >
                    슬라이드형
                  </button>
                  <button
                    onClick={() => setNewDisplayMode('blog')}
                    className={cn(
                      "text-[10px] px-2 py-1 rounded-md transition",
                      newDisplayMode === 'blog' ? "bg-white text-primary shadow-sm font-bold" : "text-muted-foreground"
                    )}
                  >
                    블로그형
                  </button>
                </div>
              </div>
              
              {newDisplayMode === 'blog' ? (
                <div className="space-y-4 border-2 border-dashed border-primary/20 p-4 rounded-xl bg-primary/5">
                  <p className="text-xs text-primary font-bold mb-2">💡 네이버 블로그 스타일: 글과 사진을 자유롭게 배치하세요!</p>
                  {newBlocks.map((block, index) => (
                    <div key={block.id} className="relative group bg-white p-3 rounded-lg shadow-sm border border-border">
                      {block.type === 'text' ? (
                        <Textarea
                          placeholder="여기에 내용을 입력하세요..."
                          value={block.content}
                          onChange={e => handleUpdateBlock(block.id, e.target.value)}
                          className="min-h-[100px] border-none focus-visible:ring-0 p-0 shadow-none text-sm"
                        />
                      ) : (
                        <div className="space-y-2">
                          <img src={block.content} alt="" className="w-full max-h-60 object-contain rounded-lg bg-slate-50" />
                        </div>
                      )}
                      <div className="absolute -right-2 -top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                      <Plus className="w-3 h-3" /> 글 추가
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => blockFileInputRef.current?.click()}
                      className="gap-1.5 text-xs h-8"
                    >
                      <ImageIcon className="w-3 h-3" /> 사진 추가
                    </Button>
                    <input ref={blockFileInputRef} type="file" accept="image/*" onChange={handleBlockImageUpload} className="hidden" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {newPhotos.map(photo => (
                    <div key={photo.id} className="relative group">
                      <img src={photo.url} alt="" className="w-full h-20 object-cover rounded-lg border border-border" />
                      <button
                        onClick={() => setNewPhotos(prev => prev.filter(p => p.id !== photo.id))}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
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
                    <span className="text-xs">추가</span>
                  </button>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={e => handlePhotoUpload(e, false)} className="hidden" />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">태그</label>
              <Input
                placeholder="쉼표로 구분: 일본, 맛집여행, 혼행"
                value={newTags}
                onChange={e => setNewTags(e.target.value)}
                className="h-11"
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-secondary rounded-xl border border-border">
              <div>
                <p className="font-semibold text-foreground text-sm">커뮤니티 공개</p>
                <p className="text-xs text-muted-foreground mt-0.5">다른 여행자들과 이 기록을 공유합니다</p>
              </div>
              <button
                onClick={() => setNewIsPublic(!newIsPublic)}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  newIsPublic ? "bg-primary" : "bg-gray-300"
                )}
              >
                <div className={cn(
                  "w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all shadow",
                  newIsPublic ? "left-6" : "left-0.5"
                )} />
              </button>
            </div>

            <Button onClick={handleCreateDiary} className="w-full bg-primary text-white h-11 text-base font-semibold">
              <BookOpen className="w-4 h-4 mr-2" /> 기록 저장하기
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Plan Preview Dialog */}
      <Dialog open={showPlanPreview} onOpenChange={setShowPlanPreview}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Plane className="w-5 h-5 text-primary" />
              {userPlans.find(p => p.id === previewPlanId)?.title} - 미리보기
            </DialogTitle>
          </DialogHeader>
          {previewPlanId && userPlans.find(p => p.id === previewPlanId) && (() => {
            const plan = userPlans.find(p => p.id === previewPlanId)!;
            const getCategoryColor = (category: string) => {
              const colors: Record<string, string> = {
                accommodation: 'bg-secondary text-foreground',
                transport: 'bg-secondary text-foreground',
                meal: 'bg-emerald-100 text-emerald-800',
                activity: 'bg-indigo-100 text-indigo-800',
                shopping: 'bg-orange-100 text-orange-800',
                other: 'bg-slate-100 text-slate-800',
              };
              return colors[category] || colors.other;
            };
            const getCategoryLabel = (category: string) => {
              const labels: Record<string, string> = {
                accommodation: '숙소', transport: '교통', meal: '식사',
                activity: '활동', shopping: '쇼핑', other: '기타',
              };
              return labels[category] || '기타';
            };
            return (
              <div className="space-y-4 pt-2">
                {/* 기본 정보 */}
                <div className="p-4 bg-secondary rounded-xl border border-border">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider mb-1">여행 기간</p>
                      <p className="font-bold text-foreground">{plan.startDate} ~ {plan.endDate}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider mb-1">총 예산</p>
                      <p className="font-bold text-primary text-lg">₩{plan.budgets.reduce((s: number, b: any) => s + b.amount, 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider mb-1">일정 수</p>
                      <p className="font-bold text-foreground">{plan.schedules.length}개</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider mb-1">쇼핑 목록</p>
                      <p className="font-bold text-foreground">{plan.shoppingList.filter((i: any) => i.checked).length}/{plan.shoppingList.length} 완료</p>
                    </div>
                  </div>
                </div>

                {/* 전체 일정 미리보기 */}
                {plan.schedules.length > 0 && (
                  <div>
                    <h4 className="font-bold text-foreground mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary" />
                      전체 일정 ({plan.schedules.length}개)
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {plan.schedules
                        .sort((a: any, b: any) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
                        .map((s: any) => (
                          <div key={s.id} className="flex items-center gap-3 p-2 bg-secondary rounded-lg text-sm">
                            <span className="text-muted-foreground font-mono text-xs w-20 flex-shrink-0">{s.date}</span>
                            <span className="text-sky-500 font-mono text-xs w-12 flex-shrink-0">{s.time}</span>
                            <span className={cn("px-1.5 py-0.5 rounded text-xs font-bold flex-shrink-0", getCategoryColor(s.category))}>
                              {getCategoryLabel(s.category)}
                            </span>
                            <span className="font-semibold text-foreground truncate">{s.title}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* 버튼 */}
                <Button
                  onClick={() => setShowPlanPreview(false)}
                  variant="outline"
                  className="w-full"
                >
                  닫기
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

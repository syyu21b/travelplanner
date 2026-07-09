import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Calendar as CalendarUI } from '@/components/ui/calendar';
import {
  Plus, Trash2, Download, Share2, MapPin, DollarSign,
  Link as LinkIcon, Clock, Calendar, Edit2, Check, X,
  Image as ImageIcon, Plane, Map, Info, LogOut, User,
  ChevronRight, Eye, BookOpen, Globe, Shield, Crown,
  TrendingUp, Heart, MessageCircle, Star,
  Search, ChevronDown, Camera
} from 'lucide-react';
import { toast } from 'sonner';
import * as QRCodeLib from 'qrcode.react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Link, useLocation } from 'wouter';
import { MapView, type MapMarker } from '@/components/Map';
import { LocationPickerDialog } from '@/components/LocationPickerDialog';
import { WeatherWidget } from '@/components/WeatherWidget';
import { useLanguage } from '@/contexts/LanguageContext';
import NotificationBell from '@/components/NotificationBell';

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

interface Budget {
  id: string;
  category: 'accommodation' | 'transport' | 'meal' | 'activity' | 'shopping' | 'other';
  amount: number;
  description: string;
}

interface ShoppingItem {
  id: string;
  item: string;
  checked: boolean;
  imageUrl?: string;
  link?: string;
}

interface TravelPlan {
  id: string;
  userId: string;
  title: string;
  startDate: string;
  endDate: string;
  coverPhoto?: string;
  schedules: ScheduleItem[];
  budgets: Budget[];
  shoppingList: ShoppingItem[];
}

function compressPlanCoverPhoto(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1400;
        let { width, height } = img;
        if (width > height) {
          if (width > MAX) { height = Math.round(height * MAX / width); width = MAX; }
        } else {
          if (height > MAX) { width = Math.round(width * MAX / height); height = MAX; }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function schedulesOverlap(aDate: string, aStart: string, aEnd: string | undefined, b: ScheduleItem): boolean {
  if (!aDate || !aStart || aDate !== b.date) return false;
  const s1 = aStart, e1 = aEnd || aStart;
  const s2 = b.time, e2 = b.endTime || b.time;
  return s1 < e2 && s2 < e1;
}

export default function Home() {
  const { t } = useLanguage();

  // 환율 계산기 상태 및 함수
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [exchangeRates] = useState<Record<string, number>>({
    'USD': 1/1380, 'EUR': 1/1480, 'GBP': 1/1750, 'JPY': 100/900, 'CNY': 1/190,
    'THB': 1/38, 'VND': 1/0.055, 'PHP': 1/24, 'IDR': 1/0.088, 'MYR': 1/290
  });

  const formatCurrency = (amount: number): string => {
    const rate = exchangeRates[selectedCurrency] || 1;
    const converted = amount * rate;
    const symbols: Record<string, string> = {
      'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥', 'CNY': '¥',
      'THB': '฿', 'VND': '₫', 'PHP': '₱', 'IDR': 'Rp', 'MYR': 'RM'
    };
    const flags: Record<string, string> = {
      'USD': '🇺🇸', 'EUR': '🇪🇺', 'GBP': '🇬🇧', 'JPY': '🇯🇵', 'CNY': '🇨🇳',
      'THB': '🇹🇭', 'VND': '🇻🇳', 'PHP': '🇵🇭', 'IDR': '🇮🇩', 'MYR': '🇲🇾'
    };
    const symbol = symbols[selectedCurrency] || selectedCurrency;
    const flag = flags[selectedCurrency] || '';
    return `${flag} ${symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  const { user, logout, getProfilePhoto } = useAuth();
  const profilePhoto = user ? getProfilePhoto(user.id) : null;

  // 유저별 여행 계획 로드
  const loadUserPlans = (): TravelPlan[] => {
    const all = JSON.parse(localStorage.getItem('travelPlans') || '[]') as TravelPlan[];
    return all.filter(p => p.userId === user?.id);
  };

  const [travelPlans, setTravelPlans] = useState<TravelPlan[]>(loadUserPlans);
  
  // 새로고침 시 현재 계획 유지
  const loadCurrentPlan = (): TravelPlan | null => {
    const savedId = localStorage.getItem('currentPlanId');
    if (savedId) {
      const all = loadUserPlans();
      return all.find(p => p.id === savedId) || null;
    }
    return null;
  };

  const [currentPlan, setCurrentPlan] = useState<TravelPlan | null>(loadCurrentPlan);
  const [isPlanLoading, setIsPlanLoading] = useState(false);
  
  // 작성 중인 계획 로드
  const loadPlanDraft = () => {
    const draft = localStorage.getItem('planFormDraft');
    if (draft) {
      try {
        return JSON.parse(draft);
      } catch {
        return null;
      }
    }
    return null;
  };
  const planDraft = loadPlanDraft();

  const [showNewPlanDialog, setShowNewPlanDialog] = useState(planDraft ? true : false);
  const [newPlanTitle, setNewPlanTitle] = useState(planDraft?.title || '');
  const [newPlanStartDate, setNewPlanStartDate] = useState(planDraft?.startDate || '');
  const [newPlanEndDate, setNewPlanEndDate] = useState(planDraft?.endDate || '');

  // 제목 수정 상태
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');

  // 날짜 수정 상태
  const [editingDates, setEditingDates] = useState(false);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');

  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editingShoppingId, setEditingShoppingId] = useState<string | null>(null);
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcPrevValue, setCalcPrevValue] = useState<number>(0);
  const [calcOperation, setCalcOperation] = useState<string | null>(null);
  
  // 환율 계산기 상태
  
  const [showShareModal, setShowShareModal] = useState(false);

  // 메인 홈 달력 상태
  const [homeCalendarDate, setHomeCalendarDate] = useState<Date | undefined>(new Date());
  const [previewPlan, setPreviewPlan] = useState<TravelPlan | null>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [planFilter, setPlanFilter] = useState<'all' | '진행 중' | '예정' | '완료'>('all');

  // 계획 상세 달력 상태
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const pdfRef = useRef<HTMLDivElement>(null);
  const scheduleMapRef = useRef<naver.maps.Map | null>(null);
  const planPhotoInputRef = useRef<HTMLInputElement>(null);

  // LocalStorage에 데이터 저장 (유저별)
  const savePlans = (plans: TravelPlan[]) => {
    const all = JSON.parse(localStorage.getItem('travelPlans') || '[]') as TravelPlan[];
    const otherUserPlans = all.filter(p => p.userId !== user?.id);
    localStorage.setItem('travelPlans', JSON.stringify([...otherUserPlans, ...plans]));
  };

  const updateTravelPlans = (plans: TravelPlan[]) => {
    setTravelPlans(plans);
    savePlans(plans);
  };

  // 계산기 키보드 이벤트
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentPlan) return;
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      const key = e.key;
      if (/^[0-9]$/.test(key)) handleCalcNumber(key);
      else if (['+', '-', '*', '/'].includes(key)) { e.preventDefault(); handleCalcOperation(key); }
      else if (key === 'Enter' || key === '=') { e.preventDefault(); handleCalcEquals(); }
      else if (key === 'Backspace') { e.preventDefault(); setCalcDisplay(prev => prev.length === 1 ? '0' : prev.slice(0, -1)); }
      else if (key === 'Escape') handleCalcClear();
      else if (key === '.' && !calcDisplay.includes('.')) setCalcDisplay(prev => prev + '.');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [calcDisplay, calcPrevValue, calcOperation, currentPlan]);

  const handleCreatePlan = () => {
    if (!user) {
      toast.error(t('session.loginRequired'));
      return;
    }
    if (!newPlanTitle || !newPlanStartDate || !newPlanEndDate) {
      toast.error(t('home.toast.fillAllFields'));
      return;
    }
    const newPlan: TravelPlan = {
      id: Date.now().toString(),
      userId: user!.id,
      title: newPlanTitle,
      startDate: newPlanStartDate,
      endDate: newPlanEndDate,
      schedules: [],
      budgets: [],
      shoppingList: [],
    };
    const updated = [...travelPlans, newPlan];
    updateTravelPlans(updated);
    setCurrentPlan(newPlan);
    setNewPlanTitle(''); setNewPlanStartDate(''); setNewPlanEndDate('');
    setShowNewPlanDialog(false);
    toast.success(t('home.toast.planCreated'));
  };

  const updateCurrentPlan = (updatedPlan: TravelPlan) => {
    setCurrentPlan(updatedPlan);
    localStorage.setItem('currentPlanId', updatedPlan.id);
    const updated = travelPlans.map(p => p.id === updatedPlan.id ? updatedPlan : p);
    updateTravelPlans(updated);
  };

  // currentPlan 변경 시 ID 저장
  useEffect(() => {
    if (currentPlan) {
      localStorage.setItem('currentPlanId', currentPlan.id);
    } else {
      localStorage.removeItem('currentPlanId');
    }
  }, [currentPlan]);

  // 작성 중인 계획 자동 저장
  useEffect(() => {
    if (showNewPlanDialog) {
      const draft = {
        title: newPlanTitle,
        startDate: newPlanStartDate,
        endDate: newPlanEndDate,
      };
      localStorage.setItem('planFormDraft', JSON.stringify(draft));
    } else {
      localStorage.removeItem('planFormDraft');
    }
  }, [newPlanTitle, newPlanStartDate, newPlanEndDate, showNewPlanDialog]);

  // 제목 수정
  const handleStartEditTitle = () => {
    if (!currentPlan) return;
    setEditTitleValue(currentPlan.title);
    setEditingTitle(true);
  };

  const handleSaveTitle = () => {
    if (!currentPlan || !editTitleValue.trim()) {
      toast.error(t('home.toast.enterTitle'));
      return;
    }
    updateCurrentPlan({ ...currentPlan, title: editTitleValue.trim() });
    setEditingTitle(false);
    toast.success(t('home.toast.titleUpdated'));
  };

  const handleCancelEditTitle = () => {
    setEditingTitle(false);
    setEditTitleValue('');
  };

  // 날짜 수정
  const handleStartEditDates = () => {
    if (!currentPlan) return;
    setEditStartDate(currentPlan.startDate);
    setEditEndDate(currentPlan.endDate);
    setEditingDates(true);
  };

  const handleSaveDates = () => {
    if (!currentPlan || !editStartDate || !editEndDate) {
      toast.error(t('home.toast.enterBothDates'));
      return;
    }
    if (editStartDate > editEndDate) {
      toast.error(t('home.toast.endBeforeStart'));
      return;
    }
    updateCurrentPlan({ ...currentPlan, startDate: editStartDate, endDate: editEndDate });
    setEditingDates(false);
    toast.success(t('home.toast.datesUpdated'));
  };

  const handleCancelEditDates = () => {
    setEditingDates(false);
    setEditStartDate('');
    setEditEndDate('');
  };

  // 여행 대표 사진 업로드
  const handlePlanPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentPlan) return;
    if (!file.type.startsWith('image/')) {
      toast.error(t('home.toast.imageFilesOnly'));
      return;
    }
    const compressed = await compressPlanCoverPhoto(file);
    updateCurrentPlan({ ...currentPlan, coverPhoto: compressed });
    toast.success(t('home.toast.coverPhotoSet'));
  };

  const handleAddSchedule = (schedule: ScheduleItem) => {
    if (!currentPlan) return;
    updateCurrentPlan({ ...currentPlan, schedules: [...currentPlan.schedules, schedule] });
    toast.success(t('home.toast.scheduleAdded'));
  };

  const handleUpdateSchedule = (scheduleId: string, updatedSchedule: ScheduleItem) => {
    if (!currentPlan) return;
    updateCurrentPlan({
      ...currentPlan,
      schedules: currentPlan.schedules.map(s => s.id === scheduleId ? updatedSchedule : s),
    });
    setEditingScheduleId(null);
    toast.success(t('home.toast.scheduleUpdated'));
  };

  const handleDeleteSchedule = (scheduleId: string) => {
    if (!currentPlan) return;
    updateCurrentPlan({
      ...currentPlan,
      schedules: currentPlan.schedules.filter(s => s.id !== scheduleId),
    });
    toast.success(t('home.toast.scheduleDeleted'));
  };

  const handleToggleScheduleComplete = (scheduleId: string) => {
    if (!currentPlan) return;
    updateCurrentPlan({
      ...currentPlan,
      schedules: currentPlan.schedules.map(s => s.id === scheduleId ? { ...s, completed: !s.completed } : s),
    });
  };

  const handleAddBudget = (budget: Budget) => {
    if (!currentPlan) return;
    updateCurrentPlan({ ...currentPlan, budgets: [...currentPlan.budgets, budget] });
    toast.success(t('home.toast.budgetAdded'));
  };

  const handleUpdateBudget = (budgetId: string, updatedBudget: Budget) => {
    if (!currentPlan) return;
    updateCurrentPlan({
      ...currentPlan,
      budgets: currentPlan.budgets.map(b => b.id === budgetId ? updatedBudget : b),
    });
    setEditingBudgetId(null);
    toast.success(t('home.toast.budgetUpdated'));
  };

  const handleDeleteBudget = (budgetId: string) => {
    if (!currentPlan) return;
    updateCurrentPlan({
      ...currentPlan,
      budgets: currentPlan.budgets.filter(b => b.id !== budgetId),
    });
    toast.success(t('home.toast.budgetDeleted'));
  };

  const handleAddShoppingItem = (item: string, imageUrl?: string, link?: string) => {
    if (!currentPlan) return;
    const newItem: ShoppingItem = { id: Date.now().toString(), item, checked: false, imageUrl, link };
    updateCurrentPlan({ ...currentPlan, shoppingList: [...currentPlan.shoppingList, newItem] });
    toast.success(t('home.toast.shoppingItemAdded'));
  };

  const handleUpdateShoppingItem = (itemId: string, updatedItem: ShoppingItem) => {
    if (!currentPlan) return;
    updateCurrentPlan({
      ...currentPlan,
      shoppingList: currentPlan.shoppingList.map(i => i.id === itemId ? updatedItem : i),
    });
    setEditingShoppingId(null);
    toast.success(t('home.toast.shoppingItemUpdated'));
  };

  const handleDeleteShoppingItem = (itemId: string) => {
    if (!currentPlan) return;
    updateCurrentPlan({
      ...currentPlan,
      shoppingList: currentPlan.shoppingList.filter(i => i.id !== itemId),
    });
  };

  const handleToggleShoppingItem = (itemId: string) => {
    if (!currentPlan) return;
    updateCurrentPlan({
      ...currentPlan,
      shoppingList: currentPlan.shoppingList.map(i => i.id === itemId ? { ...i, checked: !i.checked } : i),
    });
  };

  
  // 통합 PDF 생성 (브라우저 프린트 기능을 활용한 가장 확실한 방식)
  const generateComprehensivePDF = () => {
    if (!currentPlan) return;
    
    // 프린트 전용 창 열기
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error(t('home.toast.allowPopups'));
      return;
    }

    const schedulesHtml = currentPlan.schedules
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
      .map(s => `
        <div style="padding: 10px; border-bottom: 1px solid #eee;">
          <div style="font-weight: bold; color: #0ea5e9;">${s.date} ${s.time}</div>
          <div style="font-size: 1.1em; font-weight: bold; margin: 5px 0;">${s.title}</div>
          <div style="font-size: 0.9em; color: #666;">📍 ${s.location || '-'}</div>
          ${s.cost ? `<div style="font-size: 0.9em; color: #0ea5e9; font-weight: bold;">₩${s.cost.toLocaleString()}</div>` : ''}
          ${s.notes ? `<div style="font-size: 0.85em; color: #888; font-style: italic;">"${s.notes}"</div>` : ''}
        </div>
      `).join('');

    const budgetsHtml = currentPlan.budgets
      .map(b => `
        <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f5f5f5;">
          <span>${b.description}</span>
          <span style="font-weight: bold;">₩${b.amount.toLocaleString()}</span>
        </div>
      `).join('');

    const shoppingHtml = currentPlan.shoppingList
      .map(i => `
        <div style="padding: 5px 0; border-bottom: 1px solid #f5f5f5;">
          ${i.checked ? '☑' : '☐'} ${i.item}
        </div>
      `).join('');

    const totalBudget = currentPlan.budgets.reduce((sum, b) => sum + b.amount, 0);

    printWindow.document.write(`
      <html>
        <head>
          <title>${currentPlan.title} - ${t('home.pdf.docTitleSuffix')}</title>
          <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
          <style>
            body { font-family: 'Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; line-height: 1.6; color: #333; padding: 40px; }
            h1 { color: #0ea5e9; border-bottom: 3px solid #0ea5e9; padding-bottom: 10px; }
            h2 { background: #f0f9ff; padding: 10px; border-radius: 5px; color: #0369a1; margin-top: 30px; }
            .section { margin-bottom: 30px; }
            .total { font-size: 1.2em; font-weight: bold; text-align: right; margin-top: 10px; color: #0ea5e9; }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>${currentPlan.title}</h1>
          <p style="font-size: 1.2em; color: #666;">🗓 ${currentPlan.startDate} ~ ${currentPlan.endDate}</p>

          <div class="section">
            <h2>🗓 ${t('home.pdf.scheduleSection')}</h2>
            ${schedulesHtml || `<p>${t('home.pdf.noSchedules')}</p>`}
          </div>

          <div class="section">
            <h2>💰 ${t('home.pdf.budgetSection')}</h2>
            ${budgetsHtml || `<p>${t('home.pdf.noBudgets')}</p>`}
            <div class="total">${t('home.pdf.grandTotal')}: ₩${totalBudget.toLocaleString()}</div>
          </div>

          <div class="section">
            <h2>🛍 ${t('home.pdf.shoppingSection')}</h2>
            ${shoppingHtml || `<p>${t('home.pdf.noShoppingItems')}</p>`}
          </div>

          <script>
            window.onload = () => {
              window.print();
              // window.close(); // 저장 후 자동으로 닫고 싶을 때 주석 해제
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    toast.success(t('home.toast.printWindowOpened'));
  };

  // 여행 계획을 텍스트 파일로 저장하는 기능
  const saveAsTextFile = () => {
    if (!currentPlan) return;

    let content = `[${t('home.textExport.planLabel')}: ${currentPlan.title}]\n`;
    content += `${t('home.textExport.period')}: ${currentPlan.startDate} ~ ${currentPlan.endDate}\n\n`;

    content += `■ ${t('home.textExport.scheduleSection')}\n`;
    currentPlan.schedules.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).forEach((s, idx) => {
      content += `${idx + 1}. [${s.date} ${s.time}] ${getCategoryLabel(s.category)}: ${s.title}\n`;
      if (s.location) content += `   ${t('home.textExport.location')}: ${s.location}\n`;
      if (s.cost) content += `   ${t('home.textExport.cost')}: ₩${s.cost.toLocaleString()}\n`;
      if (s.notes) content += `   ${t('home.textExport.notes')}: ${s.notes}\n`;
      if (s.preparations && s.preparations.length > 0) content += `   ${t('home.textExport.preparations')}: ${s.preparations.join(', ')}\n`;
      content += `\n`;
    });

    content += `■ ${t('home.textExport.budgetSection')}\n`;
    const total = currentPlan.budgets.reduce((sum, b) => sum + b.amount, 0);
    currentPlan.budgets.forEach(b => {
      content += `- ${getCategoryLabel(b.category)}: ₩${b.amount.toLocaleString()} (${b.description})\n`;
    });
    content += `${t('home.textExport.totalBudget')}: ₩${total.toLocaleString()}\n\n`;

    content += `■ ${t('home.textExport.shoppingSection')}\n`;
    currentPlan.shoppingList.forEach((item, idx) => {
      const status = item.checked ? '[V]' : '[ ]';
      content += `${status} ${idx + 1}. ${item.item}\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentPlan.title}_${t('home.textExport.fileNameSuffix')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('home.toast.textFileSaved'));
  };

  const handleDownloadPDF = () => {
    if (!currentPlan || !pdfRef.current) return;
    const element = pdfRef.current;
    const printWindow = window.open('', '', 'height=800,width=1000');
    if (!printWindow) { toast.error(t('home.toast.pdfDownloadFailed')); return; }
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(s => s.outerHTML).join('');
    printWindow.document.write(`<html><head><title>${currentPlan.title}</title>${styles}<style>@media print { .no-print { display: none; } body { background: white !important; } }</style></head><body><div>${element.innerHTML}</div></body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    toast.success(t('home.toast.pdfPreparing'));
  };

  const handleDeletePlan = (planId: string) => {
    const updated = travelPlans.filter(p => p.id !== planId);
    updateTravelPlans(updated);
    if (currentPlan?.id === planId) setCurrentPlan(null);
    toast.success(t('home.toast.planDeleted'));
  };

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
      accommodation: t('home.category.accommodation'), transport: t('home.category.transport'), meal: t('home.category.meal'),
      activity: t('home.category.activity'), shopping: t('home.category.shopping'), other: t('home.category.other'),
    };
    return labels[category] || t('home.category.other');
  };

  const totalBudget = currentPlan?.budgets?.reduce((sum, b) => sum + b.amount, 0) || 0;

  const handleCalcNumber = (num: string) => setCalcDisplay(prev => prev === '0' ? num : prev + num);
  const handleCalcOperation = (op: string) => {
    setCalcPrevValue(parseFloat(calcDisplay));
    setCalcOperation(op);
    setCalcDisplay('0');
  };
  const handleCalcEquals = () => {
    if (calcOperation) {
      const current = parseFloat(calcDisplay);
      let result = calcPrevValue;
      if (calcOperation === '+') result += current;
      else if (calcOperation === '-') result -= current;
      else if (calcOperation === '*') result *= current;
      else if (calcOperation === '/') result /= current;
      setCalcDisplay(result.toString());
      setCalcOperation(null);
      setCalcPrevValue(0);
    }
  };
  const handleCalcClear = () => { setCalcDisplay('0'); setCalcPrevValue(0); setCalcOperation(null); };

  const handleDateClick = (date: Date | undefined) => {
    setSelectedDate(date);
  };

  const getDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const filteredSchedules = currentPlan?.schedules.filter(s => {
    if (!selectedDate) return true;
    return s.date === getDateString(selectedDate);
  }) || [];

  // 메인 홈 달력 - 여행 시작 날짜에만 계획 표시
  const getPlansForDate = (date: Date): TravelPlan[] => {
    const dateStr = getDateString(date);
    return travelPlans.filter(plan => {
      if (!plan.startDate || !plan.endDate) return false;
      // 여행 시작 날짜와 정확히 일치하는 경우만 반환
      return dateStr === plan.startDate;
    });
  };

  const handleHomeCalendarDateClick = (date: Date | undefined) => {
    setHomeCalendarDate(date);
    if (!date) return;
    const plans = getPlansForDate(date);
    if (plans.length > 0) {
      setPreviewPlan(plans[0]);
      setShowPreviewDialog(true);
    }
  };

  // 메인 홈 달력에서 계획이 있는 날짜 목록
  const datesWithPlans = (): Date[] => {
    const dates: Date[] = [];
    travelPlans.forEach(plan => {
      if (!plan.startDate || !plan.endDate) return;
      const start = new Date(plan.startDate);
      const end = new Date(plan.endDate);
      const cur = new Date(start);
      while (cur <= end) {
        dates.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
      }
    });
    return dates;
  };

  const getPlanStatus = (plan: TravelPlan): '진행 중' | '예정' | '완료' => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(plan.endDate + 'T23:59:59');
    const start = new Date(plan.startDate + 'T00:00:00');
    if (today > end) return '완료';
    if (today >= start) return '진행 중';
    return '예정';
  };

  // 상태 값(내부 키)을 화면에 표시할 번역 문자열로 변환
  const getStatusLabel = (status: '진행 중' | '예정' | '완료'): string => {
    if (status === '진행 중') return t('home.planList.status.ongoing');
    if (status === '예정') return t('home.planList.status.upcoming');
    return t('home.planList.status.completed');
  };

  const getFilterLabel = (filter: 'all' | '진행 중' | '예정' | '완료'): string => {
    if (filter === 'all') return t('home.planList.status.all');
    return getStatusLabel(filter);
  };

  // 여행 시작일까지 남은(혹은 지난) 일수를 D-day 형태로 계산
  const getDday = (plan: TravelPlan): string => {
    if (!plan.startDate || !plan.endDate) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(plan.startDate + 'T00:00:00');
    const end = new Date(plan.endDate + 'T00:00:00');
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const daysUntilStart = Math.round((start.getTime() - today.getTime()) / MS_PER_DAY);

    if (daysUntilStart > 0) return `D-${daysUntilStart}`;
    if (daysUntilStart === 0) return 'D-DAY';

    const daysUntilEnd = Math.round((end.getTime() - today.getTime()) / MS_PER_DAY);
    if (daysUntilEnd >= 0) return t('home.planList.dayOfTrip', { n: Math.abs(daysUntilStart) + 1 });
    return `D+${Math.abs(daysUntilEnd)}`;
  };

  const getPlanThumbnail = (planId: string): string | null => {
    try {
      const diaries = JSON.parse(localStorage.getItem('travelDiaries') || '[]');
      const linked = diaries.find((d: any) => d.linkedPlanId === planId && d.photos?.some((p: any) => p.type !== 'video'));
      return linked?.photos.find((p: any) => p.type !== 'video')?.url || null;
    } catch { return null; }
  };

  return (
    <div className="min-h-screen bg-[#F8F7F4]">
      {/* 새 여행 계획 다이얼로그 */}
      <Dialog open={showNewPlanDialog} onOpenChange={setShowNewPlanDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t('home.newPlanDialog.title')}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">{t('home.newPlanDialog.tripTitleLabel')}</label>
              <Input placeholder={t('home.newPlanDialog.tripTitlePlaceholder')} value={newPlanTitle} onChange={e => setNewPlanTitle(e.target.value)} className="h-11" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">{t('home.newPlanDialog.startDateLabel')}</label>
                <Input type="date" value={newPlanStartDate} onChange={e => setNewPlanStartDate(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">{t('home.newPlanDialog.endDateLabel')}</label>
                <Input type="date" value={newPlanEndDate} onChange={e => setNewPlanEndDate(e.target.value)} className="h-11" />
              </div>
            </div>
            <Button onClick={handleCreatePlan} className="w-full bg-primary text-white h-11 mt-2">{t('home.newPlanDialog.createButton')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 헤더 ── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <button
            onClick={() => setCurrentPlan(null)}
            className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/30 flex-shrink-0">
              <Plane className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <h1 className="text-base sm:text-xl font-extrabold text-foreground tracking-tight whitespace-nowrap">Travel Planner</h1>
          </button>

          <nav className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            <Link href="/">
              <button className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-full text-sm font-bold transition-all bg-primary text-white shadow-sm whitespace-nowrap">
                <Plane className="w-4 h-4" />
                <span className="hidden sm:inline">{t('home.header.navPlan')}</span>
              </button>
            </Link>
            <Link href="/diary">
              <button className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-full text-sm font-bold transition-all text-muted-foreground hover:bg-secondary hover:text-foreground whitespace-nowrap">
                <BookOpen className="w-4 h-4" />
                <span className="hidden sm:inline">{t('home.header.navDiary')}</span>
              </button>
            </Link>
            <Link href="/community">
              <button className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-full text-sm font-bold transition-all text-muted-foreground hover:bg-secondary hover:text-foreground whitespace-nowrap">
                <Globe className="w-4 h-4" />
                <span className="hidden sm:inline">{t('home.header.navCommunity')}</span>
              </button>
            </Link>
            {user?.isAdmin && (
              <Link href="/admin">
                <button className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-full text-sm font-bold transition-all text-amber-600 hover:bg-amber-50 whitespace-nowrap">
                  <Shield className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('home.header.navAdmin')}</span>
                </button>
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-2 flex-shrink-0">
            {user ? (
              <>
                <button className="hidden sm:flex w-9 h-9 rounded-full items-center justify-center text-muted-foreground hover:bg-secondary transition-all border border-border">
                  <Search className="w-4 h-4" />
                </button>
                <NotificationBell />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-full border border-border bg-white hover:border-primary hover:shadow-sm transition-all">
                      <div className="w-7 h-7 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center flex-shrink-0">
                        {profilePhoto ? (
                          <img src={profilePhoto} alt="" className="w-full h-full object-cover" />
                        ) : (
                          user?.isAdmin ? <Crown className="w-4 h-4 text-amber-500" /> : <User className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <span className="hidden sm:block font-semibold text-foreground max-w-[100px] truncate">{user?.name}</span>
                      <ChevronDown className="hidden sm:block w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem asChild>
                      <Link href="/mypage" className="flex items-center gap-2 cursor-pointer">
                        <User className="w-4 h-4" /> {t('home.header.myPage')}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={logout}
                      className="text-red-500 focus:text-red-500 focus:bg-red-50 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 mr-2" /> {t('home.header.logout')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <Link href="/login">
                <button className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all bg-primary text-white shadow-sm whitespace-nowrap hover:opacity-90">
                  {t('nav.login')}
                </button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {!currentPlan ? (
        /* ===== 메인 홈 화면 ===== */
        <>
          {/* ── 히어로 ── */}
          <div
            className="w-full h-[360px] md:h-[420px] relative overflow-hidden"
            style={{ backgroundImage: 'url(/hero-travel.svg)', backgroundSize: 'cover', backgroundPosition: 'center top' }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent" />
            <div className="absolute inset-0 flex flex-col justify-center px-8 md:px-16 max-w-5xl">
              <h1 className="text-3xl md:text-5xl font-black text-white leading-tight drop-shadow-lg max-w-xl">
                {t('home.hero.titleLine1')}<br />{t('home.hero.titleLine2')}
              </h1>
              <p className="text-white/75 text-base md:text-lg mt-4 drop-shadow max-w-lg">
                {t('home.hero.subtitle')}
              </p>
              <div className="flex flex-wrap gap-3 mt-8">
                <Button
                  onClick={() => {
                    if (!user) {
                      toast.error(t('session.loginRequired'));
                      return;
                    }
                    setShowNewPlanDialog(true);
                  }}
                  className="bg-[#A68B77] hover:bg-[#7D6B5D] text-white px-6 h-11 rounded-full gap-2 shadow-lg"
                >
                  <Plane className="w-4 h-4" /> {t('home.hero.startButton')}
                </Button>
                <Link href="/community">
                  <Button
                    variant="outline"
                    className="bg-white/15 backdrop-blur-sm border-white/50 text-white hover:bg-white/25 px-6 h-11 rounded-full gap-2"
                  >
                    <Globe className="w-4 h-4" /> {t('home.hero.exploreButton')}
                  </Button>
                </Link>
              </div>
            </div>
            <div className="absolute top-4 right-4">
              <Button
                onClick={() => {
                  if (!user) {
                    toast.error(t('session.loginRequired'));
                    return;
                  }
                  setShowNewPlanDialog(true);
                }}
                className="bg-white/95 text-[#3B2B1E] hover:bg-white gap-1.5 rounded-full shadow-lg font-bold text-sm px-4 h-9"
              >
                <Plus className="w-4 h-4" /> {t('home.hero.newPlanButton')}
              </Button>
            </div>
          </div>

          {/* ── 스탯 바 ── */}
          {(() => {
            const myDiaries = (() => { try { return JSON.parse(localStorage.getItem('travelDiaries') || '[]').filter((d: any) => d.userId === user?.id); } catch { return []; } })();
            const thisMonth = new Date().toISOString().slice(0, 7);
            const thisMonthSchedules = travelPlans.reduce((s, p) => s + p.schedules.filter(sc => sc.date?.startsWith(thisMonth)).length, 0);
            const thisMonthDiaries = myDiaries.filter((d: any) => d.createdAt?.startsWith(thisMonth)).length;
            const activeCount = travelPlans.filter(p => getPlanStatus(p) === '진행 중').length;
            const totalSchedules = travelPlans.reduce((s, p) => s + p.schedules.length, 0);
            const uniqueLocations = new Set(myDiaries.map((d: any) => d.location)).size;
            const statItems = [
              { label: t('home.stats.plansLabel'), value: travelPlans.length, sub: t('home.stats.plansSub', { n: activeCount }), icon: <Map className="w-5 h-5" />, bg: 'bg-blue-100', color: 'text-blue-600' },
              { label: t('home.stats.schedulesLabel'), value: totalSchedules, sub: t('home.stats.schedulesSub', { n: thisMonthSchedules }), icon: <Calendar className="w-5 h-5" />, bg: 'bg-emerald-100', color: 'text-emerald-600' },
              { label: t('home.stats.diariesLabel'), value: myDiaries.length, sub: t('home.stats.diariesSub', { n: thisMonthDiaries }), icon: <BookOpen className="w-5 h-5" />, bg: 'bg-orange-100', color: 'text-orange-600' },
              { label: t('home.stats.locationsLabel'), value: uniqueLocations, sub: t('home.stats.locationsSub', { n: uniqueLocations }), icon: <MapPin className="w-5 h-5" />, bg: 'bg-purple-100', color: 'text-purple-600' },
            ];
            return (
              <div className="max-w-5xl mx-auto px-4 -mt-8 relative z-10">
                <div className="bg-white rounded-2xl shadow-xl border border-gray-100 grid grid-cols-2 lg:grid-cols-4">
                  {statItems.map((s, i) => (
                    <div key={s.label} className={cn(
                      "p-5 flex items-center gap-4",
                      i === 0 ? "border-b lg:border-b-0 lg:border-r border-gray-100" : "",
                      i === 1 ? "border-b lg:border-b-0 lg:border-r border-gray-100" : "",
                      i === 2 ? "lg:border-r border-gray-100" : "",
                    )}>
                      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0", s.bg)}>
                        <span className={s.color}>{s.icon}</span>
                      </div>
                      <div>
                        <p className="text-2xl font-black text-foreground">{s.value}</p>
                        <p className="text-sm font-bold text-foreground">{s.label}</p>
                        <p className="text-xs text-muted-foreground">{s.sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── 메인 그리드: 달력 + 계획 목록 ── */}
          <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* 왼쪽: 달력 */}
            <div className="lg:col-span-1">
              <Card className="p-5 bg-white border-border shadow-sm sticky top-20">
                <h3 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" /> {t('home.calendarSidebar.title')}
                </h3>
                <CalendarUI
                  mode="single"
                  selected={homeCalendarDate}
                  onSelect={handleHomeCalendarDateClick}
                  className="rounded-md border border-border w-full"
                  modifiers={{ hasPlan: datesWithPlans() }}
                  modifiersStyles={{ hasPlan: { fontWeight: 'bold', backgroundColor: '#E0F2FE', color: '#0369A1', borderRadius: '50%' } }}
                />
                <div className="mt-4 space-y-2">
                  {[
                    { color: 'bg-sky-200', label: t('home.calendarSidebar.legendHasSchedule') },
                    { color: 'bg-emerald-400', label: t('home.calendarSidebar.legendOngoing') },
                    { color: 'bg-blue-400', label: t('home.calendarSidebar.legendUpcoming') },
                    { color: 'bg-slate-300', label: t('home.calendarSidebar.legendCompleted') },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", item.color)} />
                      {item.label}
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* 오른쪽: 여행 계획 목록 */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-black text-foreground">{t('home.planList.title')}</h2>
                <div className="flex gap-1 bg-secondary p-1 rounded-xl">
                  {(['all', '진행 중', '예정', '완료'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setPlanFilter(f)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                        planFilter === f ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {getFilterLabel(f)}
                    </button>
                  ))}
                </div>
              </div>

              {(() => {
                const filtered = planFilter === 'all' ? travelPlans : travelPlans.filter(p => getPlanStatus(p) === planFilter);
                const PLAN_GRADIENTS = [
                  'from-sky-400 to-blue-500',
                  'from-emerald-400 to-teal-500',
                  'from-orange-400 to-red-500',
                  'from-purple-400 to-indigo-500',
                  'from-pink-400 to-rose-500',
                  'from-amber-400 to-orange-500',
                ];
                const STATUS_STYLES: Record<string, string> = {
                  '진행 중': 'bg-emerald-100 text-emerald-700 border-emerald-200',
                  '예정': 'bg-blue-100 text-blue-700 border-blue-200',
                  '완료': 'bg-gray-100 text-gray-500 border-gray-200',
                };

                if (travelPlans.length === 0) {
                  return (
                    <Card className="p-12 flex flex-col items-center justify-center border-dashed border-2 border-border bg-white/60">
                      <Map className="w-16 h-16 text-border mb-4" />
                      <h2 className="text-xl font-bold text-foreground mb-2">{t('home.planList.emptyTitle')}</h2>
                      <p className="text-muted-foreground mb-6">{t('home.planList.emptySubtitle')}</p>
                      <Button onClick={() => {
                        if (!user) {
                          toast.error(t('session.loginRequired'));
                          return;
                        }
                        setShowNewPlanDialog(true);
                      }} className="bg-primary">{t('home.planList.emptyButton')}</Button>
                    </Card>
                  );
                }
                if (filtered.length === 0) {
                  return (
                    <div className="py-12 text-center">
                      <p className="text-base font-semibold text-muted-foreground">{t('home.planList.filterEmpty', { filter: getFilterLabel(planFilter) })}</p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-3">
                    {filtered.map((plan, idx) => {
                      const status = getPlanStatus(plan);
                      const thumbnail = plan.coverPhoto || getPlanThumbnail(plan.id);
                      const budget = plan.budgets.reduce((s, b) => s + b.amount, 0);
                      return (
                        <Card
                          key={plan.id}
                          className="flex flex-row gap-4 p-4 cursor-pointer hover:shadow-md transition-all bg-white border-border hover:border-primary/30 group"
                          onClick={() => setCurrentPlan(plan)}
                        >
                          <div className="w-32 h-32 sm:w-36 sm:h-36 md:w-40 md:h-40 rounded-xl overflow-hidden flex-shrink-0">
                            {thumbnail ? (
                              <img src={thumbnail} alt={plan.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className={cn("w-full h-full bg-gradient-to-br flex items-center justify-center", PLAN_GRADIENTS[idx % PLAN_GRADIENTS.length])}>
                                <Plane className="w-10 h-10 text-white/80" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 flex flex-col justify-center">
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <h3 className="font-bold text-foreground text-xl leading-snug line-clamp-1 group-hover:text-primary transition-colors">{plan.title}</h3>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className="text-xs font-bold px-2.5 py-1 rounded-full border border-primary/20 bg-primary/10 text-primary">
                                  {getDday(plan)}
                                </span>
                                <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full border", STATUS_STYLES[status])}>
                                  {getStatusLabel(status)}
                                </span>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                              <Calendar className="w-4 h-4" /> {plan.startDate} ~ {plan.endDate}
                            </p>
                            <div className="flex items-center gap-3 mt-2.5 text-sm">
                              <span className="text-muted-foreground">{t('home.planList.scheduleCount', { n: plan.schedules.length })}</span>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-primary font-semibold">{t('home.planList.budgetLabel')} ₩{budget.toLocaleString()}</span>
                            </div>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); handleDeletePlan(plan.id); }}
                            className="text-slate-200 hover:text-red-400 transition-colors flex-shrink-0 self-start mt-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </Card>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ── 커뮤니티 인기 여행 ── */}
          <div className="max-w-6xl mx-auto px-4 pb-12">
            <CommunityTrending />
          </div>
        </>
      ) : (
        /* ===== 계획 상세 화면 ===== */
        <main className="container mx-auto px-4 py-8">
          {currentPlan && (
            <>
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="flex items-start gap-4">
                {/* 대표 사진 */}
                <button
                  type="button"
                  onClick={() => planPhotoInputRef.current?.click()}
                  className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden flex-shrink-0 border border-border group/cover"
                  title={t('home.planDetail.coverPhotoTitle')}
                >
                  {currentPlan.coverPhoto ? (
                    <img src={currentPlan.coverPhoto} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                      <Plane className="w-7 h-7 text-primary/50" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover/cover:bg-black/40 transition-colors flex items-center justify-center">
                    <Camera className="w-5 h-5 text-white opacity-0 group-hover/cover:opacity-100 transition-opacity" />
                  </div>
                </button>
                <input
                  ref={planPhotoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePlanPhotoUpload}
                  className="hidden"
                />

                <div>
                  <button
                    onClick={() => { setCurrentPlan(null); setEditingTitle(false); setEditingDates(false); }}
                    className="text-primary font-semibold text-sm hover:underline mb-2 flex items-center gap-1"
                  >
                    ← {t('home.planDetail.backToList')}
                  </button>

                  {/* 제목 수정 영역 */}
                  {editingTitle ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editTitleValue}
                        onChange={e => setEditTitleValue(e.target.value)}
                        className="text-2xl font-black h-12 text-foreground border-primary"
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveTitle();
                          if (e.key === 'Escape') handleCancelEditTitle();
                        }}
                        autoFocus
                      />
                      <Button onClick={handleSaveTitle} size="sm" className="bg-primary text-white gap-1">
                        <Check className="w-4 h-4" /> {t('home.common.save')}
                      </Button>
                      <Button onClick={handleCancelEditTitle} size="sm" variant="outline" className="gap-1">
                        <X className="w-4 h-4" /> {t('home.common.cancel')}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <h2 className="text-4xl font-black text-foreground flex items-center gap-3">
                        {currentPlan.title}
                        <Plane className="text-primary" />
                      </h2>
                      <button
                        onClick={handleStartEditTitle}
                        className="p-2 text-slate-400 hover:text-primary transition-colors rounded-lg hover:bg-secondary"
                        title={t('home.planDetail.editTitleTooltip')}
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <span className="text-sm font-bold px-3 py-1 rounded-full bg-primary text-white shadow-sm shadow-primary/30 flex-shrink-0">
                        {getDday(currentPlan)}
                      </span>
                    </div>
                  )}

                  {/* 날짜 수정 영역 */}
                  {editingDates ? (
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Input
                        type="date"
                        value={editStartDate}
                        onChange={e => setEditStartDate(e.target.value)}
                        className="h-9 w-auto"
                        autoFocus
                      />
                      <span className="text-muted-foreground">~</span>
                      <Input
                        type="date"
                        value={editEndDate}
                        onChange={e => setEditEndDate(e.target.value)}
                        className="h-9 w-auto"
                      />
                      <Button onClick={handleSaveDates} size="sm" className="bg-primary text-white gap-1">
                        <Check className="w-4 h-4" /> {t('home.common.save')}
                      </Button>
                      <Button onClick={handleCancelEditDates} size="sm" variant="outline" className="gap-1">
                        <X className="w-4 h-4" /> {t('home.common.cancel')}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-muted-foreground font-medium mt-1 flex items-center gap-2">
                      <Calendar className="w-4 h-4" /> {currentPlan.startDate} ~ {currentPlan.endDate}
                      <button
                        onClick={handleStartEditDates}
                        className="p-1 text-slate-400 hover:text-primary transition-colors rounded hover:bg-secondary"
                        title={t('home.planDetail.editDatesTooltip')}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                <Button onClick={generateComprehensivePDF} className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-100">
                  <Download className="w-4 h-4 mr-2" /> {t('home.planDetail.savePdfButton')}
                </Button>
                <Button onClick={() => setShowShareModal(true)} className="bg-primary shadow-lg shadow-border">
                  <Share2 className="w-4 h-4 mr-2" /> {t('home.planDetail.shareButton')}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* 사이드바: 달력 및 요약 */}
              <div className="lg:col-span-4 space-y-6">
                <Card className="p-6 bg-white border-border shadow-sm">
                  <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary" /> {t('home.planDetail.calendarTitle')}
                  </h3>
                  <CalendarUI
                    mode="single"
                    selected={selectedDate}
                    onSelect={handleDateClick}
                    className="rounded-md border border-border"
                    modifiers={{
                      hasSchedule: (date) => currentPlan.schedules.some(s => s.date === getDateString(date))
                    }}
                    modifiersStyles={{
                      hasSchedule: { fontWeight: 'bold', color: '#0369A1', backgroundColor: '#BAE6FD', borderRadius: '50%' }
                    }}
                  />
                  <div className="mt-4 p-3 bg-secondary rounded-lg text-xs text-muted-foreground">
                    <p>💡 {t('home.planDetail.calendarTip')}</p>
                  </div>
                </Card>

                <Card className="p-6 bg-gradient-to-br from-primary to-[#8B7968] text-white shadow-lg shadow-border">
                  <h3 className="text-lg font-bold mb-4">{t('home.planDetail.summaryTitle')}</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-white/80 text-xs uppercase tracking-wider font-bold">{t('home.planDetail.totalBudgetLabel')}</p>
                          <p className="text-3xl font-black">₩{totalBudget.toLocaleString()}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <select 
                            value={selectedCurrency}
                            onChange={(e) => setSelectedCurrency(e.target.value)}
                            className="bg-white/20 border-none text-white text-xs rounded-md px-2 py-1 focus:ring-0 cursor-pointer"
                          >
                            <option value="USD" className="text-black">🇺🇸 USD ($)</option>
                            <option value="EUR" className="text-black">🇪🇺 EUR (€)</option>
                            <option value="GBP" className="text-black">🇬🇧 GBP (£)</option>
                            <option value="JPY" className="text-black">🇯🇵 JPY (¥)</option>
                            <option value="CNY" className="text-black">🇨🇳 CNY (¥)</option>
                            <option value="THB" className="text-black">🇹🇭 THB (฿)</option>
                            <option value="VND" className="text-black">🇻🇳 VND (₫)</option>
                            <option value="PHP" className="text-black">🇵🇭 PHP (₱)</option>
                            <option value="IDR" className="text-black">🇮🇩 IDR (Rp)</option>
                            <option value="MYR" className="text-black">🇲🇾 MYR (RM)</option>
                          </select>
                          <p className="text-lg font-bold text-white/90">{formatCurrency(totalBudget)}</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white/20 p-3 rounded-xl">
                        <p className="text-xs font-bold">{t('home.planDetail.totalSchedulesLabel')}</p>
                        <p className="text-xl font-bold">{t('home.unitCount', { n: currentPlan.schedules.length })}</p>
                      </div>
                      <div className="bg-white/20 p-3 rounded-xl">
                        <p className="text-xs font-bold">{t('home.planDetail.checklistLabel')}</p>
                        <p className="text-xl font-bold">{currentPlan.shoppingList.filter(i => i.checked).length}/{currentPlan.shoppingList.length}</p>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* 메인: 탭 컨텐츠 */}
              <div className="lg:col-span-8">
                <Tabs defaultValue="schedule" className="w-full">
                  <TabsList
                    className="flex sm:grid w-full sm:grid-cols-7 gap-1 overflow-x-auto sm:overflow-visible bg-secondary/50 p-1 rounded-2xl mb-6 [&::-webkit-scrollbar]:hidden"
                    style={{ scrollbarWidth: 'none' }}
                  >
                    <TabsTrigger value="schedule" className="flex-shrink-0 sm:flex-shrink whitespace-nowrap px-4 sm:px-2 rounded-xl data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">{t('home.tabs.schedule')}</TabsTrigger>
                    <TabsTrigger value="map" className="flex-shrink-0 sm:flex-shrink whitespace-nowrap px-4 sm:px-2 rounded-xl data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">{t('home.tabs.map')}</TabsTrigger>
                    <TabsTrigger value="weather" className="flex-shrink-0 sm:flex-shrink whitespace-nowrap px-4 sm:px-2 rounded-xl data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">{t('home.tabs.weather')}</TabsTrigger>
                    <TabsTrigger value="budget" className="flex-shrink-0 sm:flex-shrink whitespace-nowrap px-4 sm:px-2 rounded-xl data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">{t('home.tabs.budget')}</TabsTrigger>
                    <TabsTrigger value="shopping" className="flex-shrink-0 sm:flex-shrink whitespace-nowrap px-4 sm:px-2 rounded-xl data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">{t('home.tabs.shopping')}</TabsTrigger>
                    <TabsTrigger value="summary" className="flex-shrink-0 sm:flex-shrink whitespace-nowrap px-4 sm:px-2 rounded-xl data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">{t('home.tabs.summary')}</TabsTrigger>
                    <TabsTrigger value="timeline" className="flex-shrink-0 sm:flex-shrink whitespace-nowrap px-4 sm:px-2 rounded-xl data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">{t('home.tabs.timeline')}</TabsTrigger>
                  </TabsList>

                  {/* 일정 탭 */}
                  <TabsContent value="schedule" className="space-y-6">
                    <Card className="p-6 bg-white border-border">
                      <h3 className="text-lg font-bold text-foreground mb-5">{t('home.schedule.addTitle')}</h3>
                      <ScheduleForm onAdd={handleAddSchedule} existingSchedules={currentPlan?.schedules || []} />
                    </Card>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold text-foreground">
                          {selectedDate ? t('home.schedule.scheduleForDate', { date: getDateString(selectedDate) }) : t('home.schedule.allSchedules')}
                        </h3>
                        {selectedDate && (
                          <Button variant="ghost" size="sm" onClick={() => setSelectedDate(undefined)} className="text-muted-foreground">
                            {t('home.schedule.viewAll')}
                          </Button>
                        )}
                      </div>

                      {filteredSchedules.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-2xl border border-border">
                          <p className="text-slate-400">{t('home.schedule.emptyState')}</p>
                        </div>
                      ) : (
                        filteredSchedules
                          .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
                          .map(schedule => (
                            <ScheduleCard
                              key={schedule.id}
                              schedule={schedule}
                              isEditing={editingScheduleId === schedule.id}
                              onEdit={() => setEditingScheduleId(schedule.id)}
                              onUpdate={handleUpdateSchedule}
                              onDelete={handleDeleteSchedule}
                              onCancel={() => setEditingScheduleId(null)}
                              getCategoryColor={getCategoryColor}
                              getCategoryLabel={getCategoryLabel}
                              existingSchedules={currentPlan?.schedules || []}
                            />
                          ))
                      )}
                    </div>
                  </TabsContent>

                  {/* 지도 탭 */}
                  <TabsContent value="map" className="space-y-4">
                    <Card className="p-6 bg-white border-border">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                          <Map className="w-5 h-5 text-primary" /> {t('home.map.title')}
                        </h3>
                        <span className="text-sm text-muted-foreground">
                          {t('home.map.pinnedCount', { n: currentPlan.schedules.filter(s => s.lat !== undefined && s.lng !== undefined).length })}
                        </span>
                      </div>
                      {(() => {
                        const pinned = [...currentPlan.schedules]
                          .filter(s => s.lat !== undefined && s.lng !== undefined)
                          .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
                        if (pinned.length === 0) {
                          return (
                            <div className="text-center py-12 text-muted-foreground">
                              <MapPin className="w-10 h-10 mx-auto mb-3 text-border" />
                              <p className="text-sm">{t('home.map.emptyState')}</p>
                              <p className="text-xs mt-1">{t('home.map.emptyStateHint')}</p>
                            </div>
                          );
                        }
                        const markers: MapMarker[] = pinned.map((s, i) => ({
                          id: s.id,
                          lat: s.lat as number,
                          lng: s.lng as number,
                          title: `${i + 1}. ${s.title} (${s.date} ${s.time})`,
                          draggable: false,
                          label: String(i + 1),
                        }));
                        const panToSchedule = (s: (typeof pinned)[number]) => {
                          const map = scheduleMapRef.current;
                          if (!map || s.lat === undefined || s.lng === undefined || !window.naver) return;
                          map.morph(new window.naver.maps.LatLng(s.lat, s.lng), Math.max(map.getZoom(), 15));
                        };
                        return (
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <div className="lg:col-span-2">
                              <MapView
                                markers={markers}
                                fitToMarkers
                                onMapReady={map => {
                                  scheduleMapRef.current = map;
                                }}
                                onMarkerDelete={id => {
                                  const target = currentPlan.schedules.find(s => s.id === id);
                                  if (target) handleUpdateSchedule(id, { ...target, lat: undefined, lng: undefined });
                                }}
                              />
                            </div>
                            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                              <p className="text-xs font-semibold text-muted-foreground px-1 mb-1">
                                {t('home.map.tapToLocate')}
                              </p>
                              {pinned.map((s, i) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => panToSchedule(s)}
                                  className="w-full text-left flex items-start gap-3 p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors"
                                >
                                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center mt-0.5">
                                    {i + 1}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <p className="text-sm font-bold text-foreground">{s.title}</p>
                                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0", getCategoryColor(s.category))}>
                                        {getCategoryLabel(s.category)}
                                      </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                      <Calendar className="w-3 h-3 flex-shrink-0" /> {s.date} {s.time}
                                    </p>
                                    {s.location && (
                                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                                        <MapPin className="w-3 h-3 flex-shrink-0" /> {s.location}
                                      </p>
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </Card>
                  </TabsContent>

                  {/* 날씨 탭 */}
                  <TabsContent value="weather" className="space-y-4">
                    <Tabs defaultValue="domestic" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 bg-secondary/50 p-1 rounded-2xl mb-4">
                        <TabsTrigger value="domestic" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">{t('home.weather.domestic')}</TabsTrigger>
                        <TabsTrigger value="overseas" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">{t('home.weather.overseas')}</TabsTrigger>
                      </TabsList>
                      <TabsContent value="domestic">
                        <WeatherWidget scope="domestic" />
                      </TabsContent>
                      <TabsContent value="overseas">
                        <WeatherWidget scope="overseas" />
                      </TabsContent>
                    </Tabs>
                  </TabsContent>

                  {/* 예산 탭 */}
                  <TabsContent value="budget" className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Card className="p-6 bg-white border-border">
                        <h3 className="text-lg font-bold text-foreground mb-4">{t('home.budget.addTitle')}</h3>
                        <BudgetForm onAdd={handleAddBudget} />
                      </Card>
                      <Card className="p-6 bg-white border-border">
                        <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                          <Info className="w-4 h-4 text-primary" /> {t('home.budget.calculatorTitle')}
                        </h3>
                        <div className="space-y-3">
                          <div className="bg-[#3D3D3D] text-white p-4 rounded-xl text-right text-2xl font-mono font-bold">{calcDisplay}</div>
                          <div className="grid grid-cols-4 gap-2">
                            {['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '=', '+'].map(btn => {
                              let btnClass = "h-12 text-lg font-bold";
                              if (btn === '=') {
                                btnClass += " bg-[#A68B77] hover:bg-[#8B7968] text-white border-0";
                              } else if (['+', '-', '*', '/'].includes(btn)) {
                                btnClass += " bg-[#E8E2D9] hover:bg-[#DED6CC] text-[#3D3D3D] border-[#DED6CC]";
                              } else {
                                btnClass += " bg-[#F9F7F2] hover:bg-[#E8E2D9] text-[#3D3D3D] border-[#DED6CC]";
                              }
                              return (
                                <Button key={btn} onClick={() => {
                                  if (btn === '=') handleCalcEquals();
                                  else if (['+', '-', '*', '/'].includes(btn)) handleCalcOperation(btn);
                                  else handleCalcNumber(btn);
                                }} className={btnClass}>{btn}</Button>
                              );
                            })}
                            <Button onClick={handleCalcClear} className="col-span-4 h-12 font-bold bg-[#A68B77] hover:bg-[#8B7968] text-white border-0">{t('home.budget.clearButton')}</Button>
                          </div>
                        </div>
                      </Card>
                    </div>
                    <div className="space-y-4">
                      <h3 className="text-xl font-bold text-foreground">{t('home.budget.expenseHistoryTitle')}</h3>
                      {currentPlan.budgets.map(budget => (
                        <BudgetCard
                          key={budget.id}
                          budget={budget}
                          isEditing={editingBudgetId === budget.id}
                          onEdit={() => setEditingBudgetId(budget.id)}
                          onUpdate={handleUpdateBudget}
                          onDelete={handleDeleteBudget}
                          onCancel={() => setEditingBudgetId(null)}
                          getCategoryColor={getCategoryColor}
                          getCategoryLabel={getCategoryLabel}
                        />
                      ))}
                    </div>
                  </TabsContent>

                  {/* 쇼핑 탭 */}
                  <TabsContent value="shopping" className="space-y-6">
                    <Card className="p-6 bg-white border-border">
                      <h3 className="text-lg font-bold text-foreground mb-4">{t('home.shopping.addTitle')}</h3>
                      <ShoppingForm onAdd={handleAddShoppingItem} />
                    </Card>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {currentPlan.shoppingList.map(item => (
                        <ShoppingCard
                          key={item.id}
                          item={item}
                          isEditing={editingShoppingId === item.id}
                          onEdit={() => setEditingShoppingId(item.id)}
                          onUpdate={handleUpdateShoppingItem}
                          onDelete={handleDeleteShoppingItem}
                          onToggle={handleToggleShoppingItem}
                          onCancel={() => setEditingShoppingId(null)}
                        />
                      ))}
                    </div>
                  </TabsContent>

                  {/* 준비물 탭 */}
                  <TabsContent value="summary">
                    <Card className="p-6 bg-white border-border">
                      <h3 className="text-lg font-bold text-foreground mb-4">{t('home.summary.title')}</h3>
                      <div className="space-y-4">
                        {currentPlan.schedules.filter(s => s.preparations && s.preparations.length > 0).length === 0 ? (
                          <div className="text-center py-12 bg-secondary rounded-2xl">
                            <p className="text-slate-400">{t('home.summary.emptyState')}</p>
                          </div>
                        ) : (
                          currentPlan.schedules.filter(s => s.preparations && s.preparations.length > 0).map(s => (
                            <div key={s.id} className="p-4 bg-secondary rounded-xl border border-border">
                              <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                                <Check className="w-4 h-4 text-primary" /> {s.title} ({s.date})
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                {s.preparations?.map((p, idx) => (
                                  <span key={idx} className="bg-white px-3 py-1 rounded-full text-sm text-muted-foreground border border-border shadow-sm">{p}</span>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </Card>
                  </TabsContent>

                  {/* 타임라인 탭 */}
                  <TabsContent value="timeline" className="space-y-4">
                    <Card className="p-6 bg-white border-border">
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                          <Clock className="w-5 h-5 text-primary" /> {t('home.timeline.title')}
                          {currentPlan.schedules.length > 0 && (
                            <span className="text-sm font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                              {t('home.timeline.percentComplete', { n: Math.round((currentPlan.schedules.filter(s => s.completed).length / currentPlan.schedules.length) * 100) })}
                            </span>
                          )}
                        </h3>
                        {currentPlan.schedules.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {t('home.timeline.completedCount', { done: currentPlan.schedules.filter(s => s.completed).length, total: currentPlan.schedules.length })}
                          </span>
                        )}
                      </div>
                      {currentPlan.schedules.length === 0 ? (
                        <div className="text-center py-12 bg-secondary rounded-2xl">
                          <p className="text-slate-400">{t('home.timeline.emptyState')}</p>
                        </div>
                      ) : (() => {
                        const sorted = [...currentPlan.schedules].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
                        const grouped = sorted.reduce<Record<string, ScheduleItem[]>>((acc, s) => {
                          (acc[s.date] ??= []).push(s);
                          return acc;
                        }, {});
                        const dates = Object.keys(grouped).sort();
                        const weekdays = [
                          t('home.timeline.weekdaySun'), t('home.timeline.weekdayMon'), t('home.timeline.weekdayTue'),
                          t('home.timeline.weekdayWed'), t('home.timeline.weekdayThu'), t('home.timeline.weekdayFri'), t('home.timeline.weekdaySat'),
                        ];
                        return (
                          <div className="space-y-8">
                            {dates.map((date, dayIdx) => (
                              <div key={date}>
                                <div className="flex items-center gap-2 mb-4">
                                  <span className="w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                                    {dayIdx + 1}
                                  </span>
                                  <p className="font-bold text-foreground">
                                    {date}{' '}
                                    <span className="text-muted-foreground font-normal text-sm">
                                      ({weekdays[new Date(date + 'T00:00:00').getDay()]})
                                    </span>
                                  </p>
                                </div>
                                <div className="relative pl-6 border-l-2 border-border space-y-6">
                                  {grouped[date].map(s => (
                                    <div key={s.id} className="relative">
                                      <button
                                        type="button"
                                        onClick={() => handleToggleScheduleComplete(s.id)}
                                        aria-label={s.completed ? t('home.timeline.unmarkComplete') : t('home.timeline.markComplete')}
                                        className={cn(
                                          "absolute -left-9 top-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors shadow-sm",
                                          s.completed ? "bg-primary border-primary" : "bg-white border-border hover:border-primary"
                                        )}
                                      >
                                        {s.completed && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                                      </button>
                                      <div className={cn("flex items-start justify-between gap-2 transition-opacity", s.completed && "opacity-50")}>
                                        <div className="min-w-0">
                                          <p className="text-xs font-bold text-primary mb-0.5">{s.time}</p>
                                          <p className={cn("font-bold text-foreground truncate", s.completed && "line-through")}>{s.title}</p>
                                          {s.location && (
                                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                                              <MapPin className="w-3 h-3 flex-shrink-0" /> {s.location}
                                            </p>
                                          )}
                                        </div>
                                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0", getCategoryColor(s.category))}>
                                          {getCategoryLabel(s.category)}
                                        </span>
                                      </div>
                                      {!!s.cost && (
                                        <p className={cn("text-xs text-muted-foreground mt-1", s.completed && "opacity-50")}>₩{s.cost.toLocaleString()}</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            </div>

            {/* PDF 전용 레이아웃 (캡처용) */}
            <div ref={pdfRef} id="pdf-content" className="fixed -left-[9999px] top-0 bg-white" style={{ display: 'none', fontFamily: "'Pretendard', sans-serif" }}>
              <div className="p-10 bg-white text-slate-900 w-[800px]">
                <div className="border-b-4 border-primary pb-6 mb-8">
                  <h1 className="text-4xl font-black text-foreground mb-2">{currentPlan.title}</h1>
                  <p className="text-xl text-muted-foreground font-bold">{currentPlan.startDate} ~ {currentPlan.endDate}</p>
                </div>
                
                <div className="mb-10">
                  <h2 className="text-2xl font-bold text-foreground mb-6 border-b pb-2">📅 {t('home.pdf.scheduleSection')}</h2>
                  <div className="space-y-4">
                    {currentPlan.schedules.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).map(s => (
                      <div key={s.id} className="p-4 border border-slate-200 rounded-xl">
                        <div className="flex justify-between items-start mb-2">
                          <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", getCategoryColor(s.category))}>{getCategoryLabel(s.category)}</span>
                          <span className="text-sm text-slate-500 font-bold">{s.date} {s.time}</span>
                        </div>
                        <h3 className="text-lg font-bold mb-1">{s.title}</h3>
                        {s.location && <p className="text-sm text-slate-600 flex items-center gap-1">📍 {s.location}</p>}
                        {s.cost && <p className="text-sm text-primary font-bold mt-1">₩{s.cost.toLocaleString()}</p>}
                        {s.notes && <p className="text-sm text-slate-500 italic mt-2 p-2 bg-slate-50 rounded">"{s.notes}"</p>}
                        {s.preparations && s.preparations.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {s.preparations.map((p: string, i: number) => (
                              <span key={i} className="text-[10px] bg-slate-100 px-2 py-0.5 rounded"># {p}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8 mb-10">
                  <div>
                    <h2 className="text-2xl font-bold text-foreground mb-6 border-b pb-2">💰 {t('home.pdf.budgetSection')}</h2>
                    <div className="space-y-2">
                      {currentPlan.budgets.map(b => (
                        <div key={b.id} className="flex justify-between items-center p-2 border-b border-slate-100">
                          <span className="text-sm">{b.description}</span>
                          <span className="text-sm font-bold">₩{b.amount.toLocaleString()}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center p-2 bg-primary/10 rounded mt-2">
                        <span className="font-bold">{t('home.pdf.grandTotal')}</span>
                        <span className="font-bold text-primary">₩{totalBudget.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-foreground mb-6 border-b pb-2">🛍️ {t('home.pdf.shoppingSection')}</h2>
                    <div className="space-y-2">
                      {currentPlan.shoppingList.map(item => (
                        <div key={item.id} className="flex items-center gap-2 p-2 border-b border-slate-100">
                          <span>{item.checked ? '☑' : '☐'}</span>
                          <span className={cn("text-sm", item.checked && "line-through text-slate-400")}>{item.item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
            </>
          )}

          {/* 공유하기 다이얼로그 */}
          <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t('home.shareDialog.title')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <Button
                  onClick={() => { generateComprehensivePDF(); setShowShareModal(false); }}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" /> {t('home.shareDialog.savePdfOption')}
                </Button>
                <Button
                  onClick={() => { saveAsTextFile(); setShowShareModal(false); }}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" /> {t('home.shareDialog.saveTextOption')}
                </Button>
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    toast.success(t('home.toast.shareLinkCopied'));
                    setShowShareModal(false);
                  }}
                  className="w-full bg-purple-500 hover:bg-purple-600 text-white flex items-center justify-center gap-2"
                >
                  <Share2 className="w-4 h-4" /> {t('home.shareDialog.copyLinkOption')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </main>
      )}

      {/* 메인 홈 달력 - 계획 미리보기 다이얼로그 */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Eye className="w-5 h-5 text-primary" />
              {previewPlan?.title} - {t('home.previewDialog.titleSuffix')}
            </DialogTitle>
          </DialogHeader>
          {previewPlan && (
            <div className="space-y-4 pt-2">
              {/* 기본 정보 */}
              <div className="p-4 bg-secondary rounded-xl border border-border">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider mb-1">{t('home.previewDialog.periodLabel')}</p>
                    <p className="font-bold text-foreground">{previewPlan.startDate} ~ {previewPlan.endDate}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider mb-1">D-day</p>
                    <p className="font-bold text-primary">{getDday(previewPlan)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider mb-1">{t('home.previewDialog.totalBudgetLabel')}</p>
                    <p className="font-bold text-primary text-lg">₩{previewPlan.budgets.reduce((s, b) => s + b.amount, 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider mb-1">{t('home.previewDialog.scheduleCountLabel')}</p>
                    <p className="font-bold text-foreground">{t('home.unitCount', { n: previewPlan.schedules.length })}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider mb-1">{t('home.previewDialog.shoppingListLabel')}</p>
                    <p className="font-bold text-foreground">{t('home.previewDialog.shoppingCompleted', { done: previewPlan.shoppingList.filter(i => i.checked).length, total: previewPlan.shoppingList.length })}</p>
                  </div>
                </div>
              </div>

              {/* 선택된 날짜의 일정 */}
              {homeCalendarDate && (
                <div>
                  <h4 className="font-bold text-foreground mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    {t('home.previewDialog.scheduleForDate', { date: getDateString(homeCalendarDate) })}
                  </h4>
                  {previewPlan.schedules
                    .filter(s => s.date === getDateString(homeCalendarDate))
                    .sort((a, b) => a.time.localeCompare(b.time))
                    .length === 0 ? (
                    <p className="text-slate-400 text-sm py-4 text-center bg-slate-50 rounded-xl">{t('home.previewDialog.noScheduleForDate')}</p>
                  ) : (
                    <div className="space-y-2">
                      {previewPlan.schedules
                        .filter(s => s.date === getDateString(homeCalendarDate))
                        .sort((a, b) => a.time.localeCompare(b.time))
                        .map(s => (
                          <div key={s.id} className="p-3 bg-white border border-border rounded-xl">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", getCategoryColor(s.category))}>
                                {getCategoryLabel(s.category)}
                              </span>
                              <span className="text-xs text-slate-500 font-semibold">{s.time}</span>
                            </div>
                            <p className="font-bold text-foreground">{s.title}</p>
                            {s.location && (
                              <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                                <MapPin className="w-3 h-3" /> {s.location}
                              </p>
                            )}
                            {s.cost && (
                              <p className="text-xs text-primary font-semibold mt-1">₩{s.cost.toLocaleString()}</p>
                            )}
                            {s.notes && <p className="text-xs text-slate-400 italic mt-1">"{s.notes}"</p>}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* 전체 일정 미리보기 */}
              {previewPlan.schedules.length > 0 && (
                <div>
                  <h4 className="font-bold text-foreground mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    {t('home.previewDialog.allSchedules', { n: previewPlan.schedules.length })}
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {previewPlan.schedules
                      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
                      .map(s => (
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
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => {
                    setCurrentPlan(previewPlan);
                    setShowPreviewDialog(false);
                  }}
                  className="flex-1 bg-primary text-white"
                >
                  <Edit2 className="w-4 h-4 mr-2" /> {t('home.previewDialog.editButton')}
                </Button>
                <Button
                  onClick={() => setShowPreviewDialog(false)}
                  variant="outline"
                  className="flex-1"
                >
                  {t('home.previewDialog.closeButton')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== 하위 컴포넌트 =====

function ScheduleCard({ schedule, isEditing, onEdit, onUpdate, onDelete, onCancel, getCategoryColor, getCategoryLabel, existingSchedules }: any) {
  const { t } = useLanguage();
  const [editData, setEditData] = React.useState(schedule);
  const [newPrep, setNewPrep] = React.useState('');
  const [showPicker, setShowPicker] = React.useState(false);

  const hasOverlap = (existingSchedules || []).some((s: ScheduleItem) =>
    s.id !== schedule.id && schedulesOverlap(editData.date, editData.time, editData.endTime, s)
  );

  const addPrep = () => {
    if (!newPrep.trim()) return;
    const preps = [...(editData.preparations || []), newPrep.trim()];
    setEditData({ ...editData, preparations: preps });
    setNewPrep('');
  };

  const removePrep = (idx: number) => {
    const preps = editData.preparations.filter((_: any, i: number) => i !== idx);
    setEditData({ ...editData, preparations: preps });
  };

  if (isEditing) {
    return (
      <Card className="p-6 bg-white border-primary/30 shadow-lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.schedule.form.titleLabel')} *</label>
              <Input
                value={editData.title}
                onChange={e => setEditData({ ...editData, title: e.target.value })}
                placeholder={t('home.schedule.form.titlePlaceholder')}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.schedule.form.categoryLabel')}</label>
              <select
                value={editData.category}
                onChange={e => setEditData({ ...editData, category: e.target.value })}
                className="w-full h-11 px-3 py-2 border border-input rounded-md text-sm bg-background"
              >
                <option value="accommodation">{t('home.category.accommodation')}</option>
                <option value="transport">{t('home.category.transport')}</option>
                <option value="meal">{t('home.category.meal')}</option>
                <option value="activity">{t('home.category.activity')}</option>
                <option value="other">{t('home.category.other')}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.schedule.form.dateLabel')} *</label>
              <Input type="date" value={editData.date} onChange={e => setEditData({ ...editData, date: e.target.value })} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.schedule.form.startTimeLabel')} *</label>
              <Input type="time" value={editData.time} onChange={e => setEditData({ ...editData, time: e.target.value })} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.schedule.form.endTimeLabel')}</label>
              <Input type="time" value={editData.endTime || ''} onChange={e => setEditData({ ...editData, endTime: e.target.value })} className="h-11" />
            </div>
          </div>
          {hasOverlap && (
            <p className="text-red-500 text-sm font-semibold">⚠ {t('home.schedule.overlapWarning')}</p>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">{t('home.schedule.form.locationLabel')}</label>
            <div className="flex gap-2">
              <Input value={editData.location || ''} onChange={e => setEditData({ ...editData, location: e.target.value })} placeholder={t('home.schedule.form.locationPlaceholder')} className="h-11" />
              <Button type="button" variant="outline" onClick={() => setShowPicker(true)} className="h-11 gap-1.5 flex-shrink-0">
                <MapPin className="w-4 h-4" /> {t('home.schedule.form.mapButton')}
              </Button>
            </div>
            {editData.lat !== undefined && editData.lng !== undefined && (
              <p className="text-xs text-primary flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {t('home.schedule.form.coordinatesSelected', { lat: editData.lat.toFixed(5), lng: editData.lng.toFixed(5) })}
                <button type="button" onClick={() => setEditData({ ...editData, lat: undefined, lng: undefined })} className="text-red-400 hover:text-red-600 ml-1">
                  <X className="w-3 h-3" />
                </button>
              </p>
            )}
            <LocationPickerDialog
              open={showPicker}
              onOpenChange={setShowPicker}
              initialLat={editData.lat}
              initialLng={editData.lng}
              onConfirm={(pickedLat, pickedLng, address) =>
                setEditData({ ...editData, lat: pickedLat, lng: pickedLng, location: address || editData.location })
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">{t('home.schedule.form.costLabel')}</label>
            <Input type="number" value={editData.cost || ''} onChange={e => setEditData({ ...editData, cost: e.target.value ? parseInt(e.target.value) : undefined })} placeholder="0" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">{t('home.schedule.form.linkLabel')}</label>
            <Input type="url" value={editData.link || ''} onChange={e => setEditData({ ...editData, link: e.target.value })} placeholder="https://..." className="h-11" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-foreground">{t('home.schedule.form.preparationsLabel')}</label>
            <div className="flex gap-2">
              <Input value={newPrep} onChange={e => setNewPrep(e.target.value)} placeholder={t('home.schedule.form.preparationsPlaceholder')} onKeyPress={e => e.key === 'Enter' && addPrep()} className="h-11" />
              <Button onClick={addPrep} size="sm" variant="secondary" className="h-11 px-4">{t('home.common.add')}</Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {editData.preparations?.map((p: string, i: number) => (
                <span key={i} className="bg-secondary px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 border border-border">
                  {p}
                  <button onClick={() => removePrep(i)} className="text-red-400 hover:text-red-600">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">{t('home.schedule.form.notesLabel')}</label>
            <Textarea
              value={editData.notes || ''}
              onChange={e => setEditData({ ...editData, notes: e.target.value })}
              placeholder={t('home.schedule.form.notesPlaceholder')}
              className="min-h-[100px] resize-y"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => onUpdate(schedule.id, editData)} className="flex-1 bg-primary h-11">{t('home.common.save')}</Button>
            <Button onClick={onCancel} variant="outline" className="flex-1 h-11">{t('home.common.cancel')}</Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 bg-white border-border hover:border-primary/50 transition-colors shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className={cn("px-3 py-1 rounded-full text-xs font-bold", getCategoryColor(schedule.category))}>
              {getCategoryLabel(schedule.category)}
            </span>
            <span className="text-sm font-bold text-slate-700">{schedule.date}</span>
            <span className="text-sm font-bold text-sky-600 ml-1.5">
              {schedule.time}{schedule.endTime ? ` - ${schedule.endTime}` : ''}
            </span>
          </div>
          <h4 className="text-xl font-bold text-foreground mb-2">{schedule.title}</h4>
          <div className="flex flex-wrap gap-4 text-sm text-slate-600">
            {schedule.location && <p className="flex items-center gap-1"><MapPin className="w-4 h-4 text-primary" /> {schedule.location}</p>}
            {schedule.cost && <p className="flex items-center gap-1"><DollarSign className="w-4 h-4 text-primary" /> ₩{schedule.cost.toLocaleString()}</p>}
          </div>
          {schedule.link && (
            <p className="flex items-center gap-2 text-sm text-primary mt-2">
              <LinkIcon className="w-4 h-4" />
              <a href={schedule.link} target="_blank" rel="noopener noreferrer" className="underline hover:text-muted-foreground">{t('home.schedule.form.linkLabel')}</a>
            </p>
          )}
          {schedule.preparations && schedule.preparations.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {schedule.preparations.map((p: string, i: number) => (
                <span key={i} className="text-xs bg-secondary text-muted-foreground px-2 py-1 rounded border border-border"># {p}</span>
              ))}
            </div>
          )}
          {schedule.notes && <p className="text-sm text-slate-500 mt-3 italic">"{schedule.notes}"</p>}
        </div>
        <div className="flex gap-2 ml-4">
          <button onClick={onEdit} className="p-2 text-slate-300 hover:text-primary transition-colors"><Edit2 className="w-4 h-4" /></button>
          <button onClick={() => onDelete(schedule.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
    </Card>
  );
}

function BudgetCard({ budget, isEditing, onEdit, onUpdate, onDelete, onCancel, getCategoryColor, getCategoryLabel }: any) {
  const { t } = useLanguage();
  const [editData, setEditData] = React.useState(budget);
  if (isEditing) {
    return (
      <Card className="p-5 bg-white border-primary/30">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">{t('home.budget.form.categoryLabel')}</label>
            <select value={editData.category} onChange={e => setEditData({ ...editData, category: e.target.value })} className="w-full h-11 px-3 py-2 border border-input rounded-md text-sm bg-background">
              <option value="accommodation">{t('home.category.accommodation')}</option><option value="transport">{t('home.category.transport')}</option><option value="meal">{t('home.category.meal')}</option><option value="activity">{t('home.category.activity')}</option><option value="shopping">{t('home.category.shopping')}</option><option value="other">{t('home.category.other')}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">{t('home.budget.form.amountLabel')}</label>
            <Input type="number" value={editData.amount} onChange={e => setEditData({ ...editData, amount: parseInt(e.target.value) })} placeholder={t('home.budget.form.amountPlaceholder')} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">{t('home.budget.form.descriptionLabel')}</label>
            <Input value={editData.description} onChange={e => setEditData({ ...editData, description: e.target.value })} placeholder={t('home.budget.form.descriptionLabel')} className="h-11" />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => onUpdate(budget.id, editData)} className="flex-1 bg-primary h-11">{t('home.common.save')}</Button>
            <Button onClick={onCancel} variant="outline" className="flex-1 h-11">{t('home.common.cancel')}</Button>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-4 bg-white border-border">
      <div className="flex items-center justify-between">
        <div>
          <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold mb-1 inline-block", getCategoryColor(budget.category))}>{getCategoryLabel(budget.category)}</span>
          <p className="font-bold text-foreground">{budget.description}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-black text-primary">₩{budget.amount.toLocaleString()}</p>
          <div className="flex gap-2 mt-1 justify-end">
            <button onClick={onEdit} className="text-slate-300 hover:text-primary"><Edit2 className="w-3 h-3" /></button>
            <button onClick={() => onDelete(budget.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ShoppingCard({ item, isEditing, onEdit, onUpdate, onDelete, onToggle, onCancel }: any) {
  const { t } = useLanguage();
  const [editData, setEditData] = React.useState(item);
  React.useEffect(() => { setEditData(item); }, [item]);
  if (isEditing) {
    return (
      <Card className="p-4 bg-white border-primary/30">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">{t('home.shopping.form.itemLabel')}</label>
            <Input value={editData.item} onChange={e => setEditData({ ...editData, item: e.target.value })} placeholder={t('home.shopping.form.itemLabel')} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">{t('home.shopping.form.imageUrlLabel')}</label>
            <Input value={editData.imageUrl || ''} onChange={e => setEditData({ ...editData, imageUrl: e.target.value })} placeholder={t('home.shopping.form.imageUrlLabel')} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">{t('home.shopping.form.productLinkLabel')}</label>
            <Input value={editData.link || ''} onChange={e => setEditData({ ...editData, link: e.target.value })} placeholder={t('home.shopping.form.productLinkLabel')} className="h-11" />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => onUpdate(editData.id, editData)} className="flex-1 bg-primary h-11">{t('home.common.save')}</Button>
            <Button onClick={onCancel} variant="outline" className="flex-1 h-11">{t('home.common.cancel')}</Button>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-4 bg-white border-border">
      <div className="flex items-start gap-4">
        {item.imageUrl && (
          <img src={item.imageUrl} alt={item.item} className="w-16 h-16 object-cover rounded border border-border" />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <input type="checkbox" checked={item.checked} onChange={() => onToggle(item.id)} className="w-5 h-5 rounded-full border-sky-300 text-primary" />
            <span className={cn("font-bold", item.checked ? "line-through text-slate-300" : "text-foreground")}>{item.item}</span>
          </div>
          {item.link && <a href={item.link} target="_blank" className="text-xs text-primary underline">{t('home.shopping.viewProduct')}</a>}
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="text-slate-300 hover:text-primary"><Edit2 className="w-4 h-4" /></button>
          <button onClick={() => onDelete(item.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
    </Card>
  );
}

function ScheduleForm({ onAdd, existingSchedules }: { onAdd: (schedule: ScheduleItem) => void; existingSchedules?: ScheduleItem[] }) {
  const { t } = useLanguage();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [category, setCategory] = useState<ScheduleItem['category']>('activity');
  const [location, setLocation] = useState('');
  const [lat, setLat] = useState<number | undefined>(undefined);
  const [lng, setLng] = useState<number | undefined>(undefined);
  const [showPicker, setShowPicker] = useState(false);
  const [cost, setCost] = useState('');
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  const [preps, setPreps] = useState('');

  const hasOverlap = (existingSchedules || []).some(s => schedulesOverlap(date, time, endTime || undefined, s));

  const handleSubmit = () => {
    if (!title || !date || !time) { toast.error(t('home.toast.requiredFields')); return; }
    onAdd({
      id: Date.now().toString(),
      title, date, time, endTime: endTime || undefined, category,
      location: location || undefined,
      lat, lng,
      cost: cost ? parseInt(cost) : undefined,
      link: link || undefined,
      notes: notes || undefined,
      preparations: preps ? preps.split(',').map(p => p.trim()).filter(Boolean) : []
    });
    setTitle(''); setDate(''); setTime(''); setEndTime(''); setLocation(''); setLat(undefined); setLng(undefined); setCost(''); setLink(''); setNotes(''); setPreps('');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.schedule.form.titleLabel')} <span className="text-red-500">*</span></label>
          <Input
            placeholder={t('home.schedule.form.titleExample')}
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.schedule.form.categoryLabel')}</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value as any)}
            className="w-full h-11 px-3 py-2 border border-input rounded-md text-sm bg-background"
          >
            <option value="accommodation">{t('home.category.accommodation')}</option>
            <option value="transport">{t('home.category.transport')}</option>
            <option value="meal">{t('home.category.meal')}</option>
            <option value="activity">{t('home.category.activity')}</option>
            <option value="other">{t('home.category.other')}</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.schedule.form.dateLabel')} <span className="text-red-500">*</span></label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.schedule.form.startTimeLabel')} <span className="text-red-500">*</span></label>
          <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.schedule.form.endTimeLabel')}</label>
          <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-11" />
        </div>
      </div>
      {hasOverlap && (
        <p className="text-red-500 text-sm font-semibold">⚠ {t('home.schedule.overlapWarning')}</p>
      )}

      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">{t('home.schedule.form.locationLabel')} <span className="text-slate-400 font-normal">({t('home.common.optional')})</span></label>
        <div className="flex gap-2">
          <Input
            placeholder={t('home.schedule.form.locationExample')}
            value={location}
            onChange={e => setLocation(e.target.value)}
            className="h-11"
          />
          <Button type="button" variant="outline" onClick={() => setShowPicker(true)} className="h-11 gap-1.5 flex-shrink-0">
            <MapPin className="w-4 h-4" /> {t('home.schedule.form.mapButton')}
          </Button>
        </div>
        {lat !== undefined && lng !== undefined && (
          <p className="text-xs text-primary flex items-center gap-1">
            <MapPin className="w-3 h-3" /> {t('home.schedule.form.coordinatesSelected', { lat: lat.toFixed(5), lng: lng.toFixed(5) })}
            <button type="button" onClick={() => { setLat(undefined); setLng(undefined); }} className="text-red-400 hover:text-red-600 ml-1">
              <X className="w-3 h-3" />
            </button>
          </p>
        )}
        <LocationPickerDialog
          open={showPicker}
          onOpenChange={setShowPicker}
          initialLat={lat}
          initialLng={lng}
          onConfirm={(pickedLat, pickedLng, address) => {
            setLat(pickedLat);
            setLng(pickedLng);
            if (address) setLocation(address);
          }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.schedule.form.costLabel')} <span className="text-slate-400 font-normal">({t('home.common.optional')})</span></label>
          <Input
            type="number"
            placeholder="0"
            value={cost}
            onChange={e => setCost(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.schedule.form.linkLabel')} <span className="text-slate-400 font-normal">({t('home.common.optional')})</span></label>
          <Input
            type="url"
            placeholder="https://..."
            value={link}
            onChange={e => setLink(e.target.value)}
            className="h-11"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">{t('home.schedule.form.preparationsLabel')} <span className="text-slate-400 font-normal">({t('home.schedule.form.preparationsHint')})</span></label>
        <Input
          placeholder={t('home.schedule.form.preparationsExample')}
          value={preps}
          onChange={e => setPreps(e.target.value)}
          className="h-11"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">{t('home.schedule.form.notesLabel')} <span className="text-slate-400 font-normal">({t('home.common.optional')})</span></label>
        <Textarea
          placeholder={t('home.schedule.form.notesFreeformPlaceholder')}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="min-h-[100px] resize-y"
        />
      </div>

      <Button onClick={handleSubmit} className="w-full bg-primary text-white h-11 text-base font-semibold">
        <Plus className="w-4 h-4 mr-2" /> {t('home.schedule.form.submitButton')}
      </Button>
    </div>
  );
}

function BudgetForm({ onAdd }: { onAdd: (budget: Budget) => void }) {
  const { t } = useLanguage();
  const [category, setCategory] = useState<Budget['category']>('other');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = () => {
    if (!amount) { toast.error(t('home.toast.enterAmount')); return; }
    onAdd({ id: Date.now().toString(), category, amount: parseInt(amount), description });
    setAmount(''); setDescription('');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">{t('home.budget.form.categoryLabel')}</label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value as any)}
          className="w-full h-11 px-3 py-2 border border-input rounded-md text-sm bg-background"
        >
          <option value="accommodation">{t('home.category.accommodation')}</option>
          <option value="transport">{t('home.category.transport')}</option>
          <option value="meal">{t('home.category.meal')}</option>
          <option value="activity">{t('home.category.activity')}</option>
          <option value="shopping">{t('home.category.shopping')}</option>
          <option value="other">{t('home.category.other')}</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">{t('home.budget.form.amountLabel')} <span className="text-red-500">*</span></label>
        <Input type="number" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} className="h-11" />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">{t('home.budget.form.descriptionLabel')}</label>
        <Input placeholder={t('home.budget.form.descriptionExample')} value={description} onChange={e => setDescription(e.target.value)} className="h-11" />
      </div>
      <Button onClick={handleSubmit} className="w-full bg-primary text-white h-11">
        <Plus className="w-4 h-4 mr-2" /> {t('home.budget.form.submitButton')}
      </Button>
    </div>
  );
}

function ShoppingForm({ onAdd }: { onAdd: (item: string, imageUrl?: string, link?: string) => void }) {
  const { t } = useLanguage();
  const [item, setItem] = React.useState('');
  const [imageUrl, setImageUrl] = React.useState('');
  const [link, setLink] = React.useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (!item) { toast.error(t('home.toast.enterItem')); return; }
    onAdd(item, imageUrl || undefined, link || undefined);
    setItem(''); setImageUrl(''); setLink('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setImageUrl(event.target?.result as string);
      toast.success(t('home.toast.imageUploaded'));
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (event) => {
            setImageUrl(event.target?.result as string);
            toast.success(t('home.toast.imagePasted'));
          };
          reader.readAsDataURL(blob);
        }
      }
    }
  };

  return (
    <div className="space-y-4" onPaste={handlePaste}>
      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-foreground">{t('home.shopping.form.itemLabel')} <span className="text-red-500">*</span></label>
        <Input
          placeholder={t('home.shopping.form.itemExample')}
          value={item}
          onChange={e => setItem(e.target.value)}
          className="h-11"
          onKeyPress={e => e.key === 'Enter' && handleSubmit()}
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-foreground">
          <ImageIcon className="w-4 h-4 inline mr-1" />
          {t('home.shopping.form.addImageLabel')}
        </label>
        <div className="space-y-2">
          {imageUrl && (
            <div className="relative w-full h-32 rounded border-2 border-sky-300 overflow-hidden">
              <img src={imageUrl} alt="preview" className="w-full h-full object-cover" />
              <button onClick={() => setImageUrl('')} className="absolute top-1 right-1 bg-[#A68B77] hover:bg-[#8B7968] text-white p-1 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full px-3 py-3 border-2 border-dashed border-sky-300 rounded-lg bg-secondary hover:bg-secondary text-foreground font-medium text-sm transition"
          >
            📁 {t('home.shopping.form.chooseFromGallery')}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
          <p className="text-xs text-muted-foreground">💡 {t('home.shopping.form.pasteTip')}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-foreground">
          <LinkIcon className="w-4 h-4 inline mr-1" />
          {t('home.shopping.form.productLinkLabel')}
        </label>
        <Input placeholder="https://..." value={link} onChange={e => setLink(e.target.value)} className="h-11" />



    </div>

      <Button onClick={handleSubmit} className="w-full bg-primary hover:bg-secondary0 text-white gap-2 h-11">
        <Plus className="w-4 h-4" /> {t('home.shopping.form.submitButton')}
      </Button>


          )

    </div>
  );
}

// ===== 커뮤니티 인기 여행 섹션 =====

interface TrendingPost {
  id: string;
  title: string;
  location: string;
  photos: { url: string; type?: 'photo' | 'video' }[];
  likes: string[];
  commentCount: number;
  viewCount: number;
  score: number;
  createdAt: string;
  userId: string;
}

interface TrendingLocation {
  location: string;
  score: number;
  searchCount: number;
  postCount: number;
  posts: TrendingPost[];
}

function CommunityTrending() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();

  const allTrendingPosts = React.useMemo((): TrendingPost[] => {
    try {
      const diaries: any[] = JSON.parse(localStorage.getItem('travelDiaries') || '[]').filter((d: any) => d.isPublic);
      if (diaries.length === 0) return [];
      const comments: any[] = JSON.parse(localStorage.getItem('diaryComments') || '[]');
      const views: Record<string, number> = JSON.parse(localStorage.getItem('diaryViews') || '{}');
      const locationSearches: Record<string, number> = JSON.parse(localStorage.getItem('locationSearches') || '{}');

      return diaries
        .map(d => {
          const cmtCount = comments.filter((c: any) => c.diaryId === d.id).length;
          const viewCount = views[d.id] || 0;
          const locBoost = (locationSearches[d.location] || 0) * 5;
          return {
            id: d.id,
            title: d.title,
            location: d.location,
            photos: d.photos || [],
            likes: d.likes || [],
            commentCount: cmtCount,
            viewCount,
            score: (d.likes?.length || 0) * 3 + cmtCount * 2 + viewCount + locBoost,
            createdAt: d.createdAt,
            userId: d.userId,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);
    } catch {
      return [];
    }
  }, []);

  if (allTrendingPosts.length === 0) return null;

  const navigateToCommunity = (post?: TrendingPost) => {
    if (post) { try { sessionStorage.setItem('trendingOpenDiaryId', post.id); } catch {} }
    setLocation('/community');
  };

  return (
    <section className="pt-2 pb-2">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-black text-foreground flex items-center gap-2.5">
            <Plane className="w-6 h-6 text-primary" fill="currentColor" strokeWidth={1} />
            {t('home.trending.title')}
          </h2>
          <p className="text-muted-foreground text-sm mt-0.5">{t('home.trending.subtitle')}</p>
        </div>
        <button
          onClick={() => navigateToCommunity()}
          className="text-sm text-primary font-semibold hover:underline flex items-center gap-1 flex-shrink-0"
        >
          {t('home.trending.viewAll')} <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 가로 스크롤 카드 */}
      <div className="flex gap-4 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
        {allTrendingPosts.map((post, idx) => (
          <button
            key={post.id}
            onClick={() => navigateToCommunity(post)}
            className="flex-shrink-0 w-52 text-left group"
          >
            <div className="relative w-52 h-36 rounded-2xl overflow-hidden bg-gradient-to-br from-secondary to-muted shadow-sm group-hover:shadow-md transition-shadow">
              {post.photos[0] && post.photos[0].type !== 'video' ? (
                <img
                  src={post.photos[0].url}
                  alt={post.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <BookOpen className="w-8 h-8 text-muted-foreground/40" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              {idx < 3 && (
                <div className={cn(
                  "absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black shadow",
                  idx === 0 ? "bg-amber-400 text-white" : idx === 1 ? "bg-slate-400 text-white" : "bg-amber-700 text-white"
                )}>
                  {idx + 1}
                </div>
              )}
              <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/55 text-white text-xs px-2 py-0.5 rounded-full">
                <Heart className="w-3 h-3 text-red-400 fill-red-400" />
                {post.likes.length}
              </div>
            </div>
            <div className="mt-2 px-0.5">
              <p className="text-[13px] font-bold text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                {post.title}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {post.location}
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

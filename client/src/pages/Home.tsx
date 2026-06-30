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
  TrendingUp, Heart, MessageCircle, Flame, Star,
  Search, Bell, ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import * as QRCodeLib from 'qrcode.react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Link, useLocation } from 'wouter';

interface ScheduleItem {
  id: string;
  date: string;
  time: string;
  title: string;
  category: 'accommodation' | 'transport' | 'meal' | 'activity' | 'other';
  location?: string;
  cost?: number;
  link?: string;
  notes?: string;
  preparations?: string[];
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
  schedules: ScheduleItem[];
  budgets: Budget[];
  shoppingList: ShoppingItem[];
}

export default function Home() {
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
    if (!newPlanTitle || !newPlanStartDate || !newPlanEndDate) {
      toast.error('모든 필드를 입력해주세요');
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
    toast.success('여행 계획이 생성되었습니다!');
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
      toast.error('제목을 입력해주세요');
      return;
    }
    updateCurrentPlan({ ...currentPlan, title: editTitleValue.trim() });
    setEditingTitle(false);
    toast.success('제목이 수정되었습니다!');
  };

  const handleCancelEditTitle = () => {
    setEditingTitle(false);
    setEditTitleValue('');
  };

  const handleAddSchedule = (schedule: ScheduleItem) => {
    if (!currentPlan) return;
    updateCurrentPlan({ ...currentPlan, schedules: [...currentPlan.schedules, schedule] });
    toast.success('일정이 추가되었습니다!');
  };

  const handleUpdateSchedule = (scheduleId: string, updatedSchedule: ScheduleItem) => {
    if (!currentPlan) return;
    updateCurrentPlan({
      ...currentPlan,
      schedules: currentPlan.schedules.map(s => s.id === scheduleId ? updatedSchedule : s),
    });
    setEditingScheduleId(null);
    toast.success('일정이 수정되었습니다!');
  };

  const handleDeleteSchedule = (scheduleId: string) => {
    if (!currentPlan) return;
    updateCurrentPlan({
      ...currentPlan,
      schedules: currentPlan.schedules.filter(s => s.id !== scheduleId),
    });
    toast.success('일정이 삭제되었습니다!');
  };

  const handleAddBudget = (budget: Budget) => {
    if (!currentPlan) return;
    updateCurrentPlan({ ...currentPlan, budgets: [...currentPlan.budgets, budget] });
    toast.success('예산이 추가되었습니다!');
  };

  const handleUpdateBudget = (budgetId: string, updatedBudget: Budget) => {
    if (!currentPlan) return;
    updateCurrentPlan({
      ...currentPlan,
      budgets: currentPlan.budgets.map(b => b.id === budgetId ? updatedBudget : b),
    });
    setEditingBudgetId(null);
    toast.success('예산이 수정되었습니다!');
  };

  const handleDeleteBudget = (budgetId: string) => {
    if (!currentPlan) return;
    updateCurrentPlan({
      ...currentPlan,
      budgets: currentPlan.budgets.filter(b => b.id !== budgetId),
    });
    toast.success('예산이 삭제되었습니다!');
  };

  const handleAddShoppingItem = (item: string, imageUrl?: string, link?: string) => {
    if (!currentPlan) return;
    const newItem: ShoppingItem = { id: Date.now().toString(), item, checked: false, imageUrl, link };
    updateCurrentPlan({ ...currentPlan, shoppingList: [...currentPlan.shoppingList, newItem] });
    toast.success('쇼핑 목록에 추가되었습니다!');
  };

  const handleUpdateShoppingItem = (itemId: string, updatedItem: ShoppingItem) => {
    if (!currentPlan) return;
    updateCurrentPlan({
      ...currentPlan,
      shoppingList: currentPlan.shoppingList.map(i => i.id === itemId ? updatedItem : i),
    });
    setEditingShoppingId(null);
    toast.success('쇼핑 목록이 수정되었습니다!');
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
      toast.error('팝업 차단을 해제해주세요.');
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
          <title>${currentPlan.title} - 여행 계획</title>
          <style>
            body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; line-height: 1.6; color: #333; padding: 40px; }
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
            <h2>🗓 여행 일정</h2>
            ${schedulesHtml || '<p>등록된 일정이 없습니다.</p>'}
          </div>

          <div class="section">
            <h2>💰 예산 계획</h2>
            ${budgetsHtml || '<p>등록된 예산이 없습니다.</p>'}
            <div class="total">총 합계: ₩${totalBudget.toLocaleString()}</div>
          </div>

          <div class="section">
            <h2>🛍 쇼핑 목록</h2>
            ${shoppingHtml || '<p>등록된 쇼핑 목록이 없습니다.</p>'}
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
    toast.success('인쇄/PDF 저장 창이 열렸습니다.');
  };

  // 여행 계획을 텍스트 파일로 저장하는 기능
  const saveAsTextFile = () => {
    if (!currentPlan) return;

    let content = `[여행 계획: ${currentPlan.title}]\n`;
    content += `기간: ${currentPlan.startDate} ~ ${currentPlan.endDate}\n\n`;
    
    content += `■ 여행 일정\n`;
    currentPlan.schedules.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).forEach((s, idx) => {
      content += `${idx + 1}. [${s.date} ${s.time}] ${getCategoryLabel(s.category)}: ${s.title}\n`;
      if (s.location) content += `   위치: ${s.location}\n`;
      if (s.cost) content += `   비용: ₩${s.cost.toLocaleString()}\n`;
      if (s.notes) content += `   메모: ${s.notes}\n`;
      if (s.preparations && s.preparations.length > 0) content += `   준비물: ${s.preparations.join(', ')}\n`;
      content += `\n`;
    });

    content += `■ 예산 현황\n`;
    const total = currentPlan.budgets.reduce((sum, b) => sum + b.amount, 0);
    currentPlan.budgets.forEach(b => {
      content += `- ${getCategoryLabel(b.category)}: ₩${b.amount.toLocaleString()} (${b.description})\n`;
    });
    content += `총 예산: ₩${total.toLocaleString()}\n\n`;

    content += `■ 쇼핑 목록\n`;
    currentPlan.shoppingList.forEach((item, idx) => {
      const status = item.checked ? '[V]' : '[ ]';
      content += `${status} ${idx + 1}. ${item.item}\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentPlan.title}_여행계획.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('여행 계획이 텍스트 파일로 저장되었습니다!');
  };

  const handleDownloadPDF = () => {
    if (!currentPlan || !pdfRef.current) return;
    const element = pdfRef.current;
    const printWindow = window.open('', '', 'height=800,width=1000');
    if (!printWindow) { toast.error('PDF 다운로드를 실패했습니다'); return; }
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(s => s.outerHTML).join('');
    printWindow.document.write(`<html><head><title>${currentPlan.title}</title>${styles}<style>@media print { .no-print { display: none; } body { background: white !important; } }</style></head><body><div>${element.innerHTML}</div></body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    toast.success('PDF 출력을 준비합니다!');
  };

  const handleDeletePlan = (planId: string) => {
    const updated = travelPlans.filter(p => p.id !== planId);
    updateTravelPlans(updated);
    if (currentPlan?.id === planId) setCurrentPlan(null);
    toast.success('여행 계획이 삭제되었습니다!');
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
      accommodation: '숙소', transport: '교통', meal: '식사',
      activity: '활동', shopping: '쇼핑', other: '기타',
    };
    return labels[category] || '기타';
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

  const getPlanThumbnail = (planId: string): string | null => {
    try {
      const diaries = JSON.parse(localStorage.getItem('travelDiaries') || '[]');
      const linked = diaries.find((d: any) => d.linkedPlanId === planId && d.photos?.length > 0);
      return linked?.photos[0]?.url || null;
    } catch { return null; }
  };

  return (
    <div className="min-h-screen bg-[#F8F7F4]">
      {/* 새 여행 계획 다이얼로그 */}
      <Dialog open={showNewPlanDialog} onOpenChange={setShowNewPlanDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>새로운 여행 계획</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">여행 제목</label>
              <Input placeholder="어디로 떠나시나요?" value={newPlanTitle} onChange={e => setNewPlanTitle(e.target.value)} className="h-11" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">시작일</label>
                <Input type="date" value={newPlanStartDate} onChange={e => setNewPlanStartDate(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">종료일</label>
                <Input type="date" value={newPlanEndDate} onChange={e => setNewPlanEndDate(e.target.value)} className="h-11" />
              </div>
            </div>
            <Button onClick={handleCreatePlan} className="w-full bg-primary text-white h-11 mt-2">계획 생성</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 헤더 ── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <button
            onClick={() => setCurrentPlan(null)}
            className="flex items-center gap-2 flex-shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
          >
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/30">
              <Plane className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-extrabold text-foreground tracking-tight hidden sm:block">Travel Planner</h1>
          </button>

          <nav className="flex items-center gap-1">
            <Link href="/">
              <button className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all bg-primary text-white shadow-sm">
                <Plane className="w-4 h-4" />
                <span className="hidden sm:inline">여행 계획</span>
              </button>
            </Link>
            <Link href="/diary">
              <button className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all text-muted-foreground hover:bg-secondary hover:text-foreground">
                <BookOpen className="w-4 h-4" />
                <span className="hidden sm:inline">여행 기록</span>
              </button>
            </Link>
            <Link href="/community">
              <button className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all text-muted-foreground hover:bg-secondary hover:text-foreground">
                <Globe className="w-4 h-4" />
                <span className="hidden sm:inline">커뮤니티</span>
              </button>
            </Link>
            {user?.isAdmin && (
              <Link href="/admin">
                <button className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all text-amber-600 hover:bg-amber-50">
                  <Shield className="w-4 h-4" />
                  <span className="hidden sm:inline">관리자</span>
                </button>
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-all border border-border">
              <Search className="w-4 h-4" />
            </button>
            <button className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-all border border-border">
              <Bell className="w-4 h-4" />
            </button>
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
                    <User className="w-4 h-4" /> 마이페이지
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={logout}
                  className="text-red-500 focus:text-red-500 focus:bg-red-50 cursor-pointer"
                >
                  <LogOut className="w-4 h-4 mr-2" /> 로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
                여행의 순간을 계획하고,<br />평생 간직할 추억을 만들어보세요.
              </h1>
              <p className="text-white/75 text-base md:text-lg mt-4 drop-shadow max-w-lg">
                나만의 여행 일정을 만들고, 기록하고, 공유해보세요.
              </p>
              <div className="flex flex-wrap gap-3 mt-8">
                <Button
                  onClick={() => setShowNewPlanDialog(true)}
                  className="bg-[#3B2B1E] hover:bg-[#2A1F16] text-white px-6 h-11 rounded-full gap-2 shadow-lg"
                >
                  <Plane className="w-4 h-4" /> 새 여행 시작하기
                </Button>
                <Link href="/community">
                  <Button
                    variant="outline"
                    className="bg-white/15 backdrop-blur-sm border-white/50 text-white hover:bg-white/25 px-6 h-11 rounded-full gap-2"
                  >
                    <Globe className="w-4 h-4" /> 여행 둘러보기
                  </Button>
                </Link>
              </div>
            </div>
            <div className="absolute top-4 right-4">
              <Button
                onClick={() => setShowNewPlanDialog(true)}
                className="bg-white/95 text-[#3B2B1E] hover:bg-white gap-1.5 rounded-full shadow-lg font-bold text-sm px-4 h-9"
              >
                <Plus className="w-4 h-4" /> 새 여행 계획
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
              { label: '여행 계획', value: travelPlans.length, sub: `진행 중 ${activeCount}개`, icon: <Map className="w-5 h-5" />, bg: 'bg-blue-100', color: 'text-blue-600' },
              { label: '예정된 일정', value: totalSchedules, sub: `이번 달 ${thisMonthSchedules}개`, icon: <Calendar className="w-5 h-5" />, bg: 'bg-emerald-100', color: 'text-emerald-600' },
              { label: '작성한 일기', value: myDiaries.length, sub: `이번 달 ${thisMonthDiaries}개`, icon: <BookOpen className="w-5 h-5" />, bg: 'bg-orange-100', color: 'text-orange-600' },
              { label: '방문한 지역', value: uniqueLocations, sub: `총 ${uniqueLocations}개 여행지`, icon: <MapPin className="w-5 h-5" />, bg: 'bg-purple-100', color: 'text-purple-600' },
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
                  <Calendar className="w-4 h-4 text-primary" /> 여행 캘린더
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
                    { color: 'bg-sky-200', label: '여행 일정이 있는 날' },
                    { color: 'bg-emerald-400', label: '진행 중인 여행' },
                    { color: 'bg-blue-400', label: '예정된 여행' },
                    { color: 'bg-slate-300', label: '완료된 여행' },
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
                <h2 className="text-xl font-black text-foreground">내 여행 계획</h2>
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
                      {f === 'all' ? '전체' : f}
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
                      <h2 className="text-xl font-bold text-foreground mb-2">등록된 여행이 없습니다</h2>
                      <p className="text-muted-foreground mb-6">첫 번째 여행 계획을 세워보세요!</p>
                      <Button onClick={() => setShowNewPlanDialog(true)} className="bg-primary">시작하기</Button>
                    </Card>
                  );
                }
                if (filtered.length === 0) {
                  return (
                    <div className="py-12 text-center">
                      <p className="text-base font-semibold text-muted-foreground">'{planFilter}' 여행이 없습니다.</p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-3">
                    {filtered.map((plan, idx) => {
                      const status = getPlanStatus(plan);
                      const thumbnail = getPlanThumbnail(plan.id);
                      const budget = plan.budgets.reduce((s, b) => s + b.amount, 0);
                      return (
                        <Card
                          key={plan.id}
                          className="flex gap-4 p-4 cursor-pointer hover:shadow-md transition-all bg-white border-border hover:border-primary/30 group"
                          onClick={() => setCurrentPlan(plan)}
                        >
                          <div className="w-20 h-20 md:w-[88px] md:h-[88px] rounded-xl overflow-hidden flex-shrink-0">
                            {thumbnail ? (
                              <img src={thumbnail} alt={plan.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className={cn("w-full h-full bg-gradient-to-br flex items-center justify-center", PLAN_GRADIENTS[idx % PLAN_GRADIENTS.length])}>
                                <Plane className="w-7 h-7 text-white/80" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h3 className="font-bold text-foreground text-[15px] leading-snug line-clamp-1 group-hover:text-primary transition-colors">{plan.title}</h3>
                              <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0", STATUS_STYLES[status])}>
                                {status}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {plan.startDate} ~ {plan.endDate}
                            </p>
                            <div className="flex items-center gap-3 mt-2 text-xs">
                              <span className="text-muted-foreground">일정 {plan.schedules.length}개</span>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-primary font-semibold">예산 ₩{budget.toLocaleString()}</span>
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
              <div>
                <button
                  onClick={() => { setCurrentPlan(null); setEditingTitle(false); }}
                  className="text-primary font-semibold text-sm hover:underline mb-2 flex items-center gap-1"
                >
                  ← 목록으로 돌아가기
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
                      <Check className="w-4 h-4" /> 저장
                    </Button>
                    <Button onClick={handleCancelEditTitle} size="sm" variant="outline" className="gap-1">
                      <X className="w-4 h-4" /> 취소
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
                      title="제목 수정"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                  </div>
                )}

                <p className="text-muted-foreground font-medium mt-1 flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> {currentPlan.startDate} ~ {currentPlan.endDate}
                </p>
              </div>
              <div className="flex gap-3">
                <Button onClick={generateComprehensivePDF} className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-100">
                  <Download className="w-4 h-4 mr-2" /> PDF 저장
                </Button>
                <Button onClick={() => setShowShareModal(true)} className="bg-primary shadow-lg shadow-border">
                  <Share2 className="w-4 h-4 mr-2" /> 공유하기
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* 사이드바: 달력 및 요약 */}
              <div className="lg:col-span-4 space-y-6">
                <Card className="p-6 bg-white border-border shadow-sm">
                  <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary" /> 여행 달력
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
                    <p>💡 달력에서 날짜를 클릭하면 해당 날짜의 일정을 확인할 수 있습니다.</p>
                  </div>
                </Card>

                <Card className="p-6 bg-gradient-to-br from-primary to-[#8B7968] text-white shadow-lg shadow-border">
                  <h3 className="text-lg font-bold mb-4">여행 요약</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-white/80 text-xs uppercase tracking-wider font-bold">총 예산</p>
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
                        <p className="text-xs font-bold">전체 일정</p>
                        <p className="text-xl font-bold">{currentPlan.schedules.length}개</p>
                      </div>
                      <div className="bg-white/20 p-3 rounded-xl">
                        <p className="text-xs font-bold">체크리스트</p>
                        <p className="text-xl font-bold">{currentPlan.shoppingList.filter(i => i.checked).length}/{currentPlan.shoppingList.length}</p>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* 메인: 탭 컨텐츠 */}
              <div className="lg:col-span-8">
                <Tabs defaultValue="schedule" className="w-full">
                  <TabsList className="grid w-full grid-cols-4 bg-secondary/50 p-1 rounded-2xl mb-6">
                    <TabsTrigger value="schedule" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">일정</TabsTrigger>
                    <TabsTrigger value="budget" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">예산</TabsTrigger>
                    <TabsTrigger value="shopping" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">쇼핑</TabsTrigger>
                    <TabsTrigger value="summary" className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm">준비물</TabsTrigger>
                  </TabsList>

                  {/* 일정 탭 */}
                  <TabsContent value="schedule" className="space-y-6">
                    <Card className="p-6 bg-white border-border">
                      <h3 className="text-lg font-bold text-foreground mb-5">새 일정 추가</h3>
                      <ScheduleForm onAdd={handleAddSchedule} />
                    </Card>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold text-foreground">
                          {selectedDate ? `${getDateString(selectedDate)} 일정` : '전체 일정'}
                        </h3>
                        {selectedDate && (
                          <Button variant="ghost" size="sm" onClick={() => setSelectedDate(undefined)} className="text-muted-foreground">
                            전체보기
                          </Button>
                        )}
                      </div>

                      {filteredSchedules.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-2xl border border-border">
                          <p className="text-slate-400">일정이 없습니다. 새로운 일정을 추가해보세요!</p>
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
                            />
                          ))
                      )}
                    </div>
                  </TabsContent>

                  {/* 예산 탭 */}
                  <TabsContent value="budget" className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Card className="p-6 bg-white border-border">
                        <h3 className="text-lg font-bold text-foreground mb-4">예산 추가</h3>
                        <BudgetForm onAdd={handleAddBudget} />
                      </Card>
                      <Card className="p-6 bg-white border-border">
                        <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                          <Info className="w-4 h-4 text-primary" /> 간편 계산기
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
                            <Button onClick={handleCalcClear} className="col-span-4 h-12 font-bold bg-[#A68B77] hover:bg-[#8B7968] text-white border-0">CLEAR (ESC)</Button>
                          </div>
                        </div>
                      </Card>
                    </div>
                    <div className="space-y-4">
                      <h3 className="text-xl font-bold text-foreground">지출 내역</h3>
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
                      <h3 className="text-lg font-bold text-foreground mb-4">쇼핑/체크리스트 추가</h3>
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
                      <h3 className="text-lg font-bold text-foreground mb-4">준비물 목록</h3>
                      <div className="space-y-4">
                        {currentPlan.schedules.filter(s => s.preparations && s.preparations.length > 0).length === 0 ? (
                          <div className="text-center py-12 bg-secondary rounded-2xl">
                            <p className="text-slate-400">일정별 준비물을 등록하면 이곳에서 모아볼 수 있습니다.</p>
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
                </Tabs>
              </div>
            </div>

            {/* PDF 전용 레이아웃 (캡처용) */}
            <div ref={pdfRef} id="pdf-content" className="fixed -left-[9999px] top-0 bg-white" style={{ display: 'none', fontFamily: "'Noto Sans KR', sans-serif" }}>
              <div className="p-10 bg-white text-slate-900 w-[800px]">
                <div className="border-b-4 border-primary pb-6 mb-8">
                  <h1 className="text-4xl font-black text-foreground mb-2">{currentPlan.title}</h1>
                  <p className="text-xl text-muted-foreground font-bold">{currentPlan.startDate} ~ {currentPlan.endDate}</p>
                </div>
                
                <div className="mb-10">
                  <h2 className="text-2xl font-bold text-foreground mb-6 border-b pb-2">📅 여행 일정</h2>
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
                    <h2 className="text-2xl font-bold text-foreground mb-6 border-b pb-2">💰 예산 현황</h2>
                    <div className="space-y-2">
                      {currentPlan.budgets.map(b => (
                        <div key={b.id} className="flex justify-between items-center p-2 border-b border-slate-100">
                          <span className="text-sm">{b.description}</span>
                          <span className="text-sm font-bold">₩{b.amount.toLocaleString()}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center p-2 bg-primary/10 rounded mt-2">
                        <span className="font-bold">총 합계</span>
                        <span className="font-bold text-primary">₩{totalBudget.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-foreground mb-6 border-b pb-2">🛍️ 쇼핑 목록</h2>
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
                <DialogTitle>공유 및 저장 옵션</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <Button
                  onClick={() => { generateComprehensivePDF(); setShowShareModal(false); }}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" /> 통합 PDF로 저장 (일정/예산/쇼핑/준비물)
                </Button>
                <Button
                  onClick={() => { saveAsTextFile(); setShowShareModal(false); }}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" /> 여행 계획 파일(.txt)로 저장
                </Button>
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    toast.success('공유 링크가 클립보드에 복사되었습니다!');
                    setShowShareModal(false);
                  }}
                  className="w-full bg-purple-500 hover:bg-purple-600 text-white flex items-center justify-center gap-2"
                >
                  <Share2 className="w-4 h-4" /> 현재 페이지 링크 복사
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
              {previewPlan?.title} - 미리보기
            </DialogTitle>
          </DialogHeader>
          {previewPlan && (
            <div className="space-y-4 pt-2">
              {/* 기본 정보 */}
              <div className="p-4 bg-secondary rounded-xl border border-border">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider mb-1">여행 기간</p>
                    <p className="font-bold text-foreground">{previewPlan.startDate} ~ {previewPlan.endDate}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider mb-1">총 예산</p>
                    <p className="font-bold text-primary text-lg">₩{previewPlan.budgets.reduce((s, b) => s + b.amount, 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider mb-1">일정 수</p>
                    <p className="font-bold text-foreground">{previewPlan.schedules.length}개</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider mb-1">쇼핑 목록</p>
                    <p className="font-bold text-foreground">{previewPlan.shoppingList.filter(i => i.checked).length}/{previewPlan.shoppingList.length} 완료</p>
                  </div>
                </div>
              </div>

              {/* 선택된 날짜의 일정 */}
              {homeCalendarDate && (
                <div>
                  <h4 className="font-bold text-foreground mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    {getDateString(homeCalendarDate)} 일정
                  </h4>
                  {previewPlan.schedules
                    .filter(s => s.date === getDateString(homeCalendarDate))
                    .sort((a, b) => a.time.localeCompare(b.time))
                    .length === 0 ? (
                    <p className="text-slate-400 text-sm py-4 text-center bg-slate-50 rounded-xl">이 날짜에는 등록된 일정이 없습니다.</p>
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
                    전체 일정 ({previewPlan.schedules.length}개)
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
                  <Edit2 className="w-4 h-4 mr-2" /> 수정하기
                </Button>
                <Button
                  onClick={() => setShowPreviewDialog(false)}
                  variant="outline"
                  className="flex-1"
                >
                  닫기
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

function ScheduleCard({ schedule, isEditing, onEdit, onUpdate, onDelete, onCancel, getCategoryColor, getCategoryLabel }: any) {
  const [editData, setEditData] = React.useState(schedule);
  const [newPrep, setNewPrep] = React.useState('');

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
              <label className="text-sm font-semibold text-foreground">일정 제목 *</label>
              <Input
                value={editData.title}
                onChange={e => setEditData({ ...editData, title: e.target.value })}
                placeholder="제목"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">카테고리</label>
              <select
                value={editData.category}
                onChange={e => setEditData({ ...editData, category: e.target.value })}
                className="w-full h-11 px-3 py-2 border border-input rounded-md text-sm bg-background"
              >
                <option value="accommodation">숙소</option>
                <option value="transport">교통</option>
                <option value="meal">식사</option>
                <option value="activity">활동</option>
                <option value="other">기타</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">날짜 *</label>
              <Input type="date" value={editData.date} onChange={e => setEditData({ ...editData, date: e.target.value })} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">시간 *</label>
              <Input type="time" value={editData.time} onChange={e => setEditData({ ...editData, time: e.target.value })} className="h-11" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">위치</label>
            <Input value={editData.location || ''} onChange={e => setEditData({ ...editData, location: e.target.value })} placeholder="위치 입력" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">비용 (원)</label>
            <Input type="number" value={editData.cost || ''} onChange={e => setEditData({ ...editData, cost: e.target.value ? parseInt(e.target.value) : undefined })} placeholder="0" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">예약 링크</label>
            <Input type="url" value={editData.link || ''} onChange={e => setEditData({ ...editData, link: e.target.value })} placeholder="https://..." className="h-11" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-foreground">준비물</label>
            <div className="flex gap-2">
              <Input value={newPrep} onChange={e => setNewPrep(e.target.value)} placeholder="예: 여권, 우산" onKeyPress={e => e.key === 'Enter' && addPrep()} className="h-11" />
              <Button onClick={addPrep} size="sm" variant="secondary" className="h-11 px-4">추가</Button>
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
            <label className="text-sm font-semibold text-foreground">메모</label>
            <Textarea
              value={editData.notes || ''}
              onChange={e => setEditData({ ...editData, notes: e.target.value })}
              placeholder="메모를 입력하세요..."
              className="min-h-[100px] resize-y"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => onUpdate(schedule.id, editData)} className="flex-1 bg-primary h-11">저장</Button>
            <Button onClick={onCancel} variant="outline" className="flex-1 h-11">취소</Button>
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
            <span className="text-sm font-bold text-slate-500">{schedule.date} {schedule.time}</span>
          </div>
          <h4 className="text-xl font-bold text-foreground mb-2">{schedule.title}</h4>
          <div className="flex flex-wrap gap-4 text-sm text-slate-600">
            {schedule.location && <p className="flex items-center gap-1"><MapPin className="w-4 h-4 text-primary" /> {schedule.location}</p>}
            {schedule.cost && <p className="flex items-center gap-1"><DollarSign className="w-4 h-4 text-primary" /> ₩{schedule.cost.toLocaleString()}</p>}
          </div>
          {schedule.link && (
            <p className="flex items-center gap-2 text-sm text-primary mt-2">
              <LinkIcon className="w-4 h-4" />
              <a href={schedule.link} target="_blank" rel="noopener noreferrer" className="underline hover:text-muted-foreground">예약 링크</a>
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
  const [editData, setEditData] = React.useState(budget);
  if (isEditing) {
    return (
      <Card className="p-5 bg-white border-primary/30">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">카테고리</label>
            <select value={editData.category} onChange={e => setEditData({ ...editData, category: e.target.value })} className="w-full h-11 px-3 py-2 border border-input rounded-md text-sm bg-background">
              <option value="accommodation">숙소</option><option value="transport">교통</option><option value="meal">식사</option><option value="activity">활동</option><option value="shopping">쇼핑</option><option value="other">기타</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">금액 (원)</label>
            <Input type="number" value={editData.amount} onChange={e => setEditData({ ...editData, amount: parseInt(e.target.value) })} placeholder="금액" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">설명</label>
            <Input value={editData.description} onChange={e => setEditData({ ...editData, description: e.target.value })} placeholder="설명" className="h-11" />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => onUpdate(budget.id, editData)} className="flex-1 bg-primary h-11">저장</Button>
            <Button onClick={onCancel} variant="outline" className="flex-1 h-11">취소</Button>
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
  const [editData, setEditData] = React.useState(item);
  React.useEffect(() => { setEditData(item); }, [item]);
  if (isEditing) {
    return (
      <Card className="p-4 bg-white border-primary/30">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">물품명</label>
            <Input value={editData.item} onChange={e => setEditData({ ...editData, item: e.target.value })} placeholder="물품명" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">이미지 URL</label>
            <Input value={editData.imageUrl || ''} onChange={e => setEditData({ ...editData, imageUrl: e.target.value })} placeholder="이미지 URL" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">상품 링크</label>
            <Input value={editData.link || ''} onChange={e => setEditData({ ...editData, link: e.target.value })} placeholder="상품 링크" className="h-11" />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => onUpdate(editData.id, editData)} className="flex-1 bg-primary h-11">저장</Button>
            <Button onClick={onCancel} variant="outline" className="flex-1 h-11">취소</Button>
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
          {item.link && <a href={item.link} target="_blank" className="text-xs text-primary underline">상품 보기</a>}
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="text-slate-300 hover:text-primary"><Edit2 className="w-4 h-4" /></button>
          <button onClick={() => onDelete(item.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
    </Card>
  );
}

function ScheduleForm({ onAdd }: { onAdd: (schedule: ScheduleItem) => void }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [category, setCategory] = useState<ScheduleItem['category']>('activity');
  const [location, setLocation] = useState('');
  const [cost, setCost] = useState('');
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  const [preps, setPreps] = useState('');

  const handleSubmit = () => {
    if (!title || !date || !time) { toast.error('필수 정보를 입력해주세요'); return; }
    onAdd({
      id: Date.now().toString(),
      title, date, time, category,
      location: location || undefined,
      cost: cost ? parseInt(cost) : undefined,
      link: link || undefined,
      notes: notes || undefined,
      preparations: preps ? preps.split(',').map(p => p.trim()).filter(Boolean) : []
    });
    setTitle(''); setDate(''); setTime(''); setLocation(''); setCost(''); setLink(''); setNotes(''); setPreps('');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">일정 제목 <span className="text-red-500">*</span></label>
          <Input
            placeholder="예: 인천공항 출발"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">카테고리</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value as any)}
            className="w-full h-11 px-3 py-2 border border-input rounded-md text-sm bg-background"
          >
            <option value="accommodation">숙소</option>
            <option value="transport">교통</option>
            <option value="meal">식사</option>
            <option value="activity">활동</option>
            <option value="other">기타</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">날짜 <span className="text-red-500">*</span></label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">시간 <span className="text-red-500">*</span></label>
          <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="h-11" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">위치 <span className="text-slate-400 font-normal">(선택)</span></label>
        <Input
          placeholder="예: 인천국제공항 제1터미널"
          value={location}
          onChange={e => setLocation(e.target.value)}
          className="h-11"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">비용 (원) <span className="text-slate-400 font-normal">(선택)</span></label>
          <Input
            type="number"
            placeholder="0"
            value={cost}
            onChange={e => setCost(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">예약 링크 <span className="text-slate-400 font-normal">(선택)</span></label>
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
        <label className="text-sm font-semibold text-foreground">준비물 <span className="text-slate-400 font-normal">(쉼표로 구분)</span></label>
        <Input
          placeholder="예: 여권, 우산, 선크림"
          value={preps}
          onChange={e => setPreps(e.target.value)}
          className="h-11"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">메모 <span className="text-slate-400 font-normal">(선택)</span></label>
        <Textarea
          placeholder="일정에 대한 메모를 자유롭게 입력하세요..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="min-h-[100px] resize-y"
        />
      </div>

      <Button onClick={handleSubmit} className="w-full bg-primary text-white h-11 text-base font-semibold">
        <Plus className="w-4 h-4 mr-2" /> 일정 추가
      </Button>
    </div>
  );
}

function BudgetForm({ onAdd }: { onAdd: (budget: Budget) => void }) {
  const [category, setCategory] = useState<Budget['category']>('other');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = () => {
    if (!amount) { toast.error('금액을 입력해주세요'); return; }
    onAdd({ id: Date.now().toString(), category, amount: parseInt(amount), description });
    setAmount(''); setDescription('');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">카테고리</label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value as any)}
          className="w-full h-11 px-3 py-2 border border-input rounded-md text-sm bg-background"
        >
          <option value="accommodation">숙소</option>
          <option value="transport">교통</option>
          <option value="meal">식사</option>
          <option value="activity">활동</option>
          <option value="shopping">쇼핑</option>
          <option value="other">기타</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">금액 (원) <span className="text-red-500">*</span></label>
        <Input type="number" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} className="h-11" />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">설명</label>
        <Input placeholder="예: 호텔 2박" value={description} onChange={e => setDescription(e.target.value)} className="h-11" />
      </div>
      <Button onClick={handleSubmit} className="w-full bg-primary text-white h-11">
        <Plus className="w-4 h-4 mr-2" /> 예산 추가
      </Button>
    </div>
  );
}

function ShoppingForm({ onAdd }: { onAdd: (item: string, imageUrl?: string, link?: string) => void }) {
  const [item, setItem] = React.useState('');
  const [imageUrl, setImageUrl] = React.useState('');
  const [link, setLink] = React.useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (!item) { toast.error('항목을 입력해주세요'); return; }
    onAdd(item, imageUrl || undefined, link || undefined);
    setItem(''); setImageUrl(''); setLink('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setImageUrl(event.target?.result as string);
      toast.success('이미지가 업로드되었습니다!');
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
            toast.success('이미지가 붙여넣기되었습니다!');
          };
          reader.readAsDataURL(blob);
        }
      }
    }
  };

  return (
    <div className="space-y-4" onPaste={handlePaste}>
      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-foreground">쇼핑 항목 <span className="text-red-500">*</span></label>
        <Input
          placeholder="예: 선글라스, 선크림"
          value={item}
          onChange={e => setItem(e.target.value)}
          className="h-11"
          onKeyPress={e => e.key === 'Enter' && handleSubmit()}
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-foreground">
          <ImageIcon className="w-4 h-4 inline mr-1" />
          이미지 추가
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
            📁 갤러리에서 선택
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
          <p className="text-xs text-muted-foreground">💡 팁: 이미지를 복사해서 여기에 붙여넣기(Ctrl+V)도 가능합니다!</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-foreground">
          <LinkIcon className="w-4 h-4 inline mr-1" />
          상품 링크
        </label>
        <Input placeholder="https://..." value={link} onChange={e => setLink(e.target.value)} className="h-11" />
      
      

    </div>

      <Button onClick={handleSubmit} className="w-full bg-primary hover:bg-secondary0 text-white gap-2 h-11">
        <Plus className="w-4 h-4" /> 항목 추가
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
  photos: { url: string }[];
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
            <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-red-500 rounded-xl flex items-center justify-center shadow-md">
              <Flame className="w-4 h-4 text-white" />
            </div>
            커뮤니티 인기 여행
          </h2>
          <p className="text-muted-foreground text-sm mt-0.5">검색량과 반응이 높은 인기 게시글</p>
        </div>
        <button
          onClick={() => navigateToCommunity()}
          className="text-sm text-primary font-semibold hover:underline flex items-center gap-1 flex-shrink-0"
        >
          전체 보기 <ChevronRight className="w-4 h-4" />
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
            <div className="relative w-52 h-36 rounded-2xl overflow-hidden bg-gradient-to-br from-orange-100 to-red-100 shadow-sm group-hover:shadow-md transition-shadow">
              {post.photos[0] ? (
                <img
                  src={post.photos[0].url}
                  alt={post.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <BookOpen className="w-8 h-8 text-orange-300" />
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
              <p className="text-[13px] font-bold text-foreground line-clamp-2 leading-snug group-hover:text-orange-600 transition-colors">
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

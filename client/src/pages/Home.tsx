import React, { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
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
  ChevronRight, ChevronLeft, Eye, BookOpen, Globe, Shield, Crown,
  TrendingUp, Heart, MessageCircle, Star, Bookmark,
  ChevronDown, Camera, Hotel, Phone, Navigation, Hash, ArrowRight, Loader2, Lock, Sparkles, Copy
} from 'lucide-react';
import { toast } from 'sonner';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import * as QRCodeLib from 'qrcode.react';
import { cn, copyToClipboard } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Link, useLocation } from 'wouter';
import { MapView, type MapMarker, geocodeAddress } from '@/components/Map';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { recordGeminiUsage } from '@/lib/geminiUsage';
import { paymentsApi } from '@/lib/api/payments';
import { AiCreditsPaywallModal } from '@/components/AiCreditsPaywallModal';

// 해외 지도(MapLibre GL)는 용량이 커서, 실제로 "해외" 모드를 선택했을 때만 불러오도록 지연 로딩
const OverseasMapView = lazy(() =>
  import('@/components/OverseasMap').then(m => ({ default: m.OverseasMapView }))
);
import { LocationPickerDialog } from '@/components/LocationPickerDialog';
import { WeatherWidget } from '@/components/WeatherWidget';
import { useLanguage } from '@/contexts/LanguageContext';
import NotificationBell from '@/components/NotificationBell';
import HeaderSearch from '@/components/HeaderSearch';
import { plansApi } from '@/lib/api/plans';
import { uploadDataUrl } from '@/lib/api/media';
import { diariesApi } from '@/lib/api/diaries';
import { communityApi } from '@/lib/api/community';
import type { DiaryEntry } from '@shared/types';

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

const CATEGORY_CHART_COLORS: Record<string, string> = {
  accommodation: '#FBE9E3',
  transport: '#FBCFCA',
  meal: '#F4B9B9',
  activity: '#8A8F75',
  shopping: '#7B5F52',
  other: '#E6DCD8',
};

interface ShoppingItem {
  id: string;
  item: string;
  checked: boolean;
  imageUrl?: string;
  link?: string;
}

interface Accommodation {
  id: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  checkInDate: string;
  checkInTime?: string;
  checkOutDate: string;
  checkOutTime?: string;
  phone?: string;
  reservationNumber?: string;
  link?: string;
  notes?: string;
}

interface Flight {
  id: string;
  airline: string;
  flightNumber: string;
  reservationNumber?: string;
  departureAirport: string;
  arrivalAirport: string;
  departureDate: string;
  departureTime?: string;
  arrivalDate: string;
  arrivalTime?: string;
  terminal?: string;
  gate?: string;
  seat?: string;
  boardingTime?: string;
}

interface TravelPlan {
  id: string;
  userId: string;
  title: string;
  startDate: string;
  endDate: string;
  /** 여행 전체가 국내인지 해외인지 — 생성 시 결정되며, 지도(네이버 vs OpenStreetMap) 선택에 사용됨 */
  region: 'domestic' | 'overseas';
  coverPhoto?: string;
  schedules: ScheduleItem[];
  budgets: Budget[];
  shoppingList: ShoppingItem[];
  accommodations?: Accommodation[];
  flights?: Flight[];
  preparationChecks?: Record<string, boolean>;
  totalBudgetAmount?: number;
  /** AI로 계획을 생성할 때 선택한 인원수(1~10명) — 예산 탭에서 1인당 예산 계산에 사용됨 */
  travelers?: number;
  /** 커뮤니티/다이어리에 이 계획이 연결되어 공개됐을 때, 다른 회원이 자신의 여행 계획으로 복제해갈 수 있도록 작성자가 허용했는지 여부. 기본값은 false(비허용) */
  allowClone?: boolean;
}

// /api/plan-trip 응답 형태 (server/gemini.ts의 Itinerary와 동일한 구조를 클라이언트에서 느슨하게 재정의).
// 서버 응답은 신뢰할 수 없는 입력으로 취급 — 아래 변환 로직에서 필드마다 방어적으로 검증한다.
// /api/plan-trip 실패 응답의 code(예: "rate_limited")를 에러 문구를 파싱하지 않고도
// catch 블록에서 구분해 분기할 수 있도록 하는 최소한의 에러 타입
class AiPlanRequestError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

interface AiItineraryItem {
  time?: unknown;
  title?: unknown;
  description?: unknown;
  location?: unknown;
  category?: unknown;
  preparations?: unknown;
}

interface AiItineraryDay {
  day?: unknown;
  summary?: unknown;
  items?: unknown;
}

interface AiItineraryBudgetItem {
  category?: unknown;
  amount?: unknown;
  description?: unknown;
}

interface AiItinerary {
  destination?: unknown;
  region?: unknown;
  days?: unknown;
  budgets?: unknown;
  tips?: unknown;
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

// 시간 입력값(HH:mm, 24시간제)을 "h:mm AM/PM" 형식으로 바꿔 계획을 읽을 때 가독성을 높임.
// <input type="time"> 편집 위젯 자체는 그대로 24시간제를 사용하고, 읽기 전용 화면에서만 이 함수를 거친다.
function formatTime12h(time?: string): string {
  if (!time) return '';
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return time;
  const minute = match[2];
  let hour = parseInt(match[1], 10);
  if (Number.isNaN(hour)) return time;
  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${period}`;
}

function schedulesOverlap(aDate: string, aStart: string, aEnd: string | undefined, b: ScheduleItem): boolean {
  if (!aDate || !aStart || aDate !== b.date) return false;
  const s1 = aStart, e1 = aEnd || aStart;
  const s2 = b.time, e2 = b.endTime || b.time;
  return s1 < e2 && s2 < e1;
}

// 준비물 항목 하나에 쉼표로 여러 개가 함께 적혀 있는 경우(예: 편집 화면에서 "여행 가방, 여권, 선글라스"를
// 한 번에 입력한 경우)에도 항상 개별 항목으로 쪼개서 각각 따로 체크/표시할 수 있도록 정규화
function splitPreparationItems(preparations?: string[]): string[] {
  return (preparations || []).flatMap(p => p.split(',').map(x => x.trim()).filter(Boolean));
}

// 계획에 속한 모든 일정의 준비물을 모아 이름 기준으로 중복 제거한 목록 — 전체 준비물 체크리스트,
// PDF/텍스트 내보내기가 모두 이 목록을 공유해 어디서나 동일하게 하나씩만 체크되도록 함
function getUniquePreparationLabels(plan: TravelPlan): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  [...plan.schedules]
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .forEach(s => {
      splitPreparationItems(s.preparations).forEach(label => {
        if (seen.has(label)) return;
        seen.add(label);
        labels.push(label);
      });
    });
  return labels;
}

// 다른 시점/버전에서 저장된 데이터에는 schedules/budgets/shoppingList 등의 필드가 없을 수 있어,
// 읽어올 때 항상 안전한 기본값으로 채워 넣어 렌더링 중 크래시를 방지
function normalizePlan(p: TravelPlan): TravelPlan {
  return {
    ...p,
    // 이 기능이 추가되기 전에 만들어진 계획은 모두 네이버 지도만 쓰던 국내 계획이었으므로 기본값 domestic
    region: p.region === 'overseas' ? 'overseas' : 'domestic',
    schedules: p.schedules ?? [],
    budgets: p.budgets ?? [],
    shoppingList: p.shoppingList ?? [],
    accommodations: p.accommodations ?? [],
    flights: p.flights ?? [],
    allowClone: p.allowClone === true,
  };
}

// AI 일정 카테고리(한글) -> ScheduleItem 카테고리 매핑. ScheduleItem에는 'shopping'이 없으므로 'other'로 합침
function mapAiCategoryToScheduleCategory(category: unknown): ScheduleItem['category'] {
  switch (category) {
    case '식사': return 'meal';
    case '관광': return 'activity';
    case '이동': return 'transport';
    case '숙박': return 'accommodation';
    default: return 'other';
  }
}

// AI 예산 카테고리(한글) -> Budget 카테고리 매핑. Budget에는 'shopping'이 별도로 존재함
function mapAiCategoryToBudgetCategory(category: unknown): Budget['category'] {
  switch (category) {
    case '식사': return 'meal';
    case '관광': return 'activity';
    case '이동': return 'transport';
    case '숙박': return 'accommodation';
    case '쇼핑': return 'shopping';
    default: return 'other';
  }
}

// AI가 반환한 region 값을 검증 — 정확히 domestic/overseas가 아니면 안전하게 domestic으로 기본값 처리
function resolveAiRegion(region: unknown): 'domestic' | 'overseas' {
  return region === 'overseas' ? 'overseas' : 'domestic';
}

// 'YYYY-MM-DD' 문자열에 일수를 더함. toISOString()은 UTC 변환 과정에서 타임존에 따라 날짜가
// 하루 밀릴 수 있어(예: UTC+9에서 자정은 전날 UTC 15시) 로컬 날짜 필드를 직접 조합해 반환한다.
function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// AI가 반환한(신뢰할 수 없는) itinerary JSON을 기존 TravelPlan.schedules와 동일한 형태로 변환.
// 응답 형태가 예상과 다르더라도(필드 누락, 잘못된 타입 등) 절대 예외를 던지지 않고 가능한 만큼만 반영한다.
function buildSchedulesFromAiItinerary(itinerary: AiItinerary, startDate: string): ScheduleItem[] {
  const schedules: ScheduleItem[] = [];
  if (!Array.isArray(itinerary.days)) return schedules;

  itinerary.days.forEach((rawDay, dayIdx) => {
    const day = rawDay as AiItineraryDay;
    if (!day || typeof day !== 'object') return;
    const dayNumber = typeof day.day === 'number' && Number.isFinite(day.day) && day.day > 0 ? day.day : dayIdx + 1;
    const date = addDaysToDateString(startDate, dayNumber - 1);
    if (!Array.isArray(day.items)) return;

    day.items.forEach((rawItem, itemIdx) => {
      const item = rawItem as AiItineraryItem;
      if (!item || typeof item !== 'object') return;
      const title = typeof item.title === 'string' && item.title.trim() ? item.title.trim() : null;
      if (!title) return; // 제목 없는 항목은 일정으로서 의미가 없으므로 건너뜀
      const preparations = Array.isArray(item.preparations)
        ? item.preparations.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).map(p => p.trim())
        : [];

      schedules.push({
        id: `ai-${Date.now()}-${dayIdx}-${itemIdx}`,
        date,
        time: typeof item.time === 'string' && /^\d{1,2}:\d{2}$/.test(item.time) ? item.time : '09:00',
        title,
        category: mapAiCategoryToScheduleCategory(item.category),
        location: typeof item.location === 'string' && item.location.trim() ? item.location.trim() : undefined,
        notes: typeof item.description === 'string' && item.description.trim() ? item.description.trim() : undefined,
        preparations: preparations.length > 0 ? preparations : undefined,
      });
    });
  });

  return schedules;
}

// AI가 만든 일정 항목들의 location(텍스트)을 실제 좌표(lat/lng)로 지오코딩 — 기존 "위치 검색"
// 다이얼로그(LocationPickerDialog)가 쓰는 것과 동일한 함수를 재사용한다(국내: 네이버 지도
// geocoder, 해외: Nominatim/OSM). 좌표가 있어야 지도 탭에 마커가 찍히고 길찾기가 가능해진다.
// 개별 항목의 검색이 실패해도(주소를 못 찾음 등) 전체 흐름은 절대 중단되지 않고 그 항목만
// 좌표 없이 남는다 — 일정 생성 자체가 지도 문제로 실패하는 일은 없어야 하기 때문.
// 모바일 셀룰러 네트워크는 Wi-Fi보다 순간적인 지연/끊김이 잦아, 첫 시도가 실패해도 한 번 더
// 시도하면 성공하는 경우가 많다. AI 일정의 좌표가 하나라도 더 채워져야 지도 탭에 표시되므로,
// 개별 항목 검색이 일시적인 네트워크 문제로 실패했을 때 바로 포기하지 않고 재시도한다.
async function geocodeOnce(
  query: string,
  region: 'domestic' | 'overseas',
  geocodeAddressOSM: typeof import('@/components/OverseasMap').geocodeAddressOSM | null,
): Promise<{ lat: number; lng: number } | null> {
  const attempts = 2;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      if (region === 'domestic') {
        const found = await geocodeAddress(query);
        if (found[0]) return { lat: found[0].lat, lng: found[0].lng };
      } else if (geocodeAddressOSM) {
        const found = await geocodeAddressOSM(query);
        if (found[0]) return { lat: found[0].lat, lng: found[0].lng };
      }
      return null;
    } catch {
      if (attempt === attempts) return null; // 검색 실패는 무시 — 해당 항목만 지도에 표시되지 않을 뿐 전체 흐름은 계속됨
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  return null;
}

// 국내 동시 처리 개수 제한 — 네이버 지오코더는 Nominatim과 달리 초당 요청 수 제약이 문서화되어
// 있지 않으므로 병렬로 처리해 전체 소요 시간을 줄인다(모바일에서 항목이 많을 때 전체 흐름이
// 길어질수록 탭 전환/화면 잠금 등으로 중간에 끊길 위험이 커지기 때문).
const DOMESTIC_GEOCODE_CONCURRENCY = 4;

async function geocodeAiScheduleItems(
  schedules: ScheduleItem[],
  region: 'domestic' | 'overseas',
): Promise<ScheduleItem[]> {
  // lucide-react의 Map 아이콘이 파일 스코프에서 전역 Map을 가리므로 globalThis로 명시
  const cache = new globalThis.Map<string, { lat: number; lng: number } | null>();
  const geocodeAddressOSM = region === 'overseas'
    ? (await import('@/components/OverseasMap')).geocodeAddressOSM
    : null;

  const uniqueQueries = Array.from(new Set(
    schedules.map(item => item.location?.trim()).filter((q): q is string => !!q)
  ));

  if (region === 'domestic') {
    // 동시에 최대 DOMESTIC_GEOCODE_CONCURRENCY개씩만 진행하는 워커 풀
    let cursor = 0;
    const worker = async () => {
      while (cursor < uniqueQueries.length) {
        const query = uniqueQueries[cursor++];
        cache.set(query, await geocodeOnce(query, region, geocodeAddressOSM));
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(DOMESTIC_GEOCODE_CONCURRENCY, uniqueQueries.length) }, worker)
    );
  } else {
    // Nominatim 사용 정책(초당 1건 이하)을 지키기 위해 순차 처리하고, 요청 사이마다 대기
    for (const query of uniqueQueries) {
      cache.set(query, await geocodeOnce(query, region, geocodeAddressOSM));
      await new Promise(resolve => setTimeout(resolve, 1100));
    }
  }

  return schedules.map(item => {
    const query = item.location?.trim();
    const coords = query ? cache.get(query) ?? null : null;
    return coords ? { ...item, lat: coords.lat, lng: coords.lng } : item;
  });
}

// AI가 반환한(신뢰할 수 없는) budgets JSON을 기존 TravelPlan.budgets와 동일한 형태로 변환.
// 형태가 예상과 다르더라도 예외를 던지지 않고 유효한 항목만 반영한다.
function buildBudgetsFromAiItinerary(itinerary: AiItinerary): Budget[] {
  if (!Array.isArray(itinerary.budgets)) return [];

  const budgets: Budget[] = [];
  itinerary.budgets.forEach((rawItem, idx) => {
    const item = rawItem as AiItineraryBudgetItem;
    if (!item || typeof item !== 'object') return;
    const amount = typeof item.amount === 'number' && Number.isFinite(item.amount) && item.amount > 0
      ? Math.round(item.amount)
      : null;
    if (amount === null) return; // 금액이 없거나 유효하지 않은 항목은 의미가 없으므로 건너뜀
    const description = typeof item.description === 'string' && item.description.trim()
      ? item.description.trim()
      : fallbackBudgetDescription(item.category);

    budgets.push({
      id: `ai-budget-${Date.now()}-${idx}`,
      category: mapAiCategoryToBudgetCategory(item.category),
      amount,
      description,
    });
  });

  return budgets;
}

// budgets 항목에 description이 비어있을 때 쓸 최소한의 대체 텍스트 (카테고리명 그대로 사용)
function fallbackBudgetDescription(category: unknown): string {
  return typeof category === 'string' && category.trim() ? category.trim() : '기타 비용';
}

// 길찾기: 구글 지도의 공식 URL 스킴을 사용 (API 키 불필요, 모바일에서 지도 앱/웹으로 안정적으로 연결됨)
function openDirections(lat?: number, lng?: number, address?: string) {
  const url = (lat !== undefined && lng !== undefined)
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
      : null;
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

// 출발지 -> 도착지 길찾기 (구글 지도)
function openDirectionsBetween(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }) {
  const url = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}`;
  window.open(url, '_blank', 'noopener,noreferrer');
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
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  useEffect(() => {
    if (!user) { setProfilePhoto(null); return; }
    let cancelled = false;
    getProfilePhoto(user.id).then(photo => { if (!cancelled) setProfilePhoto(photo); });
    return () => { cancelled = true; };
  }, [user, getProfilePhoto]);

  const [travelPlans, setTravelPlans] = useState<TravelPlan[]>([]);
  const [currentPlan, setCurrentPlan] = useState<TravelPlan | null>(null);
  const [isPlanLoading, setIsPlanLoading] = useState(false);

  // 유저별 여행 계획 로드 (서버 D1에서)
  useEffect(() => {
    if (!user) { setTravelPlans([]); setCurrentPlan(null); return; }
    let cancelled = false;
    setIsPlanLoading(true);
    plansApi.list()
      .then(plans => {
        if (cancelled) return;
        const normalized = plans.map(normalizePlan);
        setTravelPlans(normalized);
        const savedId = localStorage.getItem('currentPlanId');
        if (savedId) setCurrentPlan(normalized.find(p => p.id === savedId) || null);
      })
      .catch(() => {
        if (cancelled) return;
        toast.error(navigator.onLine ? t('home.toast.plansLoadFailed') : t('home.toast.plansLoadFailedOffline'));
      })
      .finally(() => { if (!cancelled) setIsPlanLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  // 스탯 바(여행 기록 수 등)에서 참조하는 내 여행 기록 목록 — 서버 D1에서 로드
  const [myDiariesForStats, setMyDiariesForStats] = useState<DiaryEntry[]>([]);
  useEffect(() => {
    if (!user) { setMyDiariesForStats([]); return; }
    diariesApi.list().then(setMyDiariesForStats).catch(() => {});
  }, [user]);

  // AI 일정 생성 크레딧 — 서버가 유일한 소스이며 여기선 결제창 vs 생성 다이얼로그 분기에만 씀
  const refreshAiCredits = useCallback(() => {
    if (!user) { setAiCredits(null); return; }
    paymentsApi.getCredits().then(r => setAiCredits(r.remainingCredits)).catch(() => {});
  }, [user]);
  useEffect(() => { refreshAiCredits(); }, [refreshAiCredits]);

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
  const [newPlanRegion, setNewPlanRegion] = useState<'domestic' | 'overseas'>(planDraft?.region === 'overseas' ? 'overseas' : 'domestic');
  const [newPlanTravelers, setNewPlanTravelers] = useState<number>(
    Number.isInteger(planDraft?.travelers) && planDraft?.travelers >= 1 && planDraft?.travelers <= 10 ? planDraft.travelers : 1
  );

  // AI로 계획세우기
  const [showAiPlanDialog, setShowAiPlanDialog] = useState(false);
  const [showAiCreditsPaywall, setShowAiCreditsPaywall] = useState(false);
  const [aiCredits, setAiCredits] = useState<number | null>(null);
  const [aiPlanDestination, setAiPlanDestination] = useState('');
  const [aiPlanStartDate, setAiPlanStartDate] = useState('');
  const [aiPlanEndDate, setAiPlanEndDate] = useState('');
  const [aiPlanTravelers, setAiPlanTravelers] = useState(1);
  const [aiPlanPreferences, setAiPlanPreferences] = useState('');
  const [isGeneratingAiPlan, setIsGeneratingAiPlan] = useState(false);
  const [isMappingAiPlan, setIsMappingAiPlan] = useState(false);

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
  const [editingAccommodationId, setEditingAccommodationId] = useState<string | null>(null);
  const [editingFlightId, setEditingFlightId] = useState<string | null>(null);
  const [editingTotalBudget, setEditingTotalBudget] = useState(false);
  const [totalBudgetInput, setTotalBudgetInput] = useState('');
  const [totalBudgetTravelersInput, setTotalBudgetTravelersInput] = useState<number>(1);
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

  // 여행 계획 삭제/복제 확인 다이얼로그 — 대상 id를 들고 있으면 다이얼로그가 열림
  const [deletePlanId, setDeletePlanId] = useState<string | null>(null);
  const [duplicatePlanId, setDuplicatePlanId] = useState<string | null>(null);

  // 여행 요약 - 미리보기 다이얼로그 상태
  const [summaryPreviewPlan, setSummaryPreviewPlan] = useState<TravelPlan | null>(null);
  const [showSummaryPreview, setShowSummaryPreview] = useState(false);
  const [showAllSchedulesPreview, setShowAllSchedulesPreview] = useState(false);
  const [showTimelinePreview, setShowTimelinePreview] = useState(false);
  const [showPreparationsPreview, setShowPreparationsPreview] = useState(false);
  const [showAccommodationListPreview, setShowAccommodationListPreview] = useState(false);
  const [previewAccommodation, setPreviewAccommodation] = useState<Accommodation | null>(null);
  const [showAccommodationDetailPreview, setShowAccommodationDetailPreview] = useState(false);
  const [showFlightListPreview, setShowFlightListPreview] = useState(false);
  const [previewFlight, setPreviewFlight] = useState<Flight | null>(null);
  const [showFlightDetailPreview, setShowFlightDetailPreview] = useState(false);
  const [detailSchedule, setDetailSchedule] = useState<ScheduleItem | null>(null);
  const [showScheduleDetail, setShowScheduleDetail] = useState(false);

  // 지도 탭 - 출발/도착 선택 상태 (계획 전체가 국내 또는 해외 하나이므로 지도도 하나만 존재)
  const [routeSelectMode, setRouteSelectMode] = useState<'origin' | 'destination' | null>(null);
  const [routeOriginId, setRouteOriginId] = useState<string | null>(null);
  const [routeDestinationId, setRouteDestinationId] = useState<string | null>(null);

  const scheduleMapRef = useRef<naver.maps.Map | null>(null);
  const scheduleOverseasMapRef = useRef<MapLibreMap | null>(null);
  const planPhotoInputRef = useRef<HTMLInputElement>(null);

  // 서버(D1)에 반영: 이전 상태와 diff해서 생성/수정/삭제 API 호출로 변환한다.
  // 호출부가 "새 전체 배열"을 넘기는 기존 패턴을 그대로 유지하기 위한 어댑터.
  const updateTravelPlans = (plans: TravelPlan[]) => {
    const prevPlans = travelPlans;
    const nextIds = plans.map(p => p.id);
    setTravelPlans(plans);

    (async () => {
      try {
        for (const plan of plans) {
          const prev = prevPlans.find(p => p.id === plan.id);
          if (!prev) {
            await plansApi.create(plan);
          } else if (JSON.stringify(prev) !== JSON.stringify(plan)) {
            await plansApi.update(plan.id, plan);
          }
        }
        for (const prev of prevPlans) {
          if (!nextIds.includes(prev.id)) {
            await plansApi.remove(prev.id);
          }
        }
      } catch {
        toast.error(t('home.toast.storageFull'));
      }
    })();
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
      region: newPlanRegion,
      schedules: [],
      budgets: [],
      shoppingList: [],
      accommodations: [],
      flights: [],
      travelers: newPlanTravelers,
    };
    const updated = [...travelPlans, newPlan];
    updateTravelPlans(updated);
    setCurrentPlan(newPlan);
    setNewPlanTitle(''); setNewPlanStartDate(''); setNewPlanEndDate(''); setNewPlanRegion('domestic'); setNewPlanTravelers(1);
    setShowNewPlanDialog(false);
    toast.success(t('home.toast.planCreated'));
  };

  // AI로 계획세우기: /api/plan-trip 프록시(Vite dev 미들웨어 / Cloudflare Worker)를 호출해
  // 받은 일정을 기존 TravelPlan과 동일한 형태로 저장 — 저장 이후로는 수동으로 만든 계획과
  // 완전히 동일하게 취급되므로 PDF/텍스트 저장, 링크 복사, 여행 요약이 그대로 동작한다.
  const handleGenerateAiPlan = async () => {
    if (!user) {
      toast.error(t('session.loginRequired'));
      return;
    }
    const destination = aiPlanDestination.trim();
    if (!destination || !aiPlanStartDate || !aiPlanEndDate) {
      toast.error(t('home.toast.aiPlanFillFields'));
      return;
    }
    if (aiPlanEndDate < aiPlanStartDate) {
      toast.error(t('home.toast.endBeforeStart'));
      return;
    }

    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const start = new Date(`${aiPlanStartDate}T00:00:00`);
    const end = new Date(`${aiPlanEndDate}T00:00:00`);
    const days = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
    if (!Number.isFinite(days) || days < 1 || days > 30) {
      toast.error(t('home.toast.aiPlanTooManyDays'));
      return;
    }

    if (isGeneratingAiPlan) return; // 중복 제출 방지

    setIsGeneratingAiPlan(true);
    const controller = new AbortController();
    // 일정 생성 후 별도로 JSON 구조화까지 2단계로 Gemini를 호출하기 때문에(목적지가 임의로
    // 바뀌는 문제를 막기 위함) 응답까지 시간이 꽤 걸릴 수 있어 넉넉하게 잡음
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const res = await fetch('/api/plan-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination,
          days,
          startDate: aiPlanStartDate,
          travelers: aiPlanTravelers,
          preferences: aiPlanPreferences.trim() || undefined,
        }),
        signal: controller.signal,
      });

      // 실제로 응답을 받은 시점(성공/실패 무관)에 요청 1건으로 집계 — 서버 쪽 Gemini 호출량을
      // 가장 근접하게 반영하는 지점
      recordGeminiUsage('requests');

      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      const payloadObj = (payload && typeof payload === 'object') ? payload as Record<string, unknown> : null;

      if (!res.ok || !payloadObj?.itinerary) {
        const serverMessage = typeof payloadObj?.error === 'string' ? payloadObj.error : null;
        const code = typeof payloadObj?.code === 'string' ? payloadObj.code : undefined;
        throw new AiPlanRequestError(serverMessage || `HTTP ${res.status}`, code);
      }

      const aiItinerary = payloadObj.itinerary as AiItinerary;
      const rawSchedules = buildSchedulesFromAiItinerary(aiItinerary, aiPlanStartDate);
      if (rawSchedules.length === 0) {
        toast.error(t('home.toast.aiPlanEmpty'));
        return;
      }
      const budgets = buildBudgetsFromAiItinerary(aiItinerary);
      const region = resolveAiRegion(aiItinerary.region);

      // 일정의 location(텍스트)을 실제 좌표로 지오코딩 — 지도 탭에 마커가 찍히고 길찾기가
      // 되려면 lat/lng이 필요함. 실패해도 일정 저장 자체는 계속 진행됨(해당 항목만 좌표 없음).
      setIsMappingAiPlan(true);
      let schedules = rawSchedules;
      try {
        schedules = await geocodeAiScheduleItems(rawSchedules, region);
      } catch (geocodeErr) {
        console.error('AI plan geocoding failed (non-fatal):', geocodeErr);
      } finally {
        setIsMappingAiPlan(false);
      }

      const newPlan: TravelPlan = {
        id: Date.now().toString(),
        userId: user.id,
        title: `${destination} ${t('home.aiPlanDialog.titleSuffix')}`,
        startDate: aiPlanStartDate,
        endDate: aiPlanEndDate,
        region,
        schedules,
        budgets,
        shoppingList: [],
        accommodations: [],
        flights: [],
        travelers: aiPlanTravelers,
      };

      const updated = [...travelPlans, newPlan];
      updateTravelPlans(updated);
      setCurrentPlan(newPlan);
      setShowAiPlanDialog(false);
      setAiPlanDestination('');
      setAiPlanStartDate('');
      setAiPlanEndDate('');
      setAiPlanTravelers(1);
      setAiPlanPreferences('');
      recordGeminiUsage('generations');
      toast.success(t('home.toast.aiPlanSuccess'));
      setAiCredits(c => (c === null ? c : Math.max(0, c - 1)));
    } catch (err) {
      // 서버 프록시가 없는 환경(로컬 Node 배포 등)이거나 네트워크가 끊긴 경우 등 어떤 실패든
      // 화면이 깨지지 않고 항상 토스트 메시지로만 안내되도록 함
      console.error('AI plan generation failed:', err);
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast.error(t('home.toast.aiPlanTimeout'));
      } else if (err instanceof AiPlanRequestError && err.code === 'rate_limited') {
        toast.error(t('home.toast.aiPlanRateLimited'));
      } else if (err instanceof AiPlanRequestError && err.code === 'overloaded') {
        toast.error(t('home.toast.aiPlanOverloaded'));
      } else if (err instanceof AiPlanRequestError && err.code === 'unsupported_location') {
        toast.error(t('home.toast.aiPlanUnsupportedLocation'));
      } else if (err instanceof AiPlanRequestError && err.code === 'no_credits') {
        setAiCredits(0);
        setShowAiPlanDialog(false);
        setShowAiCreditsPaywall(true);
      } else {
        toast.error(t('home.toast.aiPlanError'));
      }
    } finally {
      clearTimeout(timeoutId);
      setIsGeneratingAiPlan(false);
      setIsMappingAiPlan(false);
    }
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
        region: newPlanRegion,
        travelers: newPlanTravelers,
      };
      localStorage.setItem('planFormDraft', JSON.stringify(draft));
    } else {
      localStorage.removeItem('planFormDraft');
    }
  }, [newPlanTitle, newPlanStartDate, newPlanEndDate, newPlanRegion, newPlanTravelers, showNewPlanDialog]);

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
    const uploaded = await uploadDataUrl('plan-cover', compressed);
    updateCurrentPlan({ ...currentPlan, coverPhoto: uploaded.url });
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

  const handleAddAccommodation = (accommodation: Accommodation) => {
    if (!currentPlan) return;
    updateCurrentPlan({ ...currentPlan, accommodations: [...(currentPlan.accommodations || []), accommodation] });
    toast.success(t('home.toast.accommodationAdded'));
  };

  const handleUpdateAccommodation = (accommodationId: string, updated: Accommodation) => {
    if (!currentPlan) return;
    updateCurrentPlan({
      ...currentPlan,
      accommodations: (currentPlan.accommodations || []).map(a => a.id === accommodationId ? updated : a),
    });
    setEditingAccommodationId(null);
    toast.success(t('home.toast.accommodationUpdated'));
  };

  const handleDeleteAccommodation = (accommodationId: string) => {
    if (!currentPlan) return;
    updateCurrentPlan({
      ...currentPlan,
      accommodations: (currentPlan.accommodations || []).filter(a => a.id !== accommodationId),
    });
    toast.success(t('home.toast.accommodationDeleted'));
  };

  const handleAddFlight = (flight: Flight) => {
    if (!currentPlan) return;
    updateCurrentPlan({ ...currentPlan, flights: [...(currentPlan.flights || []), flight] });
    toast.success(t('home.toast.flightAdded'));
  };

  const handleUpdateFlight = (flightId: string, updated: Flight) => {
    if (!currentPlan) return;
    updateCurrentPlan({
      ...currentPlan,
      flights: (currentPlan.flights || []).map(f => f.id === flightId ? updated : f),
    });
    setEditingFlightId(null);
    toast.success(t('home.toast.flightUpdated'));
  };

  const handleDeleteFlight = (flightId: string) => {
    if (!currentPlan) return;
    updateCurrentPlan({
      ...currentPlan,
      flights: (currentPlan.flights || []).filter(f => f.id !== flightId),
    });
    toast.success(t('home.toast.flightDeleted'));
  };

  const handleToggleScheduleComplete = (scheduleId: string) => {
    if (!currentPlan) return;
    updateCurrentPlan({
      ...currentPlan,
      schedules: currentPlan.schedules.map(s => s.id === scheduleId ? { ...s, completed: !s.completed } : s),
    });
  };

  const handleToggleScheduleCompleteForPlan = (planId: string, scheduleId: string) => {
    const updated = travelPlans.map(p =>
      p.id === planId
        ? { ...p, schedules: p.schedules.map(s => s.id === scheduleId ? { ...s, completed: !s.completed } : s) }
        : p
    );
    updateTravelPlans(updated);
    const updatedPlan = updated.find(p => p.id === planId) || null;
    if (currentPlan?.id === planId) setCurrentPlan(updatedPlan);
    setSummaryPreviewPlan(prev => (prev && prev.id === planId ? updatedPlan : prev));
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

  const handleStartEditTotalBudget = () => {
    if (!currentPlan) return;
    setTotalBudgetInput(currentPlan.totalBudgetAmount ? String(currentPlan.totalBudgetAmount) : '');
    setTotalBudgetTravelersInput(
      Number.isInteger(currentPlan.travelers) && currentPlan.travelers! >= 1 && currentPlan.travelers! <= 10
        ? currentPlan.travelers!
        : 1
    );
    setEditingTotalBudget(true);
  };

  const handleSaveTotalBudget = () => {
    if (!currentPlan) return;
    // 금액은 이미 설정되어 있고 인원수만 바꾸고 싶은 경우도 있어 입력이 비어 있으면 기존 금액을 유지
    let amount = currentPlan.totalBudgetAmount;
    if (totalBudgetInput.trim()) {
      const parsed = parseInt(totalBudgetInput);
      if (isNaN(parsed) || parsed < 0) {
        toast.error(t('home.toast.enterAmount'));
        return;
      }
      amount = parsed;
    }
    updateCurrentPlan({ ...currentPlan, totalBudgetAmount: amount, travelers: totalBudgetTravelersInput });
    setEditingTotalBudget(false);
    toast.success(t('home.budget.totalBudgetUpdated'));
  };

  const handleCancelEditTotalBudget = () => {
    setEditingTotalBudget(false);
    setTotalBudgetInput('');
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

  const handleTogglePreparationCheck = (item: string) => {
    if (!currentPlan) return;
    updateCurrentPlan({
      ...currentPlan,
      preparationChecks: { ...currentPlan.preparationChecks, [item]: !currentPlan.preparationChecks?.[item] },
    });
  };

  // 여행 요약 미리보기(계획 목록의 아무 계획)에서도 준비물 체크를 켤 수 있도록 하는 범용 버전
  const handleTogglePreparationCheckForPlan = (planId: string, item: string) => {
    const updated = travelPlans.map(p =>
      p.id === planId
        ? { ...p, preparationChecks: { ...p.preparationChecks, [item]: !p.preparationChecks?.[item] } }
        : p
    );
    updateTravelPlans(updated);
    const updatedPlan = updated.find(p => p.id === planId) || null;
    if (currentPlan?.id === planId) setCurrentPlan(updatedPlan);
    setSummaryPreviewPlan(prev => (prev && prev.id === planId ? updatedPlan : prev));
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
          <div style="font-weight: bold; color: #0ea5e9;">${s.date} ${formatTime12h(s.time)}</div>
          <div style="font-size: 1.1em; font-weight: bold; margin: 5px 0;">${s.title}</div>
          <div style="font-size: 0.9em; color: #666;">📍 ${s.location || '-'}</div>
          ${s.cost ? `<div style="font-size: 0.9em; color: #0ea5e9; font-weight: bold;">₩${s.cost.toLocaleString()}</div>` : ''}
          ${s.notes ? `<div style="font-size: 0.85em; color: #888; font-style: italic;">"${s.notes}"</div>` : ''}
          ${s.preparations && s.preparations.length > 0 ? `<div style="font-size: 0.85em; color: #888; margin-top: 4px;">${splitPreparationItems(s.preparations).map(p => `# ${p}`).join('  ')}</div>` : ''}
        </div>
      `).join('');

    const accommodationsHtml = [...(currentPlan.accommodations || [])]
      .sort((a, b) => a.checkInDate.localeCompare(b.checkInDate) || (a.checkInTime || '').localeCompare(b.checkInTime || ''))
      .map(a => `
        <div style="padding: 10px; border-bottom: 1px solid #eee;">
          <div style="font-size: 1.1em; font-weight: bold; margin-bottom: 4px;">${a.name}</div>
          ${a.address ? `<div style="font-size: 0.9em; color: #666;">📍 ${a.address}</div>` : ''}
          <div style="font-size: 0.9em; color: #666;">${t('home.accommodation.checkInShort')} ${a.checkInDate} ${formatTime12h(a.checkInTime)} → ${t('home.accommodation.checkOutShort')} ${a.checkOutDate} ${formatTime12h(a.checkOutTime)}</div>
          ${a.phone ? `<div style="font-size: 0.9em; color: #666;">☎ ${a.phone}</div>` : ''}
          ${a.reservationNumber ? `<div style="font-size: 0.9em; color: #666;">${t('home.accommodation.form.reservationNumberLabel')}: ${a.reservationNumber}</div>` : ''}
          ${a.notes ? `<div style="font-size: 0.85em; color: #888; font-style: italic;">"${a.notes}"</div>` : ''}
        </div>
      `).join('');

    const flightsHtml = [...(currentPlan.flights || [])]
      .sort((a, b) => a.departureDate.localeCompare(b.departureDate) || (a.departureTime || '').localeCompare(b.departureTime || ''))
      .map(f => {
        const details = [
          f.terminal && `${t('home.flight.form.terminalLabel')}: ${f.terminal}`,
          f.gate && `${t('home.flight.form.gateLabel')}: ${f.gate}`,
          f.seat && `${t('home.flight.form.seatLabel')}: ${f.seat}`,
        ].filter(Boolean).join('  ·  ');
        return `
          <div style="padding: 10px; border-bottom: 1px solid #eee;">
            <div style="font-size: 1.1em; font-weight: bold; margin-bottom: 4px;">${f.airline} ${f.flightNumber}</div>
            <div style="font-size: 0.9em; color: #666;">${t('home.flight.departureShort')}: ${f.departureAirport} ${f.departureDate} ${formatTime12h(f.departureTime)}</div>
            <div style="font-size: 0.9em; color: #666;">${t('home.flight.arrivalShort')}: ${f.arrivalAirport} ${f.arrivalDate} ${formatTime12h(f.arrivalTime)}</div>
            ${details ? `<div style="font-size: 0.9em; color: #666;">${details}</div>` : ''}
            ${f.reservationNumber ? `<div style="font-size: 0.9em; color: #666;">${t('home.flight.form.reservationNumberLabel')}: ${f.reservationNumber}</div>` : ''}
          </div>
        `;
      }).join('');

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

    const preparationsHtml = getUniquePreparationLabels(currentPlan)
      .map(label => {
        const checked = !!currentPlan.preparationChecks?.[label];
        return `<div style="padding: 5px 0; border-bottom: 1px solid #f5f5f5; ${checked ? 'color: #aaa; text-decoration: line-through;' : ''}">${checked ? '☑' : '☐'} ${label}</div>`;
      }).join('');

    const timelineGroups = [...currentPlan.schedules]
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
      .reduce<Record<string, ScheduleItem[]>>((acc, s) => {
        (acc[s.date] ??= []).push(s);
        return acc;
      }, {});
    const timelineHtml = Object.keys(timelineGroups).sort().map((date, dayIdx) => `
      <div style="margin-bottom: 14px;">
        <div style="font-weight: bold; color: #0369a1; margin-bottom: 6px;">Day ${dayIdx + 1} · ${date}</div>
        ${timelineGroups[date].map(s => `
          <div style="padding: 4px 0 4px 12px; font-size: 0.9em; ${s.completed ? 'color: #aaa; text-decoration: line-through;' : ''}">${s.completed ? '☑' : '☐'} ${formatTime12h(s.time)} ${s.title}</div>
        `).join('')}
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
            <h2>🏨 ${t('home.pdf.accommodationSection')}</h2>
            ${accommodationsHtml || `<p>${t('home.pdf.noAccommodations')}</p>`}
          </div>

          <div class="section">
            <h2>✈️ ${t('home.pdf.flightSection')}</h2>
            ${flightsHtml || `<p>${t('home.pdf.noFlights')}</p>`}
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

          <div class="section">
            <h2>✅ ${t('home.pdf.preparationsSection')}</h2>
            ${preparationsHtml || `<p>${t('home.pdf.noPreparations')}</p>`}
          </div>

          <div class="section">
            <h2>🕐 ${t('home.pdf.timelineSection')}</h2>
            ${timelineHtml || `<p>${t('home.pdf.noSchedules')}</p>`}
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
      content += `${idx + 1}. [${s.date} ${formatTime12h(s.time)}] ${getCategoryLabel(s.category)}: ${s.title}\n`;
      if (s.location) content += `   ${t('home.textExport.location')}: ${s.location}\n`;
      if (s.cost) content += `   ${t('home.textExport.cost')}: ₩${s.cost.toLocaleString()}\n`;
      if (s.notes) content += `   ${t('home.textExport.notes')}: ${s.notes}\n`;
      if (s.preparations && s.preparations.length > 0) content += `   ${t('home.textExport.preparations')}: ${splitPreparationItems(s.preparations).join(', ')}\n`;
      content += `\n`;
    });

    content += `■ ${t('home.textExport.accommodationSection')}\n`;
    const accommodations = [...(currentPlan.accommodations || [])]
      .sort((a, b) => a.checkInDate.localeCompare(b.checkInDate) || (a.checkInTime || '').localeCompare(b.checkInTime || ''));
    if (accommodations.length === 0) {
      content += `${t('home.textExport.noAccommodations')}\n`;
    } else {
      accommodations.forEach((a, idx) => {
        content += `${idx + 1}. ${a.name}\n`;
        if (a.address) content += `   ${t('home.textExport.location')}: ${a.address}\n`;
        content += `   ${t('home.textExport.checkIn')}: ${a.checkInDate} ${formatTime12h(a.checkInTime)} → ${t('home.textExport.checkOut')}: ${a.checkOutDate} ${formatTime12h(a.checkOutTime)}\n`;
        if (a.phone) content += `   ${t('home.textExport.phone')}: ${a.phone}\n`;
        if (a.reservationNumber) content += `   ${t('home.textExport.reservationNumber')}: ${a.reservationNumber}\n`;
        if (a.notes) content += `   ${t('home.textExport.notes')}: ${a.notes}\n`;
      });
    }
    content += `\n`;

    content += `■ ${t('home.textExport.flightSection')}\n`;
    const flights = [...(currentPlan.flights || [])]
      .sort((a, b) => a.departureDate.localeCompare(b.departureDate) || (a.departureTime || '').localeCompare(b.departureTime || ''));
    if (flights.length === 0) {
      content += `${t('home.textExport.noFlights')}\n`;
    } else {
      flights.forEach((f, idx) => {
        content += `${idx + 1}. ${f.airline} ${f.flightNumber}\n`;
        content += `   ${t('home.textExport.departure')}: ${f.departureAirport} ${f.departureDate} ${formatTime12h(f.departureTime)}\n`;
        content += `   ${t('home.textExport.arrival')}: ${f.arrivalAirport} ${f.arrivalDate} ${formatTime12h(f.arrivalTime)}\n`;
        if (f.seat) content += `   ${t('home.textExport.seat')}: ${f.seat}\n`;
        if (f.reservationNumber) content += `   ${t('home.textExport.reservationNumber')}: ${f.reservationNumber}\n`;
      });
    }
    content += `\n`;

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
    content += `\n`;

    content += `■ ${t('home.textExport.preparationsSection')}\n`;
    const uniquePreps = getUniquePreparationLabels(currentPlan);
    if (uniquePreps.length === 0) {
      content += `${t('home.textExport.noPreparations')}\n`;
    } else {
      uniquePreps.forEach((label, idx) => {
        const status = currentPlan.preparationChecks?.[label] ? '[V]' : '[ ]';
        content += `${status} ${idx + 1}. ${label}\n`;
      });
    }
    content += `\n`;

    content += `■ ${t('home.textExport.timelineSection')}\n`;
    if (currentPlan.schedules.length === 0) {
      content += `${t('home.textExport.noTimeline')}\n`;
    } else {
      const sortedByDate = [...currentPlan.schedules].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
      const groupedByDate = sortedByDate.reduce<Record<string, ScheduleItem[]>>((acc, s) => {
        (acc[s.date] ??= []).push(s);
        return acc;
      }, {});
      Object.keys(groupedByDate).sort().forEach((date, dayIdx) => {
        content += `[Day ${dayIdx + 1}] ${date}\n`;
        groupedByDate[date].forEach(s => {
          const status = s.completed ? '[V]' : '[ ]';
          content += `  ${status} ${formatTime12h(s.time)} ${s.title}\n`;
        });
      });
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentPlan.title}_${t('home.textExport.fileNameSuffix')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('home.toast.textFileSaved'));
  };

  const handleDeletePlan = (planId: string) => {
    const updated = travelPlans.filter(p => p.id !== planId);
    updateTravelPlans(updated);
    if (currentPlan?.id === planId) setCurrentPlan(null);
    toast.success(t('home.toast.planDeleted'));
  };

  // 계획을 복제할 때 하위 항목(일정/예산/준비물/숙소/항공편)의 id도 모두 새로 발급 —
  // 같은 밀리초 안에 여러 개를 만들 수 있어 Date.now()만으로는 충돌할 수 있으므로 랜덤 suffix를 붙임
  const handleDuplicatePlan = (planId: string) => {
    const source = travelPlans.find(p => p.id === planId);
    if (!source || !user) return;

    const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const duplicated: TravelPlan = {
      ...source,
      id: newId(),
      userId: user.id,
      title: `${source.title}${t('home.planList.copySuffix')}`,
      schedules: source.schedules.map(s => ({ ...s, id: newId(), completed: false })),
      budgets: source.budgets.map(b => ({ ...b, id: newId() })),
      shoppingList: source.shoppingList.map(s => ({ ...s, id: newId(), checked: false })),
      accommodations: source.accommodations?.map(a => ({ ...a, id: newId() })),
      flights: source.flights?.map(f => ({ ...f, id: newId() })),
      preparationChecks: {},
      allowClone: false,
    };

    updateTravelPlans([...travelPlans, duplicated]);
    toast.success(t('home.toast.planDuplicated'));
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      accommodation: 'bg-blue-100 text-blue-800',
      transport: 'bg-amber-100 text-amber-800',
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
  const plannedBudget = currentPlan?.totalBudgetAmount || 0;
  const remainingBudget = plannedBudget - totalBudget;
  const categorySpending = currentPlan
    ? Object.entries(
        currentPlan.budgets.reduce<Record<string, number>>((acc, b) => {
          acc[b.category] = (acc[b.category] || 0) + b.amount;
          return acc;
        }, {})
      )
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount)
    : [];

  const renderTimelineContent = (plan: TravelPlan | null, onToggle?: (scheduleId: string) => void) => {
    if (!plan) return null;
    const interactive = !!onToggle;
    if (plan.schedules.length === 0) {
      return (
        <div className="text-center py-12 bg-secondary rounded-2xl">
          <p className="text-slate-400">{t('home.timeline.emptyState')}</p>
        </div>
      );
    }
    const sorted = [...plan.schedules].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
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
                    onClick={onToggle ? () => onToggle(s.id) : undefined}
                    aria-label={s.completed ? t('home.timeline.unmarkComplete') : t('home.timeline.markComplete')}
                    disabled={!interactive}
                    className={cn(
                      "absolute -left-9 top-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors shadow-sm",
                      s.completed ? "bg-primary border-primary" : "bg-card border-border",
                      interactive && !s.completed && "hover:border-primary",
                      !interactive && "cursor-default"
                    )}
                  >
                    {s.completed && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                  </button>
                  <div className={cn("flex items-start justify-between gap-2 transition-opacity", s.completed && "opacity-50")}>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-primary mb-0.5">{formatTime12h(s.time)}{s.endTime ? ` ~ ${formatTime12h(s.endTime)}` : ''}</p>
                      <p className={cn("font-bold text-foreground truncate", s.completed && "line-through")}>{s.title}</p>
                      {s.location && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 min-w-0">
                          <MapPin className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{s.location}</span>
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
  };

  const renderPreparationsByScheduleContent = (plan: TravelPlan | null) => {
    if (!plan) return null;
    const withPreps = plan.schedules.filter(s => s.preparations && s.preparations.length > 0);
    if (withPreps.length === 0) {
      return (
        <div className="text-center py-12 bg-secondary rounded-2xl">
          <p className="text-slate-400">{t('home.summary.emptyState')}</p>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {withPreps.map(s => (
          <div key={s.id} className="p-4 bg-secondary rounded-xl border border-border">
            <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
              <Check className="w-4 h-4 text-primary" /> {s.title} ({s.date})
            </h4>
            <div className="flex flex-wrap gap-2">
              {splitPreparationItems(s.preparations).map((p, idx) => (
                <span key={idx} className="bg-card px-3 py-1 rounded-full text-sm text-muted-foreground border border-border shadow-sm">{p}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // 준비물 체크 상태 키 — 같은 이름의 준비물이 서로 다른 일정에 중복으로 적혀 있어도
  // (예: "여권"이 1일차와 3일차에 모두 있는 경우) 하나로 합쳐서 한 번만 체크하면 되도록
  // "준비물명" 자체를 키로 사용 (일정과 무관)
  function preparationCheckKey(item: string): string {
    return item;
  }

  // 전체 준비물 체크리스트 — 계획 내 준비물 탭과 여행 요약 미리보기 양쪽에서 동일하게(국내/해외 구분 없이)
  // 모든 일정의 준비물을 모아 이름 기준으로 중복을 제거한 뒤, 겹치는 준비물 없이 하나씩만 체크 가능하도록 표시
  const renderAllPreparationsChecklistContent = (plan: TravelPlan | null, onToggle?: (key: string) => void) => {
    if (!plan) return null;
    const interactive = !!onToggle;
    const uniqueLabels = getUniquePreparationLabels(plan);

    const totalCount = uniqueLabels.length;
    const checkedCount = uniqueLabels.filter(label => plan.preparationChecks?.[preparationCheckKey(label)]).length;
    const percent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

    return (
      <>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            {t('home.summary.allTitle')}
            {totalCount > 0 && (
              <span className="text-sm font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                {t('home.summary.percentComplete', { n: percent })}
              </span>
            )}
          </h3>
          {totalCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {t('home.summary.completedCount', { done: checkedCount, total: totalCount })}
            </span>
          )}
        </div>
        {totalCount === 0 ? (
          <div className="text-center py-12 bg-secondary rounded-2xl">
            <p className="text-slate-400">{t('home.summary.allEmptyState')}</p>
          </div>
        ) : (
          <div className="relative pl-6 border-l-2 border-border space-y-3">
            {uniqueLabels.map(label => {
              const key = preparationCheckKey(label);
              const checked = !!plan.preparationChecks?.[key];
              return (
                <div key={key} className="relative">
                  <button
                    type="button"
                    onClick={onToggle ? () => onToggle(key) : undefined}
                    disabled={!interactive}
                    aria-label={checked ? t('home.timeline.unmarkComplete') : t('home.timeline.markComplete')}
                    className={cn(
                      "absolute -left-9 top-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors shadow-sm",
                      checked ? "bg-primary border-primary" : "bg-card border-border",
                      interactive && !checked && "hover:border-primary",
                      !interactive && "cursor-default"
                    )}
                  >
                    {checked && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                  </button>
                  <p className={cn("font-semibold text-foreground text-sm transition-opacity", checked && "line-through opacity-50")}>{label}</p>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  };

  const renderAllSchedulesContent = (plan: TravelPlan | null) => {
    if (!plan) return null;
    if (plan.schedules.length === 0) {
      return (
        <div className="text-center py-12 bg-secondary rounded-2xl">
          <p className="text-slate-400">{t('home.timeline.emptyState')}</p>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {[...plan.schedules]
          .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
          .map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => { setDetailSchedule(s); setShowScheduleDetail(true); }}
              className="w-full flex items-center gap-3 p-2.5 bg-secondary rounded-lg text-sm hover:bg-secondary/70 transition-colors text-left"
            >
              <span className="text-muted-foreground font-mono text-xs flex-shrink-0">{s.date}</span>
              <span className="text-sky-600 font-mono text-xs flex-shrink-0 whitespace-nowrap">{formatTime12h(s.time)}{s.endTime ? ` ~ ${formatTime12h(s.endTime)}` : ''}</span>
              <span className={cn("px-1.5 py-0.5 rounded text-xs font-bold flex-shrink-0", getCategoryColor(s.category))}>
                {getCategoryLabel(s.category)}
              </span>
              <span className="font-semibold text-foreground truncate flex-1 min-w-0">{s.title}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
      </div>
    );
  };

  const renderAccommodationListContent = (plan: TravelPlan | null) => {
    if (!plan) return null;
    const list = plan.accommodations || [];
    if (list.length === 0) {
      return (
        <div className="text-center py-12 bg-secondary rounded-2xl">
          <p className="text-slate-400">{t('home.accommodation.emptyState')}</p>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {[...list]
          .sort((a, b) => a.checkInDate.localeCompare(b.checkInDate))
          .map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => { setPreviewAccommodation(a); setShowAccommodationListPreview(false); setShowAccommodationDetailPreview(true); }}
              className="w-full flex items-center gap-3 p-2.5 bg-secondary rounded-lg text-sm hover:bg-secondary/70 transition-colors text-left"
            >
              <Hotel className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="font-semibold text-foreground truncate flex-1 min-w-0">{a.name}</span>
              <span className="text-muted-foreground font-mono text-xs flex-shrink-0">{a.checkInDate}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
      </div>
    );
  };

  const renderFlightListContent = (plan: TravelPlan | null) => {
    if (!plan) return null;
    const list = plan.flights || [];
    if (list.length === 0) {
      return (
        <div className="text-center py-12 bg-secondary rounded-2xl">
          <p className="text-slate-400">{t('home.flight.emptyState')}</p>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {[...list]
          .sort((a, b) => a.departureDate.localeCompare(b.departureDate) || (a.departureTime || '').localeCompare(b.departureTime || ''))
          .map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => { setPreviewFlight(f); setShowFlightListPreview(false); setShowFlightDetailPreview(true); }}
              className="w-full flex items-center gap-3 p-2.5 bg-secondary rounded-lg text-sm hover:bg-secondary/70 transition-colors text-left"
            >
              <Plane className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="font-semibold text-foreground truncate flex-1 min-w-0">{f.airline} {f.flightNumber}</span>
              {f.seat && <span className="text-muted-foreground font-mono text-xs flex-shrink-0">{f.seat}</span>}
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
      </div>
    );
  };

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

  // 여행 시작일까지 남은 일수(정렬용 — D-day 배지 문자열과 달리 순수 숫자로 비교해야 하므로 별도로 계산)
  const getDaysUntilStart = (plan: TravelPlan): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(plan.startDate + 'T00:00:00');
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    return Math.round((start.getTime() - today.getTime()) / MS_PER_DAY);
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

  return (
    <div className="min-h-screen bg-[#F8F7F4]">
      {/* 새 여행 계획 다이얼로그 */}
      <Dialog open={showNewPlanDialog} onOpenChange={setShowNewPlanDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t('home.newPlanDialog.title')}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">{t('home.newPlanDialog.regionLabel')}</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewPlanRegion('domestic')}
                  className={cn(
                    "h-11 rounded-xl border font-bold text-sm transition-colors",
                    newPlanRegion === 'domestic' ? "bg-primary text-white border-primary" : "bg-card text-foreground border-border hover:border-primary/40"
                  )}
                >
                  {t('home.map.domestic')}
                </button>
                <button
                  type="button"
                  onClick={() => setNewPlanRegion('overseas')}
                  className={cn(
                    "h-11 rounded-xl border font-bold text-sm transition-colors",
                    newPlanRegion === 'overseas' ? "bg-primary text-white border-primary" : "bg-card text-foreground border-border hover:border-primary/40"
                  )}
                >
                  {t('home.map.overseas')}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{t('home.newPlanDialog.regionHint')}</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">{t('home.newPlanDialog.tripTitleLabel')}</label>
              <Input placeholder={t('home.newPlanDialog.tripTitlePlaceholder')} value={newPlanTitle} onChange={e => setNewPlanTitle(e.target.value)} className="h-11" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">{t('home.newPlanDialog.startDateLabel')}</label>
                <Input type="date" value={newPlanStartDate} onChange={e => setNewPlanStartDate(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">{t('home.newPlanDialog.endDateLabel')}</label>
                <Input type="date" value={newPlanEndDate} onChange={e => setNewPlanEndDate(e.target.value)} className="h-11" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">{t('home.aiPlanDialog.travelersLabel')}</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setNewPlanTravelers(v => Math.max(1, v - 1))}
                  disabled={newPlanTravelers <= 1}
                  className="w-11 h-11 rounded-xl border border-border flex items-center justify-center text-lg font-bold text-foreground disabled:opacity-40 hover:bg-secondary transition-colors flex-shrink-0"
                >
                  −
                </button>
                <div className="flex-1 text-center font-bold text-foreground">
                  {t('home.aiPlanDialog.travelersCount', { n: newPlanTravelers })}
                </div>
                <button
                  type="button"
                  onClick={() => setNewPlanTravelers(v => Math.min(10, v + 1))}
                  disabled={newPlanTravelers >= 10}
                  className="w-11 h-11 rounded-xl border border-border flex items-center justify-center text-lg font-bold text-foreground disabled:opacity-40 hover:bg-secondary transition-colors flex-shrink-0"
                >
                  +
                </button>
              </div>
            </div>
            <Button onClick={handleCreatePlan} className="w-full bg-primary text-white h-11 mt-2">{t('home.newPlanDialog.createButton')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI로 계획세우기 다이얼로그 */}
      <Dialog open={showAiPlanDialog} onOpenChange={(open) => { if (!isGeneratingAiPlan) setShowAiPlanDialog(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" /> {t('home.aiPlanDialog.title')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2.5 text-xs text-primary">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                {t('home.aiPlanDialog.pricingNotice')}
                {!user?.isAdmin && aiCredits !== null && ` ${t('home.aiPlanDialog.pricingNoticeCredits', { count: aiCredits })}`}
              </span>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">{t('home.aiPlanDialog.destinationLabel')}</label>
              <Input
                placeholder={t('home.aiPlanDialog.destinationPlaceholder')}
                value={aiPlanDestination}
                onChange={e => setAiPlanDestination(e.target.value)}
                className="h-11"
                disabled={isGeneratingAiPlan}
                maxLength={100}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">{t('home.newPlanDialog.startDateLabel')}</label>
                <Input type="date" value={aiPlanStartDate} onChange={e => setAiPlanStartDate(e.target.value)} className="h-11" disabled={isGeneratingAiPlan} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">{t('home.newPlanDialog.endDateLabel')}</label>
                <Input type="date" value={aiPlanEndDate} onChange={e => setAiPlanEndDate(e.target.value)} className="h-11" disabled={isGeneratingAiPlan} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">{t('home.aiPlanDialog.travelersLabel')}</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAiPlanTravelers(v => Math.max(1, v - 1))}
                  disabled={isGeneratingAiPlan || aiPlanTravelers <= 1}
                  className="w-11 h-11 rounded-xl border border-border flex items-center justify-center text-lg font-bold text-foreground disabled:opacity-40 hover:bg-secondary transition-colors flex-shrink-0"
                >
                  −
                </button>
                <div className="flex-1 text-center font-bold text-foreground">
                  {t('home.aiPlanDialog.travelersCount', { n: aiPlanTravelers })}
                </div>
                <button
                  type="button"
                  onClick={() => setAiPlanTravelers(v => Math.min(10, v + 1))}
                  disabled={isGeneratingAiPlan || aiPlanTravelers >= 10}
                  className="w-11 h-11 rounded-xl border border-border flex items-center justify-center text-lg font-bold text-foreground disabled:opacity-40 hover:bg-secondary transition-colors flex-shrink-0"
                >
                  +
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">{t('home.aiPlanDialog.preferencesLabel')}</label>
              <Textarea
                placeholder={t('home.aiPlanDialog.preferencesPlaceholder')}
                value={aiPlanPreferences}
                onChange={e => setAiPlanPreferences(e.target.value)}
                className="min-h-[80px] resize-none"
                disabled={isGeneratingAiPlan}
                maxLength={500}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t('home.aiPlanDialog.autoNote')}</p>
            <Button onClick={handleGenerateAiPlan} disabled={isGeneratingAiPlan} className="w-full bg-primary text-white h-11 mt-2 gap-2">
              {isMappingAiPlan ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {t('home.aiPlanDialog.mapping')}</>
              ) : isGeneratingAiPlan ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {t('home.aiPlanDialog.generating')}</>
              ) : (
                <><Sparkles className="w-4 h-4" /> {t('home.aiPlanDialog.generateButton')}</>
              )}
            </Button>
            {isGeneratingAiPlan && (
              <p className="text-xs text-center text-muted-foreground">
                {isMappingAiPlan ? t('home.aiPlanDialog.mappingHint') : t('home.aiPlanDialog.generatingHint')}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AiCreditsPaywallModal
        open={showAiCreditsPaywall}
        onOpenChange={setShowAiCreditsPaywall}
        onPurchased={() => { refreshAiCredits(); setShowAiPlanDialog(true); }}
      />

      {/* ── 헤더 ── */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-md border-b border-border shadow-sm">
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

          <nav className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto touch-pan-x overscroll-x-contain [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
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
                <HeaderSearch />
                <NotificationBell />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-full border border-border bg-card hover:border-primary hover:shadow-sm transition-all">
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
            className="w-full min-h-[360px] md:min-h-[420px] relative overflow-hidden"
            style={{ backgroundImage: 'url(/hero-travel.jpg)', backgroundSize: 'cover', backgroundPosition: '75% 20%' }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent" />
            <div className="absolute inset-0 flex flex-col justify-center px-5 sm:px-8 md:px-16 py-16 md:py-0 max-w-5xl">
              <h1 className="text-2xl sm:text-3xl md:text-5xl font-black text-white leading-tight drop-shadow-lg max-w-xl">
                {t('home.hero.titleLine1')}<br />{t('home.hero.titleLine2')}
              </h1>
              <p className="text-white/75 text-sm sm:text-base md:text-lg mt-4 drop-shadow max-w-lg">
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
            <div className="absolute top-4 right-4 flex items-center gap-2 flex-wrap justify-end max-w-[calc(100%-2rem)]">
              <Button
                onClick={() => {
                  if (!user) {
                    toast.error(t('session.loginRequired'));
                    return;
                  }
                  if (!user.isAdmin && aiCredits === 0) {
                    setShowAiCreditsPaywall(true);
                    return;
                  }
                  setShowAiPlanDialog(true);
                }}
                className="bg-gradient-to-r from-primary to-[#7D6B5D] text-white hover:opacity-90 gap-1.5 rounded-full shadow-lg font-bold text-sm px-4 h-9"
              >
                <Sparkles className="w-4 h-4" /> <span className="hidden sm:inline">{t('home.hero.aiPlanButton')}</span>
              </Button>
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
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">{t('home.hero.newPlanButton')}</span>
              </Button>
            </div>
          </div>

          {/* 로그아웃 상태에서는 이전 사용자의 여행 계획/기록이 화면에 노출되지 않도록
              스탯/달력/계획 목록 전체를 숨기고 로그인 유도 카드만 보여줌 */}
          {!user ? (
            <div className="max-w-5xl mx-auto px-4 -mt-8 relative z-10 pb-12">
              <Card className="p-10 flex flex-col items-center justify-center text-center bg-card border-border shadow-xl rounded-2xl">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <Lock className="w-7 h-7 text-primary" />
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">{t('home.loggedOut.title')}</h2>
                <p className="text-muted-foreground mb-6 max-w-sm">{t('home.loggedOut.subtitle')}</p>
                <Link href="/login">
                  <Button className="bg-primary text-white px-6 h-11 rounded-full">{t('nav.login')}</Button>
                </Link>
              </Card>
            </div>
          ) : (
          <>
          {/* ── 스탯 바 ── */}
          {(() => {
            const myDiaries = myDiariesForStats;
            const thisMonth = new Date().toISOString().slice(0, 7);
            const thisMonthSchedules = travelPlans.reduce((s, p) => s + p.schedules.filter(sc => sc.date?.startsWith(thisMonth)).length, 0);
            const thisMonthDiaries = myDiaries.filter(d => d.createdAt?.startsWith(thisMonth)).length;
            const activeCount = travelPlans.filter(p => getPlanStatus(p) === '진행 중').length;
            const totalSchedules = travelPlans.reduce((s, p) => s + p.schedules.length, 0);
            const uniqueLocations = Array.from(new Set(myDiaries.map(d => d.location))).length;
            const statItems = [
              { label: t('home.stats.plansLabel'), value: travelPlans.length, sub: t('home.stats.plansSub', { n: activeCount }), icon: <Map className="w-5 h-5" />, bg: 'bg-blue-100', color: 'text-blue-600' },
              { label: t('home.stats.schedulesLabel'), value: totalSchedules, sub: t('home.stats.schedulesSub', { n: thisMonthSchedules }), icon: <Calendar className="w-5 h-5" />, bg: 'bg-emerald-100', color: 'text-emerald-600' },
              { label: t('home.stats.diariesLabel'), value: myDiaries.length, sub: t('home.stats.diariesSub', { n: thisMonthDiaries }), icon: <BookOpen className="w-5 h-5" />, bg: 'bg-orange-100', color: 'text-orange-600' },
              { label: t('home.stats.locationsLabel'), value: uniqueLocations, sub: t('home.stats.locationsSub', { n: uniqueLocations }), icon: <MapPin className="w-5 h-5" />, bg: 'bg-purple-100', color: 'text-purple-600' },
            ];
            return (
              <div className="max-w-5xl mx-auto px-4 -mt-8 relative z-10">
                <div className="bg-card rounded-2xl shadow-xl border border-gray-100 grid grid-cols-2 lg:grid-cols-4">
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
              <Card className="p-5 bg-card border-border shadow-sm lg:sticky lg:top-20">
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
              <div className="flex items-center justify-between mb-5 gap-2 flex-wrap">
                <h2 className="text-xl font-black text-foreground">{t('home.planList.title')}</h2>
                <div className="flex gap-1 bg-secondary p-1 rounded-xl overflow-x-auto max-w-full touch-pan-x overscroll-x-contain [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                  {(['all', '진행 중', '예정', '완료'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setPlanFilter(f)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex-shrink-0",
                        planFilter === f ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {getFilterLabel(f)}
                    </button>
                  ))}
                </div>
              </div>

              {(() => {
                // "전체" 탭에서는 진행 중 → 예정 → 완료 순으로 그룹핑하고, 같은 상태끼리는
                // 예정=D-day 적은(임박한) 순, 완료=여행 시작일이 빠른(오래된) 순으로 정렬
                const PLAN_STATUS_ORDER: Record<string, number> = { '진행 중': 0, '예정': 1, '완료': 2 };
                const filtered = (planFilter === 'all' ? travelPlans : travelPlans.filter(p => getPlanStatus(p) === planFilter))
                  .slice()
                  .sort((a, b) => {
                    const statusA = getPlanStatus(a);
                    const statusB = getPlanStatus(b);
                    if (statusA !== statusB) return PLAN_STATUS_ORDER[statusA] - PLAN_STATUS_ORDER[statusB];
                    if (statusA === '예정') return getDaysUntilStart(a) - getDaysUntilStart(b);
                    if (statusA === '완료') return new Date(a.startDate + 'T00:00:00').getTime() - new Date(b.startDate + 'T00:00:00').getTime();
                    return 0;
                  });
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

                if (isPlanLoading && travelPlans.length === 0) {
                  return (
                    <div className="py-12 flex items-center justify-center text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  );
                }
                if (travelPlans.length === 0) {
                  return (
                    <Card className="p-12 flex flex-col items-center justify-center border-dashed border-2 border-border bg-card/60">
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
                      const thumbnail = plan.coverPhoto;
                      return (
                        <Card
                          key={plan.id}
                          className="flex flex-row gap-4 p-4 cursor-pointer hover:shadow-md transition-all bg-card border-border hover:border-primary/30 group"
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
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-2 mb-1.5">
                              <h3 className="w-full sm:w-auto min-w-0 font-bold text-foreground text-base sm:text-xl leading-snug line-clamp-1 group-hover:text-primary transition-colors">{plan.title}</h3>
                              <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap flex-shrink-0">
                                <span className="text-[11px] sm:text-xs font-bold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full border border-primary/20 bg-primary/10 text-primary">
                                  {getDday(plan)}
                                </span>
                                <span className={cn("text-[11px] sm:text-xs font-bold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full border", STATUS_STYLES[status])}>
                                  {getStatusLabel(status)}
                                </span>
                              </div>
                            </div>
                            <p className="text-xs sm:text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                              <Calendar className="w-4 h-4" /> {plan.startDate} ~ {plan.endDate}
                            </p>
                            <div className="flex items-center justify-between gap-3 mt-2.5">
                              <span className="text-muted-foreground text-xs sm:text-sm">{t('home.planList.scheduleCount', { n: plan.schedules.length })}</span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={e => { e.stopPropagation(); setSummaryPreviewPlan(plan); setShowSummaryPreview(true); }}
                                className="h-6 sm:h-7 text-[11px] sm:text-xs px-2 sm:px-2.5 gap-1 border-primary/30 text-primary hover:bg-primary/10"
                              >
                                <Eye className="w-3.5 h-3.5" /> {t('home.planList.summaryButton')}
                              </Button>
                            </div>
                          </div>
                          <div className="flex flex-col items-center gap-2 flex-shrink-0 self-start mt-1">
                            <button
                              onClick={e => { e.stopPropagation(); setDuplicatePlanId(plan.id); }}
                              title={t('home.planList.duplicateButton')}
                              className="text-slate-200 hover:text-primary transition-colors"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); setDeletePlanId(plan.id); }}
                              className="text-slate-200 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
          </>
          )}

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
                  <div className="absolute inset-0 bg-black/20 sm:bg-black/0 sm:group-hover/cover:bg-black/40 transition-colors flex items-center justify-center">
                    <Camera className="w-5 h-5 text-white opacity-100 sm:opacity-0 sm:group-hover/cover:opacity-100 transition-opacity" />
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
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                      <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-foreground flex items-center gap-2 flex-wrap break-words">
                        <span>{currentPlan.title}</span>
                        <Plane className="text-primary flex-shrink-0" />
                      </h2>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={handleStartEditTitle}
                          className="p-2 text-slate-400 hover:text-primary transition-colors rounded-lg hover:bg-secondary flex-shrink-0"
                          title={t('home.planDetail.editTitleTooltip')}
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <span className="text-sm font-bold px-3 py-1 rounded-full bg-primary text-white shadow-sm shadow-primary/30 flex-shrink-0">
                          {getDday(currentPlan)}
                        </span>
                      </div>
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
                <Card className="p-6 bg-card border-border shadow-sm">
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
              </div>

              {/* 메인: 탭 컨텐츠 */}
              <div className="lg:col-span-8">
                <Tabs defaultValue="schedule" className="w-full">
                  <TabsList
                    className="flex lg:grid w-full lg:grid-cols-9 gap-1 overflow-x-auto lg:overflow-visible touch-pan-x overscroll-x-contain bg-secondary/50 p-1 rounded-2xl mb-6 [&::-webkit-scrollbar]:hidden"
                    style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
                  >
                    <TabsTrigger value="schedule" className="flex-shrink-0 lg:flex-shrink whitespace-nowrap px-4 lg:px-2 rounded-xl data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">{t('home.tabs.schedule')}</TabsTrigger>
                    <TabsTrigger value="accommodation" className="flex-shrink-0 lg:flex-shrink whitespace-nowrap px-4 lg:px-2 rounded-xl data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">{t('home.tabs.accommodation')}</TabsTrigger>
                    <TabsTrigger value="flight" className="flex-shrink-0 lg:flex-shrink whitespace-nowrap px-4 lg:px-2 rounded-xl data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">{t('home.tabs.flight')}</TabsTrigger>
                    <TabsTrigger value="map" className="flex-shrink-0 lg:flex-shrink whitespace-nowrap px-4 lg:px-2 rounded-xl data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">{t('home.tabs.map')}</TabsTrigger>
                    <TabsTrigger value="weather" className="flex-shrink-0 lg:flex-shrink whitespace-nowrap px-4 lg:px-2 rounded-xl data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">{t('home.tabs.weather')}</TabsTrigger>
                    <TabsTrigger value="budget" className="flex-shrink-0 lg:flex-shrink whitespace-nowrap px-4 lg:px-2 rounded-xl data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">{t('home.tabs.budget')}</TabsTrigger>
                    <TabsTrigger value="shopping" className="flex-shrink-0 lg:flex-shrink whitespace-nowrap px-4 lg:px-2 rounded-xl data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">{t('home.tabs.shopping')}</TabsTrigger>
                    <TabsTrigger value="summary" className="flex-shrink-0 lg:flex-shrink whitespace-nowrap px-4 lg:px-2 rounded-xl data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">{t('home.tabs.summary')}</TabsTrigger>
                    <TabsTrigger value="timeline" className="flex-shrink-0 lg:flex-shrink whitespace-nowrap px-4 lg:px-2 rounded-xl data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">{t('home.tabs.timeline')}</TabsTrigger>
                  </TabsList>

                  {/* 일정 탭 */}
                  <TabsContent value="schedule" className="space-y-6">
                    <Card className="p-6 bg-card border-border">
                      <h3 className="text-lg font-bold text-foreground mb-5">{t('home.schedule.addTitle')}</h3>
                      <ScheduleForm onAdd={handleAddSchedule} existingSchedules={currentPlan?.schedules || []} region={currentPlan.region} />
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
                        <div className="text-center py-12 bg-card rounded-2xl border border-border">
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
                              region={currentPlan.region}
                            />
                          ))
                      )}
                    </div>
                  </TabsContent>

                  {/* 숙소 탭 */}
                  <TabsContent value="accommodation" className="space-y-6">
                    <Card className="p-6 bg-card border-border">
                      <h3 className="text-lg font-bold text-foreground mb-5">{t('home.accommodation.addTitle')}</h3>
                      <AccommodationForm onAdd={handleAddAccommodation} region={currentPlan.region} />
                    </Card>

                    <div className="space-y-4">
                      <h3 className="text-xl font-bold text-foreground">{t('home.accommodation.listTitle')}</h3>
                      {(currentPlan.accommodations || []).length === 0 ? (
                        <div className="text-center py-12 bg-card rounded-2xl border border-border">
                          <p className="text-slate-400">{t('home.accommodation.emptyState')}</p>
                        </div>
                      ) : (
                        [...(currentPlan.accommodations || [])]
                          .sort((a, b) => a.checkInDate.localeCompare(b.checkInDate) || (a.checkInTime || '').localeCompare(b.checkInTime || ''))
                          .map(accommodation => (
                            <AccommodationCard
                              key={accommodation.id}
                              accommodation={accommodation}
                              isEditing={editingAccommodationId === accommodation.id}
                              onEdit={() => setEditingAccommodationId(accommodation.id)}
                              onUpdate={handleUpdateAccommodation}
                              onDelete={handleDeleteAccommodation}
                              onCancel={() => setEditingAccommodationId(null)}
                              region={currentPlan.region}
                            />
                          ))
                      )}
                    </div>
                  </TabsContent>

                  {/* 항공권 탭 */}
                  <TabsContent value="flight" className="space-y-6">
                    <Card className="p-6 bg-card border-border">
                      <h3 className="text-lg font-bold text-foreground mb-5">{t('home.flight.addTitle')}</h3>
                      <FlightForm onAdd={handleAddFlight} />
                    </Card>

                    <div className="space-y-4">
                      <h3 className="text-xl font-bold text-foreground">{t('home.flight.listTitle')}</h3>
                      {(currentPlan.flights || []).length === 0 ? (
                        <div className="text-center py-12 bg-card rounded-2xl border border-border">
                          <p className="text-slate-400">{t('home.flight.emptyState')}</p>
                        </div>
                      ) : (
                        [...(currentPlan.flights || [])]
                          .sort((a, b) => a.departureDate.localeCompare(b.departureDate) || (a.departureTime || '').localeCompare(b.departureTime || ''))
                          .map(flight => (
                            <FlightCard
                              key={flight.id}
                              flight={flight}
                              isEditing={editingFlightId === flight.id}
                              onEdit={() => setEditingFlightId(flight.id)}
                              onUpdate={handleUpdateFlight}
                              onDelete={handleDeleteFlight}
                              onCancel={() => setEditingFlightId(null)}
                            />
                          ))
                      )}
                    </div>
                  </TabsContent>

                  {/* 지도 탭 */}
                  <TabsContent value="map" className="space-y-4">
                    <Card className="p-6 bg-card border-border">
                      {(() => {
                        const isDomestic = currentPlan.region !== 'overseas';

                        const pinned = [...currentPlan.schedules]
                          .filter(s => s.lat !== undefined && s.lng !== undefined)
                          .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

                        const markers: MapMarker[] = pinned.map((s, i) => ({
                          id: s.id,
                          lat: s.lat as number,
                          lng: s.lng as number,
                          title: `${i + 1}. ${s.title} (${s.date} ${formatTime12h(s.time)})`,
                          draggable: false,
                          label: String(i + 1),
                        }));
                        const panToSchedule = (s: (typeof pinned)[number]) => {
                          if (s.lat === undefined || s.lng === undefined) return;
                          if (isDomestic) {
                            const map = scheduleMapRef.current;
                            if (!map || !window.naver) return;
                            map.morph(new window.naver.maps.LatLng(s.lat, s.lng), Math.max(map.getZoom(), 15));
                          } else {
                            const map = scheduleOverseasMapRef.current;
                            if (!map) return;
                            map.flyTo({ center: [s.lng, s.lat], zoom: Math.max(map.getZoom(), 15) });
                          }
                        };
                        const routeOrigin = pinned.find(s => s.id === routeOriginId);
                        const routeDestination = pinned.find(s => s.id === routeDestinationId);
                        const canGetDirections = !!routeOrigin && !!routeDestination && routeOrigin.id !== routeDestination.id;
                        const handleRowClick = (s: (typeof pinned)[number]) => {
                          if (routeSelectMode === 'origin') {
                            setRouteOriginId(s.id);
                            setRouteSelectMode(null);
                          } else if (routeSelectMode === 'destination') {
                            setRouteDestinationId(s.id);
                            setRouteSelectMode(null);
                          } else {
                            panToSchedule(s);
                          }
                        };
                        const handleMarkerDelete = (id: string) => {
                          const target = currentPlan.schedules.find(s => s.id === id);
                          if (target) handleUpdateSchedule(id, { ...target, lat: undefined, lng: undefined });
                          if (routeOriginId === id) setRouteOriginId(null);
                          if (routeDestinationId === id) setRouteDestinationId(null);
                        };

                        return (
                          <>
                            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                                <Map className="w-5 h-5 text-primary" /> {t('home.map.title')}
                                <span className="text-xs font-normal text-muted-foreground">
                                  ({isDomestic ? t('home.map.domestic') : t('home.map.overseas')})
                                </span>
                              </h3>
                              <span className="text-sm text-muted-foreground">
                                {t('home.map.pinnedCount', { n: pinned.length })}
                              </span>
                            </div>

                            {pinned.length === 0 ? (
                              <div className="text-center py-12 text-muted-foreground">
                                <MapPin className="w-10 h-10 mx-auto mb-3 text-border" />
                                <p className="text-sm">{t('home.map.emptyState')}</p>
                                <p className="text-xs mt-1">{t('home.map.emptyStateHint')}</p>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                <div className="lg:col-span-2">
                                  {isDomestic ? (
                                    <MapView
                                      key="domestic"
                                      className="h-[280px] sm:h-[500px]"
                                      markers={markers}
                                      fitToMarkers
                                      onMapReady={map => {
                                        scheduleMapRef.current = map;
                                      }}
                                      onMarkerDelete={handleMarkerDelete}
                                    />
                                  ) : (
                                    <Suspense fallback={<div className="relative w-full h-[280px] sm:h-[500px] rounded-xl overflow-hidden bg-secondary flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
                                      <OverseasMapView
                                        key="overseas"
                                        className="h-[280px] sm:h-[500px]"
                                        markers={markers}
                                        fitToMarkers
                                        onMapReady={map => {
                                          scheduleOverseasMapRef.current = map;
                                        }}
                                        onMarkerDelete={handleMarkerDelete}
                                      />
                                    </Suspense>
                                  )}
                                  <div className="mt-4 pt-4 border-t border-border">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setRouteSelectMode(routeSelectMode === 'origin' ? null : 'origin')}
                                        className={cn(
                                          "px-3 py-2 rounded-full text-xs sm:text-sm font-bold border transition-colors max-w-[45%] sm:max-w-[180px] truncate",
                                          routeSelectMode === 'origin' ? "bg-primary text-white border-primary" : "bg-card text-foreground border-border hover:border-primary/40"
                                        )}
                                      >
                                        {t('home.map.routeOriginLabel')}{routeOrigin ? `: ${pinned.indexOf(routeOrigin) + 1}. ${routeOrigin.title}` : ''}
                                      </button>
                                      <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                      <button
                                        type="button"
                                        onClick={() => setRouteSelectMode(routeSelectMode === 'destination' ? null : 'destination')}
                                        className={cn(
                                          "px-3 py-2 rounded-full text-xs sm:text-sm font-bold border transition-colors max-w-[45%] sm:max-w-[180px] truncate",
                                          routeSelectMode === 'destination' ? "bg-primary text-white border-primary" : "bg-card text-foreground border-border hover:border-primary/40"
                                        )}
                                      >
                                        {t('home.map.routeDestinationLabel')}{routeDestination ? `: ${pinned.indexOf(routeDestination) + 1}. ${routeDestination.title}` : ''}
                                      </button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        onClick={() => {
                                          if (!routeOrigin || !routeDestination || routeOrigin.lat === undefined || routeDestination.lat === undefined) return;
                                          openDirectionsBetween(
                                            { lat: routeOrigin.lat, lng: routeOrigin.lng as number },
                                            { lat: routeDestination.lat, lng: routeDestination.lng as number }
                                          );
                                        }}
                                        disabled={!canGetDirections}
                                        className="gap-1.5 h-9"
                                      >
                                        <Navigation className="w-4 h-4" /> {t('home.map.getDirections')}
                                      </Button>
                                    </div>
                                    {routeSelectMode && (
                                      <p className="text-xs text-primary font-semibold mt-2">
                                        {routeSelectMode === 'origin' ? t('home.map.selectOriginHint') : t('home.map.selectDestinationHint')}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                                  <p className="text-xs font-semibold text-muted-foreground px-1 mb-1">
                                    {routeSelectMode ? (routeSelectMode === 'origin' ? t('home.map.selectOriginHint') : t('home.map.selectDestinationHint')) : t('home.map.tapToLocate')}
                                  </p>
                                  {pinned.map((s, i) => (
                                    <button
                                      key={s.id}
                                      type="button"
                                      onClick={() => handleRowClick(s)}
                                      className={cn(
                                        "w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-colors",
                                        routeOriginId === s.id ? "border-emerald-400 bg-emerald-50" :
                                        routeDestinationId === s.id ? "border-rose-400 bg-rose-50" :
                                        "border-border hover:border-primary/40 hover:bg-primary/5"
                                      )}
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
                                          {routeOriginId === s.id && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 bg-emerald-100 text-emerald-700">{t('home.map.routeOriginBadge')}</span>
                                          )}
                                          {routeDestinationId === s.id && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 bg-rose-100 text-rose-700">{t('home.map.routeDestinationBadge')}</span>
                                          )}
                                        </div>
                                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                          <Calendar className="w-3 h-3 flex-shrink-0" /> {s.date} {formatTime12h(s.time)}
                                        </p>
                                        {s.location && (
                                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 min-w-0">
                                            <MapPin className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{s.location}</span>
                                          </p>
                                        )}
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </Card>
                  </TabsContent>

                  {/* 날씨 탭 */}
                  <TabsContent value="weather" className="space-y-4">
                    <Tabs defaultValue="domestic" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 bg-secondary/50 p-1 rounded-2xl mb-4">
                        <TabsTrigger value="domestic" className="rounded-xl data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">{t('home.weather.domestic')}</TabsTrigger>
                        <TabsTrigger value="overseas" className="rounded-xl data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">{t('home.weather.overseas')}</TabsTrigger>
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
                    {/* 총 예산 개요 */}
                    <Card className="p-6 bg-gradient-to-br from-primary to-[#8B7968] text-white shadow-lg shadow-border">
                      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                        <h3 className="text-lg font-bold">{t('home.budget.overviewTitle')}</h3>
                        <div className="flex items-center gap-2">
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
                          {!editingTotalBudget && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handleStartEditTotalBudget}
                              className="h-8 text-white hover:bg-white/20 hover:text-white"
                            >
                              <Edit2 className="w-3.5 h-3.5 mr-1.5" />
                              {plannedBudget > 0 ? t('home.budget.editTotalBudget') : t('home.budget.setTotalBudget')}
                            </Button>
                          )}
                        </div>
                      </div>
                      {editingTotalBudget ? (
                        <div className="mb-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              value={totalBudgetInput}
                              onChange={e => setTotalBudgetInput(e.target.value)}
                              placeholder={t('home.budget.totalBudgetPlaceholder')}
                              className="h-11 bg-white/90 text-foreground border-0"
                              autoFocus
                            />
                            <Button onClick={handleSaveTotalBudget} className="h-11 w-11 p-0 bg-white text-primary hover:bg-white/90 flex-shrink-0"><Check className="w-4 h-4" /></Button>
                            <Button onClick={handleCancelEditTotalBudget} variant="ghost" className="h-11 w-11 p-0 text-white hover:bg-white/20 hover:text-white flex-shrink-0"><X className="w-4 h-4" /></Button>
                          </div>
                          <div className="flex items-center justify-between gap-3 bg-white/10 rounded-xl px-3 py-2">
                            <span className="text-xs sm:text-sm font-semibold text-white/90">{t('home.aiPlanDialog.travelersLabel')}</span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setTotalBudgetTravelersInput(v => Math.max(1, v - 1))}
                                disabled={totalBudgetTravelersInput <= 1}
                                className="w-8 h-8 rounded-lg border border-white/30 flex items-center justify-center text-sm font-bold text-white disabled:opacity-40 hover:bg-white/20 transition-colors flex-shrink-0"
                              >
                                −
                              </button>
                              <span className="min-w-[3.5rem] text-center font-bold text-white text-sm">
                                {t('home.aiPlanDialog.travelersCount', { n: totalBudgetTravelersInput })}
                              </span>
                              <button
                                type="button"
                                onClick={() => setTotalBudgetTravelersInput(v => Math.min(10, v + 1))}
                                disabled={totalBudgetTravelersInput >= 10}
                                className="w-8 h-8 rounded-lg border border-white/30 flex items-center justify-center text-sm font-bold text-white disabled:opacity-40 hover:bg-white/20 transition-colors flex-shrink-0"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
                          <div className="bg-white/20 p-3 rounded-xl min-w-0">
                            <p className="text-[11px] font-bold text-white/80 uppercase tracking-wider">{t('home.budget.plannedLabel')}</p>
                            <p className="text-base sm:text-xl font-black truncate">₩{plannedBudget.toLocaleString()}</p>
                            <p className="text-[11px] text-white/70 truncate mt-0.5">{formatCurrency(plannedBudget)}</p>
                          </div>
                          <div className="bg-white/20 p-3 rounded-xl min-w-0">
                            <p className="text-[11px] font-bold text-white/80 uppercase tracking-wider">{t('home.budget.spentLabel')}</p>
                            <p className="text-base sm:text-xl font-black truncate">₩{totalBudget.toLocaleString()}</p>
                            <p className="text-[11px] text-white/70 truncate mt-0.5">{formatCurrency(totalBudget)}</p>
                          </div>
                          <div className={cn("p-3 rounded-xl min-w-0", plannedBudget > 0 && remainingBudget < 0 ? "bg-red-500/30" : "bg-white/20")}>
                            <p className="text-[11px] font-bold text-white/80 uppercase tracking-wider">{t('home.budget.remainingLabel')}</p>
                            <p className="text-base sm:text-xl font-black truncate">₩{remainingBudget.toLocaleString()}</p>
                            <p className="text-[11px] text-white/70 truncate mt-0.5">{formatCurrency(remainingBudget)}</p>
                          </div>
                        </div>
                      )}
                      {plannedBudget > 0 && (
                        <div>
                          <div className="h-2.5 rounded-full bg-white/20 overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all", totalBudget > plannedBudget ? "bg-red-400" : "bg-card")}
                              style={{ width: `${Math.min(100, Math.round((totalBudget / plannedBudget) * 100))}%` }}
                            />
                          </div>
                          <p className="text-xs text-white/80 mt-1.5 font-semibold">
                            {t('home.budget.usagePercent', { n: Math.round((totalBudget / plannedBudget) * 100) })}
                          </p>
                        </div>
                      )}
                      {!!currentPlan.travelers && currentPlan.travelers > 1 && (
                        <div className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between flex-wrap gap-2 text-xs sm:text-sm">
                          <span className="font-semibold text-white/90">{t('home.budget.travelersCountLabel', { n: currentPlan.travelers })}</span>
                          <span className="font-bold">{t('home.budget.perSpentPersonLabel')}: ₩{Math.round(totalBudget / currentPlan.travelers).toLocaleString()}</span>
                        </div>
                      )}
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Card className="p-6 bg-card border-border">
                        <h3 className="text-lg font-bold text-foreground mb-4">{t('home.budget.addTitle')}</h3>
                        <BudgetForm onAdd={handleAddBudget} remainingBudget={plannedBudget > 0 ? remainingBudget : null} />
                      </Card>
                      <Card className="p-6 bg-card border-border">
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

                    {/* 카테고리별 지출 차트 */}
                    <Card className="p-6 bg-card border-border">
                      <h3 className="text-lg font-bold text-foreground mb-4">{t('home.budget.categoryChartTitle')}</h3>
                      {categorySpending.length === 0 ? (
                        <div className="text-center py-12 bg-secondary rounded-2xl">
                          <p className="text-slate-400">{t('home.budget.categoryChartEmptyState')}</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                          <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={categorySpending}
                                  dataKey="amount"
                                  nameKey="category"
                                  innerRadius="55%"
                                  outerRadius="85%"
                                  paddingAngle={2}
                                >
                                  {categorySpending.map(entry => (
                                    <Cell key={entry.category} fill={CATEGORY_CHART_COLORS[entry.category] || CATEGORY_CHART_COLORS.other} />
                                  ))}
                                </Pie>
                                <Tooltip
                                  formatter={(value: number, _name: string, item: any) => [`₩${value.toLocaleString()}`, getCategoryLabel(item.payload.category)]}
                                  contentStyle={{ borderRadius: 12, border: '1px solid #e1e0d9', fontSize: 13 }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="space-y-2.5">
                            {categorySpending.map(entry => {
                              const pct = totalBudget > 0 ? Math.round((entry.amount / totalBudget) * 100) : 0;
                              return (
                                <div key={entry.category} className="flex items-center gap-3">
                                  <span
                                    className="w-3 h-3 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: CATEGORY_CHART_COLORS[entry.category] || CATEGORY_CHART_COLORS.other }}
                                  />
                                  <span className="text-sm font-semibold text-foreground flex-1 min-w-0 truncate">{getCategoryLabel(entry.category)}</span>
                                  <span className="text-sm font-bold text-foreground flex-shrink-0">₩{entry.amount.toLocaleString()}</span>
                                  <span className="text-xs text-muted-foreground w-10 text-right flex-shrink-0">{pct}%</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </Card>

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
                    <Card className="p-6 bg-card border-border">
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* 좌측: 일정별 준비물 */}
                      <Card className="p-6 bg-card border-border">
                        <h3 className="text-lg font-bold text-foreground mb-4">{t('home.summary.byScheduleTitle')}</h3>
                        {renderPreparationsByScheduleContent(currentPlan)}
                      </Card>

                      {/* 우측: 전체 준비물 체크리스트 */}
                      <Card className="p-6 bg-card border-border">
                        {renderAllPreparationsChecklistContent(currentPlan, handleTogglePreparationCheck)}
                      </Card>
                    </div>
                  </TabsContent>

                  {/* 타임라인 탭 */}
                  <TabsContent value="timeline" className="space-y-4">
                    <Card className="p-6 bg-card border-border">
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
                      {renderTimelineContent(currentPlan, handleToggleScheduleComplete)}
                    </Card>
                  </TabsContent>
                </Tabs>
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
                  onClick={async () => {
                    if (await copyToClipboard(window.location.href)) {
                      toast.success(t('home.toast.shareLinkCopied'));
                    }
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
            <DialogTitle className="flex items-center gap-2 text-foreground break-words">
              <Eye className="w-5 h-5 text-primary flex-shrink-0" />
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
                  {!!previewPlan.travelers && previewPlan.travelers > 1 && (
                    <div>
                      <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider mb-1">{t('home.budget.travelersCountLabel', { n: previewPlan.travelers })}</p>
                      <p className="font-bold text-primary text-lg">₩{Math.round(previewPlan.budgets.reduce((s, b) => s + b.amount, 0) / previewPlan.travelers).toLocaleString()} <span className="text-xs font-semibold text-muted-foreground">/ {t('home.budget.perSpentPersonLabel')}</span></p>
                    </div>
                  )}
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
                          <div key={s.id} className="p-3 bg-card border border-border rounded-xl">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", getCategoryColor(s.category))}>
                                {getCategoryLabel(s.category)}
                              </span>
                              <span className="text-xs text-slate-500 font-semibold">{formatTime12h(s.time)}</span>
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
                          <span className="text-sky-500 font-mono text-xs w-16 flex-shrink-0 whitespace-nowrap">{formatTime12h(s.time)}</span>
                          <span className={cn("px-1.5 py-0.5 rounded text-xs font-bold flex-shrink-0", getCategoryColor(s.category))}>
                            {getCategoryLabel(s.category)}
                          </span>
                          <span className="font-semibold text-foreground truncate flex-1 min-w-0">{s.title}</span>
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

      {/* 여행 계획 삭제 확인 다이얼로그 — 데스크톱/모바일 모두 동일하게 실수 삭제 방지 */}
      <Dialog open={!!deletePlanId} onOpenChange={(o) => { if (!o) setDeletePlanId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" /> {t('home.deletePlanDialog.title')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <p className="font-semibold text-black">{t('home.deletePlanDialog.message')}</p>
              <p className="text-xs mt-1 text-red-500">{t('home.deletePlanDialog.warning')}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDeletePlanId(null)} className="flex-1">
                {t('home.common.cancel')}
              </Button>
              <Button
                onClick={() => { if (deletePlanId) handleDeletePlan(deletePlanId); setDeletePlanId(null); }}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
              >
                <Trash2 className="w-4 h-4 mr-1" /> {t('home.deletePlanDialog.confirmButton')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 여행 계획 복제 확인 다이얼로그 — 데스크톱/모바일 모두 동일하게 실수 복제 방지 */}
      <Dialog open={!!duplicatePlanId} onOpenChange={(o) => { if (!o) setDuplicatePlanId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Copy className="w-5 h-5 text-primary" /> {t('home.duplicatePlanDialog.title')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-secondary border border-border rounded-lg p-3 text-sm">
              <p className="font-semibold text-black">{t('home.duplicatePlanDialog.message')}</p>
              <p className="text-xs mt-1 text-muted-foreground">{t('home.duplicatePlanDialog.note')}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDuplicatePlanId(null)} className="flex-1">
                {t('home.common.cancel')}
              </Button>
              <Button
                onClick={() => { if (duplicatePlanId) handleDuplicatePlan(duplicatePlanId); setDuplicatePlanId(null); }}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Copy className="w-4 h-4 mr-1" /> {t('home.duplicatePlanDialog.confirmButton')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 여행 요약 - 선택 다이얼로그 (전체 일정 / 타임라인 / 준비물) */}
      <Dialog open={showSummaryPreview} onOpenChange={setShowSummaryPreview}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Eye className="w-5 h-5 text-primary" /> {summaryPreviewPlan?.title} - {t('home.planDetail.summaryTitle')}
            </DialogTitle>
          </DialogHeader>
          {summaryPreviewPlan && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowSummaryPreview(false); setShowAllSchedulesPreview(true); }}
                className="bg-secondary hover:bg-secondary/70 p-4 rounded-xl text-left transition-colors"
              >
                <p className="text-xs font-bold text-muted-foreground">{t('home.planDetail.totalSchedulesLabel')}</p>
                <p className="text-xl font-bold text-foreground">{t('home.unitCount', { n: summaryPreviewPlan.schedules.length })}</p>
              </button>
              <button
                type="button"
                onClick={() => { setShowSummaryPreview(false); setShowTimelinePreview(true); }}
                className="bg-secondary hover:bg-secondary/70 p-4 rounded-xl text-left transition-colors"
              >
                <p className="text-xs font-bold text-muted-foreground">{t('home.planDetail.timelineLabel')}</p>
                <p className="text-xl font-bold text-foreground">
                  {summaryPreviewPlan.schedules.length > 0
                    ? t('home.timeline.percentComplete', { n: Math.round((summaryPreviewPlan.schedules.filter(s => s.completed).length / summaryPreviewPlan.schedules.length) * 100) })
                    : t('home.unitCount', { n: 0 })}
                </p>
              </button>
              <button
                type="button"
                onClick={() => { setShowSummaryPreview(false); setShowPreparationsPreview(true); }}
                className="bg-secondary hover:bg-secondary/70 p-4 rounded-xl text-left transition-colors"
              >
                <p className="text-xs font-bold text-muted-foreground">{t('home.planDetail.preparationsLabel')}</p>
                <p className="text-xl font-bold text-foreground">
                  {t('home.unitCount', { n: summaryPreviewPlan.schedules.filter(s => s.preparations && s.preparations.length > 0).length })}
                </p>
              </button>
              <button
                type="button"
                onClick={() => { setShowSummaryPreview(false); setShowAccommodationListPreview(true); }}
                className="bg-secondary hover:bg-secondary/70 p-4 rounded-xl text-left transition-colors"
              >
                <p className="text-xs font-bold text-muted-foreground">{t('home.accommodation.listTitle')}</p>
                <p className="text-xl font-bold text-foreground">{t('home.unitCount', { n: (summaryPreviewPlan.accommodations || []).length })}</p>
              </button>
              <button
                type="button"
                onClick={() => { setShowSummaryPreview(false); setShowFlightListPreview(true); }}
                className="bg-secondary hover:bg-secondary/70 p-4 rounded-xl text-left transition-colors"
              >
                <p className="text-xs font-bold text-muted-foreground">{t('home.flight.listTitle')}</p>
                <p className="text-xl font-bold text-foreground">{t('home.unitCount', { n: (summaryPreviewPlan.flights || []).length })}</p>
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 여행 요약 - 전체 일정 미리보기 다이얼로그 */}
      <Dialog open={showAllSchedulesPreview} onOpenChange={setShowAllSchedulesPreview}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <button
              type="button"
              onClick={() => { setShowAllSchedulesPreview(false); setShowSummaryPreview(true); }}
              className="text-primary font-semibold text-sm hover:underline flex items-center gap-1 self-start"
            >
              <ChevronLeft className="w-4 h-4" /> {t('home.planDetail.backButton')}
            </button>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Clock className="w-5 h-5 text-primary" /> {t('home.planDetail.totalSchedulesLabel')}
            </DialogTitle>
          </DialogHeader>
          <div className="pt-2">{renderAllSchedulesContent(summaryPreviewPlan)}</div>
        </DialogContent>
      </Dialog>

      {/* 여행 요약 - 타임라인 미리보기 다이얼로그 */}
      <Dialog open={showTimelinePreview} onOpenChange={setShowTimelinePreview}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <button
              type="button"
              onClick={() => { setShowTimelinePreview(false); setShowSummaryPreview(true); }}
              className="text-primary font-semibold text-sm hover:underline flex items-center gap-1 self-start"
            >
              <ChevronLeft className="w-4 h-4" /> {t('home.planDetail.backButton')}
            </button>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Clock className="w-5 h-5 text-primary" /> {t('home.timeline.title')}
            </DialogTitle>
          </DialogHeader>
          <div className="pt-2">
            {renderTimelineContent(
              summaryPreviewPlan,
              summaryPreviewPlan ? (scheduleId: string) => handleToggleScheduleCompleteForPlan(summaryPreviewPlan.id, scheduleId) : undefined
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 여행 요약 - 준비물 미리보기 다이얼로그 */}
      <Dialog open={showPreparationsPreview} onOpenChange={setShowPreparationsPreview}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <button
              type="button"
              onClick={() => { setShowPreparationsPreview(false); setShowSummaryPreview(true); }}
              className="text-primary font-semibold text-sm hover:underline flex items-center gap-1 self-start"
            >
              <ChevronLeft className="w-4 h-4" /> {t('home.planDetail.backButton')}
            </button>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Check className="w-5 h-5 text-primary" /> {t('home.planDetail.preparationsLabel')}
            </DialogTitle>
          </DialogHeader>
          <div className="pt-2 space-y-2">
            <h4 className="text-sm font-bold text-muted-foreground">{t('home.summary.byScheduleTitle')}</h4>
            {renderPreparationsByScheduleContent(summaryPreviewPlan)}
          </div>
          <div className="pt-6 mt-2 border-t border-border">
            {renderAllPreparationsChecklistContent(
              summaryPreviewPlan,
              summaryPreviewPlan ? (item: string) => handleTogglePreparationCheckForPlan(summaryPreviewPlan.id, item) : undefined
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 여행 요약 - 숙소 목록 미리보기 다이얼로그 */}
      <Dialog open={showAccommodationListPreview} onOpenChange={setShowAccommodationListPreview}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <button
              type="button"
              onClick={() => { setShowAccommodationListPreview(false); setShowSummaryPreview(true); }}
              className="text-primary font-semibold text-sm hover:underline flex items-center gap-1 self-start"
            >
              <ChevronLeft className="w-4 h-4" /> {t('home.planDetail.backButton')}
            </button>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Hotel className="w-5 h-5 text-primary" /> {t('home.accommodation.listTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="pt-2">{renderAccommodationListContent(summaryPreviewPlan)}</div>
        </DialogContent>
      </Dialog>

      {/* 여행 요약 - 숙소 상세 미리보기 다이얼로그 (읽기 전용) */}
      <Dialog open={showAccommodationDetailPreview} onOpenChange={setShowAccommodationDetailPreview}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <button
              type="button"
              onClick={() => { setShowAccommodationDetailPreview(false); setShowAccommodationListPreview(true); }}
              className="text-primary font-semibold text-sm hover:underline flex items-center gap-1 self-start"
            >
              <ChevronLeft className="w-4 h-4" /> {t('home.planDetail.backButton')}
            </button>
            <DialogTitle className="flex items-center gap-2 text-foreground break-words">
              <Hotel className="w-5 h-5 text-primary flex-shrink-0" /> {previewAccommodation?.name}
            </DialogTitle>
          </DialogHeader>
          {previewAccommodation && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap">
                <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary flex-shrink-0" /> {t('home.accommodation.checkInShort')} {previewAccommodation.checkInDate}{previewAccommodation.checkInTime ? ` ${formatTime12h(previewAccommodation.checkInTime)}` : ''}
                </span>
                <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary flex-shrink-0" /> {t('home.accommodation.checkOutShort')} {previewAccommodation.checkOutDate}{previewAccommodation.checkOutTime ? ` ${formatTime12h(previewAccommodation.checkOutTime)}` : ''}
                </span>
              </div>
              {previewAccommodation.address && (
                <div className="flex items-center gap-2 flex-wrap text-sm text-slate-600">
                  <p className="flex items-center gap-1 min-w-0">
                    <MapPin className="w-4 h-4 text-primary flex-shrink-0" /> <span className="truncate">{previewAccommodation.address}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => openDirections(previewAccommodation.lat, previewAccommodation.lng, previewAccommodation.address)}
                    className="flex items-center gap-1 text-primary font-semibold hover:underline flex-shrink-0"
                  >
                    <Navigation className="w-3.5 h-3.5" /> {t('home.accommodation.form.directionsButton')}
                  </button>
                </div>
              )}
              {previewAccommodation.phone && (
                <p className="flex items-center gap-1.5 text-sm text-slate-600">
                  <Phone className="w-4 h-4 text-primary flex-shrink-0" />
                  <a href={`tel:${previewAccommodation.phone}`} className="hover:text-primary hover:underline">{previewAccommodation.phone}</a>
                </p>
              )}
              {previewAccommodation.reservationNumber && (
                <p className="flex items-center gap-1.5 text-sm text-slate-600">
                  <Hash className="w-4 h-4 text-primary flex-shrink-0" /> {previewAccommodation.reservationNumber}
                </p>
              )}
              {previewAccommodation.link && (
                <a
                  href={previewAccommodation.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline flex items-center gap-1.5 break-all"
                >
                  <LinkIcon className="w-4 h-4 flex-shrink-0" /> {previewAccommodation.link}
                </a>
              )}
              {previewAccommodation.notes && (
                <p className="text-sm text-muted-foreground italic bg-secondary p-3 rounded-xl">"{previewAccommodation.notes}"</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 여행 요약 - 항공권 목록 미리보기 다이얼로그 */}
      <Dialog open={showFlightListPreview} onOpenChange={setShowFlightListPreview}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <button
              type="button"
              onClick={() => { setShowFlightListPreview(false); setShowSummaryPreview(true); }}
              className="text-primary font-semibold text-sm hover:underline flex items-center gap-1 self-start"
            >
              <ChevronLeft className="w-4 h-4" /> {t('home.planDetail.backButton')}
            </button>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Plane className="w-5 h-5 text-primary" /> {t('home.flight.listTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="pt-2">{renderFlightListContent(summaryPreviewPlan)}</div>
        </DialogContent>
      </Dialog>

      {/* 여행 요약 - 항공권 상세 미리보기 다이얼로그 (읽기 전용) */}
      <Dialog open={showFlightDetailPreview} onOpenChange={setShowFlightDetailPreview}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <button
              type="button"
              onClick={() => { setShowFlightDetailPreview(false); setShowFlightListPreview(true); }}
              className="text-primary font-semibold text-sm hover:underline flex items-center gap-1 self-start"
            >
              <ChevronLeft className="w-4 h-4" /> {t('home.planDetail.backButton')}
            </button>
            <DialogTitle className="flex items-center gap-2 text-foreground break-words">
              <Plane className="w-5 h-5 text-primary flex-shrink-0" /> {previewFlight?.airline} {previewFlight?.flightNumber}
            </DialogTitle>
          </DialogHeader>
          {previewFlight && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 flex-wrap text-sm font-semibold text-slate-700">
                <span>{previewFlight.departureAirport}</span>
                <ArrowRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span>{previewFlight.arrivalAirport}</span>
              </div>
              <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap">
                <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary flex-shrink-0" /> {t('home.flight.departureShort')} {previewFlight.departureDate}{previewFlight.departureTime ? ` ${formatTime12h(previewFlight.departureTime)}` : ''}
                </span>
                <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary flex-shrink-0" /> {t('home.flight.arrivalShort')} {previewFlight.arrivalDate}{previewFlight.arrivalTime ? ` ${formatTime12h(previewFlight.arrivalTime)}` : ''}
                </span>
              </div>
              {previewFlight.boardingTime && (
                <p className="flex items-center gap-1.5 text-sm text-slate-600">
                  <Clock className="w-4 h-4 text-primary flex-shrink-0" /> {t('home.flight.form.boardingTimeLabel')} {formatTime12h(previewFlight.boardingTime)}
                </p>
              )}
              {(previewFlight.terminal || previewFlight.gate || previewFlight.seat) && (
                <div className="flex flex-wrap gap-2">
                  {previewFlight.terminal && (
                    <span className="bg-secondary px-3 py-1 rounded-full text-sm text-muted-foreground border border-border">{t('home.flight.form.terminalLabel')} {previewFlight.terminal}</span>
                  )}
                  {previewFlight.gate && (
                    <span className="bg-secondary px-3 py-1 rounded-full text-sm text-muted-foreground border border-border">{t('home.flight.form.gateLabel')} {previewFlight.gate}</span>
                  )}
                  {previewFlight.seat && (
                    <span className="bg-secondary px-3 py-1 rounded-full text-sm text-muted-foreground border border-border">{t('home.flight.form.seatLabel')} {previewFlight.seat}</span>
                  )}
                </div>
              )}
              {previewFlight.reservationNumber && (
                <p className="flex items-center gap-1.5 text-sm text-slate-600">
                  <Hash className="w-4 h-4 text-primary flex-shrink-0" /> {previewFlight.reservationNumber}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 일정 상세 다이얼로그 */}
      <Dialog open={showScheduleDetail} onOpenChange={setShowScheduleDetail}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Clock className="w-5 h-5 text-primary" /> {detailSchedule?.title}
            </DialogTitle>
          </DialogHeader>
          {detailSchedule && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", getCategoryColor(detailSchedule.category))}>
                  {getCategoryLabel(detailSchedule.category)}
                </span>
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> {detailSchedule.date}
                </span>
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> {formatTime12h(detailSchedule.time)}{detailSchedule.endTime ? ` ~ ${formatTime12h(detailSchedule.endTime)}` : ''}
                </span>
              </div>
              {detailSchedule.location && (
                <p className="text-sm text-foreground flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-primary flex-shrink-0" /> {detailSchedule.location}
                </p>
              )}
              {!!detailSchedule.cost && (
                <p className="text-sm font-bold text-primary flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 flex-shrink-0" /> ₩{detailSchedule.cost.toLocaleString()}
                </p>
              )}
              {detailSchedule.link && (
                <a
                  href={detailSchedule.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline flex items-center gap-1.5 break-all"
                >
                  <LinkIcon className="w-4 h-4 flex-shrink-0" /> {detailSchedule.link}
                </a>
              )}
              {detailSchedule.notes && (
                <p className="text-sm text-muted-foreground italic bg-secondary p-3 rounded-xl">"{detailSchedule.notes}"</p>
              )}
              {detailSchedule.preparations && detailSchedule.preparations.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground mb-1.5">{t('home.schedule.form.preparationsLabel')}</p>
                  <div className="flex flex-wrap gap-2">
                    {splitPreparationItems(detailSchedule.preparations).map((p, idx) => (
                      <span key={idx} className="bg-secondary px-3 py-1 rounded-full text-sm text-muted-foreground border border-border">{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== 하위 컴포넌트 =====

function AccommodationCard({ accommodation, isEditing, onEdit, onUpdate, onDelete, onCancel, region }: any) {
  const { t } = useLanguage();
  const [editData, setEditData] = React.useState(accommodation);
  const [showPicker, setShowPicker] = React.useState(false);

  const checkOutBeforeCheckIn = !!(editData.checkInDate && editData.checkOutDate && editData.checkOutDate < editData.checkInDate);

  if (isEditing) {
    return (
      <Card className="p-6 bg-card border-primary/30 shadow-lg">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">{t('home.accommodation.form.nameLabel')} *</label>
            <Input
              value={editData.name}
              onChange={e => setEditData({ ...editData, name: e.target.value })}
              placeholder={t('home.accommodation.form.namePlaceholder')}
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">{t('home.accommodation.form.addressLabel')}</label>
            <div className="flex flex-wrap gap-2">
              <Input value={editData.address || ''} onChange={e => setEditData({ ...editData, address: e.target.value })} placeholder={t('home.accommodation.form.addressPlaceholder')} className="h-11 flex-1 min-w-[140px]" />
              <Button type="button" variant="outline" onClick={() => setShowPicker(true)} className="h-11 gap-1.5 flex-shrink-0">
                <MapPin className="w-4 h-4" /> {t('home.schedule.form.mapButton')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => openDirections(editData.lat, editData.lng, editData.address)}
                disabled={editData.lat === undefined && !editData.address}
                className="h-11 gap-1.5 flex-shrink-0"
              >
                <Navigation className="w-4 h-4" /> {t('home.accommodation.form.directionsButton')}
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
              region={region}
              onConfirm={(pickedLat, pickedLng, address) =>
                setEditData({ ...editData, lat: pickedLat, lng: pickedLng, address: address || editData.address })
              }
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.accommodation.form.checkInLabel')} *</label>
              <Input type="date" value={editData.checkInDate} onChange={e => setEditData({ ...editData, checkInDate: e.target.value })} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.accommodation.form.checkInTimeLabel')}</label>
              <Input type="time" value={editData.checkInTime || ''} onChange={e => setEditData({ ...editData, checkInTime: e.target.value })} className="h-11" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.accommodation.form.checkOutLabel')} *</label>
              <Input type="date" value={editData.checkOutDate} onChange={e => setEditData({ ...editData, checkOutDate: e.target.value })} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.accommodation.form.checkOutTimeLabel')}</label>
              <Input type="time" value={editData.checkOutTime || ''} onChange={e => setEditData({ ...editData, checkOutTime: e.target.value })} className="h-11" />
            </div>
          </div>
          {checkOutBeforeCheckIn && (
            <p className="text-red-500 text-sm font-semibold">⚠ {t('home.accommodation.checkOutBeforeCheckIn')}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.accommodation.form.phoneLabel')}</label>
              <Input type="tel" value={editData.phone || ''} onChange={e => setEditData({ ...editData, phone: e.target.value })} placeholder={t('home.accommodation.form.phonePlaceholder')} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.accommodation.form.reservationNumberLabel')}</label>
              <Input value={editData.reservationNumber || ''} onChange={e => setEditData({ ...editData, reservationNumber: e.target.value })} placeholder={t('home.accommodation.form.reservationNumberPlaceholder')} className="h-11" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">{t('home.accommodation.form.linkLabel')}</label>
            <Input type="url" value={editData.link || ''} onChange={e => setEditData({ ...editData, link: e.target.value })} placeholder="https://..." className="h-11" />
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
            <Button
              onClick={() => {
                if (!editData.name || !editData.checkInDate || !editData.checkOutDate) { toast.error(t('home.toast.requiredFields')); return; }
                onUpdate(accommodation.id, editData);
              }}
              className="flex-1 bg-primary h-11"
            >
              {t('home.common.save')}
            </Button>
            <Button onClick={onCancel} variant="outline" className="flex-1 h-11">{t('home.common.cancel')}</Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 bg-card border-border hover:border-primary/50 transition-colors shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 flex items-center gap-1">
              <Hotel className="w-3 h-3" /> {t('home.category.accommodation')}
            </span>
          </div>
          <h4 className="text-xl font-bold text-foreground mb-2 break-words">{accommodation.name}</h4>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-600 mb-1">
            <p className="flex items-center gap-1.5 font-semibold text-slate-700">
              <Calendar className="w-4 h-4 text-primary" />
              {t('home.accommodation.checkInShort')} {accommodation.checkInDate}{accommodation.checkInTime ? ` ${formatTime12h(accommodation.checkInTime)}` : ''}
            </p>
            <p className="flex items-center gap-1.5 font-semibold text-slate-700">
              <Calendar className="w-4 h-4 text-primary" />
              {t('home.accommodation.checkOutShort')} {accommodation.checkOutDate}{accommodation.checkOutTime ? ` ${formatTime12h(accommodation.checkOutTime)}` : ''}
            </p>
          </div>

          {accommodation.address && (
            <div className="flex items-center gap-2 text-sm text-slate-600 mt-1.5">
              <p className="flex items-center gap-1 min-w-0">
                <MapPin className="w-4 h-4 text-primary flex-shrink-0" /> <span className="truncate">{accommodation.address}</span>
              </p>
              <button
                type="button"
                onClick={() => openDirections(accommodation.lat, accommodation.lng, accommodation.address)}
                className="flex items-center gap-1 text-primary font-semibold hover:underline flex-shrink-0"
              >
                <Navigation className="w-3.5 h-3.5" /> {t('home.accommodation.form.directionsButton')}
              </button>
            </div>
          )}

          {accommodation.phone && (
            <p className="flex items-center gap-1.5 text-sm text-slate-600 mt-1.5">
              <Phone className="w-4 h-4 text-primary" />
              <a href={`tel:${accommodation.phone}`} className="hover:text-primary hover:underline">{accommodation.phone}</a>
            </p>
          )}

          {accommodation.reservationNumber && (
            <p className="flex items-center gap-1.5 text-sm text-slate-600 mt-1.5">
              <Hash className="w-4 h-4 text-primary" /> {accommodation.reservationNumber}
            </p>
          )}

          {accommodation.link && (
            <p className="flex items-center gap-2 text-sm text-primary mt-2">
              <LinkIcon className="w-4 h-4" />
              <a href={accommodation.link} target="_blank" rel="noopener noreferrer" className="underline hover:text-muted-foreground break-all">{t('home.accommodation.form.linkLabel')}</a>
            </p>
          )}

          {accommodation.notes && <p className="text-sm text-slate-500 mt-3 italic">"{accommodation.notes}"</p>}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={onEdit} className="p-2 text-slate-300 hover:text-primary transition-colors"><Edit2 className="w-4 h-4" /></button>
          <button onClick={() => onDelete(accommodation.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
    </Card>
  );
}

function AccommodationForm({ onAdd, region }: { onAdd: (accommodation: Accommodation) => void; region: 'domestic' | 'overseas' }) {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | undefined>(undefined);
  const [lng, setLng] = useState<number | undefined>(undefined);
  const [showPicker, setShowPicker] = useState(false);
  const [checkInDate, setCheckInDate] = useState('');
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [phone, setPhone] = useState('');
  const [reservationNumber, setReservationNumber] = useState('');
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');

  const checkOutBeforeCheckIn = !!(checkInDate && checkOutDate && checkOutDate < checkInDate);

  const handleSubmit = () => {
    if (!name || !checkInDate || !checkOutDate) { toast.error(t('home.toast.requiredFields')); return; }
    onAdd({
      id: Date.now().toString(),
      name,
      address: address || undefined,
      lat, lng,
      checkInDate,
      checkInTime: checkInTime || undefined,
      checkOutDate,
      checkOutTime: checkOutTime || undefined,
      phone: phone || undefined,
      reservationNumber: reservationNumber || undefined,
      link: link || undefined,
      notes: notes || undefined,
    });
    setName(''); setAddress(''); setLat(undefined); setLng(undefined);
    setCheckInDate(''); setCheckInTime(''); setCheckOutDate(''); setCheckOutTime('');
    setPhone(''); setReservationNumber(''); setLink(''); setNotes('');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">{t('home.accommodation.form.nameLabel')} <span className="text-red-500">*</span></label>
        <Input
          placeholder={t('home.accommodation.form.namePlaceholder')}
          value={name}
          onChange={e => setName(e.target.value)}
          className="h-11"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">{t('home.accommodation.form.addressLabel')} <span className="text-slate-400 font-normal">({t('home.common.optional')})</span></label>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder={t('home.accommodation.form.addressPlaceholder')}
            value={address}
            onChange={e => setAddress(e.target.value)}
            className="h-11 flex-1 min-w-[140px]"
          />
          <Button type="button" variant="outline" onClick={() => setShowPicker(true)} className="h-11 gap-1.5 flex-shrink-0">
            <MapPin className="w-4 h-4" /> {t('home.schedule.form.mapButton')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => openDirections(lat, lng, address)}
            disabled={lat === undefined && !address}
            className="h-11 gap-1.5 flex-shrink-0"
          >
            <Navigation className="w-4 h-4" /> {t('home.accommodation.form.directionsButton')}
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
          region={region}
          onConfirm={(pickedLat, pickedLng, pickedAddress) => {
            setLat(pickedLat);
            setLng(pickedLng);
            if (pickedAddress) setAddress(pickedAddress);
          }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.accommodation.form.checkInLabel')} <span className="text-red-500">*</span></label>
          <Input type="date" value={checkInDate} onChange={e => setCheckInDate(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.accommodation.form.checkInTimeLabel')} <span className="text-slate-400 font-normal">({t('home.common.optional')})</span></label>
          <Input type="time" value={checkInTime} onChange={e => setCheckInTime(e.target.value)} className="h-11" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.accommodation.form.checkOutLabel')} <span className="text-red-500">*</span></label>
          <Input type="date" value={checkOutDate} onChange={e => setCheckOutDate(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.accommodation.form.checkOutTimeLabel')} <span className="text-slate-400 font-normal">({t('home.common.optional')})</span></label>
          <Input type="time" value={checkOutTime} onChange={e => setCheckOutTime(e.target.value)} className="h-11" />
        </div>
      </div>
      {checkOutBeforeCheckIn && (
        <p className="text-red-500 text-sm font-semibold">⚠ {t('home.accommodation.checkOutBeforeCheckIn')}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.accommodation.form.phoneLabel')} <span className="text-slate-400 font-normal">({t('home.common.optional')})</span></label>
          <Input type="tel" placeholder={t('home.accommodation.form.phonePlaceholder')} value={phone} onChange={e => setPhone(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.accommodation.form.reservationNumberLabel')} <span className="text-slate-400 font-normal">({t('home.common.optional')})</span></label>
          <Input placeholder={t('home.accommodation.form.reservationNumberPlaceholder')} value={reservationNumber} onChange={e => setReservationNumber(e.target.value)} className="h-11" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">{t('home.accommodation.form.linkLabel')} <span className="text-slate-400 font-normal">({t('home.common.optional')})</span></label>
        <Input
          type="url"
          placeholder="https://..."
          value={link}
          onChange={e => setLink(e.target.value)}
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
        <Plus className="w-4 h-4 mr-2" /> {t('home.accommodation.form.submitButton')}
      </Button>
    </div>
  );
}

function FlightCard({ flight, isEditing, onEdit, onUpdate, onDelete, onCancel }: any) {
  const { t } = useLanguage();
  const [editData, setEditData] = React.useState(flight);

  if (isEditing) {
    return (
      <Card className="p-6 bg-card border-primary/30 shadow-lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.flight.form.airlineLabel')} *</label>
              <Input value={editData.airline} onChange={e => setEditData({ ...editData, airline: e.target.value })} placeholder={t('home.flight.form.airlinePlaceholder')} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.flight.form.flightNumberLabel')} *</label>
              <Input value={editData.flightNumber} onChange={e => setEditData({ ...editData, flightNumber: e.target.value })} placeholder={t('home.flight.form.flightNumberPlaceholder')} className="h-11" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">{t('home.flight.form.reservationNumberLabel')}</label>
            <Input value={editData.reservationNumber || ''} onChange={e => setEditData({ ...editData, reservationNumber: e.target.value })} placeholder={t('home.flight.form.reservationNumberPlaceholder')} className="h-11" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.flight.form.departureAirportLabel')} *</label>
              <Input value={editData.departureAirport} onChange={e => setEditData({ ...editData, departureAirport: e.target.value })} placeholder={t('home.flight.form.departureAirportPlaceholder')} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.flight.form.arrivalAirportLabel')} *</label>
              <Input value={editData.arrivalAirport} onChange={e => setEditData({ ...editData, arrivalAirport: e.target.value })} placeholder={t('home.flight.form.arrivalAirportPlaceholder')} className="h-11" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.flight.form.departureDateLabel')} *</label>
              <Input type="date" value={editData.departureDate} onChange={e => setEditData({ ...editData, departureDate: e.target.value })} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.flight.form.departureTimeLabel')}</label>
              <Input type="time" value={editData.departureTime || ''} onChange={e => setEditData({ ...editData, departureTime: e.target.value })} className="h-11" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.flight.form.arrivalDateLabel')} *</label>
              <Input type="date" value={editData.arrivalDate} onChange={e => setEditData({ ...editData, arrivalDate: e.target.value })} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.flight.form.arrivalTimeLabel')}</label>
              <Input type="time" value={editData.arrivalTime || ''} onChange={e => setEditData({ ...editData, arrivalTime: e.target.value })} className="h-11" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.flight.form.terminalLabel')}</label>
              <Input value={editData.terminal || ''} onChange={e => setEditData({ ...editData, terminal: e.target.value })} placeholder={t('home.flight.form.terminalPlaceholder')} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.flight.form.gateLabel')}</label>
              <Input value={editData.gate || ''} onChange={e => setEditData({ ...editData, gate: e.target.value })} placeholder={t('home.flight.form.gatePlaceholder')} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">{t('home.flight.form.seatLabel')}</label>
              <Input value={editData.seat || ''} onChange={e => setEditData({ ...editData, seat: e.target.value })} placeholder={t('home.flight.form.seatPlaceholder')} className="h-11" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">{t('home.flight.form.boardingTimeLabel')}</label>
            <Input type="time" value={editData.boardingTime || ''} onChange={e => setEditData({ ...editData, boardingTime: e.target.value })} className="h-11" />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => {
                if (!editData.airline || !editData.flightNumber || !editData.departureAirport || !editData.arrivalAirport || !editData.departureDate || !editData.arrivalDate) { toast.error(t('home.toast.requiredFields')); return; }
                onUpdate(flight.id, editData);
              }}
              className="flex-1 bg-primary h-11"
            >
              {t('home.common.save')}
            </Button>
            <Button onClick={onCancel} variant="outline" className="flex-1 h-11">{t('home.common.cancel')}</Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 bg-card border-border hover:border-primary/50 transition-colors shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-700 flex items-center gap-1">
              <Plane className="w-3 h-3" /> {t('home.flight.badgeLabel')}
            </span>
          </div>
          <h4 className="text-xl font-bold text-foreground mb-2 break-words">{flight.airline} {flight.flightNumber}</h4>

          <div className="flex items-center gap-2 flex-wrap text-sm font-semibold text-slate-700 mb-1.5">
            <span>{flight.departureAirport}</span>
            <ArrowRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span>{flight.arrivalAirport}</span>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-600 mb-1">
            <p className="flex items-center gap-1.5 font-semibold text-slate-700">
              <Calendar className="w-4 h-4 text-primary" />
              {t('home.flight.departureShort')} {flight.departureDate}{flight.departureTime ? ` ${formatTime12h(flight.departureTime)}` : ''}
            </p>
            <p className="flex items-center gap-1.5 font-semibold text-slate-700">
              <Calendar className="w-4 h-4 text-primary" />
              {t('home.flight.arrivalShort')} {flight.arrivalDate}{flight.arrivalTime ? ` ${formatTime12h(flight.arrivalTime)}` : ''}
            </p>
          </div>

          {flight.boardingTime && (
            <p className="flex items-center gap-1.5 text-sm text-slate-600 mt-1.5">
              <Clock className="w-4 h-4 text-primary flex-shrink-0" /> {t('home.flight.form.boardingTimeLabel')} {formatTime12h(flight.boardingTime)}
            </p>
          )}

          {(flight.terminal || flight.gate || flight.seat) && (
            <div className="flex flex-wrap gap-2 mt-2">
              {flight.terminal && <span className="bg-secondary px-3 py-1 rounded-full text-xs text-muted-foreground border border-border">{t('home.flight.form.terminalLabel')} {flight.terminal}</span>}
              {flight.gate && <span className="bg-secondary px-3 py-1 rounded-full text-xs text-muted-foreground border border-border">{t('home.flight.form.gateLabel')} {flight.gate}</span>}
              {flight.seat && <span className="bg-secondary px-3 py-1 rounded-full text-xs text-muted-foreground border border-border">{t('home.flight.form.seatLabel')} {flight.seat}</span>}
            </div>
          )}

          {flight.reservationNumber && (
            <p className="flex items-center gap-1.5 text-sm text-slate-600 mt-1.5">
              <Hash className="w-4 h-4 text-primary" /> {flight.reservationNumber}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={onEdit} className="p-2 text-slate-300 hover:text-primary transition-colors"><Edit2 className="w-4 h-4" /></button>
          <button onClick={() => onDelete(flight.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
    </Card>
  );
}

function FlightForm({ onAdd }: { onAdd: (flight: Flight) => void }) {
  const { t } = useLanguage();
  const [airline, setAirline] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [reservationNumber, setReservationNumber] = useState('');
  const [departureAirport, setDepartureAirport] = useState('');
  const [arrivalAirport, setArrivalAirport] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [arrivalDate, setArrivalDate] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [terminal, setTerminal] = useState('');
  const [gate, setGate] = useState('');
  const [seat, setSeat] = useState('');
  const [boardingTime, setBoardingTime] = useState('');

  const handleSubmit = () => {
    if (!airline || !flightNumber || !departureAirport || !arrivalAirport || !departureDate || !arrivalDate) {
      toast.error(t('home.toast.requiredFields'));
      return;
    }
    onAdd({
      id: Date.now().toString(),
      airline,
      flightNumber,
      reservationNumber: reservationNumber || undefined,
      departureAirport,
      arrivalAirport,
      departureDate,
      departureTime: departureTime || undefined,
      arrivalDate,
      arrivalTime: arrivalTime || undefined,
      terminal: terminal || undefined,
      gate: gate || undefined,
      seat: seat || undefined,
      boardingTime: boardingTime || undefined,
    });
    setAirline(''); setFlightNumber(''); setReservationNumber('');
    setDepartureAirport(''); setArrivalAirport('');
    setDepartureDate(''); setDepartureTime(''); setArrivalDate(''); setArrivalTime('');
    setTerminal(''); setGate(''); setSeat(''); setBoardingTime('');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.flight.form.airlineLabel')} <span className="text-red-500">*</span></label>
          <Input placeholder={t('home.flight.form.airlinePlaceholder')} value={airline} onChange={e => setAirline(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.flight.form.flightNumberLabel')} <span className="text-red-500">*</span></label>
          <Input placeholder={t('home.flight.form.flightNumberPlaceholder')} value={flightNumber} onChange={e => setFlightNumber(e.target.value)} className="h-11" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">{t('home.flight.form.reservationNumberLabel')} <span className="text-slate-400 font-normal">({t('home.common.optional')})</span></label>
        <Input placeholder={t('home.flight.form.reservationNumberPlaceholder')} value={reservationNumber} onChange={e => setReservationNumber(e.target.value)} className="h-11" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.flight.form.departureAirportLabel')} <span className="text-red-500">*</span></label>
          <Input placeholder={t('home.flight.form.departureAirportPlaceholder')} value={departureAirport} onChange={e => setDepartureAirport(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.flight.form.arrivalAirportLabel')} <span className="text-red-500">*</span></label>
          <Input placeholder={t('home.flight.form.arrivalAirportPlaceholder')} value={arrivalAirport} onChange={e => setArrivalAirport(e.target.value)} className="h-11" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.flight.form.departureDateLabel')} <span className="text-red-500">*</span></label>
          <Input type="date" value={departureDate} onChange={e => setDepartureDate(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.flight.form.departureTimeLabel')} <span className="text-slate-400 font-normal">({t('home.common.optional')})</span></label>
          <Input type="time" value={departureTime} onChange={e => setDepartureTime(e.target.value)} className="h-11" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.flight.form.arrivalDateLabel')} <span className="text-red-500">*</span></label>
          <Input type="date" value={arrivalDate} onChange={e => setArrivalDate(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.flight.form.arrivalTimeLabel')} <span className="text-slate-400 font-normal">({t('home.common.optional')})</span></label>
          <Input type="time" value={arrivalTime} onChange={e => setArrivalTime(e.target.value)} className="h-11" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.flight.form.terminalLabel')} <span className="text-slate-400 font-normal">({t('home.common.optional')})</span></label>
          <Input placeholder={t('home.flight.form.terminalPlaceholder')} value={terminal} onChange={e => setTerminal(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.flight.form.gateLabel')} <span className="text-slate-400 font-normal">({t('home.common.optional')})</span></label>
          <Input placeholder={t('home.flight.form.gatePlaceholder')} value={gate} onChange={e => setGate(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('home.flight.form.seatLabel')} <span className="text-slate-400 font-normal">({t('home.common.optional')})</span></label>
          <Input placeholder={t('home.flight.form.seatPlaceholder')} value={seat} onChange={e => setSeat(e.target.value)} className="h-11" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">{t('home.flight.form.boardingTimeLabel')} <span className="text-slate-400 font-normal">({t('home.common.optional')})</span></label>
        <Input type="time" value={boardingTime} onChange={e => setBoardingTime(e.target.value)} className="h-11" />
      </div>

      <Button onClick={handleSubmit} className="w-full bg-primary text-white h-11 text-base font-semibold">
        <Plus className="w-4 h-4 mr-2" /> {t('home.flight.form.submitButton')}
      </Button>
    </div>
  );
}

function ScheduleCard({ schedule, isEditing, onEdit, onUpdate, onDelete, onCancel, getCategoryColor, getCategoryLabel, existingSchedules, region }: any) {
  const { t } = useLanguage();
  const [editData, setEditData] = React.useState(schedule);
  const [newPrep, setNewPrep] = React.useState('');
  const [showPicker, setShowPicker] = React.useState(false);

  const hasOverlap = (existingSchedules || []).some((s: ScheduleItem) =>
    s.id !== schedule.id && schedulesOverlap(editData.date, editData.time, editData.endTime, s)
  );

  const addPrep = () => {
    const items = newPrep.split(',').map(p => p.trim()).filter(Boolean);
    if (items.length === 0) return;
    const preps = [...(editData.preparations || []), ...items];
    setEditData({ ...editData, preparations: preps });
    setNewPrep('');
  };

  const removePrep = (idx: number) => {
    const preps = editData.preparations.filter((_: any, i: number) => i !== idx);
    setEditData({ ...editData, preparations: preps });
  };

  if (isEditing) {
    return (
      <Card className="p-6 bg-card border-primary/30 shadow-lg">
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
                className="w-full min-h-11 px-3 py-2.5 border border-input rounded-md text-sm leading-tight bg-background"
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
              region={region}
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
    <Card className="p-5 bg-card border-border hover:border-primary/50 transition-colors shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <span className={cn("px-3 py-1 rounded-full text-xs font-bold", getCategoryColor(schedule.category))}>
              {getCategoryLabel(schedule.category)}
            </span>
            <span className="text-sm font-bold text-slate-700">{schedule.date}</span>
            <span className="text-sm font-bold text-sky-600 ml-1.5">
              {formatTime12h(schedule.time)}{schedule.endTime ? ` - ${formatTime12h(schedule.endTime)}` : ''}
            </span>
          </div>
          <h4 className="text-xl font-bold text-foreground mb-2 break-words">{schedule.title}</h4>
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
              {splitPreparationItems(schedule.preparations).map((p: string, i: number) => (
                <span key={i} className="text-xs bg-secondary text-muted-foreground px-2 py-1 rounded border border-border"># {p}</span>
              ))}
            </div>
          )}
          {schedule.notes && <p className="text-sm text-slate-500 mt-3 italic break-words">"{schedule.notes}"</p>}
        </div>
        <div className="flex gap-2 ml-4 flex-shrink-0">
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
      <Card className="p-5 bg-card border-primary/30">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">{t('home.budget.form.categoryLabel')}</label>
            <select value={editData.category} onChange={e => setEditData({ ...editData, category: e.target.value })} className="w-full min-h-11 px-3 py-2.5 border border-input rounded-md text-sm leading-tight bg-background">
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
    <Card className="p-4 bg-card border-border">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold mb-1 inline-block", getCategoryColor(budget.category))}>{getCategoryLabel(budget.category)}</span>
          <p className="font-bold text-foreground break-words">{budget.description}</p>
        </div>
        <div className="text-right flex-shrink-0">
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
      <Card className="p-4 bg-card border-primary/30">
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
    <Card className="p-4 bg-card border-border">
      <div className="flex items-start gap-4">
        {item.imageUrl && (
          <img src={item.imageUrl} alt={item.item} className="w-16 h-16 object-cover rounded border border-border" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <input type="checkbox" checked={item.checked} onChange={() => onToggle(item.id)} className="w-5 h-5 rounded-full border-sky-300 text-primary flex-shrink-0" />
            <span className={cn("font-bold break-words", item.checked ? "line-through text-slate-300" : "text-foreground")}>{item.item}</span>
          </div>
          {item.link && <a href={item.link} target="_blank" className="text-xs text-primary underline">{t('home.shopping.viewProduct')}</a>}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={onEdit} className="text-slate-300 hover:text-primary"><Edit2 className="w-4 h-4" /></button>
          <button onClick={() => onDelete(item.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
    </Card>
  );
}

function ScheduleForm({ onAdd, existingSchedules, region }: { onAdd: (schedule: ScheduleItem) => void; existingSchedules?: ScheduleItem[]; region: 'domestic' | 'overseas' }) {
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
            className="w-full min-h-11 px-3 py-2.5 border border-input rounded-md text-sm leading-tight bg-background"
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
          region={region}
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

function BudgetForm({ onAdd, remainingBudget }: { onAdd: (budget: Budget) => void; remainingBudget: number | null }) {
  const { t } = useLanguage();
  const [category, setCategory] = useState<Budget['category']>('other');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = () => {
    if (!amount) { toast.error(t('home.toast.enterAmount')); return; }
    onAdd({ id: Date.now().toString(), category, amount: parseInt(amount), description });
    setAmount(''); setDescription('');
  };

  const projectedRemaining = remainingBudget !== null && amount ? remainingBudget - (parseInt(amount) || 0) : null;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">{t('home.budget.form.categoryLabel')}</label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value as any)}
          className="w-full min-h-11 px-3 py-2.5 border border-input rounded-md text-sm leading-tight bg-background"
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
        {projectedRemaining !== null && (
          <p className={cn("text-xs font-semibold", projectedRemaining < 0 ? "text-red-500" : "text-muted-foreground")}>
            {t('home.budget.form.afterAddRemaining', { amount: projectedRemaining.toLocaleString() })}
          </p>
        )}
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

      <Button onClick={handleSubmit} className="w-full bg-primary hover:bg-primary/90 text-white gap-2 h-11">
        <Plus className="w-4 h-4" /> {t('home.shopping.form.submitButton')}
      </Button>
    </div>
  );
}

// ===== 커뮤니티 인기 여행 섹션 =====

function CommunityTrending() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const [allTrendingPosts, setAllTrendingPosts] = useState<DiaryEntry[]>([]);

  // 좋아요/댓글/저장 수 기준 인기순 — 서버가 정렬해서 내려줌 (커뮤니티 페이지와 동일한 랭킹 로직)
  useEffect(() => {
    communityApi.listDiaries({ sort: 'popular', pageSize: 12 })
      .then(res => setAllTrendingPosts(res.diaries))
      .catch(() => setAllTrendingPosts([]));
  }, []);

  if (allTrendingPosts.length === 0) return null;

  // 대표 사진(mainPhoto)으로 지정한 사진을 우선 사용하고, 없을 때만 게시글 사진 중 첫 번째(영상 제외)로 대체
  const getTrendingThumbUrl = (post: DiaryEntry): string | null => {
    if (post.mainPhoto && post.mainPhoto.type !== 'video' && post.mainPhoto.url) return post.mainPhoto.url;
    return post.photos.find(p => p.type !== 'video')?.url || null;
  };

  const navigateToCommunity = (post?: DiaryEntry) => {
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
        {allTrendingPosts.map((post, idx) => {
          const thumbUrl = getTrendingThumbUrl(post);
          return (
          <button
            key={post.id}
            onClick={() => navigateToCommunity(post)}
            className="flex-shrink-0 w-52 text-left group"
          >
            <div className="relative w-52 h-36 rounded-2xl overflow-hidden bg-gradient-to-br from-secondary to-muted shadow-sm group-hover:shadow-md transition-shadow">
              {thumbUrl ? (
                <img
                  src={thumbUrl}
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
              <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-black/55 text-white text-xs px-2 py-0.5 rounded-full">
                <span className="flex items-center gap-1">
                  <Bookmark className="w-3 h-3 text-amber-300 fill-amber-300" />
                  {post.bookmarksCount}
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle className="w-3 h-3 text-sky-300 fill-sky-300" />
                  {post.commentsCount}
                </span>
                <span className="flex items-center gap-1">
                  <Heart className="w-3 h-3 text-red-400 fill-red-400" />
                  {post.likesCount}
                </span>
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
          );
        })}
      </div>
    </section>
  );
}

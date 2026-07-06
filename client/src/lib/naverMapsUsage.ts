/**
 * 네이버 지도(NCP Maps) API 자체 호출 집계.
 *
 * NCP 콘솔은 Geocoding/Dynamic Map의 당일·당월 사용량을 콘솔 UI에서만 보여주고
 * 이를 조회할 수 있는 공개 REST API를 제공하지 않는다. 이 앱은 별도 서버나
 * NCP 비밀키 없이 동작하므로, 실제 과금 수치 대신 이 앱이 직접 호출한 횟수를
 * localStorage에 날짜별로 집계해 근사치로 보여준다.
 */

export type NaverMapsUsageType = "geocoding" | "dynamicMap";

interface UsageStats {
  geocoding: Record<string, number>;
  dynamicMap: Record<string, number>;
}

export interface NaverMapsUsageSummary {
  today: number;
  month: number;
}

const STORAGE_KEY = "naverMapsUsageStats";
const USAGE_UPDATED_EVENT = "naver-maps-usage-updated";
const RETENTION_DAYS = 400; // 최근 약 1년치 일별 집계만 보관하고 이전 값은 정리

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadStats(): UsageStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { geocoding: {}, dynamicMap: {} };
    const parsed = JSON.parse(raw);
    return {
      geocoding: parsed.geocoding ?? {},
      dynamicMap: parsed.dynamicMap ?? {},
    };
  } catch {
    return { geocoding: {}, dynamicMap: {} };
  }
}

function saveStats(stats: UsageStats): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

function pruneOldEntries(record: Record<string, number>): Record<string, number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffKey = formatDateKey(cutoff);
  const pruned: Record<string, number> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key >= cutoffKey) pruned[key] = value;
  }
  return pruned;
}

/** Geocoding/Dynamic Map을 실제로 호출하는 지점에서 1회 호출마다 기록 */
export function recordNaverMapsUsage(type: NaverMapsUsageType): void {
  if (typeof window === "undefined") return;
  const stats = loadStats();
  const todayKey = formatDateKey(new Date());
  stats[type][todayKey] = (stats[type][todayKey] ?? 0) + 1;
  stats[type] = pruneOldEntries(stats[type]);
  saveStats(stats);
  window.dispatchEvent(new CustomEvent(USAGE_UPDATED_EVENT));
}

/** 당일/당월 집계 조회 */
export function getNaverMapsUsageSummary(): Record<NaverMapsUsageType, NaverMapsUsageSummary> {
  const stats = loadStats();
  const todayKey = formatDateKey(new Date());
  const monthPrefix = todayKey.slice(0, 7); // YYYY-MM

  const summarize = (record: Record<string, number>): NaverMapsUsageSummary => {
    let month = 0;
    for (const [key, value] of Object.entries(record)) {
      if (key.startsWith(monthPrefix)) month += value;
    }
    return { today: record[todayKey] ?? 0, month };
  };

  return {
    geocoding: summarize(stats.geocoding),
    dynamicMap: summarize(stats.dynamicMap),
  };
}

/** 같은 탭에서 recordNaverMapsUsage가 호출되거나, 다른 탭에서 localStorage가 바뀌면 콜백 실행 */
export function subscribeNaverMapsUsage(callback: () => void): () => void {
  window.addEventListener(USAGE_UPDATED_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(USAGE_UPDATED_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

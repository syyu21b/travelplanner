/**
 * AI 여행 일정 생성(Gemini) API 자체 호출 집계.
 *
 * naverMapsUsage.ts와 동일한 방식 — Gemini API는 별도의 사용량 조회 REST API를 제공하지
 * 않으므로, 이 앱이 /api/plan-trip을 호출한 횟수를 localStorage에 날짜별로 집계해 근사치로 보여준다.
 * (실제 Gemini 호출은 서버/Worker 쪽에서 일어나지만, 그 환경에는 localStorage가 없으므로
 * 클라이언트가 응답을 받은 시점에 기록한다.)
 */

export type GeminiUsageType = "requests" | "generations";

interface UsageStats {
  requests: Record<string, number>;
  generations: Record<string, number>;
}

export interface GeminiUsageSummary {
  today: number;
  month: number;
}

const STORAGE_KEY = "geminiUsageStats";
const USAGE_UPDATED_EVENT = "gemini-usage-updated";
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
    if (!raw) return { requests: {}, generations: {} };
    const parsed = JSON.parse(raw);
    return {
      requests: parsed.requests ?? {},
      generations: parsed.generations ?? {},
    };
  } catch {
    return { requests: {}, generations: {} };
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

/** /api/plan-trip을 실제로 호출하는(요청을 보낸 / 계획 생성에 성공한) 지점에서 1회마다 기록 */
export function recordGeminiUsage(type: GeminiUsageType): void {
  if (typeof window === "undefined") return;
  const stats = loadStats();
  const todayKey = formatDateKey(new Date());
  stats[type][todayKey] = (stats[type][todayKey] ?? 0) + 1;
  stats[type] = pruneOldEntries(stats[type]);
  saveStats(stats);
  window.dispatchEvent(new CustomEvent(USAGE_UPDATED_EVENT));
}

/** 당일/당월 집계 조회 */
export function getGeminiUsageSummary(): Record<GeminiUsageType, GeminiUsageSummary> {
  const stats = loadStats();
  const todayKey = formatDateKey(new Date());
  const monthPrefix = todayKey.slice(0, 7); // YYYY-MM

  const summarize = (record: Record<string, number>): GeminiUsageSummary => {
    let month = 0;
    for (const [key, value] of Object.entries(record)) {
      if (key.startsWith(monthPrefix)) month += value;
    }
    return { today: record[todayKey] ?? 0, month };
  };

  return {
    requests: summarize(stats.requests),
    generations: summarize(stats.generations),
  };
}

/** 같은 탭에서 recordGeminiUsage가 호출되거나, 다른 탭에서 localStorage가 바뀌면 콜백 실행 */
export function subscribeGeminiUsage(callback: () => void): () => void {
  window.addEventListener(USAGE_UPDATED_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(USAGE_UPDATED_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

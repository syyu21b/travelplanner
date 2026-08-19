import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { HardDrive, Info, Loader2 } from "lucide-react";
import { getR2Usage, type R2UsageSummary } from "@/lib/api/media";

const FREE_TIER_BYTES = 10 * 1024 * 1024 * 1024; // R2 무료 티어: 월 10GB 저장

const KIND_LABELS: Record<string, string> = {
  "diary-photo": "일기 사진",
  "diary-block": "일기 본문 이미지",
  "plan-cover": "계획 커버",
  "album-photo": "앨범 사진",
  "profile-photo": "프로필 사진",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex++;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

export function R2UsagePanel() {
  const [summary, setSummary] = useState<R2UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getR2Usage()
      .then(setSummary)
      .catch(() => setError("R2 사용량을 불러오지 못했습니다."));
  }, []);

  const usedPercent = summary ? Math.min(100, (summary.totalBytes / FREE_TIER_BYTES) * 100) : 0;
  const kindEntries = summary ? Object.entries(summary.byKind).sort((a, b) => b[1].bytes - a[1].bytes) : [];

  return (
    <Card className="p-5 bg-white border-[#DED6CC] mb-8">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-base font-bold text-[#7D6B5D]">R2 스토리지 사용량</h2>
        <a
          href="https://dash.cloudflare.com/f545225d9fa9224b8af3fffc70c5f5c5/r2/default/buckets/travelplanner/metrics"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-blue-500 hover:text-blue-600 hover:underline"
        >
          Cloudflare 대시보드에서 Class A/B 사용량 보기 ↗
        </a>
      </div>
      <p className="text-xs text-[#A68B77] flex items-start gap-1 mb-4">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        업로드된 전체 이미지/영상 파일을 직접 조회해 집계한 실측 값입니다. 무료 티어는 월 10GB 저장까지 무료입니다.
        Class A/B 오퍼레이션 사용량은 위 대시보드 링크에서 확인할 수 있습니다.
      </p>

      {error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : !summary ? (
        <div className="flex items-center gap-2 text-sm text-[#A68B77] py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중...
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 bg-[#F9F7F2] rounded-xl p-4 border border-[#E8E2D9] mb-4">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
              <HardDrive className="w-5 h-5 text-indigo-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-bold text-[#7D6B5D]">
                  {formatBytes(summary.totalBytes)} <span className="font-normal text-[#A68B77]">/ 10 GB</span>
                </p>
                <p className="text-xs text-[#A68B77]">파일 {summary.totalCount.toLocaleString()}개</p>
              </div>
              <div className="mt-2 h-2 rounded-full bg-[#E8E2D9] overflow-hidden">
                <div
                  className={`h-full rounded-full ${usedPercent >= 90 ? "bg-red-500" : usedPercent >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${usedPercent}%` }}
                />
              </div>
            </div>
          </div>

          {kindEntries.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {kindEntries.map(([kind, stat]) => (
                <div key={kind} className="bg-[#F9F7F2] rounded-lg p-3 border border-[#E8E2D9]">
                  <p className="text-xs font-semibold text-[#7D6B5D]">{KIND_LABELS[kind] ?? kind}</p>
                  <p className="text-sm font-bold text-[#7D6B5D] mt-0.5">{formatBytes(stat.bytes)}</p>
                  <p className="text-[10px] text-[#A68B77]">{stat.count.toLocaleString()}개</p>
                </div>
              ))}
            </div>
          )}

          {summary.truncated && (
            <p className="text-xs text-amber-600 mt-3">객체 수가 많아 일부만 집계됐습니다 (근사치).</p>
          )}
        </>
      )}
    </Card>
  );
}

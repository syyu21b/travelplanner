import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { MapPin, Map as MapIcon, Info } from "lucide-react";
import { getNaverMapsUsageSummary, subscribeNaverMapsUsage } from "@/lib/naverMapsUsage";

export function NaverMapsUsagePanel() {
  const [summary, setSummary] = useState(() => getNaverMapsUsageSummary());

  useEffect(() => {
    const refresh = () => setSummary(getNaverMapsUsageSummary());
    refresh();
    return subscribeNaverMapsUsage(refresh);
  }, []);

  const items = [
    { key: "geocoding" as const, label: "Geocoding", icon: <MapPin className="w-5 h-5 text-blue-500" /> },
    { key: "dynamicMap" as const, label: "Dynamic Map", icon: <MapIcon className="w-5 h-5 text-emerald-500" /> },
  ];

  return (
    <Card className="p-5 bg-card border-[#DED6CC] mb-8">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-base font-bold text-[#7D6B5D]">네이버 지도(NCP Maps) 사용량</h2>
        <a
          href="https://console.ncloud.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-blue-500 hover:text-blue-600 hover:underline"
        >
          NCP 콘솔에서 보기 ↗
        </a>
      </div>
      <p className="text-xs text-[#A68B77] flex items-start gap-1 mb-4">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        NCP 콘솔은 사용량 통계를 조회하는 공개 API를 제공하지 않아, 이 앱에서 실제로 호출한 횟수를 자체 집계한 값입니다. NCP 콘솔의 공식 과금 수치와 다를 수 있습니다.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map(item => {
          const s = summary[item.key];
          return (
            <div key={item.key} className="flex items-center gap-3 bg-[#F9F7F2] rounded-xl p-4 border border-[#E8E2D9]">
              <div className="w-10 h-10 bg-card rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[#7D6B5D]">{item.label}</p>
                <div className="flex items-center gap-5 mt-1">
                  <div>
                    <p className="text-[10px] text-[#A68B77] font-semibold uppercase tracking-wide">당일</p>
                    <p className="text-lg font-bold text-[#7D6B5D]">{s.today.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#A68B77] font-semibold uppercase tracking-wide">당월</p>
                    <p className="text-lg font-bold text-[#7D6B5D]">{s.month.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

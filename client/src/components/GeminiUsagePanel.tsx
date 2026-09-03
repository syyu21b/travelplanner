import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Sparkles, Send, Info } from "lucide-react";
import { getGeminiUsageSummary, subscribeGeminiUsage } from "@/lib/geminiUsage";

export function GeminiUsagePanel() {
  const [summary, setSummary] = useState(() => getGeminiUsageSummary());

  useEffect(() => {
    const refresh = () => setSummary(getGeminiUsageSummary());
    refresh();
    return subscribeGeminiUsage(refresh);
  }, []);

  const items = [
    { key: "requests" as const, label: "요청 횟수", icon: <Send className="w-5 h-5 text-blue-500" /> },
    { key: "generations" as const, label: "생성 성공", icon: <Sparkles className="w-5 h-5 text-emerald-500" /> },
  ];

  return (
    <Card className="p-5 bg-card border-[#DED6CC] mb-8">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-base font-bold text-[#7D6B5D]">AI 여행 일정(Gemini API) 사용량</h2>
        <a
          href="https://aistudio.google.com/usage"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-blue-500 hover:text-blue-600 hover:underline"
        >
          Google AI Studio에서 보기 ↗
        </a>
      </div>
      <p className="text-xs text-[#A68B77] flex items-start gap-1 mb-4">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        Google AI Studio는 사용량 통계를 조회하는 공개 API를 제공하지 않아, 이 브라우저에서 실제로 호출한 횟수를 자체 집계한 값입니다. 요청 1건당 서버에서 Gemini API를 2회(생성 + 구조화) 호출합니다.
        무료 티어 한도는 이 앱을 쓰는 모든 사용자가 하루 단위로 공유하는 계정 전체 한도라서, 아래 숫자가 낮아도 실제로는 한도 초과로 일정 생성이 실패할 수 있습니다.
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

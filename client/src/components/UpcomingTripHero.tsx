import { useEffect, useMemo, useState } from "react";
import { Calendar, MapPin, ArrowRight, Plane } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { getWeatherInfo } from "@/lib/weatherCodes";

// Home.tsx의 TravelPlan을 구조적으로 받기 위한 최소 형태 (schedules/accommodations는 좌표만 사용)
interface UpcomingTripHeroPlan {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  coverPhoto?: string;
  schedules: { date?: string; lat?: number; lng?: number }[];
  accommodations?: { lat?: number; lng?: number }[];
}

interface UpcomingTripHeroProps {
  plan: UpcomingTripHeroPlan;
  status: "진행 중" | "예정";
  onOpen: () => void;
}

function localISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Dday =
  | { mode: "countdown"; value: number }
  | { mode: "dday" }
  | { mode: "ongoing"; value: number }
  | { mode: "past"; value: number };

function computeDday(startDate: string, endDate: string): Dday {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const DAY = 1000 * 60 * 60 * 24;
  const untilStart = Math.round((start.getTime() - today.getTime()) / DAY);
  const untilEnd = Math.round((end.getTime() - today.getTime()) / DAY);
  if (untilStart > 0) return { mode: "countdown", value: untilStart };
  if (untilStart === 0) return { mode: "dday" };
  if (untilEnd >= 0) return { mode: "ongoing", value: Math.abs(untilStart) + 1 };
  return { mode: "past", value: Math.abs(untilEnd) };
}

interface DailyForecast {
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  rainProb: number;
}

async function fetchDailyForecast(
  lat: number,
  lng: number,
  targetDate: string,
  signal: AbortSignal,
): Promise<{ forecast: DailyForecast; isTargetDate: boolean } | null> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "16",
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    daily?: {
      time?: string[];
      weather_code?: number[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      precipitation_probability_max?: number[];
    };
  };
  const daily = data.daily;
  if (!daily?.time?.length) return null;
  const idx = daily.time.indexOf(targetDate);
  const useIdx = idx >= 0 ? idx : 0;
  return {
    isTargetDate: idx >= 0,
    forecast: {
      weatherCode: daily.weather_code?.[useIdx] ?? 0,
      tempMax: daily.temperature_2m_max?.[useIdx] ?? 0,
      tempMin: daily.temperature_2m_min?.[useIdx] ?? 0,
      rainProb: daily.precipitation_probability_max?.[useIdx] ?? 0,
    },
  };
}

export function UpcomingTripHero({ plan, status, onOpen }: UpcomingTripHeroProps) {
  const { t } = useLanguage();

  const coords = useMemo(() => {
    const acc = plan.accommodations?.find(
      a => typeof a.lat === "number" && typeof a.lng === "number",
    );
    if (acc) return { lat: acc.lat as number, lng: acc.lng as number };
    const sch = plan.schedules?.find(
      s => typeof s.lat === "number" && typeof s.lng === "number",
    );
    if (sch) return { lat: sch.lat as number, lng: sch.lng as number };
    return null;
  }, [plan]);

  const targetDate = status === "진행 중" ? localISODate(new Date()) : plan.startDate;

  const [weather, setWeather] = useState<{ forecast: DailyForecast; isTargetDate: boolean } | null>(null);

  useEffect(() => {
    if (!coords) {
      setWeather(null);
      return;
    }
    const controller = new AbortController();
    fetchDailyForecast(coords.lat, coords.lng, targetDate, controller.signal)
      .then(result => {
        if (!controller.signal.aborted) setWeather(result);
      })
      .catch(() => {
        /* 날씨는 부가 정보 — 실패해도 카드 본문은 그대로 노출 */
      });
    return () => controller.abort();
  }, [coords, targetDate]);

  const dday = computeDday(plan.startDate, plan.endDate);

  const badgeLabel =
    status === "진행 중" ? t("home.dashboard.ongoingBadge") : t("home.dashboard.upcomingBadge");

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative block w-full overflow-hidden rounded-3xl text-left shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      {/* 커버사진 풀블리드 (없으면 그라디언트 폴백) */}
      {plan.coverPhoto ? (
        <img
          src={plan.coverPhoto}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-sky-500 via-indigo-500 to-purple-600" />
      )}

      {/* 그라디언트 오버레이 */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/20" />

      <div className="relative flex min-h-[15rem] flex-col justify-between gap-6 p-5 sm:min-h-[17rem] sm:p-7 md:min-h-[18rem]">
        {/* 상단: 상태 배지 + 일정 수 */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold backdrop-blur-sm",
              status === "진행 중"
                ? "bg-emerald-400/90 text-emerald-950"
                : "bg-white/90 text-[#3B2B1E]",
            )}
          >
            <Plane className="h-3.5 w-3.5" /> {badgeLabel}
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-sm">
            {t("home.planList.scheduleCount", { n: plan.schedules.length })}
          </span>
        </div>

        {/* 하단: 제목/날짜/날씨 + 큰 D-day */}
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="line-clamp-2 text-2xl font-black leading-tight text-white drop-shadow-md sm:text-3xl md:text-4xl">
              {plan.title}
            </h2>
            <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-white/85">
              <Calendar className="h-4 w-4 flex-shrink-0" />
              {plan.startDate} ~ {plan.endDate}
            </p>
            {weather && (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-medium text-white/90">
                <span className="text-base leading-none">
                  {getWeatherInfo(weather.forecast.weatherCode).emoji}
                </span>
                <span>
                  {Math.round(weather.forecast.tempMax)}° / {Math.round(weather.forecast.tempMin)}°
                </span>
                <span className="text-white/60">·</span>
                <span>{getWeatherInfo(weather.forecast.weatherCode).label}</span>
                {weather.forecast.rainProb > 0 && (
                  <>
                    <span className="text-white/60">·</span>
                    <span>{t("home.dashboard.rainChance", { n: Math.round(weather.forecast.rainProb) })}</span>
                  </>
                )}
                <span className="ml-1 hidden text-[11px] text-white/55 sm:inline">
                  {weather.isTargetDate
                    ? t("home.dashboard.weatherForTripDate")
                    : t("home.dashboard.weatherAtDestination")}
                </span>
              </p>
            )}
          </div>

          <div className="flex flex-shrink-0 flex-col items-end text-white drop-shadow-md">
            {dday.mode === "countdown" && (
              <span className="leading-none">
                <span className="text-xl font-bold sm:text-2xl">D-</span>
                <span className="text-5xl font-black tabular-nums sm:text-6xl md:text-7xl">
                  {dday.value}
                </span>
              </span>
            )}
            {dday.mode === "dday" && (
              <span className="text-4xl font-black leading-none sm:text-5xl md:text-6xl">D-DAY</span>
            )}
            {dday.mode === "ongoing" && (
              <span className="leading-none">
                {t("home.dashboard.tripDayPrefix") && (
                  <span className="text-lg font-bold sm:text-xl">
                    {t("home.dashboard.tripDayPrefix")}
                  </span>
                )}
                <span className="text-5xl font-black tabular-nums sm:text-6xl md:text-7xl">
                  {dday.value}
                </span>
                {t("home.dashboard.tripDaySuffix") && (
                  <span className="ml-1 text-lg font-bold sm:text-xl">
                    {t("home.dashboard.tripDaySuffix")}
                  </span>
                )}
              </span>
            )}
            {dday.mode === "past" && (
              <span className="leading-none">
                <span className="text-xl font-bold sm:text-2xl">D+</span>
                <span className="text-5xl font-black tabular-nums sm:text-6xl md:text-7xl">
                  {dday.value}
                </span>
              </span>
            )}
            <span className="mt-2 flex items-center gap-1 text-xs font-semibold text-white/80 opacity-0 transition-opacity group-hover:opacity-100">
              {t("home.dashboard.openTrip")} <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

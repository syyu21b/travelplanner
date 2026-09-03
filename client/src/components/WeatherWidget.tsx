import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Loader2, MapPin, Droplets, Wind, Gauge,
  Sunrise, Sunset, CloudRain, Snowflake, Sun, Thermometer, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getWeatherInfo, getUvLevel } from "@/lib/weatherCodes";
import { searchKoreaCities } from "@/lib/koreaCities";
import { OVERSEAS_CITIES } from "@/lib/overseasCities";

interface WeatherWidgetProps {
  scope: "domestic" | "overseas";
}

interface CityPreset {
  name: string;
  lat: number;
  lng: number;
}

const PRESET_CITIES: CityPreset[] = [
  { name: "서울", lat: 37.5665, lng: 126.978 },
  { name: "부산", lat: 35.1796, lng: 129.0756 },
  { name: "인천", lat: 37.4563, lng: 126.7052 },
  { name: "대구", lat: 35.8714, lng: 128.6014 },
  { name: "대전", lat: 36.3504, lng: 127.3845 },
  { name: "광주", lat: 35.1595, lng: 126.8526 },
  { name: "울산", lat: 35.5384, lng: 129.3114 },
  { name: "제주", lat: 33.4996, lng: 126.5312 },
  { name: "강릉", lat: 37.7519, lng: 128.8761 },
  { name: "전주", lat: 35.8242, lng: 127.148 },
  { name: "여수", lat: 34.7604, lng: 127.6622 },
  { name: "경주", lat: 35.8562, lng: 129.2247 },
  { name: "춘천", lat: 37.8813, lng: 127.7298 },
  { name: "속초", lat: 38.207, lng: 128.5918 },
  { name: "포항", lat: 36.019, lng: 129.3435 },
];

interface GeoResult {
  name: string;
  lat: number;
  lng: number;
}

interface CurrentWeather {
  time: string;
  temperature_2m: number;
  relative_humidity_2m: number;
  apparent_temperature: number;
  precipitation: number;
  snowfall: number;
  weather_code: number;
  surface_pressure: number;
  wind_speed_10m: number;
}

interface HourlyWeather {
  time: string[];
  temperature_2m: number[];
  apparent_temperature: number[];
  precipitation_probability: number[];
  precipitation: number[];
  snowfall: number[];
  weather_code: number[];
  uv_index: number[];
}

interface DailyWeather {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  sunrise: string[];
  sunset: string[];
  uv_index_max: number[];
  precipitation_sum: number[];
  snowfall_sum: number[];
  precipitation_probability_max: number[];
  wind_speed_10m_max: number[];
}

interface OpenMeteoResponse {
  current: CurrentWeather;
  hourly: HourlyWeather;
  daily: DailyWeather;
}

interface OpenMeteoGeocodeResult {
  name: string;
  latitude: number;
  longitude: number;
  country_code?: string;
  country?: string;
  admin1?: string;
  admin2?: string;
}

async function geocodeSearch(query: string, signal?: AbortSignal): Promise<OpenMeteoGeocodeResult[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=ko&format=json`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`위치 검색 요청이 실패했습니다. (status: ${res.status})`);
  }
  const data = (await res.json()) as { results?: OpenMeteoGeocodeResult[] };
  return data.results ?? [];
}

async function searchDomesticGeocode(query: string, signal?: AbortSignal): Promise<GeoResult[]> {
  const results = await geocodeSearch(query, signal);
  const kr = results.filter(r => r.country_code === "KR");
  if (kr.length === 0) {
    throw new Error("대한민국 내 검색 결과가 없습니다. 다른 지명으로 검색해보세요.");
  }
  return kr.map(r => ({
    name: [r.name, r.admin1].filter(Boolean).join(", "),
    lat: r.latitude,
    lng: r.longitude,
  }));
}

async function searchOverseasGeocode(query: string, signal?: AbortSignal): Promise<GeoResult[]> {
  const results = await geocodeSearch(query, signal);
  const overseas = results.filter(r => r.country_code !== "KR");
  if (overseas.length === 0) {
    throw new Error("해외 검색 결과가 없습니다. 영문 지명이나 정확한 도시명으로 검색해보세요.");
  }
  return overseas.map(r => ({
    name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
    lat: r.latitude,
    lng: r.longitude,
  }));
}

async function fetchWeather(lat: number, lng: number, signal?: AbortSignal): Promise<OpenMeteoResponse> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: [
      "temperature_2m", "relative_humidity_2m", "apparent_temperature",
      "precipitation", "snowfall", "weather_code",
      "surface_pressure", "wind_speed_10m",
    ].join(","),
    hourly: [
      "temperature_2m", "apparent_temperature", "precipitation_probability",
      "precipitation", "snowfall", "weather_code", "uv_index",
    ].join(","),
    daily: [
      "weather_code", "temperature_2m_max", "temperature_2m_min",
      "sunrise", "sunset", "uv_index_max", "precipitation_sum",
      "snowfall_sum", "precipitation_probability_max", "wind_speed_10m_max",
    ].join(","),
    timezone: "auto",
    forecast_days: "7",
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { reason?: string } | null;
    throw new Error(body?.reason || `날씨 정보를 불러오지 못했습니다. (status: ${res.status})`);
  }
  return res.json() as Promise<OpenMeteoResponse>;
}

function formatHour(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}시`;
}

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function WeatherWidget({ scope }: WeatherWidgetProps) {
  const presetCities = scope === "domestic" ? PRESET_CITIES : OVERSEAS_CITIES;
  const [selectedCity, setSelectedCity] = useState<CityPreset>(() => presetCities[0]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GeoResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weather, setWeather] = useState<OpenMeteoResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchWeather(selectedCity.lat, selectedCity.lng, controller.signal)
      .then(data => {
        setWeather(data);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        console.error("[WeatherWidget] 날씨 조회 실패:", err);
        setError(err instanceof Error ? err.message : "날씨 정보를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
      });
    return () => controller.abort();
  }, [selectedCity]);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearchError(null);
    setSearchResults([]);

    if (scope === "domestic") {
      // 국내 주요 도시는 자체 목록에서 먼저 찾는다 (Open-Meteo 지오코딩은 한글 지명 검색이 불안정함)
      const localMatches = searchKoreaCities(q);
      if (localMatches.length === 1) {
        setSelectedCity(localMatches[0]);
        setQuery("");
        return;
      }
      if (localMatches.length > 1) {
        setSearchResults(localMatches.slice(0, 6));
        return;
      }
    }

    setSearching(true);
    try {
      const results = scope === "domestic" ? await searchDomesticGeocode(q) : await searchOverseasGeocode(q);
      if (results.length === 1) {
        setSelectedCity({ name: results[0].name, lat: results[0].lat, lng: results[0].lng });
        setQuery("");
      } else {
        setSearchResults(results.slice(0, 6));
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "위치 검색 중 오류가 발생했습니다.");
    } finally {
      setSearching(false);
    }
  };

  const selectSearchResult = (r: GeoResult) => {
    setSelectedCity({ name: r.name, lat: r.lat, lng: r.lng });
    setSearchResults([]);
    setQuery("");
  };

  const nextHours = useMemo(() => {
    if (!weather) return [];
    const nowIso = weather.current.time;
    const idx = weather.hourly.time.findIndex(t => t >= nowIso);
    const start = idx === -1 ? 0 : idx;
    return weather.hourly.time.slice(start, start + 24).map((time, i) => {
      const realIdx = start + i;
      return {
        time,
        temp: weather.hourly.temperature_2m[realIdx],
        feelsLike: weather.hourly.apparent_temperature[realIdx],
        precipProb: weather.hourly.precipitation_probability[realIdx],
        precip: weather.hourly.precipitation[realIdx],
        snowfall: weather.hourly.snowfall[realIdx],
        code: weather.hourly.weather_code[realIdx],
        uv: weather.hourly.uv_index[realIdx],
      };
    });
  }, [weather]);

  const currentUv = nextHours[0]?.uv;
  const currentInfo = weather ? getWeatherInfo(weather.current.weather_code) : null;

  return (
    <Card className="p-6 bg-card border-border space-y-5">
      <div>
        <h3 className="text-lg font-bold text-foreground flex items-center gap-2 mb-3">
          <Sun className="w-5 h-5 text-primary" /> {scope === "domestic" ? "국내 날씨" : "해외 날씨"}
        </h3>
        <div className="relative">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              placeholder={scope === "domestic" ? "예: 서울, 부산, 강릉, 제주" : "예: 도쿄, 파리, 방콕, New York"}
              className="h-11"
            />
            <Button type="button" onClick={handleSearch} disabled={searching || !query.trim()} className="h-11 gap-1.5 flex-shrink-0">
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              검색
            </Button>
          </div>
          {searchResults.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
              {searchResults.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectSearchResult(r)}
                  className="w-full text-left px-4 py-2.5 hover:bg-secondary transition-colors border-b border-border last:border-b-0 text-sm font-medium text-foreground"
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
          {searchError && (
            <p className="text-xs text-red-500 flex items-center gap-1 mt-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {searchError}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          {presetCities.map(city => (
            <button
              key={city.name}
              type="button"
              onClick={() => setSelectedCity(city)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-bold transition-colors",
                selectedCity.name === city.name
                  ? "bg-primary text-white"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary"
              )}
            >
              {city.name}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      )}

      {!loading && error && (
        <div className="text-center py-10 text-muted-foreground">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-400" />
          <p className="text-sm text-red-500 font-medium">{error}</p>
        </div>
      )}

      {!loading && !error && weather && currentInfo && (
        <div className="space-y-5">
          {/* 현재 날씨 */}
          <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-5">
            <div className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground mb-1">
              <MapPin className="w-4 h-4 text-primary" /> {selectedCity.name}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-5xl">{currentInfo.emoji}</span>
              <div>
                <p className="text-4xl font-extrabold text-foreground">{Math.round(weather.current.temperature_2m)}°C</p>
                <p className="text-sm text-muted-foreground font-medium">{currentInfo.label}</p>
              </div>
              <div className="ml-auto text-right text-sm text-muted-foreground">
                <p className="flex items-center gap-1 justify-end">
                  <Thermometer className="w-3.5 h-3.5" /> 체감 {Math.round(weather.current.apparent_temperature)}°C
                </p>
                <p className="mt-1">습도 {weather.current.relative_humidity_2m}%</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
              <div className="bg-card/70 rounded-xl p-3">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Wind className="w-3.5 h-3.5" /> 풍속</p>
                <p className="text-sm font-bold text-foreground mt-0.5">{weather.current.wind_speed_10m} km/h</p>
              </div>
              <div className="bg-card/70 rounded-xl p-3">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Gauge className="w-3.5 h-3.5" /> 기압</p>
                <p className="text-sm font-bold text-foreground mt-0.5">{Math.round(weather.current.surface_pressure)} hPa</p>
              </div>
              <div className="bg-card/70 rounded-xl p-3">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1"><CloudRain className="w-3.5 h-3.5" /> 강수량</p>
                <p className="text-sm font-bold text-foreground mt-0.5">{weather.current.precipitation} mm</p>
              </div>
              <div className="bg-card/70 rounded-xl p-3">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Snowflake className="w-3.5 h-3.5" /> 강설량</p>
                <p className="text-sm font-bold text-foreground mt-0.5">{weather.current.snowfall} cm</p>
              </div>
              <div className="bg-card/70 rounded-xl p-3">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Sun className="w-3.5 h-3.5" /> 자외선(UV)</p>
                <p className={cn("text-sm font-bold mt-0.5", getUvLevel(currentUv).color)}>
                  {currentUv !== undefined ? currentUv.toFixed(1) : "-"} · {getUvLevel(currentUv).label}
                </p>
              </div>
              <div className="bg-card/70 rounded-xl p-3">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Droplets className="w-3.5 h-3.5" /> 습도</p>
                <p className="text-sm font-bold text-foreground mt-0.5">{weather.current.relative_humidity_2m}%</p>
              </div>
            </div>

            <div className="flex items-center gap-5 mt-4 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Sunrise className="w-4 h-4 text-amber-500" /> 일출 {formatTime(weather.daily.sunrise[0])}
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Sunset className="w-4 h-4 text-orange-500" /> 일몰 {formatTime(weather.daily.sunset[0])}
              </span>
            </div>
          </div>

          {/* 시간별 예보 */}
          <div>
            <h4 className="text-sm font-bold text-foreground mb-2">시간별 예보</h4>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {nextHours.map((h, i) => {
                const info = getWeatherInfo(h.code);
                return (
                  <div key={h.time} className="flex-shrink-0 w-16 text-center bg-secondary/40 rounded-xl p-2.5">
                    <p className="text-[11px] text-muted-foreground font-semibold">{i === 0 ? "지금" : formatHour(h.time)}</p>
                    <p className="text-xl my-1">{info.emoji}</p>
                    <p className="text-sm font-bold text-foreground">{Math.round(h.temp)}°</p>
                    <p className="text-[10px] text-blue-500 font-semibold mt-0.5">{h.precipProb}%</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 일별 예보 */}
          <div>
            <h4 className="text-sm font-bold text-foreground mb-2">일별 예보 (7일)</h4>
            <div className="space-y-1.5">
              {weather.daily.time.map((day, i) => {
                const info = getWeatherInfo(weather.daily.weather_code[i]);
                return (
                  <div key={day} className="flex items-center gap-1.5 sm:gap-3 px-1.5 sm:px-3 py-2 rounded-xl hover:bg-secondary/40 transition-colors">
                    <span className="text-[11px] sm:text-xs font-bold text-foreground w-9 sm:w-16 flex-shrink-0">{i === 0 ? "오늘" : formatDay(day)}</span>
                    <span className="text-lg sm:text-xl w-6 sm:w-8 flex-shrink-0">{info.emoji}</span>
                    <span className="text-xs text-muted-foreground flex-1 min-w-0 truncate hidden sm:block">{info.label}</span>
                    <span className="text-[10px] sm:text-xs text-blue-500 font-semibold flex items-center gap-0.5 w-9 sm:w-12 flex-shrink-0">
                      <CloudRain className="w-3 h-3" /> {weather.daily.precipitation_probability_max[i]}%
                    </span>
                    <span className={cn("text-xs font-semibold w-10 flex-shrink-0 hidden sm:block", getUvLevel(weather.daily.uv_index_max[i]).color)}>
                      UV {Math.round(weather.daily.uv_index_max[i])}
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-foreground w-16 sm:w-20 text-right flex-shrink-0">
                      {Math.round(weather.daily.temperature_2m_max[i])}° / {Math.round(weather.daily.temperature_2m_min[i])}°
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground text-right">데이터 제공: Open-Meteo</p>
        </div>
      )}
    </Card>
  );
}

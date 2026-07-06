/** Open-Meteo가 사용하는 WMO 날씨 코드를 한글 설명/이모지로 변환 */
export interface WeatherCodeInfo {
  label: string;
  emoji: string;
}

const WEATHER_CODES: Record<number, WeatherCodeInfo> = {
  0: { label: "맑음", emoji: "☀️" },
  1: { label: "대체로 맑음", emoji: "🌤️" },
  2: { label: "구름 조금", emoji: "⛅" },
  3: { label: "흐림", emoji: "☁️" },
  45: { label: "안개", emoji: "🌫️" },
  48: { label: "서리 안개", emoji: "🌫️" },
  51: { label: "약한 이슬비", emoji: "🌦️" },
  53: { label: "이슬비", emoji: "🌦️" },
  55: { label: "강한 이슬비", emoji: "🌧️" },
  56: { label: "약한 어는 이슬비", emoji: "🌧️" },
  57: { label: "어는 이슬비", emoji: "🌧️" },
  61: { label: "약한 비", emoji: "🌦️" },
  63: { label: "비", emoji: "🌧️" },
  65: { label: "강한 비", emoji: "🌧️" },
  66: { label: "약한 어는 비", emoji: "🌧️" },
  67: { label: "어는 비", emoji: "🌧️" },
  71: { label: "약한 눈", emoji: "🌨️" },
  73: { label: "눈", emoji: "🌨️" },
  75: { label: "강한 눈", emoji: "❄️" },
  77: { label: "싸락눈", emoji: "🌨️" },
  80: { label: "약한 소나기", emoji: "🌦️" },
  81: { label: "소나기", emoji: "🌧️" },
  82: { label: "강한 소나기", emoji: "⛈️" },
  85: { label: "약한 눈 소나기", emoji: "🌨️" },
  86: { label: "강한 눈 소나기", emoji: "❄️" },
  95: { label: "천둥번개", emoji: "⛈️" },
  96: { label: "천둥번개(약한 우박)", emoji: "⛈️" },
  99: { label: "천둥번개(강한 우박)", emoji: "⛈️" },
};

export function getWeatherInfo(code: number | undefined): WeatherCodeInfo {
  if (code === undefined || !(code in WEATHER_CODES)) {
    return { label: "정보 없음", emoji: "❓" };
  }
  return WEATHER_CODES[code];
}

export function getUvLevel(uv: number | undefined): { label: string; color: string } {
  if (uv === undefined || Number.isNaN(uv)) return { label: "정보 없음", color: "text-muted-foreground" };
  if (uv < 3) return { label: "낮음", color: "text-green-600" };
  if (uv < 6) return { label: "보통", color: "text-yellow-600" };
  if (uv < 8) return { label: "높음", color: "text-orange-600" };
  if (uv < 11) return { label: "매우 높음", color: "text-red-600" };
  return { label: "위험", color: "text-purple-600" };
}

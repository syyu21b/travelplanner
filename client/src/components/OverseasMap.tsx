/**
 * 해외 지도 (OpenStreetMap 데이터 + MapLibre GL + OpenFreeMap 벡터 타일)
 *
 * 래스터 타일(이미지)로는 도시/지역/도로 이름이 이미지에 그려진 채로 오기 때문에
 * 라벨 언어를 바꿀 방법이 없습니다. 해외 지역의 도시/국가/장소명을 여행 국가의
 * 현지 언어가 아니라 한국어·영어로 읽을 수 있도록, 벡터 타일(OpenFreeMap, API 키
 * 불필요)을 받아 라벨 텍스트 식을 "한국어 이름 → 영어 이름 → 현지 이름" 순으로
 * 직접 재작성합니다.
 *
 * USAGE:
 * ======
 * <OverseasMapView
 *   initialCenter={{ lat: 48.8566, lng: 2.3522 }}
 *   initialZoom={12}
 *   markers={markers}
 *   onMapClick={(lat, lng) => ...}
 * />
 *
 * const results = await geocodeAddressOSM("Eiffel Tower");
 * const address = await reverseGeocodeToAddressOSM(48.8566, 2.3522);
 */

import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LocateFixed, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { MapMarker } from "@/components/Map";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
// 공용 Overpass 서버 하나만 쓰면 그 서버가 느리거나 요청 제한에 걸렸을 때 바로 실패로 이어지므로,
// 여러 미러 서버를 순서대로 시도해 "주변 정보 요청 실패"가 최대한 뜨지 않도록 함
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export interface OsmGeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

/** 주소/장소명으로 검색해 좌표를 찾음 (Nominatim, 브라우저에서 직접 호출 가능 — API 키 불필요) */
export async function geocodeAddressOSM(query: string): Promise<OsmGeocodeResult[]> {
  const url = `${NOMINATIM_BASE}/search?format=jsonv2&addressdetails=0&limit=5&accept-language=ko,en&q=${encodeURIComponent(query)}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("주소 검색 요청에 실패했습니다. 네트워크 연결을 확인해주세요.");
  }
  if (!res.ok) {
    throw new Error(`주소 검색 요청이 실패했습니다 (status: ${res.status}). 잠시 후 다시 시도해주세요.`);
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error("주소 검색 응답을 처리하지 못했습니다.");
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("검색 결과가 없습니다. 영문 지명이나 정확한 주소로 검색해보세요.");
  }
  return data
    .map((d: any) => ({
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
      displayName: typeof d.display_name === "string" ? d.display_name : "",
    }))
    .filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

/** 좌표로 주소를 역변환 (Nominatim reverse geocoding, 한국어/영어 우선) */
export async function reverseGeocodeToAddressOSM(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `${NOMINATIM_BASE}/reverse?format=jsonv2&accept-language=ko,en&lat=${lat}&lon=${lng}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.display_name === "string" ? data.display_name : null;
  } catch {
    return null;
  }
}

// ── 주변 POI 추천 (Overpass API) ──
// 좌표 하나를 중심으로 관광지/맛집·카페/숙소를 OSM 태그 기준으로 찾아 카테고리별로 묶어줌.
// 공용 Overpass 서버는 응답이 느리고 요청 빈도 제한이 있어, 지도 클릭/드래그마다 바로 호출하지 말고
// 호출부(LocationPickerDialog 등)에서 디바운스한 뒤 한 번만 호출하는 것을 전제로 설계함.

export type PoiCategory = "attraction" | "food" | "hotel";

export interface OsmPoi {
  id: string;
  lat: number;
  lng: number;
  name: string;
  category: PoiCategory;
  /** 세부 태그값 (예: museum, cafe, hotel) — 아이콘/설명에 참고용 */
  kind: string;
  distanceMeters: number;
}

// 태그 범위를 넉넉하게 잡아, 관광 인프라가 상대적으로 적게 태깅된 지역에서도
// 카테고리가 비지 않도록 함 (예: historic/leisure=park를 관광지에, pub/food_court를 맛집에 포함)
const POI_CATEGORY_QUERIES: Record<PoiCategory, string[]> = {
  attraction: [
    '["tourism"~"^(attraction|museum|viewpoint|gallery|zoo|theme_park|artwork|aquarium)$"]',
    '["historic"]',
    '["leisure"~"^(park|garden)$"]',
  ],
  food: [
    '["amenity"~"^(restaurant|cafe|fast_food|bar|pub|food_court)$"]',
  ],
  hotel: [
    '["tourism"~"^(hotel|guest_house|hostel|motel|apartment|chalet)$"]',
  ],
};

// 반경을 1.2km부터 점점 넓혀가며, 세 카테고리가 모두 채워지거나 최대 반경에
// 도달할 때까지 재시도 — 관광 인프라가 드문 지역에서도 최대한 추천을 채움
const POI_RADIUS_STEPS_METERS = [1200, 3000, 7000, 15000];
const OVERPASS_TIMEOUT_MS = 9000;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function categorizePoiTags(tags: Record<string, string>): { category: PoiCategory; kind: string } | null {
  if (tags.tourism && /^(attraction|museum|viewpoint|gallery|zoo|theme_park|artwork|aquarium)$/.test(tags.tourism)) {
    return { category: "attraction", kind: tags.tourism };
  }
  if (tags.historic) {
    return { category: "attraction", kind: tags.historic };
  }
  if (tags.leisure && /^(park|garden)$/.test(tags.leisure)) {
    return { category: "attraction", kind: tags.leisure };
  }
  if (tags.amenity && /^(restaurant|cafe|fast_food|bar|pub|food_court)$/.test(tags.amenity)) {
    return { category: "food", kind: tags.amenity };
  }
  if (tags.tourism && /^(hotel|guest_house|hostel|motel|apartment|chalet)$/.test(tags.tourism)) {
    return { category: "hotel", kind: tags.tourism };
  }
  return null;
}

/** 여러 Overpass 미러 서버를 순서대로 시도 — 하나가 느리거나(9초 타임아웃) 막혀도 다음 서버로 자동 전환 */
async function postOverpassQuery(query: string): Promise<any> {
  let lastErr: unknown = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: query,
        signal: controller.signal,
      });
      if (!res.ok) {
        lastErr = new Error(`주변 정보 요청이 실패했습니다 (status: ${res.status}).`);
        continue;
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      continue;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("주변 정보를 불러오지 못했습니다. 네트워크 연결을 확인해주세요.");
}

function parsePoiElements(data: any, originLat: number, originLng: number): OsmPoi[] {
  const elements: any[] = Array.isArray(data?.elements) ? data.elements : [];
  const byCategory: Record<PoiCategory, OsmPoi[]> = { attraction: [], food: [], hotel: [] };

  elements
    .map((el): OsmPoi | null => {
      const tags = el?.tags || {};
      const name: string | undefined = tags["name:ko"] || tags["name:en"] || tags.name;
      if (!name || typeof el.lat !== "number" || typeof el.lon !== "number") return null;
      const categorized = categorizePoiTags(tags);
      if (!categorized) return null;
      return {
        id: `${el.type}/${el.id}`,
        lat: el.lat,
        lng: el.lon,
        name,
        category: categorized.category,
        kind: categorized.kind,
        distanceMeters: haversineMeters(originLat, originLng, el.lat, el.lon),
      };
    })
    .filter((p): p is OsmPoi => p !== null)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .forEach(p => {
      if (byCategory[p.category].length < 10) byCategory[p.category].push(p);
    });

  return [...byCategory.attraction, ...byCategory.food, ...byCategory.hotel];
}

// 카테고리마다 별도의 Overpass 집합(set)으로 나눠 각각 out으로 개수를 제한 — 도심처럼 "historic"
// 태그가 붙은 지점이 매우 많은 지역에서 관광지 결과가 맛집/숙소 결과를 밀어내 카테고리가
// 통째로 비어버리는 일이 없도록, 하나의 요청 안에서 카테고리별로 결과를 확실히 확보함
async function fetchPOIsAtRadius(lat: number, lng: number, radiusMeters: number): Promise<OsmPoi[]> {
  const around = `(around:${radiusMeters},${lat},${lng})`;
  const categoryBlocks = (Object.keys(POI_CATEGORY_QUERIES) as PoiCategory[])
    .map(cat => {
      const clauses = POI_CATEGORY_QUERIES[cat].map(tagFilter => `node${tagFilter}${around};`).join("");
      return `(${clauses})->.${cat};.${cat} out body 25;`;
    })
    .join("");
  const query = `[out:json][timeout:20];${categoryBlocks}`;
  const data = await postOverpassQuery(query);
  return parsePoiElements(data, lat, lng);
}

const ALL_POI_CATEGORIES: PoiCategory[] = ["attraction", "food", "hotel"];

/**
 * 좌표 주변의 관광지/맛집·카페/숙소를 Overpass API로 조회.
 * 1.2km부터 시작해 세 카테고리가 모두 채워지거나 15km에 도달할 때까지 반경을 넓혀가며 재시도하고,
 * 카테고리별로 가까운 순 최대 10개까지 반환. 서버 요청 자체가 실패한 경우에도 그 시점까지
 * 모은 결과가 있으면 에러를 던지지 않고 그대로 반환한다.
 */
export async function fetchNearbyPOIs(lat: number, lng: number): Promise<OsmPoi[]> {
  let result: OsmPoi[] = [];
  let lastErr: unknown = null;

  for (const radius of POI_RADIUS_STEPS_METERS) {
    try {
      result = await fetchPOIsAtRadius(lat, lng, radius);
      lastErr = null;
    } catch (err) {
      lastErr = err;
      break; // 서버 자체가 응답하지 않는 상황이면 반경을 더 넓혀도 의미가 없으므로 중단
    }
    const allFilled = ALL_POI_CATEGORIES.every(cat => result.some(p => p.category === cat));
    if (allFilled || result.length >= 8) break;
  }

  if (lastErr && result.length === 0) throw lastErr;
  return result;
}

// 도시/국가/지역/도로/장소명 라벨을 "한국어 이름 -> 영어 이름 -> 현지 이름" 순으로 표시.
// (도로 번호판(ref) 등 이름이 아닌 라벨은 건드리지 않도록 "get","name..." 패턴만 대상으로 함)
const NAME_GET_PATTERN = /\["get",\s*"name/;
const NAME_LABEL_EXPRESSION = [
  "coalesce",
  ["get", "name:ko"],
  ["get", "name_en"],
  ["get", "name:en"],
  ["get", "name"],
] as unknown as maplibregl.ExpressionSpecification;

function localizeLabels(map: maplibregl.Map) {
  let style: maplibregl.StyleSpecification;
  try {
    style = map.getStyle();
  } catch {
    return;
  }
  if (!style?.layers) return;
  for (const layer of style.layers) {
    if (layer.type !== "symbol") continue;
    const textField = (layer as maplibregl.SymbolLayerSpecification).layout?.["text-field"];
    if (textField === undefined) continue;
    if (!NAME_GET_PATTERN.test(JSON.stringify(textField))) continue;
    try {
      map.setLayoutProperty(layer.id, "text-field", NAME_LABEL_EXPRESSION);
    } catch {
      // 스타일 로딩 타이밍 등으로 실패해도 지도 자체는 정상 동작하도록 무시
    }
  }
}

function buildMarkerElement(label?: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = label
    ? "width:28px;height:28px;border-radius:50% 50% 50% 0;background:#4f7cff;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 5px rgba(0,0,0,0.35);border:2px solid #fff;cursor:pointer;"
    : "width:24px;height:24px;border-radius:50% 50% 50% 0;background:#ef4444;transform:rotate(-45deg);box-shadow:0 2px 5px rgba(0,0,0,0.35);border:2px solid #fff;cursor:pointer;";
  if (label) {
    const span = document.createElement("span");
    span.style.cssText = "transform:rotate(45deg);color:#fff;font-weight:700;font-size:12px;line-height:1;";
    span.textContent = label;
    el.appendChild(span);
  }
  return el;
}

interface OverseasMapViewProps {
  className?: string;
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  markers?: MapMarker[];
  onMapClick?: (lat: number, lng: number) => void;
  onMarkerClick?: (id: string) => void;
  onMarkerDelete?: (id: string) => void;
  onMarkerDragEnd?: (id: string, lat: number, lng: number) => void;
  onMapReady?: (map: maplibregl.Map) => void;
  fitToMarkers?: boolean;
  showCurrentLocationButton?: boolean;
}

export function OverseasMapView({
  className,
  initialCenter = { lat: 20, lng: 0 },
  initialZoom = 2,
  markers = [],
  onMapClick,
  onMarkerClick,
  onMarkerDelete,
  onMarkerDragEnd,
  onMapReady,
  fitToMarkers = false,
  showCurrentLocationButton = true,
}: OverseasMapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerObjsRef = useRef<globalThis.Map<string, maplibregl.Marker>>(new globalThis.Map());
  const currentLocationMarkerRef = useRef<maplibregl.Marker | null>(null);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [locating, setLocating] = useState(false);

  const callbacksRef = useRef({ onMapClick, onMarkerClick, onMarkerDelete, onMarkerDragEnd });
  callbacksRef.current = { onMapClick, onMarkerClick, onMarkerDelete, onMarkerDragEnd };

  // 지도 최초 생성 (마운트 시 1회)
  useEffect(() => {
    if (!mapContainer.current) return;
    let cancelled = false;

    // 방화벽/오프라인 등으로 타일 서버 자체에 접속이 안 되면 'load' 이벤트가 영영 안 올 수 있어,
    // 로딩 스피너가 무한히 도는 대신 일정 시간 후 에러 메시지를 보여줌
    let timeoutId: number | undefined;

    try {
      const map = new maplibregl.Map({
        container: mapContainer.current,
        style: STYLE_URL,
        center: [initialCenter.lng, initialCenter.lat],
        zoom: initialZoom,
        attributionControl: {
          compact: true,
          customAttribution: "OpenFreeMap · OpenMapTiles · © OpenStreetMap contributors",
        },
      });

      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        setErrorMessage("지도를 불러오지 못했습니다. 네트워크 연결을 확인하고 다시 시도해주세요.");
        setStatus("error");
      }, 15000);

      map.on("error", (e) => {
        console.error("[OverseasMapView]", e?.error);
      });

      map.on("load", () => {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        if (cancelled) return;
        localizeLabels(map);
        mapRef.current = map;
        setStatus("ready");
        onMapReady?.(map);
      });

      map.on("click", (e) => {
        callbacksRef.current.onMapClick?.(e.lngLat.lat, e.lngLat.lng);
      });
    } catch (err) {
      console.error(err);
      if (!cancelled) {
        setErrorMessage(err instanceof Error ? err.message : "지도를 불러오지 못했습니다.");
        setStatus("error");
      }
    }

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      markerObjsRef.current.forEach(m => {
        try { m.remove(); } catch { /* noop */ }
      });
      markerObjsRef.current.clear();
      try { currentLocationMarkerRef.current?.remove(); } catch { /* noop */ }
      currentLocationMarkerRef.current = null;
      try { mapRef.current?.remove(); } catch { /* noop */ }
      mapRef.current = null;
    };
    // 최초 마운트 시에만 지도를 생성합니다 (initialCenter/initialZoom 변경은 이후 반영되지 않음).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // markers prop과 실제 maplibregl.Marker 인스턴스 동기화 (추가/이동/삭제)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;

    const incomingIds = new Set(markers.map(m => m.id));
    markerObjsRef.current.forEach((markerObj, id) => {
      if (!incomingIds.has(id)) {
        markerObj.remove();
        markerObjsRef.current.delete(id);
      }
    });

    markers.forEach(m => {
      let markerObj = markerObjsRef.current.get(m.id);

      if (!markerObj) {
        const el = buildMarkerElement(m.label);
        markerObj = new maplibregl.Marker({ element: el, draggable: m.draggable !== false, anchor: "bottom" })
          .setLngLat([m.lng, m.lat])
          .addTo(map);
        markerObjsRef.current.set(m.id, markerObj);

        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          callbacksRef.current.onMarkerClick?.(m.id);

          if (callbacksRef.current.onMarkerDelete) {
            const popupEl = document.createElement("div");
            popupEl.style.cssText = "padding:2px 0;min-width:120px;font-family:inherit;";
            const titleEl = document.createElement("p");
            titleEl.style.cssText = "font-weight:700;font-size:13px;margin:0 0 6px;color:#1f2937;";
            titleEl.textContent = m.title || "선택한 위치";
            popupEl.appendChild(titleEl);
            const delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.textContent = "마커 삭제";
            delBtn.style.cssText =
              "font-size:12px;color:#ef4444;background:none;border:none;cursor:pointer;padding:0;text-decoration:underline;";
            delBtn.onclick = () => {
              markerObj?.getPopup()?.remove();
              callbacksRef.current.onMarkerDelete?.(m.id);
            };
            popupEl.appendChild(delBtn);
            new maplibregl.Popup({ offset: 20, closeButton: true })
              .setDOMContent(popupEl)
              .setLngLat(markerObj!.getLngLat())
              .addTo(map);
          }
        });

        markerObj.on("dragend", () => {
          const pos = markerObj!.getLngLat();
          callbacksRef.current.onMarkerDragEnd?.(m.id, pos.lat, pos.lng);
        });
      } else {
        markerObj.setLngLat([m.lng, m.lat]);
        if (m.draggable !== false) markerObj.setDraggable(true);
        else markerObj.setDraggable(false);
      }
    });

    if (fitToMarkers && markers.length > 0) {
      if (markers.length === 1) {
        map.flyTo({ center: [markers[0].lng, markers[0].lat], zoom: Math.max(map.getZoom(), 15) });
      } else {
        const bounds = markers.reduce(
          (b, m) => b.extend([m.lng, m.lat]),
          new maplibregl.LngLatBounds([markers[0].lng, markers[0].lat], [markers[0].lng, markers[0].lat])
        );
        map.fitBounds(bounds, { padding: 40, maxZoom: 16 });
      }
    }
  }, [markers, fitToMarkers, status]);

  const handleLocateMe = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!navigator.geolocation) {
      toast.error("이 브라우저에서는 위치 정보를 사용할 수 없습니다.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        map.flyTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 15) });

        if (currentLocationMarkerRef.current) {
          currentLocationMarkerRef.current.setLngLat([longitude, latitude]);
        } else {
          const el = document.createElement("div");
          el.style.cssText =
            "width:16px;height:16px;border-radius:50%;background:#4285F4;border:3px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.4);";
          currentLocationMarkerRef.current = new maplibregl.Marker({ element: el })
            .setLngLat([longitude, latitude])
            .addTo(map);
        }
      },
      (err) => {
        setLocating(false);
        console.error(err);
        toast.error("현재 위치를 가져올 수 없습니다. 위치 권한을 확인해주세요.");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  return (
    <div className={cn("relative w-full h-[500px] rounded-xl overflow-hidden bg-secondary", className)}>
      <div ref={mapContainer} className="w-full h-full" />

      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/80 pointer-events-none">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/95 p-4">
          <p className="text-sm text-muted-foreground text-center">{errorMessage}</p>
        </div>
      )}

      {status === "ready" && showCurrentLocationButton && (
        <button
          type="button"
          onClick={handleLocateMe}
          disabled={locating}
          title="현재 위치로 이동"
          className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-white shadow-lg border border-border flex items-center justify-center text-primary hover:bg-secondary transition-colors disabled:opacity-60 z-[10]"
        >
          {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}

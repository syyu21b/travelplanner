import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, X, Search, Loader2, Landmark, Utensils, BedDouble, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MapView, type MapMarker, geocodeAddress, reverseGeocodeToAddress } from "@/components/Map";
import type { OsmPoi, PoiCategory } from "@/components/OverseasMap";
import type { Map as MapLibreMap } from "maplibre-gl";

// 해외 지도(MapLibre GL)는 용량이 커서, 실제로 해외 계획을 다룰 때만 불러오도록 지연 로딩
const OverseasMapView = lazy(() =>
  import("@/components/OverseasMap").then(m => ({ default: m.OverseasMapView }))
);

const POI_ICONS: Record<PoiCategory, typeof Landmark> = {
  attraction: Landmark,
  food: Utensils,
  hotel: BedDouble,
};

// OverseasMap 모듈은 maplibre-gl 등 용량이 커서 지연 로딩하므로, 여기서는 카테고리 라벨만
// 별도로 두어 이 다이얼로그가 처음 열릴 때 무거운 모듈을 정적으로 끌어오지 않도록 함
const POI_CATEGORY_LABELS: Record<PoiCategory, string> = {
  attraction: "관광지",
  food: "맛집·카페",
  hotel: "숙소",
};

// 구글 지도 검색 URL 스킴 사용 (API 키 불필요) — 장소명과 좌표를 함께 넣어 검색하면
// 구글 지도가 해당 좌표 근처에서 이름이 일치하는 장소를 찾아 정보 카드를 보여줄 확률이 높음
function openPoiInGoogleMaps(poi: OsmPoi) {
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${poi.name} ${poi.lat},${poi.lng}`)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

type Region = "domestic" | "overseas";

interface LocationPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLat?: number;
  initialLng?: number;
  /** 이 위치를 고르는 여행 계획이 국내인지 해외인지 — 계획 생성 시 정해지며, 어떤 지도를 쓸지 결정함 */
  region: Region;
  title?: string;
  onConfirm: (lat: number, lng: number, address?: string) => void;
}

const DOMESTIC_DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 서울시청
const OVERSEAS_DEFAULT_CENTER = { lat: 48.8566, lng: 2.3522 }; // 파리 (해외 기본값)

interface SimpleSearchResult {
  lat: number;
  lng: number;
  primary: string;
  secondary?: string;
}

export function LocationPickerDialog({
  open,
  onOpenChange,
  initialLat,
  initialLng,
  region,
  title = "지도에서 위치 선택",
  onConfirm,
}: LocationPickerDialogProps) {
  const isDomestic = region === "domestic";
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(
    initialLat !== undefined && initialLng !== undefined ? { lat: initialLat, lng: initialLng } : null
  );
  const [pickedAddress, setPickedAddress] = useState<string | null>(null);
  const [resolvingAddress, setResolvingAddress] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SimpleSearchResult[]>([]);

  const [nearbyPois, setNearbyPois] = useState<OsmPoi[]>([]);
  const [loadingPois, setLoadingPois] = useState(false);
  const [activePoiCategory, setActivePoiCategory] = useState<PoiCategory>("attraction");
  const overseasMapRef = useRef<MapLibreMap | null>(null);

  // 다이얼로그를 열 때마다 초기 상태로 리셋
  useEffect(() => {
    if (open) {
      setPicked(initialLat !== undefined && initialLng !== undefined ? { lat: initialLat, lng: initialLng } : null);
      setPickedAddress(null);
      setSearchQuery("");
      setSearchResults([]);
      setNearbyPois([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialLat, initialLng]);

  // 해외 지도에서 위치를 고를 때마다 주변 관광지/맛집·카페/숙소를 Overpass API로 추천 —
  // 지도 클릭/드래그로 좌표가 자주 바뀔 수 있어 공용 Overpass 서버 요청 빈도 제한에 걸리지 않도록
  // 800ms 디바운스 후 한 번만 호출하고, 그 사이 좌표가 또 바뀌면 이전 요청 결과는 버림.
  // fetchNearbyPOIs 자체가 여러 미러 서버 + 반경 확장으로 최대한 결과를 채워오므로, 그래도 실패하면
  // 사용자에게는 "요청 실패" 문구 대신 그냥 빈 상태("추천할 만한 장소를 찾지 못했습니다")로 보여줌
  useEffect(() => {
    if (isDomestic || !open || !picked) {
      setNearbyPois([]);
      return;
    }
    let cancelled = false;
    setLoadingPois(true);
    const timer = window.setTimeout(() => {
      import("@/components/OverseasMap")
        .then(m => m.fetchNearbyPOIs(picked.lat, picked.lng))
        .then(pois => {
          if (cancelled) return;
          setNearbyPois(pois);
          // 새로 불러온 목록에 현재 선택된 카테고리 결과가 없으면, 결과가 있는 첫 카테고리로 자동 전환
          setActivePoiCategory(prev => (pois.some(p => p.category === prev) ? prev : pois[0]?.category ?? prev));
        })
        .catch((err: unknown) => {
          console.error("[LocationPickerDialog] 주변 정보 조회 실패:", err);
          if (cancelled) return;
          setNearbyPois([]);
        })
        .finally(() => {
          if (!cancelled) setLoadingPois(false);
        });
    }, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isDomestic, open, picked?.lat, picked?.lng]);

  const selectLocation = (lat: number, lng: number, address?: string | null) => {
    setPicked({ lat, lng });
    setSearchResults([]);
    if (address !== undefined) {
      setPickedAddress(address);
      return;
    }
    // 지도를 직접 클릭/드래그한 경우 -> 좌표를 사람이 읽을 수 있는 주소로 역변환
    setPickedAddress(null);
    setResolvingAddress(true);
    const reverseLookup = isDomestic
      ? reverseGeocodeToAddress(lat, lng)
      : import("@/components/OverseasMap").then(m => m.reverseGeocodeToAddressOSM(lat, lng));
    reverseLookup
      .then(addr => setPickedAddress(addr))
      .finally(() => setResolvingAddress(false));
  };

  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query) return;
    setSearching(true);
    setSearchResults([]);
    try {
      if (isDomestic) {
        const results = await geocodeAddress(query);
        const mapped: SimpleSearchResult[] = results.map(r => ({
          lat: r.lat,
          lng: r.lng,
          primary: r.roadAddress || r.jibunAddress,
          secondary: r.roadAddress && r.jibunAddress && r.roadAddress !== r.jibunAddress ? r.jibunAddress : undefined,
        }));
        if (mapped.length === 1) {
          selectLocation(mapped[0].lat, mapped[0].lng, mapped[0].primary);
        } else {
          setSearchResults(mapped.slice(0, 5));
        }
      } else {
        const { geocodeAddressOSM } = await import("@/components/OverseasMap");
        const results = await geocodeAddressOSM(query);
        const mapped: SimpleSearchResult[] = results.map(r => ({ lat: r.lat, lng: r.lng, primary: r.displayName }));
        if (mapped.length === 1) {
          selectLocation(mapped[0].lat, mapped[0].lng, mapped[0].primary);
        } else {
          setSearchResults(mapped.slice(0, 5));
        }
      }
    } catch (err) {
      console.error("[LocationPickerDialog] 주소 검색 실패:", err);
      toast.error(err instanceof Error ? err.message : "주소 검색 중 오류가 발생했습니다.");
    } finally {
      setSearching(false);
    }
  };

  // 주변 추천 카드를 선택했을 때, 지도가 어디로 이동했는지 놓치지 않도록 해당 지점으로
  // 확실히 확대 이동시키고 이름표가 붙은 풍선(팝업)을 잠깐 띄워 위치를 명확히 보여줌
  const selectPoi = (poi: OsmPoi) => {
    selectLocation(poi.lat, poi.lng, poi.name);
    const map = overseasMapRef.current;
    if (!map) return;
    try {
      map.flyTo({ center: [poi.lng, poi.lat], zoom: Math.max(map.getZoom(), 17) });
    } catch {
      return; // 지도 인스턴스가 이미 정리된 경우 등 — 위치 선택 자체는 이미 반영되었으므로 조용히 무시
    }
    import("maplibre-gl")
      .then(({ Popup }) => {
        new Popup({ offset: 20, closeButton: false, closeOnClick: true })
          .setLngLat([poi.lng, poi.lat])
          .setText(poi.name)
          .addTo(map);
      })
      .catch(() => { /* 팝업은 부가 요소라 실패해도 위치 이동 자체는 이미 정상 동작함 */ });
  };

  const markers: MapMarker[] = picked
    ? [{ id: "picked", lat: picked.lat, lng: picked.lng, title: pickedAddress || "선택한 위치", draggable: true }]
    : [];

  const handleConfirm = () => {
    if (!picked) return;
    onConfirm(picked.lat, picked.lng, pickedAddress || undefined);
    onOpenChange(false);
  };

  const clearSelection = () => {
    setPicked(null);
    setPickedAddress(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" /> {title}
            <span className="text-xs font-normal text-muted-foreground">({isDomestic ? "네이버 지도" : "OpenStreetMap"})</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {isDomestic
              ? "도로명 주소 또는 지번 주소로 검색하거나(건물명·상호명 검색은 아직 지원되지 않습니다), 지도를 클릭해 위치를 지정하세요. 마커를 드래그해 조정하거나 클릭해 삭제할 수 있습니다."
              : "영문 지명이나 주소로 검색하거나, 지도를 클릭해 위치를 지정하세요. 마커를 드래그해 조정하거나 클릭해 삭제할 수 있습니다."}
          </p>

          {/* 검색 */}
          <div className="relative">
            <div className="flex gap-2">
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                placeholder={isDomestic ? "예: 서울특별시 중구 세종대로 110" : "예: Eiffel Tower, Paris"}
                className="h-11"
              />
              <Button type="button" onClick={handleSearch} disabled={searching || !searchQuery.trim()} className="h-11 gap-1.5 flex-shrink-0">
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                검색
              </Button>
            </div>
            {searchResults.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-border rounded-lg shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectLocation(r.lat, r.lng, r.primary)}
                    className="w-full text-left px-4 py-2.5 hover:bg-secondary transition-colors border-b border-border last:border-b-0"
                  >
                    <p className="text-sm font-medium text-foreground">{r.primary}</p>
                    {r.secondary && (
                      <p className="text-xs text-muted-foreground mt-0.5">{r.secondary}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isDomestic ? (
            <MapView
              key="domestic"
              className="h-[260px] sm:h-[400px]"
              initialCenter={picked ?? DOMESTIC_DEFAULT_CENTER}
              initialZoom={picked ? 16 : 12}
              markers={markers}
              fitToMarkers
              onMapClick={(lat, lng) => selectLocation(lat, lng)}
              onMarkerDragEnd={(_id, lat, lng) => selectLocation(lat, lng)}
              onMarkerDelete={clearSelection}
            />
          ) : (
            <Suspense fallback={<div className="h-[260px] sm:h-[400px] rounded-xl bg-secondary flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
              <OverseasMapView
                key="overseas"
                className="h-[260px] sm:h-[400px]"
                initialCenter={picked ?? OVERSEAS_DEFAULT_CENTER}
                initialZoom={picked ? 16 : 5}
                markers={markers}
                fitToMarkers
                onMapClick={(lat, lng) => selectLocation(lat, lng)}
                onMarkerDragEnd={(_id, lat, lng) => selectLocation(lat, lng)}
                onMarkerDelete={clearSelection}
                onMapReady={map => { overseasMapRef.current = map; }}
              />
            </Suspense>
          )}

          <div className="flex items-start justify-between gap-3 min-h-[20px]">
            <div className="text-sm">
              {picked ? (
                <div className="flex items-start gap-1.5 font-medium text-foreground">
                  <MapPin className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <span>
                    {resolvingAddress ? (
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> 주소 확인 중...
                      </span>
                    ) : (
                      pickedAddress || `${picked.lat.toFixed(6)}, ${picked.lng.toFixed(6)}`
                    )}
                    {pickedAddress && (
                      <span className="block text-xs text-muted-foreground font-normal mt-0.5">
                        {picked.lat.toFixed(6)}, {picked.lng.toFixed(6)}
                      </span>
                    )}
                  </span>
                </div>
              ) : (
                <p className="text-muted-foreground">아직 선택된 위치가 없습니다.</p>
              )}
            </div>
            {picked && (
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs text-red-500 hover:underline flex items-center gap-1 flex-shrink-0"
              >
                <X className="w-3 h-3" /> 선택 취소
              </button>
            )}
          </div>

          {/* 주변 추천 (Overpass API, 해외 지도 전용) — 좌우 스크롤 카드 대신 카테고리 버튼 +
              세로 목록으로 구성해, 모바일에서 가로 스크롤 없이 탭만으로 훑어볼 수 있게 함 */}
          {!isDomestic && picked && (
            <div className="border border-border rounded-lg p-3 bg-secondary/40">
              <p className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-primary" /> 주변 추천
                {loadingPois && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              </p>
              {!loadingPois && nearbyPois.length === 0 ? (
                <p className="text-xs text-muted-foreground">이 주변에서 추천할 만한 장소를 찾지 못했습니다.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(Object.keys(POI_CATEGORY_LABELS) as PoiCategory[]).map(cat => {
                      const count = nearbyPois.filter(p => p.category === cat).length;
                      const Icon = POI_ICONS[cat];
                      const active = activePoiCategory === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          disabled={count === 0}
                          onClick={() => setActivePoiCategory(cat)}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors",
                            active ? "bg-primary text-white border-primary" : "bg-white text-foreground border-border hover:border-primary/40",
                            count === 0 && "opacity-40 cursor-not-allowed"
                          )}
                        >
                          <Icon className="w-3.5 h-3.5" /> {POI_CATEGORY_LABELS[cat]}
                          {count > 0 && <span className={active ? "text-white/80" : "text-muted-foreground"}>{count}</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                    {nearbyPois.filter(p => p.category === activePoiCategory).length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">이 카테고리에는 추천할 만한 장소가 없습니다.</p>
                    ) : (
                      nearbyPois
                        .filter(p => p.category === activePoiCategory)
                        .map(poi => (
                          <div
                            key={poi.id}
                            className="flex items-center gap-1.5 rounded-lg bg-white border border-border hover:border-primary/40 hover:shadow-sm transition-all"
                          >
                            <button
                              type="button"
                              onClick={() => selectPoi(poi)}
                              className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left px-3 py-2.5"
                            >
                              <span className="text-sm font-medium text-foreground truncate">{poi.name}</span>
                              <span className="text-xs text-muted-foreground flex-shrink-0">
                                {poi.distanceMeters < 1000 ? `${Math.round(poi.distanceMeters)}m` : `${(poi.distanceMeters / 1000).toFixed(1)}km`}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openPoiInGoogleMaps(poi)}
                              title="구글 지도에서 이 장소 정보 보기"
                              className="flex-shrink-0 flex items-center gap-1 text-xs font-bold text-primary hover:underline pr-3 py-2.5"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> Link
                            </button>
                          </div>
                        ))
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button onClick={handleConfirm} disabled={!picked} className="flex-1 bg-primary text-white h-11">
              이 위치로 설정
            </Button>
            <Button onClick={() => onOpenChange(false)} variant="outline" className="flex-1 h-11">
              취소
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

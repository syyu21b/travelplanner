import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, X, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MapView, type MapMarker, geocodeAddress, reverseGeocodeToAddress } from "@/components/Map";
import { LeafletMapView, geocodeAddressOSM, reverseGeocodeToAddressOSM } from "@/components/LeafletMap";

interface LocationPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLat?: number;
  initialLng?: number;
  title?: string;
  onConfirm: (lat: number, lng: number, address?: string) => void;
}

type MapMode = "domestic" | "overseas";

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
  title = "지도에서 위치 선택",
  onConfirm,
}: LocationPickerDialogProps) {
  const [mapMode, setMapMode] = useState<MapMode>("domestic");
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(
    initialLat !== undefined && initialLng !== undefined ? { lat: initialLat, lng: initialLng } : null
  );
  const [pickedAddress, setPickedAddress] = useState<string | null>(null);
  const [resolvingAddress, setResolvingAddress] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SimpleSearchResult[]>([]);

  // 다이얼로그를 열 때마다 초기 상태로 리셋
  useEffect(() => {
    if (open) {
      setMapMode("domestic");
      setPicked(initialLat !== undefined && initialLng !== undefined ? { lat: initialLat, lng: initialLng } : null);
      setPickedAddress(null);
      setSearchQuery("");
      setSearchResults([]);
    }
  }, [open, initialLat, initialLng]);

  const switchMapMode = (mode: MapMode) => {
    if (mode === mapMode) return;
    setMapMode(mode);
    setSearchQuery("");
    setSearchResults([]);
  };

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
    const reverseLookup = mapMode === "domestic" ? reverseGeocodeToAddress(lat, lng) : reverseGeocodeToAddressOSM(lat, lng);
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
      if (mapMode === "domestic") {
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
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* 국내/해외 선택 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => switchMapMode("domestic")}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-bold border transition-colors",
                mapMode === "domestic" ? "bg-primary text-white border-primary" : "bg-white text-foreground border-border hover:border-primary/40"
              )}
            >
              국내
            </button>
            <button
              type="button"
              onClick={() => switchMapMode("overseas")}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-bold border transition-colors",
                mapMode === "overseas" ? "bg-primary text-white border-primary" : "bg-white text-foreground border-border hover:border-primary/40"
              )}
            >
              해외
            </button>
            <span className="text-xs text-muted-foreground">
              {mapMode === "domestic" ? "네이버 지도" : "OpenStreetMap"}
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            {mapMode === "domestic"
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
                placeholder={mapMode === "domestic" ? "예: 서울특별시 중구 세종대로 110" : "예: Eiffel Tower, Paris"}
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

          {mapMode === "domestic" ? (
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
            <LeafletMapView
              key="overseas"
              className="h-[260px] sm:h-[400px]"
              initialCenter={picked ?? OVERSEAS_DEFAULT_CENTER}
              initialZoom={picked ? 16 : 5}
              markers={markers}
              fitToMarkers
              onMapClick={(lat, lng) => selectLocation(lat, lng)}
              onMarkerDragEnd={(_id, lat, lng) => selectLocation(lat, lng)}
              onMarkerDelete={clearSelection}
            />
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

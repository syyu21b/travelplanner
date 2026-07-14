/**
 * OPENSTREETMAP + LEAFLET INTEGRATION (해외 지도)
 *
 * 네이버 지도는 국내 지도/주소 검색에 최적화되어 있어 해외 지역에서는 커버리지가
 * 떨어집니다. 해외 일정/숙소는 별도 API 키가 필요 없는 OpenStreetMap 타일과
 * Leaflet, Nominatim(OSM의 무료 지오코더)을 사용해 위치 검색 및 지도 표시를 제공합니다.
 *
 * USAGE:
 * ======
 * <LeafletMapView
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
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LocateFixed, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { MapMarker } from "@/components/Map";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

export interface OsmGeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

/** 주소/장소명으로 검색해 좌표를 찾음 (Nominatim, 브라우저에서 직접 호출 가능 — API 키 불필요) */
export async function geocodeAddressOSM(query: string): Promise<OsmGeocodeResult[]> {
  const url = `${NOMINATIM_BASE}/search?format=jsonv2&addressdetails=0&limit=5&q=${encodeURIComponent(query)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "Accept-Language": "ko,en;q=0.8" } });
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

/** 좌표로 주소를 역변환 (Nominatim reverse geocoding) */
export async function reverseGeocodeToAddressOSM(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { "Accept-Language": "ko,en;q=0.8" } });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.display_name === "string" ? data.display_name : null;
  } catch {
    return null;
  }
}

function buildDivIcon(label?: string): L.DivIcon {
  const html = label
    ? `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#4f7cff;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 5px rgba(0,0,0,0.35);border:2px solid #fff;"><span style="transform:rotate(45deg);color:#fff;font-weight:700;font-size:12px;line-height:1;">${label}</span></div>`
    : `<div style="width:24px;height:24px;border-radius:50% 50% 50% 0;background:#ef4444;transform:rotate(-45deg);box-shadow:0 2px 5px rgba(0,0,0,0.35);border:2px solid #fff;"></div>`;
  return L.divIcon({
    html,
    className: "",
    iconSize: label ? [28, 28] : [24, 24],
    iconAnchor: label ? [14, 28] : [12, 24],
  });
}

interface LeafletMapViewProps {
  className?: string;
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  markers?: MapMarker[];
  onMapClick?: (lat: number, lng: number) => void;
  onMarkerClick?: (id: string) => void;
  onMarkerDelete?: (id: string) => void;
  onMarkerDragEnd?: (id: string, lat: number, lng: number) => void;
  onMapReady?: (map: L.Map) => void;
  fitToMarkers?: boolean;
  showCurrentLocationButton?: boolean;
}

export function LeafletMapView({
  className,
  initialCenter = { lat: 20, lng: 0 },
  initialZoom = 3,
  markers = [],
  onMapClick,
  onMarkerClick,
  onMarkerDelete,
  onMarkerDragEnd,
  onMapReady,
  fitToMarkers = false,
  showCurrentLocationButton = true,
}: LeafletMapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerObjsRef = useRef<globalThis.Map<string, L.Marker>>(new globalThis.Map());
  const currentLocationMarkerRef = useRef<L.Marker | null>(null);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [locating, setLocating] = useState(false);

  const callbacksRef = useRef({ onMapClick, onMarkerClick, onMarkerDelete, onMarkerDragEnd });
  callbacksRef.current = { onMapClick, onMarkerClick, onMarkerDelete, onMarkerDragEnd };

  // 지도 최초 생성 (마운트 시 1회)
  useEffect(() => {
    if (!mapContainer.current) return;
    let cancelled = false;

    try {
      const map = L.map(mapContainer.current, {
        center: [initialCenter.lat, initialCenter.lng],
        zoom: initialZoom,
        zoomControl: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      map.on("click", (e: L.LeafletMouseEvent) => {
        callbacksRef.current.onMapClick?.(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current = map;
      if (!cancelled) {
        setStatus("ready");
        onMapReady?.(map);
      }
    } catch (err) {
      console.error(err);
      if (!cancelled) {
        setErrorMessage(err instanceof Error ? err.message : "지도를 불러오지 못했습니다.");
        setStatus("error");
      }
    }

    return () => {
      cancelled = true;
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

  // markers prop과 실제 L.Marker 인스턴스 동기화 (추가/이동/삭제)
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
      const icon = buildDivIcon(m.label);

      if (!markerObj) {
        markerObj = L.marker([m.lat, m.lng], {
          icon,
          draggable: m.draggable !== false,
          title: m.title,
        }).addTo(map);
        markerObjsRef.current.set(m.id, markerObj);

        markerObj.on("click", () => {
          callbacksRef.current.onMarkerClick?.(m.id);
        });

        markerObj.on("dragend", () => {
          const pos = markerObj!.getLatLng();
          callbacksRef.current.onMarkerDragEnd?.(m.id, pos.lat, pos.lng);
        });

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
            markerObj?.closePopup();
            callbacksRef.current.onMarkerDelete?.(m.id);
          };
          popupEl.appendChild(delBtn);
          markerObj.bindPopup(popupEl);
        } else if (m.title) {
          markerObj.bindPopup(m.title);
        }
      } else {
        markerObj.setLatLng([m.lat, m.lng]);
        markerObj.setIcon(icon);
        if (typeof (markerObj as any).setTitle === "function") {
          (markerObj as any).setTitle(m.title || "");
        }
        if (m.draggable !== false) markerObj.dragging?.enable();
        else markerObj.dragging?.disable();
      }
    });

    if (fitToMarkers && markers.length > 0) {
      if (markers.length === 1) {
        map.setView([markers[0].lat, markers[0].lng], Math.max(map.getZoom(), 15));
      } else {
        const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng] as [number, number]));
        map.fitBounds(bounds, { padding: [40, 40] });
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
        map.flyTo([latitude, longitude], Math.max(map.getZoom(), 15));

        if (currentLocationMarkerRef.current) {
          currentLocationMarkerRef.current.setLatLng([latitude, longitude]);
        } else {
          currentLocationMarkerRef.current = L.marker([latitude, longitude], {
            icon: L.divIcon({
              html: '<div style="width:16px;height:16px;border-radius:50%;background:#4285F4;border:3px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>',
              className: "",
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            }),
            interactive: false,
            zIndexOffset: 1000,
          }).addTo(map);
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
          className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-white shadow-lg border border-border flex items-center justify-center text-primary hover:bg-secondary transition-colors disabled:opacity-60 z-[1000]"
        >
          {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}

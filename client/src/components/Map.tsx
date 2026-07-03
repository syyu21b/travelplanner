/**
 * NAVER MAPS FRONTEND INTEGRATION
 *
 * USAGE:
 * ======
 * const [markers, setMarkers] = useState<MapMarker[]>([]);
 *
 * <MapView
 *   initialCenter={{ lat: 37.5665, lng: 126.9780 }}
 *   initialZoom={14}
 *   markers={markers}
 *   onMapClick={(lat, lng) => setMarkers(prev => [...prev, { id: Date.now().toString(), lat, lng }])}
 *   onMarkerDelete={(id) => setMarkers(prev => prev.filter(m => m.id !== id))}
 *   onMarkerDragEnd={(id, lat, lng) => setMarkers(prev => prev.map(m => m.id === id ? { ...m, lat, lng } : m))}
 * />
 *
 * - Client ID는 VITE_NAVER_MAP_CLIENT_ID 환경 변수에서 읽어옵니다 (코드에 직접 작성하지 않음).
 * - 스크립트는 앱 전체에서 한 번만 로드되도록 모듈 레벨에서 중복 방지 처리합니다.
 *
 * 주소/장소 검색:
 * ======
 * geocode/reverseGeocode API를 함께 제공합니다 (geocoder submodule, 브라우저에서 직접 호출 —
 * 별도 서버나 Client Secret 불필요).
 *
 * const results = await geocodeAddress("인천국제공항");
 * const address = await reverseGeocodeToAddress(37.5665, 126.9780);
 */

/// <reference types="@types/navermaps" />

import { useEffect, useRef, useState, useCallback } from "react";
import { LocateFixed, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    naver?: typeof naver;
  }
}

const NAVER_CLIENT_ID = import.meta.env.VITE_NAVER_MAP_CLIENT_ID as string | undefined;
const SCRIPT_ATTR = "data-naver-maps-loader";

// 앱 전체에서 스크립트가 중복 로딩되지 않도록 모듈 스코프에서 프라미스를 공유
let naverMapsLoadPromise: Promise<void> | null = null;

function loadNaverMapsScript(): Promise<void> {
  // .Service(geocoder submodule)까지 확인 — naver.maps만 있고 Service가 없으면
  // (예: 이 기능이 추가되기 전 스크립트가 이미 로드된 경우) 다시 로드해야 함
  if (typeof window !== "undefined" && window.naver?.maps?.Service) {
    return Promise.resolve();
  }
  if (naverMapsLoadPromise) {
    return naverMapsLoadPromise;
  }
  naverMapsLoadPromise = new Promise((resolve, reject) => {
    if (!NAVER_CLIENT_ID) {
      reject(new Error("VITE_NAVER_MAP_CLIENT_ID 환경 변수가 설정되지 않았습니다."));
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[${SCRIPT_ATTR}]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("네이버 지도 스크립트를 불러오지 못했습니다.")));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(NAVER_CLIENT_ID)}&submodules=geocoder`;
    script.async = true;
    script.setAttribute(SCRIPT_ATTR, "true");
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("네이버 지도 스크립트를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
  return naverMapsLoadPromise;
}

/** 다른 컴포넌트(예: 위치 검색창)에서 naver.maps.Service를 쓰기 전에 스크립트 로딩을 보장하기 위해 노출 */
export function ensureNaverMapsReady(): Promise<void> {
  return loadNaverMapsScript();
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  roadAddress: string;
  jibunAddress: string;
}

/** 주소/장소명으로 검색해 좌표를 찾음 (geocoder submodule, 브라우저에서 직접 호출 가능 — 별도 서버/시크릿 불필요) */
export function geocodeAddress(query: string): Promise<GeocodeResult[]> {
  return ensureNaverMapsReady().then(
    () =>
      new Promise((resolve, reject) => {
        const naverNs = window.naver;
        if (!naverNs?.maps?.Service) {
          reject(new Error("주소 검색 기능을 사용할 수 없습니다. (geocoder submodule 로드 실패)"));
          return;
        }

        // NCP 콘솔에서 Geocoding이 비활성화되어 있거나 도메인이 등록되지 않은 경우,
        // SDK 콜백이 아예 호출되지 않을 수 있어 타임아웃으로 방어
        let settled = false;
        const timeoutId = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error("주소 검색 응답이 없습니다. NCP 콘솔에서 Geocoding이 활성화되어 있는지, 이 도메인이 등록되어 있는지 확인해주세요."));
        }, 8000);

        naverNs.maps.Service.geocode({ query }, (status, response) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);

          console.log("[naver geocode] status:", status, "response:", response);

          if (status !== naverNs.maps.Service.Status.OK) {
            reject(
              new Error(
                `네이버 지도 검색 요청이 실패했습니다 (status: ${status}). NCP 콘솔에서 이 애플리케이션에 Geocoding이 활성화되어 있는지, 이 도메인이 서비스 URL로 등록되어 있는지 확인해주세요.`
              )
            );
            return;
          }
          if (response.v2.status !== "OK" || !response.v2.addresses || response.v2.addresses.length === 0) {
            const reason = response.v2.errorMessage ? ` (사유: ${response.v2.errorMessage})` : "";
            reject(
              new Error(
                `검색 결과가 없습니다${reason}. 정확한 도로명 주소나 지번 주소로 검색해보세요 (건물명·상호명 검색은 아직 지원되지 않습니다).`
              )
            );
            return;
          }
          resolve(
            response.v2.addresses.map(a => ({
              lat: parseFloat(a.y),
              lng: parseFloat(a.x),
              roadAddress: a.roadAddress,
              jibunAddress: a.jibunAddress,
            }))
          );
        });
      })
  );
}

/** 좌표로 주소를 역변환 (지도를 클릭/드래그해 고른 위치를 사람이 읽을 수 있는 주소로 보여줄 때 사용) */
export function reverseGeocodeToAddress(lat: number, lng: number): Promise<string | null> {
  return ensureNaverMapsReady().then(
    () =>
      new Promise((resolve) => {
        const naverNs = window.naver;
        if (!naverNs?.maps?.Service) {
          resolve(null);
          return;
        }
        naverNs.maps.Service.reverseGeocode({ coords: new naverNs.maps.LatLng(lat, lng) }, (status, response) => {
          if (status !== naverNs.maps.Service.Status.OK) {
            resolve(null);
            return;
          }
          const addr = response.v2.address;
          resolve(addr.roadAddress || addr.jibunAddress || null);
        });
      })
  );
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title?: string;
  draggable?: boolean;
}

interface MapViewProps {
  className?: string;
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  /** 지도에 표시할 마커 목록 (부모 컴포넌트가 상태를 소유하는 controlled 방식) */
  markers?: MapMarker[];
  /** 지도를 클릭했을 때 (예: 새 마커를 추가하고 싶을 때 사용) */
  onMapClick?: (lat: number, lng: number) => void;
  /** 마커를 클릭했을 때 */
  onMarkerClick?: (id: string) => void;
  /** 마커의 정보창에서 "삭제"를 눌렀을 때 (전달하지 않으면 삭제 버튼이 표시되지 않음) */
  onMarkerDelete?: (id: string) => void;
  /** 마커를 드래그로 이동시켰을 때 */
  onMarkerDragEnd?: (id: string, lat: number, lng: number) => void;
  /** 지도(naver.maps.Map) 인스턴스가 준비되면 직접 제어할 수 있도록 전달 */
  onMapReady?: (map: naver.maps.Map) => void;
  /** true면 markers 배열이 모두 보이도록 지도 범위를 자동으로 맞춤 */
  fitToMarkers?: boolean;
  /** "내 위치" 버튼 노출 여부 (기본 true) */
  showCurrentLocationButton?: boolean;
}

export function MapView({
  className,
  initialCenter = { lat: 37.5665, lng: 126.978 }, // 서울시청 기본값
  initialZoom = 14,
  markers = [],
  onMapClick,
  onMarkerClick,
  onMarkerDelete,
  onMarkerDragEnd,
  onMapReady,
  fitToMarkers = false,
  showCurrentLocationButton = true,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const markerObjsRef = useRef<globalThis.Map<string, naver.maps.Marker>>(new globalThis.Map());
  const currentLocationMarkerRef = useRef<naver.maps.Marker | null>(null);
  const infoWindowRef = useRef<naver.maps.InfoWindow | null>(null);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [locating, setLocating] = useState(false);

  // 최신 콜백을 ref로 보관해 지도/마커 리스너를 매번 다시 붙이지 않도록 함
  const callbacksRef = useRef({ onMapClick, onMarkerClick, onMarkerDelete, onMarkerDragEnd });
  callbacksRef.current = { onMapClick, onMarkerClick, onMarkerDelete, onMarkerDragEnd };

  // 지도 최초 생성 (마운트 시 1회)
  useEffect(() => {
    let cancelled = false;

    loadNaverMapsScript()
      .then(() => {
        if (cancelled || !mapContainer.current || !window.naver) return;
        const naverNs = window.naver;

        if (!naverNs.maps) {
          // 스크립트 요청 자체는 성공(200)했지만 naver.maps가 비어있는 경우 →
          // 대부분 현재 도메인이 NCP 콘솔의 "서비스 URL"에 등록되어 있지 않은 경우입니다.
          throw new Error(
            `네이버 지도 인증에 실패했습니다. NCP 콘솔에서 이 주소(${window.location.origin})가 Maps 애플리케이션의 서비스 URL로 등록되어 있는지 확인해주세요.`
          );
        }

        const map = new naverNs.maps.Map(mapContainer.current, {
          center: new naverNs.maps.LatLng(initialCenter.lat, initialCenter.lng),
          zoom: initialZoom,
          zoomControl: true,
          zoomControlOptions: { position: naverNs.maps.Position.TOP_RIGHT },
          scrollWheel: true,
          draggable: true,
        });
        mapRef.current = map;

        naverNs.maps.Event.addListener(map, "click", (e: naver.maps.PointerEvent) => {
          const coord = e.coord as naver.maps.LatLng;
          callbacksRef.current.onMapClick?.(coord.lat(), coord.lng());
        });

        setStatus("ready");
        onMapReady?.(map);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        console.error(err);
        setErrorMessage(err.message || "지도를 불러오지 못했습니다.");
        setStatus("error");
      });

    return () => {
      cancelled = true;
      // 네이버 지도 SDK는 내부 리스너가 정리되기 전 상태에서 destroy()가 호출되면
      // 내부적으로 예외를 던지는 경우가 있어(SDK 자체 버그), 언마운트 시 앱이
      // 죽지 않도록 각 정리 단계를 개별적으로 안전하게 처리합니다.
      try {
        markerObjsRef.current.forEach(m => m.setMap(null));
      } catch { /* noop */ }
      markerObjsRef.current.clear();
      try {
        currentLocationMarkerRef.current?.setMap(null);
      } catch { /* noop */ }
      try {
        infoWindowRef.current?.close();
      } catch { /* noop */ }
      try {
        mapRef.current?.destroy();
      } catch { /* noop */ }
      mapRef.current = null;
    };
    // 최초 마운트 시에만 지도를 생성합니다 (initialCenter/initialZoom 변경은 이후 반영되지 않음).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // markers prop과 실제 naver.maps.Marker 인스턴스 동기화 (추가/이동/삭제)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver || status !== "ready") return;
    const naverNs = window.naver;

    const incomingIds = new Set(markers.map(m => m.id));
    markerObjsRef.current.forEach((markerObj, id) => {
      if (!incomingIds.has(id)) {
        markerObj.setMap(null);
        markerObjsRef.current.delete(id);
      }
    });

    markers.forEach(m => {
      const position = new naverNs.maps.LatLng(m.lat, m.lng);
      let markerObj = markerObjsRef.current.get(m.id);

      if (!markerObj) {
        markerObj = new naverNs.maps.Marker({
          map,
          position,
          title: m.title,
          draggable: m.draggable !== false,
        });
        markerObjsRef.current.set(m.id, markerObj);

        naverNs.maps.Event.addListener(markerObj, "click", () => {
          callbacksRef.current.onMarkerClick?.(m.id);

          infoWindowRef.current?.close();
          const content = document.createElement("div");
          content.style.cssText = "padding:10px 14px;min-width:140px;font-family:inherit;";
          const titleEl = document.createElement("p");
          titleEl.style.cssText = "font-weight:700;font-size:13px;margin:0 0 6px;color:#1f2937;";
          titleEl.textContent = m.title || "선택한 위치";
          content.appendChild(titleEl);

          if (callbacksRef.current.onMarkerDelete) {
            const delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.textContent = "마커 삭제";
            delBtn.style.cssText =
              "font-size:12px;color:#ef4444;background:none;border:none;cursor:pointer;padding:0;text-decoration:underline;";
            delBtn.onclick = () => {
              infoWindowRef.current?.close();
              callbacksRef.current.onMarkerDelete?.(m.id);
            };
            content.appendChild(delBtn);
          }

          const infoWindow = new naverNs.maps.InfoWindow({
            content,
            backgroundColor: "#fff",
            borderColor: "#e5e7eb",
            borderWidth: 1,
          });
          infoWindow.open(map, markerObj!);
          infoWindowRef.current = infoWindow;
        });

        naverNs.maps.Event.addListener(markerObj, "dragend", (e: naver.maps.PointerEvent) => {
          const coord = e.coord as naver.maps.LatLng;
          callbacksRef.current.onMarkerDragEnd?.(m.id, coord.lat(), coord.lng());
        });
      } else {
        markerObj.setPosition(position);
        markerObj.setTitle(m.title || "");
        markerObj.setDraggable(m.draggable !== false);
      }
    });

    if (fitToMarkers && markers.length > 0) {
      if (markers.length === 1) {
        map.setCenter(new naverNs.maps.LatLng(markers[0].lat, markers[0].lng));
        // 검색 등으로 멀리 줌아웃된 상태에서 위치를 옮긴 경우, 알아볼 수 있는 수준까지는 확대
        if (map.getZoom() < 15) map.setZoom(16);
      } else {
        const bounds = new naverNs.maps.LatLngBounds(
          new naverNs.maps.LatLng(markers[0].lat, markers[0].lng),
          new naverNs.maps.LatLng(markers[0].lat, markers[0].lng)
        );
        markers.forEach(m => bounds.extend(new naverNs.maps.LatLng(m.lat, m.lng)));
        map.fitBounds(bounds);
      }
    }
  }, [markers, fitToMarkers, status]);

  const handleLocateMe = useCallback(() => {
    const map = mapRef.current;
    const naverNs = window.naver;
    if (!map || !naverNs) return;

    if (!navigator.geolocation) {
      toast.error("이 브라우저에서는 위치 정보를 사용할 수 없습니다.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        const position = new naverNs.maps.LatLng(latitude, longitude);
        map.morph(position, Math.max(map.getZoom(), 15));

        if (currentLocationMarkerRef.current) {
          currentLocationMarkerRef.current.setPosition(position);
        } else {
          currentLocationMarkerRef.current = new naverNs.maps.Marker({
            map,
            position,
            title: "현재 위치",
            clickable: false,
            zIndex: 200,
            icon: {
              content:
                '<div style="width:16px;height:16px;border-radius:50%;background:#4285F4;border:3px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.4);"></div>',
              anchor: new naverNs.maps.Point(8, 8),
            },
          });
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
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/80">
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
          className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-white shadow-lg border border-border flex items-center justify-center text-primary hover:bg-secondary transition-colors disabled:opacity-60"
        >
          {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}

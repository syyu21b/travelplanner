import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, X } from "lucide-react";
import { MapView, type MapMarker } from "@/components/Map";

interface LocationPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLat?: number;
  initialLng?: number;
  title?: string;
  onConfirm: (lat: number, lng: number) => void;
}

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 서울시청

export function LocationPickerDialog({
  open,
  onOpenChange,
  initialLat,
  initialLng,
  title = "지도에서 위치 선택",
  onConfirm,
}: LocationPickerDialogProps) {
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(
    initialLat !== undefined && initialLng !== undefined ? { lat: initialLat, lng: initialLng } : null
  );

  // 다이얼로그를 열 때마다 초기 위치로 리셋
  useEffect(() => {
    if (open) {
      setPicked(initialLat !== undefined && initialLng !== undefined ? { lat: initialLat, lng: initialLng } : null);
    }
  }, [open, initialLat, initialLng]);

  const markers: MapMarker[] = picked
    ? [{ id: "picked", lat: picked.lat, lng: picked.lng, title: "선택한 위치", draggable: true }]
    : [];

  const handleConfirm = () => {
    if (!picked) return;
    onConfirm(picked.lat, picked.lng);
    onOpenChange(false);
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
          <p className="text-xs text-muted-foreground">
            지도를 클릭해 위치를 지정하세요. 마커를 드래그해 위치를 조정하거나, 마커를 클릭해 삭제할 수 있습니다.
          </p>
          <MapView
            className="h-[400px]"
            initialCenter={picked ?? DEFAULT_CENTER}
            initialZoom={picked ? 16 : 12}
            markers={markers}
            onMapClick={(lat, lng) => setPicked({ lat, lng })}
            onMarkerDragEnd={(_id, lat, lng) => setPicked({ lat, lng })}
            onMarkerDelete={() => setPicked(null)}
          />
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {picked ? (
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <MapPin className="w-4 h-4 text-primary" />
                  {picked.lat.toFixed(6)}, {picked.lng.toFixed(6)}
                </span>
              ) : (
                "아직 선택된 위치가 없습니다."
              )}
            </p>
            {picked && (
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="text-xs text-red-500 hover:underline flex items-center gap-1"
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

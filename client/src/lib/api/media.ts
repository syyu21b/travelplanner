import { ApiError } from "../api";

export type MediaKind = "diary-photo" | "diary-block" | "plan-cover" | "album-photo" | "profile-photo";

export interface UploadResult {
  key: string;
  url: string;
}

// base64 data URL(compressImage() 결과물)을 Blob으로 변환
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

// 업로드는 raw binary body + Content-Type/X-Media-Kind 헤더로 보낸다 (JSON이 아님) —
// client/src/lib/api.ts의 범용 래퍼는 항상 JSON 바디를 가정하므로 여기서는 직접 fetch한다.
export async function uploadMedia(kind: MediaKind, blob: Blob): Promise<UploadResult> {
  const res = await fetch("/api/media/upload", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": blob.type || "application/octet-stream",
      "X-Media-Kind": kind,
    },
    body: blob,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, body);
  return body as UploadResult;
}

export async function uploadDataUrl(kind: MediaKind, dataUrl: string): Promise<UploadResult> {
  return uploadMedia(kind, await dataUrlToBlob(dataUrl));
}

export function mediaUrl(key: string | null | undefined): string | undefined {
  return key ? `/api/media/${key}` : undefined;
}

export async function deleteMedia(key: string): Promise<void> {
  await fetch(`/api/media/${key}`, { method: "DELETE", credentials: "include" });
}

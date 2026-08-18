export function mediaUrl(key: string | null | undefined): string | undefined {
  return key ? `/api/media/${key}` : undefined;
}

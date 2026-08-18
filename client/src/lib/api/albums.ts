import { api } from "../api";
import type { Album } from "@shared/types";

export const albumsApi = {
  list: () => api.get<{ albums: Album[] }>("/albums").then((r) => r.albums),
  get: (id: string) => api.get<{ album: Album }>(`/albums/${id}`).then((r) => r.album),
  create: (album: Partial<Album>) => api.post<{ album: Album }>("/albums", album).then((r) => r.album),
  update: (id: string, album: Partial<Album>) => api.put<{ album: Album }>(`/albums/${id}`, album).then((r) => r.album),
  remove: (id: string) => api.del<{ success: boolean }>(`/albums/${id}`),
};

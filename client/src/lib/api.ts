// 서버 API용 얇은 fetch 래퍼. 모든 요청은 세션 쿠키를 함께 보낸다(같은 출처이므로 CORS 불필요).

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    const message = (body && typeof body === "object" && "message" in body && typeof (body as any).message === "string")
      ? (body as any).message
      : (body && typeof body === "object" && "error" in body && typeof (body as any).error === "string")
        ? (body as any).error
        : `요청이 실패했습니다 (status: ${status})`;
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: "DELETE", body: body !== undefined ? JSON.stringify(body) : undefined }),
};

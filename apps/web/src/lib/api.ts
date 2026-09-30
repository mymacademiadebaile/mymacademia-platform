const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "production" ? "/api" : "http://localhost:4000/api")
).replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: unknown,
    message = "API request failed"
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiUrl(path: string) {
  return `${API_URL}${path}`;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);

  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store"
  });
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  let response = await request(path, init);

  // The access cookie is deliberately short lived. Renew it once and replay the
  // request so an active user is not interrupted when those 15 minutes elapse.
  if (
    response.status === 401 &&
    typeof window !== "undefined" &&
    path !== "/auth/refresh" &&
    path !== "/auth/login" &&
    path !== "/auth/logout"
  ) {
    const refreshResponse = await request("/auth/refresh", { method: "POST" });

    if (refreshResponse.ok) {
      response = await request(path, init);
    } else {
      // Surface a temporary refresh-service failure as such. Treating it as the
      // original 401 would incorrectly log a valid user out.
      response = refreshResponse;
    }
  }

  if (!response.ok) {
    const text = await response.text();
    let payload: unknown;

    try {
      payload = text ? JSON.parse(text) : undefined;
    } catch {
      payload = text;
    }

    throw new ApiError(response.status, payload);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function apiMessage(error: unknown): string {
  if (error instanceof ApiError && error.payload && typeof error.payload === "object") {
    const payload = error.payload as { message?: string; error?: string };
    return payload.message ?? payload.error ?? "No pudimos completar la operación.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "No pudimos completar la operación.";
}

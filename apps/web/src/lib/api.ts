const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "production" ? "/api" : "http://localhost:4000/api")
).replace(/\/+$/, "");

export class ApiError extends Error {
  public readonly status: number;
  public readonly payload: unknown;

  constructor(
    status: number,
    payload: unknown,
    message = "No se pudo completar la solicitud"
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
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
    && !path.startsWith("/check-in")
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

type ProfessorVideoUploadSignature = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  uploadPublicId: string;
  allowedFormats: string;
};

type CloudinaryUploadResponse = {
  public_id?: string;
  secure_url?: string;
  error?: { message?: string };
};

type AcademySpaceImageUploadSignature = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  uploadPublicId: string;
  allowedFormats: string;
};

/** Uploads the file browser → Cloudinary, so the video never crosses Vercel. */
export async function uploadProfessorIntroVideo(
  signaturePath: string,
  completionPath: string,
  file: File
): Promise<{ introVideoUrl: string }> {
  const ticket = await apiFetch<ProfessorVideoUploadSignature>(signaturePath, { method: "POST" });
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", ticket.apiKey);
  form.append("timestamp", String(ticket.timestamp));
  form.append("signature", ticket.signature);
  form.append("folder", ticket.folder);
  form.append("public_id", ticket.uploadPublicId);
  form.append("overwrite", "true");
  form.append("allowed_formats", ticket.allowedFormats);

  const uploadResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(ticket.cloudName)}/video/upload`,
    { method: "POST", body: form }
  );
  const upload = (await uploadResponse.json().catch(() => ({}))) as CloudinaryUploadResponse;

  if (!uploadResponse.ok) {
    throw new Error(upload.error?.message ?? "No pudimos cargar el video");
  }

  if (upload.public_id !== ticket.publicId) {
    throw new Error("Cloudinary devolvió un video no esperado");
  }

  return apiFetch<{ introVideoUrl: string }>(completionPath, {
    method: "POST",
    body: JSON.stringify({ publicId: ticket.publicId })
  });
}

/** Uploads a landing image directly to Cloudinary, avoiding Vercel's request-size limit. */
export async function uploadAcademySpaceImage(slot: "tall" | "wide" | "detail", file: File) {
  const ticket = await apiFetch<AcademySpaceImageUploadSignature>(
    `/admin/settings/landing-images/${slot}/signature`,
    { method: "POST" }
  );
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", ticket.apiKey);
  form.append("timestamp", String(ticket.timestamp));
  form.append("signature", ticket.signature);
  form.append("folder", ticket.folder);
  form.append("public_id", ticket.uploadPublicId);
  form.append("overwrite", "true");
  form.append("allowed_formats", ticket.allowedFormats);

  const uploadResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(ticket.cloudName)}/image/upload`,
    { method: "POST", body: form }
  );
  const upload = (await uploadResponse.json().catch(() => ({}))) as CloudinaryUploadResponse;

  if (!uploadResponse.ok) {
    throw new Error(upload.error?.message ?? "No pudimos cargar la imagen");
  }
  if (upload.public_id !== ticket.publicId || !upload.secure_url) {
    throw new Error("Cloudinary devolvió una imagen no esperada");
  }

  return apiFetch(`/admin/settings/landing-images/${slot}/complete`, {
    method: "POST",
    body: JSON.stringify({ publicId: ticket.publicId })
  });
}

export function apiMessage(error: unknown): string {
  if (error instanceof ApiError && error.payload && typeof error.payload === "object") {
    const payload = error.payload as {
      message?: string;
      error?: string;
      issues?: Array<{ message?: string }>;
    };

    const validationMessage = payload.issues?.find((issue) => issue.message)?.message;
    if (validationMessage) return validationMessage;

    return payload.message ?? "No pudimos completar la operación.";
  }

  if (error instanceof Error) {
    // Fetch and third-party providers can return English or technical errors.
    // The UI must only expose a clear Spanish message to the end user.
    return "No pudimos completar la operación. Probá nuevamente.";
  }

  return "No pudimos completar la operación.";
}

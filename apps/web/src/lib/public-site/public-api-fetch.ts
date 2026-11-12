const DEFAULT_TIMEOUT_MS = 70_000;
const RETRY_DELAY_MS = 1_000;
const TRANSIENT_STATUS_CODES = new Set([502, 503, 504]);

type PublicFetchInit = RequestInit & {
  next?: { tags?: string[]; revalidate?: number | false };
};

export type PublicApiFetchOptions = {
  timeoutMs?: number;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
};

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function isTransientNetworkError(error: unknown, callerSignal?: AbortSignal) {
  if (callerSignal?.aborted) return false;
  return error instanceof TypeError ||
    (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"));
}

function requestSignal(callerSignal: AbortSignal | null | undefined, timeoutMs: number) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
}

/**
 * Fetches read-only public data with one bounded retry for Render cold starts or
 * transient upstream failures. Validation failures and non-transient HTTP errors
 * are deliberately returned to the caller without retrying.
 */
export async function fetchPublicApi(
  url: string,
  init: PublicFetchInit = {},
  options: PublicApiFetchOptions = {}
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
  const pause = options.sleep ?? sleep;
  const path = new URL(url).pathname;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(url, { ...init, signal: requestSignal(init.signal ?? undefined, timeoutMs) });
      const shouldRetry = attempt === 0 && TRANSIENT_STATUS_CODES.has(response.status);
      if (!shouldRetry) return response;

      console.warn("[public-api] transient response; retrying once", { path, status: response.status, retryDelayMs });
    } catch (error) {
      if (attempt === 1 || !isTransientNetworkError(error, init.signal ?? undefined)) throw error;
      console.warn("[public-api] transient network failure; retrying once", { path, errorName: error instanceof Error ? error.name : "UnknownError", retryDelayMs });
    }

    await pause(retryDelayMs);
  }

  // The loop either returns a response or throws. Kept for TypeScript exhaustiveness.
  throw new Error(`Public API request exhausted retries for ${path}`);
}

export const PUBLIC_API_REQUEST_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
export const PUBLIC_API_RETRY_DELAY_MS = RETRY_DELAY_MS;

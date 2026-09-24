/**
 * Centralized API & Authentication Client for VYAPERI X.
 * Handles unified API base URL resolution, bearer token propagation, and resilient fallback.
 */

export function getApiBase(): string {
  const env = import.meta.env as Record<string, any>;
  const base =
    env["VITE_BACKEND_URL"] ||
    env["VITE_SCRAPER_API_BASE"] ||
    env["VITE_API_BASE_URL"] ||
    "http://localhost:8000";
  return String(base).replace(/\/$/, "");
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("vyepari_x_auth_token");
}

export function getAuthHeaders(
  sessionToken?: string | null,
  extraHeaders?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extraHeaders || {}),
  };

  const token = sessionToken || getStoredToken();
  if (token && token.trim() && token !== "undefined" && token !== "null") {
    headers["Authorization"] = `Bearer ${token.trim()}`;
  }

  return headers;
}

export async function apiFetch(
  endpoint: string,
  options: RequestInit = {},
  sessionToken?: string | null
): Promise<Response> {
  const base = getApiBase();
  const primary = endpoint.startsWith("http://") || endpoint.startsWith("https://")
    ? endpoint
    : `${base}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  const headers = getAuthHeaders(sessionToken, (options.headers as Record<string, string>) || {});

  // Do not override Content-Type if FormData is used
  if (options.body instanceof FormData) {
    delete headers["Content-Type"];
  }

  const mergedOptions: RequestInit = {
    ...options,
    headers,
  };

  try {
    const res = await fetch(primary, mergedOptions);
    return res;
  } catch (err) {
    // If localhost failed, attempt fallback between localhost and 127.0.0.1
    if (primary.includes("localhost:8000") || primary.includes("127.0.0.1:8000")) {
      const fallbackUrl = primary.includes("localhost:8000")
        ? primary.replace("localhost:8000", "127.0.0.1:8000")
        : primary.replace("127.0.0.1:8000", "localhost:8000");

      try {
        const fallbackRes = await fetch(fallbackUrl, mergedOptions);
        return fallbackRes;
      } catch {
        // Fall through to throw original error
      }
    }
    throw err;
  }
}

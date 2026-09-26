/**
 * Centralized API & Authentication Client for VYAPERI X.
 * Handles unified API base URL resolution, bearer token propagation, and resilient fallback.
 */

export function getApiBase(): string {
  const env = import.meta.env as Record<string, any>;
  if (typeof window === "undefined") {
    const raw = env["VITE_BACKEND_URL"] || env["VITE_SCRAPER_API_BASE"] || "http://127.0.0.1:8000";
    return String(raw).replace(/\/$/, "");
  }

  const hostname = window.location.hostname;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

  // When running in browser on developer machine
  if (isLocalhost) {
    const localBase = env["VITE_BACKEND_URL"] || env["VITE_SCRAPER_API_BASE"] || "http://localhost:8000";
    return String(localBase).replace(/\/$/, "");
  }

  // When accessed from another device on the same local Wi-Fi network (e.g. 192.168.x.x, 10.x.x.x, or .local)
  const isLan = /^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.|\.local$/.test(hostname);
  if (isLan) {
    return `http://${hostname}:8000`;
  }

  // When running on production, Vercel, Railway, Netlify, or custom domain
  const prodUrl = env["VITE_PROD_BACKEND_URL"] || "https://backend-production-4ba21.up.railway.app";
  const explicit = env["VITE_BACKEND_URL"] || env["VITE_SCRAPER_API_BASE"];
  if (explicit && (explicit.startsWith("https://") || (!explicit.includes("localhost") && !explicit.includes("127.0.0.1")))) {
    return String(explicit).replace(/\/$/, "");
  }

  return String(prodUrl).replace(/\/$/, "");
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
        // Fall through to Railway cloud fallback
      }
    }

    // Secondary fallback: if local server unreachable from another device, try Railway backend
    if (primary.includes(":8000")) {
      try {
        const cloudUrl = primary.replace(/^http:\/\/[^/]+/, "https://backend-production-4ba21.up.railway.app");
        const cloudRes = await fetch(cloudUrl, mergedOptions);
        return cloudRes;
      } catch {
        // Fall through to throw original error
      }
    }

    throw err;
  }
}

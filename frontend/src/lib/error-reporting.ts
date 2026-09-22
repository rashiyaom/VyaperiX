/**
 * Generic runtime error logging & diagnostics utility.
 */
export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);

  if (typeof process !== "undefined" && process.env && process.env["NODE_ENV"] !== "production") {
    console.error("[VYAPERI X Error Boundary]:", message, context);
  }
}

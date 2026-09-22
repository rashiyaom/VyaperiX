import { createClient } from "@supabase/supabase-js";

function cleanSupabaseUrl(url: string): string {
  let cleaned = (url || "").trim().replace(/\/+$/, "");
  if (cleaned.endsWith("/rest/v1")) {
    cleaned = cleaned.slice(0, -"/rest/v1".length).replace(/\/+$/, "");
  }
  return cleaned;
}

// Dedicated Supabase Project URL & Publishable Key
const envUrl = (import.meta.env["VITE_SUPABASE_URL"] as string) || "";
export const SUPABASE_URL: string = cleanSupabaseUrl(envUrl);

const envKey =
  (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string) ||
  (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string) ||
  "";
export const SUPABASE_PUBLISHABLE_KEY: string = envKey.trim();

export const isSupabaseConfigured =
  Boolean(SUPABASE_URL) &&
  !SUPABASE_URL.includes("your-project") &&
  Boolean(SUPABASE_PUBLISHABLE_KEY);

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "vyepari_x_auth_token",
  },
});

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn("Error fetching Supabase session:", error);
    return null;
  }
  return data.session;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    return null;
  }
  return data.user;
}

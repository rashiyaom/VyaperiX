import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useGoogleLogin } from "@react-oauth/google";
import { supabase } from "./supabase";

const API_BASE = (import.meta.env["VITE_SCRAPER_API_BASE"] as string) || "http://localhost:8000";

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  company_name?: string;
  industry?: string;
  avatar_url?: string;
  role?: string;
  onboarding_completed?: boolean;
  team_size?: string;
  use_case?: string;
  source?: string;
  updated_at?: string;
  created_at?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  signInWithGoogle: () => Promise<{ error: any }>;
  signInWithEmail: (
    email: string,
    password: string
  ) => Promise<{ user: User | null; session: Session | null; error: any }>;
  signUpWithEmail: (
    email: string,
    password: string,
    metadata?: { full_name?: string; company_name?: string; industry?: string }
  ) => Promise<{
    user: User | null;
    session: Session | null;
    error: any;
    needsVerification: boolean;
  }>;
  signOut: () => Promise<void>;
  resendVerificationEmail: (email: string) => Promise<{ error: any }>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  completeOnboarding: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch or sync user profile from MongoDB
  const fetchProfile = async (currentUser: User, explicitToken?: string) => {
    try {
      const token = explicitToken || session?.access_token || localStorage.getItem("vyepari_x_auth_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      // Query profile directly from MongoDB backend
      const res = await fetch(`${API_BASE}/api/profile?user_id=${currentUser.id}`, {
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.id) {
          setProfile(data as UserProfile);
          return;
        }
      }
    } catch (err) {
      console.warn("Could not fetch remote profile from MongoDB:", err);
    }

    // Fallback to user metadata
    const meta = (currentUser.user_metadata || {}) as Record<string, any>;
    const fallbackProfile: UserProfile = {
      id: currentUser.id,
      email: currentUser.email || "",
      full_name: (meta["full_name"] || meta["name"] || "") as string,
      company_name: (meta["company_name"] || meta["company"] || "") as string,
      industry: (meta["industry"] || "") as string,
      avatar_url: (meta["avatar_url"] || meta["picture"] || "") as string,
      role: "owner",
      onboarding_completed: Boolean(meta["onboarding_completed"]),
    };
    setProfile(fallbackProfile);

    // Sync fallback into MongoDB
    try {
      const token = explicitToken || session?.access_token || localStorage.getItem("vyepari_x_auth_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      await fetch(`${API_BASE}/api/profile?user_id=${currentUser.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(fallbackProfile),
      });
    } catch (e) {
      console.warn("Could not sync fallback profile to MongoDB:", e);
    }
  };

  // Helper to sync Google user with FastAPI /api/auth/me (resolving real Supabase UUID & profile)
  const syncGoogleUserWithBackend = async (token: string, userInfo: any) => {
    try {
      const API_BASE = (import.meta.env["VITE_SCRAPER_API_BASE"] as string) || "http://localhost:8000";
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const resolvedId = data.id || userInfo.sub;
        const resolvedProfile: UserProfile = data.profile || {
          id: resolvedId,
          email: data.email || userInfo.email,
          full_name: data.user_metadata?.full_name || data.user_metadata?.name || userInfo.name,
          company_name: data.user_metadata?.company_name || "",
          industry: data.user_metadata?.industry || "",
          avatar_url: data.user_metadata?.picture || userInfo.picture,
          role: "owner",
          onboarding_completed: true,
        };

        const resolvedUser = {
          id: resolvedId,
          email: data.email || userInfo.email,
          user_metadata: {
            full_name: resolvedProfile.full_name,
            company_name: resolvedProfile.company_name,
            industry: resolvedProfile.industry,
            picture: resolvedProfile.avatar_url,
            onboarding_completed: true,
          },
        } as unknown as User;

        setUser(resolvedUser);
        setSession({ access_token: token } as unknown as Session);
        setProfile(resolvedProfile);
        setLoading(false);
        return;
      }
    } catch (e) {
      console.warn("Could not sync Google user with backend:", e);
    }

    // Offline / fallback if backend cannot be reached
    const fallbackUser = {
      id: userInfo.sub,
      email: userInfo.email,
      user_metadata: {
        full_name: userInfo.name,
        picture: userInfo.picture,
        onboarding_completed: true,
      },
    } as unknown as User;
    setUser(fallbackUser);
    setSession({ access_token: token } as unknown as Session);
    setProfile({
      id: userInfo.sub,
      email: userInfo.email,
      full_name: userInfo.name,
      avatar_url: userInfo.picture,
      role: "owner",
      onboarding_completed: true,
    });
    setLoading(false);
  };

  useEffect(() => {
    // Check if user previously logged in via direct Google OAuth
    const authProvider = localStorage.getItem("vyepari_x_auth_provider");
    const storedToken = localStorage.getItem("vyepari_x_auth_token");
    const storedGoogleUser = localStorage.getItem("vyepari_x_google_user");

    if (authProvider === "google" && storedToken && storedGoogleUser) {
      try {
        const userInfo = JSON.parse(storedGoogleUser);
        syncGoogleUserWithBackend(storedToken, userInfo);
        return;
      } catch (e) {
        console.warn("Could not parse cached Google user info:", e);
      }
    }

    // Initial Supabase session load
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      if (localStorage.getItem("vyepari_x_auth_provider") === "google") {
        return;
      }
      if (existingSession) {
        setSession(existingSession);
        setUser(existingSession?.user ?? null);
        if (existingSession?.user) {
          fetchProfile(existingSession.user);
        }
      }
      setLoading(false);
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (localStorage.getItem("vyepari_x_auth_provider") === "google") {
        return;
      }
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        await fetchProfile(newSession.user);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Direct Google OAuth flow via @react-oauth/google (bypasses Supabase provider)
  const loginWithGoogle = useGoogleLogin({
    onSuccess: async (codeResponse) => {
      try {
        const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${codeResponse.access_token}` },
        });
        const userInfo = await res.json();

        localStorage.setItem("vyepari_x_auth_token", codeResponse.access_token);
        localStorage.setItem("vyepari_x_auth_provider", "google");
        localStorage.setItem("vyepari_x_google_user", JSON.stringify(userInfo));

        await syncGoogleUserWithBackend(codeResponse.access_token, userInfo);
      } catch (err) {
        console.error("Failed to fetch Google profile info:", err);
      }
    },
    onError: (errorResponse) => {
      console.error("Google authentication failed:", errorResponse);
    },
  });

  const signInWithGoogle = async () => {
    loginWithGoogle();
    return { error: null };
  };

  const signInWithEmail = async (email: string, password: string) => {
    localStorage.removeItem("vyepari_x_auth_provider");
    localStorage.removeItem("vyepari_x_google_user");
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (!error && data.session) {
      setSession(data.session);
      setUser(data.user);
      if (data.user) {
        await fetchProfile(data.user);
      }
    }
    return { user: data.user, session: data.session, error };
  };

  const signUpWithEmail = async (
    email: string,
    password: string,
    metadata?: { full_name?: string; company_name?: string; industry?: string }
  ) => {
    localStorage.removeItem("vyepari_x_auth_provider");
    localStorage.removeItem("vyepari_x_google_user");
    const origin = window.location.origin;
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: metadata?.full_name?.trim() || "",
          company_name: metadata?.company_name?.trim() || "",
          industry: metadata?.industry?.trim() || "",
          onboarding_completed: false,
        },
        emailRedirectTo: `${origin}/onboarding`,
      },
    });

    const needsVerification = Boolean(
      !error && data.user && (!data.session || data.user.identities?.length === 0)
    );

    if (data.session && data.user) {
      setSession(data.session);
      setUser(data.user);
      await fetchProfile(data.user);
    }

    return {
      user: data.user,
      session: data.session,
      error,
      needsVerification,
    };
  };

  const resendVerificationEmail = async (email: string) => {
    const origin = window.location.origin;
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: {
        emailRedirectTo: `${origin}/onboarding`,
      },
    });
    return { error };
  };

  const resetPassword = async (email: string) => {
    const origin = window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${origin}/login?type=recovery`,
    });
    return { error };
  };

  const completeOnboarding = async () => {
    if (!user) return;
    try {
      await supabase.auth.updateUser({
        data: { onboarding_completed: true },
      });
      const token = session?.access_token || localStorage.getItem("vyepari_x_auth_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      await fetch(`${API_BASE}/api/profile?user_id=${user.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ onboarding_completed: true }),
      });
      setProfile((prev) => (prev ? { ...prev, onboarding_completed: true } : null));
    } catch (e) {
      console.warn("Failed to update onboarding status in MongoDB:", e);
    }
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return;
    try {
      const token = session?.access_token || localStorage.getItem("vyepari_x_auth_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      await fetch(`${API_BASE}/api/profile?user_id=${user.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(updates),
      });
      setProfile((prev) => (prev ? { ...prev, ...updates } : null));
    } catch (e) {
      console.warn("Failed to update profile in MongoDB:", e);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user);
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    setUser(null);
    setSession(null);
    setProfile(null);
    localStorage.removeItem("vyepari_x_auth_token");
    localStorage.removeItem("vyepari_x_auth_provider");
    localStorage.removeItem("vyepari_x_google_user");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        isAuthenticated: Boolean(user && session),
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        resendVerificationEmail,
        resetPassword,
        completeOnboarding,
        updateProfile,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

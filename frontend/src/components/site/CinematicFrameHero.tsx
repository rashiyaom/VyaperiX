import React, { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/app/theme";
import { Sun, Moon } from "lucide-react";

const LOADING_STATUSES = [
  "making phonebook list...",
  "getting customer info...",
  "enriching lead radar...",
  "calibrating voice fleet...",
  "system ready",
];

export function CinematicFrameHero() {
  const { theme, setTheme } = useTheme();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const lightVideoRef = useRef<HTMLVideoElement | null>(null);
  const darkVideoRef = useRef<HTMLVideoElement | null>(null);

  // Active theme state with instant client storage fallback
  const [currentTheme, setCurrentTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("vyaperi_theme");
      if (saved === "dark" || saved === "light") return saved;
      if (document.documentElement.classList.contains("dark")) return "dark";
    }
    return theme === "dark" ? "dark" : "light";
  });

  // Premium Preloader State
  const [isLoading, setIsLoading] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  const [statusIndex, setStatusIndex] = useState(0);
  const [progress, setProgress] = useState(18);
  const [videoReady, setVideoReady] = useState(false);

  // Sync external theme changes
  useEffect(() => {
    if (theme === "dark" || theme === "light") {
      setCurrentTheme(theme);
    }
  }, [theme]);

  // Video ready detection
  const handleVideoLoaded = () => {
    setVideoReady(true);
  };

  // Fast preloader exit: dismiss immediately when frame/video is ready (max 350ms instead of 3.5s)
  useEffect(() => {
    const timer = setTimeout(() => {
      setProgress(100);
      setIsExiting(true);
      setTimeout(() => setIsLoading(false), 250);
    }, 350);

    return () => clearTimeout(timer);
  }, [videoReady]);

  // Frame-accurate hardware video synchronization
  useEffect(() => {
    const lightVideo = lightVideoRef.current;
    const darkVideo = darkVideoRef.current;
    if (!lightVideo || !darkVideo) return;

    // Start playing active video immediately
    const activeVideo = currentTheme === "light" ? lightVideo : darkVideo;
    activeVideo.play().catch(() => {});

    // Idle background warm-up of the alternate theme video after initial paint
    const idleTimer = setTimeout(() => {
      const inactiveVideo = currentTheme === "light" ? darkVideo : lightVideo;
      if (inactiveVideo && inactiveVideo.preload === "none") {
        inactiveVideo.preload = "auto";
      }
    }, 1800);

    // Strict time alignment so transitions occur at the exact same millisecond
    const syncVideos = () => {
      if (Math.abs(lightVideo.currentTime - darkVideo.currentTime) > 0.04) {
        if (currentTheme === "light") {
          darkVideo.currentTime = lightVideo.currentTime;
        } else {
          lightVideo.currentTime = darkVideo.currentTime;
        }
      }
    };

    const syncInterval = setInterval(syncVideos, 300);

    return () => {
      clearTimeout(idleTimer);
      clearInterval(syncInterval);
    };
  }, [currentTheme]);

  // Instant seamless lighting crossfade trigger
  const handleToggle = () => {
    const newTarget = currentTheme === "light" ? "dark" : "light";
    setCurrentTheme(newTarget);
    setTheme(newTarget);

    const light = lightVideoRef.current;
    const dark = darkVideoRef.current;
    const targetVideo = newTarget === "dark" ? dark : light;
    const currentVideo = newTarget === "dark" ? light : dark;

    if (targetVideo && currentVideo) {
      if (targetVideo.preload === "none") {
        targetVideo.preload = "auto";
        targetVideo.load();
      }
      targetVideo.currentTime = currentVideo.currentTime;
      targetVideo.play().catch(() => {});
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-screen min-h-[100dvh] overflow-hidden select-none transition-colors duration-500 ${
        currentTheme === "dark" ? "bg-black" : "bg-[#f5f5f7]"
      }`}
    >
      {/* ── PURE BLACK UIVERSE KINETIC PRELOADER OVERLAY ── */}
      {isLoading && (
        <div
          className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black select-none transition-all duration-700 ease-out ${
            isExiting ? "opacity-0 scale-105 pointer-events-none" : "opacity-100 scale-100"
          }`}
        >
          {/* Kinetic Ball Wheel */}
          <div className="uiverse-main mb-8">
            <div className="up">
              <div className="uiverse-loaders">
                <div className="uiverse-loader" />
                <div className="uiverse-loader" />
                <div className="uiverse-loader" />
                <div className="uiverse-loader" />
                <div className="uiverse-loader" />
                <div className="uiverse-loader" />
                <div className="uiverse-loader" />
                <div className="uiverse-loader" />
                <div className="uiverse-loader" />
                <div className="uiverse-loader" />
              </div>
              <div className="uiverse-loadersB">
                <div className="uiverse-loaderA">
                  <div className="uiverse-ball0" />
                </div>
                <div className="uiverse-loaderA">
                  <div className="uiverse-ball1" />
                </div>
                <div className="uiverse-loaderA">
                  <div className="uiverse-ball2" />
                </div>
                <div className="uiverse-loaderA">
                  <div className="uiverse-ball3" />
                </div>
                <div className="uiverse-loaderA">
                  <div className="uiverse-ball4" />
                </div>
                <div className="uiverse-loaderA">
                  <div className="uiverse-ball5" />
                </div>
                <div className="uiverse-loaderA">
                  <div className="uiverse-ball6" />
                </div>
                <div className="uiverse-loaderA">
                  <div className="uiverse-ball7" />
                </div>
                <div className="uiverse-loaderA">
                  <div className="uiverse-ball8" />
                </div>
              </div>
            </div>
          </div>

          {/* Minimal Title Only */}
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[0.4em] text-white uppercase select-none drop-shadow-[0_2px_20px_rgba(255,255,255,0.2)]">
            VYEPARI X
          </h1>

          {/* Ultra-Fine Minimal Progress Bar */}
          <div className="w-36 sm:w-48 h-[1.5px] bg-white/10 rounded-full mt-5 overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-lime via-white to-violet transition-all duration-300 ease-out shadow-[0_0_8px_rgba(214,255,68,0.7)]"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Very Small Micro-Status Ticker */}
          <div className="flex items-center gap-2 mt-3.5 h-5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-lime animate-pulse" />
            <p className="text-[10px] sm:text-[11px] font-mono tracking-widest text-neutral-400 lowercase transition-all duration-300">
              {LOADING_STATUSES[statusIndex]}
            </p>
          </div>
        </div>
      )}

      {/* ── HARDWARE-ACCELERATED 2K LIGHT MODE VIDEO STREAM ── */}
      <video
        ref={lightVideoRef}
        src="/videos/hero_light_2k.mp4"
        poster="/videos/hero_light_poster.webp"
        playsInline
        muted
        loop
        autoPlay
        preload={currentTheme === "light" ? "auto" : "none"}
        onLoadedData={handleVideoLoaded}
        onCanPlay={handleVideoLoaded}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out pointer-events-none will-change-transform ${
          currentTheme === "light" ? "opacity-100 z-10" : "opacity-0 z-0"
        }`}
      />

      {/* ── HARDWARE-ACCELERATED 2K DARK MODE VIDEO STREAM ── */}
      <video
        ref={darkVideoRef}
        src="/videos/hero_dark_2k.mp4"
        poster="/videos/hero_dark_poster.webp"
        playsInline
        muted
        loop
        autoPlay
        preload={currentTheme === "dark" ? "auto" : "none"}
        onLoadedData={handleVideoLoaded}
        onCanPlay={handleVideoLoaded}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out pointer-events-none will-change-transform ${
          currentTheme === "dark" ? "opacity-100 z-10" : "opacity-0 z-0"
        }`}
      />

      {/* ── MINIMAL FLOATING LIGHT / DARK TOGGLE ── */}
      <div className="absolute top-6 right-6 z-50">
        <button
          onClick={handleToggle}
          title={currentTheme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          aria-label="Toggle theme mode"
          className={`group relative flex items-center justify-center h-12 w-12 rounded-full backdrop-blur-2xl transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer ${
            currentTheme === "dark"
              ? "bg-black/40 border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.5)] hover:border-white/40 hover:bg-black/60"
              : "bg-white/80 border border-black/15 shadow-[0_8px_32px_rgba(0,0,0,0.12)] hover:border-black/30 hover:bg-white/95"
          }`}
        >
          {/* Subtle Ambient Glow */}
          <div
            className={`absolute inset-0 rounded-full transition-opacity duration-500 blur-md ${
              currentTheme === "dark"
                ? "bg-cyan-500/25 group-hover:bg-cyan-500/40"
                : "bg-amber-400/25 group-hover:bg-amber-400/40"
            }`}
          />

          {/* Minimal Icon with Smooth Rotation */}
          <div className="relative z-10 transition-transform duration-500 group-hover:rotate-45">
            {currentTheme === "dark" ? (
              <Moon className="h-5 w-5 text-cyan-300 transition-colors drop-shadow-[0_0_8px_rgba(103,232,249,0.8)]" />
            ) : (
              <Sun className="h-5 w-5 text-amber-500 transition-colors drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
            )}
          </div>
        </button>
      </div>

      {/* ── MINIMAL SUBTLE BOTTOM SCROLL INDICATOR ── */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
        <button
          onClick={() => {
            const el = document.getElementById("platform-content");
            if (el) el.scrollIntoView({ behavior: "smooth" });
          }}
          className={`flex flex-col items-center gap-1.5 opacity-70 hover:opacity-100 transition-all cursor-pointer ${
            currentTheme === "dark" ? "text-white/80 hover:text-white" : "text-neutral-900/80 hover:text-neutral-950"
          }`}
          aria-label="Scroll to platform overview"
        >
          <span className="text-[9px] font-mono tracking-widest uppercase font-bold">Scroll</span>
          <div
            className={`h-6 w-3.5 rounded-full border flex items-start justify-center p-0.5 ${
              currentTheme === "dark" ? "border-white/50" : "border-neutral-900/50"
            }`}
          >
            <div
              className={`h-1.5 w-1 rounded-full animate-bounce ${
                currentTheme === "dark" ? "bg-white" : "bg-neutral-900"
              }`}
            />
          </div>
        </button>
      </div>
    </div>
  );
}

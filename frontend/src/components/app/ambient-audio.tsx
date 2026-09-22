import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Volume2, VolumeX, Play, Pause, Radio, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";

/**
 * Ambient background audio controller for "Spark.mp3".
 * - Only active for unauthenticated visitors.
 * - Disables and stops immediately when a user is logged in.
 */
export function AmbientAudioPlayer() {
  const { isAuthenticated } = useAuth();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.55);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // When user is authenticated / logged in, stop audio completely and do not mount listeners
    if (isAuthenticated) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
      setIsPlaying(false);
      return;
    }

    setMounted(true);

    const audio = new Audio("/Spark.mp3");
    audio.loop = true;
    audio.volume = 0.55;
    audio.preload = "auto";
    audio.autoplay = true;
    audioRef.current = audio;

    // 1. Immediate unmuted play attempt
    const attemptUnmutedPlay = () => {
      audio
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          // If browser policy blocked unmuted autoplay, start in muted mode immediately
          // and unmute on the very first touch/scroll/click
          audio.muted = true;
          audio
            .play()
            .then(() => {
              setIsPlaying(true);
            })
            .catch(() => {});
        });
    };

    attemptUnmutedPlay();

    // 2. Multi-gesture aggressive trigger: unmute + ensure play on ANY micro-action
    const triggerAudioOnInteraction = () => {
      if (audio) {
        audio.muted = false;
        audio.volume = 0.55;
        if (audio.paused) {
          audio
            .play()
            .then(() => setIsPlaying(true))
            .catch(() => {});
        } else {
          setIsPlaying(true);
        }
      }
      cleanup();
    };

    const cleanup = () => {
      window.removeEventListener("pointerdown", triggerAudioOnInteraction);
      window.removeEventListener("touchstart", triggerAudioOnInteraction);
      window.removeEventListener("touchend", triggerAudioOnInteraction);
      window.removeEventListener("scroll", triggerAudioOnInteraction);
      window.removeEventListener("wheel", triggerAudioOnInteraction);
      window.removeEventListener("keydown", triggerAudioOnInteraction);
      window.removeEventListener("click", triggerAudioOnInteraction);
    };

    window.addEventListener("pointerdown", triggerAudioOnInteraction, {
      passive: true,
      once: true,
    });
    window.addEventListener("touchstart", triggerAudioOnInteraction, { passive: true, once: true });
    window.addEventListener("touchend", triggerAudioOnInteraction, { passive: true, once: true });
    window.addEventListener("scroll", triggerAudioOnInteraction, { passive: true, once: true });
    window.addEventListener("wheel", triggerAudioOnInteraction, { passive: true, once: true });
    window.addEventListener("keydown", triggerAudioOnInteraction, { passive: true, once: true });
    window.addEventListener("click", triggerAudioOnInteraction, { passive: true, once: true });

    audio.onplay = () => setIsPlaying(true);
    audio.onpause = () => setIsPlaying(false);

    return () => {
      cleanup();
      audio.pause();
      audio.currentTime = 0;
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  const togglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.muted = false;
      audioRef.current.volume = volume;
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  };

  const toggleMute = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsMuted((m) => !m);
  };

  if (isAuthenticated || !mounted || typeof document === "undefined") {
    return null;
  }

  const content = (
    <aside
      aria-label="Ambient background track player"
      className="fixed bottom-3 sm:bottom-4 z-[9990] flex items-center select-none"
      style={{
        left: "var(--audio-left, 50%)",
        right: "var(--audio-right, auto)",
        transform: "var(--audio-transform, translateX(-50%))",
      }}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <style>{`
        @media (min-width: 640px) {
          .fixed[aria-label="Ambient background track player"] {
            --audio-left: auto !important;
            --audio-right: 16px !important;
            --audio-transform: none !important;
          }
        }
      `}</style>
      <div
        className={`flex items-center gap-2 border-2 bg-card/95 px-3 py-1.5 sm:px-3 sm:py-2 shadow-2xl backdrop-blur-md transition-all duration-300 rounded-none shrink-0 ${
          isPlaying
            ? "border-violet ring-1 ring-violet/50 shadow-[0_4px_20px_rgba(139,92,246,0.35)]"
            : "border-ink/60"
        }`}
      >
        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          title={isPlaying ? "Pause Ambient Music" : "Play Ambient Music (Spark.mp3)"}
          className="flex h-7 w-7 items-center justify-center border border-neutral-800 bg-neutral-950 text-neutral-100 hover:bg-violet hover:border-violet transition-all active:scale-95 shadow-sm shrink-0"
        >
          {isPlaying ? (
            <Pause className="h-3.5 w-3.5 text-lime" />
          ) : (
            <Play className="h-3.5 w-3.5 text-lime ml-0.5" />
          )}
        </button>

        {/* Track Label & Animated Equalizer */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 font-mono text-[10px] sm:text-xs font-bold text-ink whitespace-nowrap">
            <Radio
              className={`h-3 w-3 ${isPlaying ? "text-emerald-700 dark:text-lime live-dot" : "text-muted-foreground"}`}
            />
            <span>{isPlaying ? "Spark.mp3" : "Spark (Paused)"}</span>
          </div>

          {/* Dynamic Audio Equalizer Bars */}
          <div className="flex items-end gap-[2px] h-3.5 px-0.5">
            {[0.4, 0.9, 0.6, 1.0, 0.5, 0.8].map((scale, i) => (
              <span
                key={i}
                className="w-[2.5px] bg-emerald-600 dark:bg-lime origin-bottom rounded-none"
                style={{
                  height: isPlaying ? "100%" : "3px",
                  animation: isPlaying ? `wave-bar 0.${5 + (i % 4)}s ease-in-out infinite` : "none",
                  animationDelay: `${i * 90}ms`,
                  opacity: isPlaying ? 1 : 0.35,
                }}
              />
            ))}
          </div>
        </div>

        {/* Mute & Volume Control */}
        <div className="flex items-center gap-1.5 border-l border-ink/20 pl-2">
          <button
            onClick={toggleMute}
            className="text-muted-foreground hover:text-ink transition-colors p-1"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="h-3.5 w-3.5 text-danger" />
            ) : (
              <Volume2 className="h-3.5 w-3.5 text-ink" />
            )}
          </button>

          {/* Desktop Hover Volume Slider */}
          {isExpanded && (
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                setVolume(Number(e.target.value));
                if (isMuted) setIsMuted(false);
              }}
              className="hidden sm:block w-16 accent-violet cursor-pointer h-1.5 bg-ink/20 rounded-none transition-all"
              title="Volume"
            />
          )}
        </div>
      </div>
    </aside>
  );

  return createPortal(content, document.body);
}

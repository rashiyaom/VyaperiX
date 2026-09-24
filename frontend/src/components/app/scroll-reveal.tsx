import { useEffect, useRef, useState, type ReactNode } from "react";

interface ScrollRevealProps {
  children: ReactNode;
  variant?: "fade-up" | "fade-down" | "fade-left" | "fade-right" | "zoom-in" | "fade";
  delay?: number; // ms
  duration?: number; // ms
  className?: string;
  threshold?: number;
  once?: boolean;
}

/**
 * High-performance scroll-triggered reveal animation using IntersectionObserver.
 */
export function ScrollReveal({
  children,
  variant = "fade-up",
  delay = 0,
  duration = 500,
  className = "",
  threshold = 0.01,
  once = true,
}: ScrollRevealProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry && entry.isIntersecting) {
          setIsVisible(true);
          if (once) observer.unobserve(el);
        } else if (!once) {
          setIsVisible(false);
        }
      },
      {
        threshold,
        rootMargin: "50px 0px 50px 0px",
      },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, once]);

  // Initial vs Visible Transform Styles
  const getTransforms = () => {
    switch (variant) {
      case "fade-up":
        return isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10";
      case "fade-down":
        return isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-10";
      case "fade-left":
        return isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-12";
      case "fade-right":
        return isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-12";
      case "zoom-in":
        return isVisible ? "opacity-100 scale-100" : "opacity-0 scale-90";
      case "fade":
      default:
        return isVisible ? "opacity-100" : "opacity-0";
    }
  };

  return (
    <div
      ref={ref}
      className={`transition-all ${getTransforms()} ${className}`}
      style={{
        transitionDuration: `${duration}ms`,
        transitionDelay: `${delay}ms`,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        willChange: "transform, opacity",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Top-of-page neon scroll progress bar.
 */
export function ScrollProgressBar() {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (totalScroll > 0) {
        const currentProgress = (window.scrollY / totalScroll) * 100;
        setScrollProgress(currentProgress);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 h-[3px] bg-transparent z-[100] pointer-events-none">
      <div
        className="h-full bg-gradient-to-r from-violet via-lime to-violet shadow-[0_0_8px_rgba(214,255,68,0.8)] transition-all duration-75 ease-out"
        style={{ width: `${scrollProgress}%` }}
      />
    </div>
  );
}

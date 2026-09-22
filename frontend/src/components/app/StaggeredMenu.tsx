import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "@tanstack/react-router";
import { ArrowUpRight, Radio, X } from "lucide-react";
import { Logo } from "@/components/site/Chrome";
import { LangSwitcher, useLang } from "@/components/app/lang";
import { ThemeToggle } from "@/components/app/theme";

export interface MenuItem {
  label: string;
  link: string;
  ariaLabel?: string | undefined;
  badge?: string | undefined;
  group?: string | undefined;
}

export interface SocialItem {
  label: string;
  link: string;
}

export interface StaggeredMenuProps {
  position?: "left" | "right";
  items: MenuItem[];
  socialItems?: SocialItem[];
  displaySocials?: boolean;
  displayItemNumbering?: boolean;
  menuButtonColor?: string;
  openMenuButtonColor?: string;
  changeMenuColorOnOpen?: boolean;
  colors?: string[];
  logoUrl?: string;
  accentColor?: string;
  isDashboard?: boolean;
  onMenuOpen?: () => void;
  onMenuClose?: () => void;
}

export default function StaggeredMenu({
  position = "right",
  items,
  socialItems = [
    { label: "Twitter / X", link: "https://twitter.com" },
    { label: "LinkedIn", link: "https://linkedin.com" },
    { label: "GitHub", link: "https://github.com" },
  ],
  displaySocials = true,
  displayItemNumbering = true,
  menuButtonColor = "#000000",
  openMenuButtonColor = "#ffffff",
  changeMenuColorOnOpen = true,
  colors = ["#8B5CF6", "#0D0E14"],
  accentColor = "#d6ff44",
  isDashboard = false,
  onMenuOpen,
  onMenuClose,
}: StaggeredMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { t } = useLang();
  const location = useLocation();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close menu on route navigation
  useEffect(() => {
    if (isOpen) {
      setIsOpen(false);
      onMenuClose?.();
    }
  }, [location.pathname]);

  // Lock body scrolling when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const toggleMenu = () => {
    if (isOpen) {
      setIsOpen(false);
      onMenuClose?.();
    } else {
      setIsOpen(true);
      onMenuOpen?.();
    }
  };

  const closeMenu = () => {
    setIsOpen(false);
    onMenuClose?.();
  };

  // Drawer Content rendered directly via createPortal to bypass any parent overflow/stacking issues
  const drawerContent =
    isOpen && mounted ? (
      <div
        className="fixed inset-0 z-[99999] h-[100dvh] w-screen overflow-hidden pointer-events-auto select-none"
        style={{ isolation: "isolate" }}
      >
        {/* Backdrop Layer 1 (Accent Violet Curtain) */}
        <div
          className="absolute inset-0 transition-transform duration-300 ease-out"
          style={{
            backgroundColor: colors[0] || "#8B5CF6",
            zIndex: 1,
          }}
        />

        {/* Backdrop Layer 2 (Main Dark Cyber Curtain) */}
        <div className="absolute inset-0 z-10 flex flex-col justify-between overflow-y-auto p-4 sm:p-8 bg-[#0D0E14] text-[#f6f6f6]">
          {/* Top Header inside Drawer */}
          <div className="flex items-center justify-between border-b border-white/15 pb-3 sm:pb-4 shrink-0">
            <Logo />
            <div className="flex items-center gap-2">
              <ThemeToggle className="p-1 text-white border-white/30" />
              <LangSwitcher />
              <button
                onClick={closeMenu}
                className="flex h-9 w-9 items-center justify-center border-2 border-lime bg-lime text-lime-foreground font-black hover:bg-white hover:text-black transition-all active:scale-95 shadow"
                aria-label="Close menu"
              >
                <X className="h-5 w-5 stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* Menu Items List */}
          <div className="my-auto py-6 space-y-4 max-w-xl w-full mx-auto">
            <div className="label-mono text-[10px] text-lime font-bold tracking-widest flex items-center gap-2">
              <Radio className="h-3 w-3 live-dot" />
              <span>{isDashboard ? "SALES CONSOLE DIRECTORY" : "EXPLORE PLATFORM"}</span>
            </div>

            <nav className="space-y-1 sm:space-y-2">
              {items.map((item, idx) => {
                const num = String(idx + 1).padStart(2, "0");
                const isHash = item.link.startsWith("/#") || item.link.startsWith("#");
                const isActive = !isHash && location.pathname === item.link;

                const linkClass = `group flex items-center justify-between py-2.5 sm:py-3.5 border-b border-white/10 transition-all ${
                  isActive
                    ? "text-lime font-extrabold pl-3 border-l-4 border-l-lime"
                    : "text-white/85 hover:text-white hover:pl-3 hover:border-white/30"
                }`;

                const innerContent = (
                  <>
                    <div className="flex items-baseline gap-3">
                      {displayItemNumbering && (
                        <span className="font-mono text-xs text-white/40 group-hover:text-lime">
                          /{num}
                        </span>
                      )}
                      <span className="font-display text-xl sm:text-2xl font-extrabold tracking-tight uppercase group-hover:text-lime transition-colors">
                        {item.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.badge && (
                        <span className="px-2 py-0.5 text-[9px] uppercase font-bold border border-white/20 bg-white/10 text-lime font-mono">
                          {item.badge}
                        </span>
                      )}
                      <ArrowUpRight className="h-5 w-5 text-white/40 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-lime" />
                    </div>
                  </>
                );

                return (
                  <div
                    key={item.link}
                    className="overflow-hidden"
                    style={{
                      animation: "fade-in-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) both",
                      animationDelay: `${idx * 40}ms`,
                    }}
                  >
                    {isHash ? (
                      <a
                        href={item.link}
                        aria-label={item.ariaLabel || item.label}
                        onClick={closeMenu}
                        className={linkClass}
                      >
                        {innerContent}
                      </a>
                    ) : (
                      <Link
                        to={item.link}
                        aria-label={item.ariaLabel || item.label}
                        onClick={closeMenu}
                        className={linkClass}
                      >
                        {innerContent}
                      </Link>
                    )}
                  </div>
                );
              })}
            </nav>

            {/* Quick Action Button */}
            <div className="pt-3">
              <Link
                to="/login"
                onClick={closeMenu}
                className="flex items-center justify-center gap-2 w-full border-2 border-lime bg-lime text-lime-foreground py-3 sm:py-3.5 font-mono text-xs sm:text-sm font-black uppercase hover:bg-white hover:border-white hover:text-black transition-all shadow-xl active:scale-95"
              >
                {isDashboard ? "Sign Out of Console ➔" : "Start Free Trial ↗"}
              </Link>
            </div>
          </div>

          {/* Social Links & Footer Info */}
          {displaySocials && (
            <div className="border-t border-white/15 pt-4 space-y-2 font-mono text-xs text-white/60 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[10px] uppercase text-white/40">CONNECT:</span>
                <div className="flex items-center gap-4">
                  {socialItems.map((soc) => (
                    <a
                      key={soc.label}
                      href={soc.link}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-lime transition-colors underline underline-offset-4"
                    >
                      {soc.label}
                    </a>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center text-[10px] text-white/40 pt-1">
                <span>VYAPERI X · सुनो · समझो · सौदा करो</span>
                <span className="text-lime">© 2026 Autonomous Sales</span>
              </div>
            </div>
          )}
        </div>
      </div>
    ) : null;

  return (
    <>
      {/* 🍔 Cyber-Brutalist Staggered Menu Toggle Button */}
      <button
        onClick={toggleMenu}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
        className={`flex h-9 w-9 items-center justify-center border-2 transition-all duration-200 active:scale-95 shadow-md shrink-0 ${
          isOpen
            ? "border-lime bg-lime text-lime-foreground font-black"
            : "border-ink bg-card text-ink hover:border-violet hover:bg-secondary"
        }`}
      >
        {isOpen ? (
          <X className="h-5 w-5 stroke-[2.5]" />
        ) : (
          <div className="flex flex-col items-center justify-center gap-1">
            <span className="h-0.5 w-4 bg-current" />
            <span className="h-0.5 w-4 bg-current" />
            <span className="h-0.5 w-4 bg-current" />
          </div>
        )}
      </button>

      {/* Render Drawer into document.body */}
      {drawerContent &&
        typeof document !== "undefined" &&
        createPortal(drawerContent, document.body)}
    </>
  );
}

export { StaggeredMenu };

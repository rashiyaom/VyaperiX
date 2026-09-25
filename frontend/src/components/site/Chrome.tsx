import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { LangSwitcher, useLang } from "@/components/app/lang";
import { ThemeToggle } from "@/components/app/theme";
import { StaggeredMenu, type MenuItem } from "@/components/app/StaggeredMenu";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      to="/"
      className={`flex items-center gap-2 sm:gap-2.5 group shrink-0 whitespace-nowrap ${className}`}
    >
      <span className="relative flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center border border-ink/40 bg-ink transition-transform group-hover:scale-105 shadow-sm">
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-3.5 w-3.5 sm:h-5 sm:w-5"
        >
          <path
            d="M6 6L14 16L6 26H11L16 19.5L21 26H26L18 16L26 6H21L16 12.5L11 6H6Z"
            fill="var(--color-paper, #f6f6f6)"
          />
          <path d="M16 12.5L21 6H26L18 16L16 13.5" fill="var(--color-violet, #8b5cf6)" />
          <path d="M6 26L11 26L16 19.5L14 17" fill="var(--color-lime, #d6ff44)" />
          <circle cx="16" cy="16" r="2" fill="var(--color-lime, #d6ff44)" />
        </svg>
      </span>
      <span className="flex items-baseline gap-1 sm:gap-1.5 whitespace-nowrap">
        <span className="font-display text-sm sm:text-lg font-extrabold tracking-tight text-ink">
          VYAPERI X
        </span>
        <span className="hidden font-display text-xs sm:text-sm font-bold text-violet md:inline">
          व्यापारी X
        </span>
      </span>
    </Link>
  );
}

import { useAuth } from "@/lib/auth";

export function SiteHeader() {
  const { t } = useLang();
  const { user, signOut } = useAuth();
  const [time, setTime] = useState("--:--:--");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const tick = () => setTime(new Date().toISOString().slice(11, 19));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const NAV = [
    { label: t("site.sandbox"), href: "/#sandbox", badge: "Live" },
    { label: t("site.pipeline"), href: "/#pipeline", badge: "6 Modules" },
    { label: t("site.voice"), href: "/#voice", badge: "Real Voice" },
    { label: t("site.capabs"), href: "/#capabilities" },
    { label: "Intelligence Suite", href: "/scraper", badge: "New" },
    user
      ? { label: "Command Console", href: "/dashboard", badge: "Active" }
      : { label: "Sign In", href: "/login", badge: "Trial" },
  ];

  const mobileMenuItems: MenuItem[] = NAV.map((item) => ({
    label: item.label,
    link: item.href,
    badge: item.badge,
  }));

  const headerClasses = [
    "sticky top-0 z-50 w-full max-w-full transition-all duration-300",
    "bg-paper/85 dark:bg-[#0D0E14]/85 backdrop-blur-2xl border-b border-ink/20 shadow-[0_10px_35px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_35px_rgba(0,0,0,0.5)] dark:border-white/15",
    scrolled ? "py-1" : "py-0",
  ].join(" ");

  return (
    <header
      className={headerClasses}
      style={{ WebkitBackdropFilter: "blur(24px)" }}
    >
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-2 px-3 py-2.5 sm:px-6 sm:py-3 lg:px-8 w-full">
        {/* Left: Logo & Desktop Navigation */}
        <div className="flex shrink-0 items-center gap-6">
          <Logo />
          <nav className="hidden min-w-0 items-center gap-1 border-l border-ink/20 pl-6 lg:flex">
            {NAV.map((item, i) => (
              <span key={item.label} className="flex items-center">
                {i > 0 && <span className="label-mono px-2 text-muted-foreground">/</span>}
                <a
                  href={item.href}
                  className="label-mono px-1 py-1 text-ink transition-colors hover:text-violet"
                >
                  {item.label}
                </a>
              </span>
            ))}
          </nav>
        </div>

        {/* Right: Controls & Actions */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <ThemeToggle className="p-1 sm:p-2" />
          <LangSwitcher />

          <div className="hidden border border-ink/20 px-3 py-1.5 font-mono text-[10px] leading-tight text-muted-foreground xl:block">
            <div>SYS.TIME</div>
            <div className="text-ink">{time}</div>
          </div>

          {user ? (
            <div className="hidden sm:flex items-center gap-2">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-1.5 border border-ink bg-lime text-black px-3 py-2 sm:px-4 sm:py-2.5 label-mono transition-all hover:bg-white hover:text-black active:scale-95 whitespace-nowrap text-xs font-black shadow-sm"
              >
                <span className="w-2 h-2 rounded-full bg-black animate-pulse" />
                <span>Open Console</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => signOut()}
                title="Sign Out"
                className="inline-flex items-center border border-ink/20 bg-card hover:bg-destructive hover:text-white px-2.5 py-2 label-mono text-[10px] font-bold text-muted-foreground transition-all cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              search={{ tab: "Signup" }}
              className="hidden sm:inline-flex items-center gap-1.5 border border-ink bg-ink px-3 py-2 sm:px-4 sm:py-2.5 label-mono text-paper transition-all hover:border-violet hover:bg-violet active:scale-95 whitespace-nowrap text-xs font-bold"
            >
              <span>{t("site.starttrial")}</span>
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          )}

          {/* 🍔 Mobile Staggered Menu Drawer */}
          <div className="lg:hidden">
            <StaggeredMenu items={mobileMenuItems} />
          </div>
        </div>
      </div>
    </header>
  );
}


export function SiteFooter() {
  const { t } = useLang();
  return (
    <footer className="border-t border-ink/20 bg-paper text-ink">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs font-mono text-xs leading-relaxed text-muted-foreground">
            सुनो · समझो · सौदा करो — AI lead discovery, enrichment and multilingual voice selling in
            one autonomous workflow.
          </p>
          <p className="mt-6 label-mono text-muted-foreground">© 2026 VYAPERI X</p>
        </div>
        <FooterCol
          title="Product"
          links={[
            [t("site.sandbox"), "/#sandbox"],
            [t("site.pipeline"), "/#pipeline"],
            ["Voice Agent Fleet", "/#voice"],
            [t("site.capabs"), "/#capabilities"],
            ["Intelligence Suite", "/scraper"],
            ["Sign In / Free Trial", "/login"],
          ]}
        />
        <FooterCol
          title="Platform"
          links={[
            ["Live Voice Demo", "/#voice"],
            ["Pipeline Simulation", "/#pipeline"],
            ["Autonomous Mesh", "/#sandbox"],
            ["Intelligence Suite", "/scraper"],
            ["Sign In", "/login"],
          ]}
        />
        <div>
          <h3 className="label-mono text-muted-foreground">Voice Regions Active</h3>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-xs text-ink">
            {[
              "IN (Mumbai/Surat)",
              "AE (Dubai)",
              "UK (London)",
              "SG (Singapore)",
              "CO (Bogotá)",
            ].map((n, i) => (
              <span key={n} className="flex items-center gap-3 text-ink dark:text-neutral-200">
                {i > 0 && <span className="text-violet">+</span>}
                {n}
              </span>
            ))}
          </div>
          <div className="mt-6 border border-ink/20 bg-lime px-3 py-2 label-mono text-lime-foreground font-bold">
            ✓ Autonomous Mesh Operational
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h3 className="label-mono text-muted-foreground">{title}</h3>
      <ul className="mt-4 space-y-2">
        {links.map(([label, href]) => (
          <li key={label}>
            {href.startsWith("http") ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-ink hover:text-violet"
              >
                {label}
              </a>
            ) : href.startsWith("/#") ? (
              <a
                href={href}
                className="font-mono text-xs text-ink hover:text-violet transition-colors"
              >
                {label}
              </a>
            ) : (
              <Link
                to={href}
                className="font-mono text-xs text-ink hover:text-violet transition-colors"
              >
                {label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SectionHead({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-4 border-b border-ink/20 pb-4 fade-in-up">
      <span className="label-mono text-violet">/{index}</span>
      <h2 className="text-xl font-extrabold sm:text-2xl text-ink">{title}</h2>
      {children}
    </div>
  );
}

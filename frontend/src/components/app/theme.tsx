import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Sun, Moon } from "lucide-react";

export type Theme = "light" | "dark";

type ThemeCtx = {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
};

const Ctx = createContext<ThemeCtx>({
  theme: "light",
  toggleTheme: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark"); // Default to sleek dark mode for high-tech aesthetic

  useEffect(() => {
    const saved = localStorage.getItem("vyaperi_theme") as Theme | null;
    const initial = saved || "dark";
    setThemeState(initial);
    if (initial === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem("vyaperi_theme", t);
    if (t === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return <Ctx.Provider value={{ theme, toggleTheme, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
      aria-label="Toggle dark mode"
      className={`inline-flex items-center justify-center border border-ink/30 bg-paper p-2 font-mono text-xs text-ink transition-all hover:border-violet hover:bg-secondary active:scale-95 ${className}`}
    >
      {theme === "dark" ? (
        <Sun className="h-3.5 w-3.5 text-lime transition-transform hover:rotate-45" />
      ) : (
        <Moon className="h-3.5 w-3.5 text-violet transition-transform hover:-rotate-12" />
      )}
    </button>
  );
}

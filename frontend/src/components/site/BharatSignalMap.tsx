/**
 * Bharat Signal Map — animated hero visual for the "multilingual reach" story.
 *
 * A dot-matrix map of India (rasterised at runtime from a simplified outline) on which simulated
 * outbound calls light up: an arc leaves the hub, lands on a city, a pulse ripples through the dots and
 * a bubble greets in that region's own language and script. A radar scan-line sweeps across continuously.
 * Beside it, a greeting card, language ring and live feed narrate the same events.
 *
 * Everything is simulated demo traffic (labelled as such). Canvas is decorative (aria-hidden); the feed
 * carries the same information as text. Animation pauses off-screen and honours prefers-reduced-motion.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { SpeakingWave, LiveDot } from "@/components/app/ui";

type LangKey = "hi" | "gu" | "en" | "mr" | "bn" | "ta" | "te" | "kn" | "ml" | "pa" | "od";

const LANG: Record<LangKey, { name: string; native: string; greeting: string }> = {
  hi: { name: "Hindi", native: "हिन्दी", greeting: "नमस्ते! व्यापारी X की ओर से कॉल है।" },
  gu: { name: "Gujarati", native: "ગુજરાતી", greeting: "નમસ્તે! વ્યાપારી X તરફથી કૉલ છે." },
  en: { name: "English", native: "English", greeting: "Hello! This is Vyaperi X calling." },
  mr: { name: "Marathi", native: "मराठी", greeting: "नमस्कार! व्यापारी X कडून कॉल आहे." },
  bn: { name: "Bengali", native: "বাংলা", greeting: "নমস্কার! ব্যাপারী X থেকে ফোন করা হচ্ছে।" },
  ta: { name: "Tamil", native: "தமிழ்", greeting: "வணக்கம்! வியாபாரி X சார்பில் அழைக்கிறோம்." },
  te: { name: "Telugu", native: "తెలుగు", greeting: "నమస్కారం! వ్యాపారి X నుండి కాల్ చేస్తున్నాము." },
  kn: { name: "Kannada", native: "ಕನ್ನಡ", greeting: "ನಮಸ್ಕಾರ! ವ್ಯಾಪಾರಿ X ಕಡೆಯಿಂದ ಕರೆ ಮಾಡುತ್ತಿದ್ದೇವೆ." },
  ml: { name: "Malayalam", native: "മലയാളം", greeting: "നമസ്കാരം! വ്യാപാരി X-ൽ നിന്നാണ് വിളിക്കുന്നത്." },
  pa: { name: "Punjabi", native: "ਪੰਜਾਬੀ", greeting: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਵਪਾਰੀ X ਵੱਲੋਂ ਕਾਲ ਹੈ।" },
  od: { name: "Odia", native: "ଓଡ଼ିଆ", greeting: "ନମସ୍କାର! ବ୍ୟାପାରୀ X ତରଫରୁ କଲ୍ କରୁଛୁ।" },
};
const LANG_ORDER = Object.keys(LANG) as LangKey[];

interface City {
  name: string;
  lon: number;
  lat: number;
  lang: LangKey;
  left?: boolean; // draw the label on the left of the marker to avoid overlaps
}

const CITIES: City[] = [
  { name: "Delhi", lon: 77.2, lat: 28.6, lang: "hi" },
  { name: "Jaipur", lon: 75.8, lat: 26.9, lang: "hi", left: true },
  { name: "Lucknow", lon: 80.9, lat: 26.85, lang: "hi" },
  { name: "Chandigarh", lon: 76.8, lat: 30.7, lang: "pa" },
  { name: "Ahmedabad", lon: 72.6, lat: 23.0, lang: "gu", left: true },
  { name: "Surat", lon: 72.85, lat: 21.2, lang: "gu" },
  { name: "Mumbai", lon: 72.9, lat: 19.1, lang: "mr", left: true },
  { name: "Pune", lon: 73.9, lat: 18.5, lang: "mr" },
  { name: "Hyderabad", lon: 78.5, lat: 17.4, lang: "te" },
  { name: "Bengaluru", lon: 77.6, lat: 13.0, lang: "kn", left: true },
  { name: "Chennai", lon: 80.3, lat: 13.1, lang: "ta" },
  { name: "Kochi", lon: 76.3, lat: 10.0, lang: "ml", left: true },
  { name: "Kolkata", lon: 88.4, lat: 22.6, lang: "bn" },
  { name: "Bhubaneswar", lon: 85.8, lat: 20.3, lang: "od" },
  { name: "Guwahati", lon: 91.7, lat: 26.15, lang: "en" },
];
const HUB = CITIES.find((c) => c.name === "Ahmedabad")!;

const OUTCOMES = ["Meeting booked", "Lead qualified", "Demo confirmed", "Callback scheduled", "Call connected"];

/** Simplified mainland India outline as [lon, lat]; only used to rasterise the dot grid. */
const INDIA: [number, number][] = [
  [74.5, 37.0], [77.8, 35.5], [78.9, 34.3], [78.4, 32.5], [79.1, 31.4], [80.2, 30.4], [80.4, 29.6],
  [81.2, 28.7], [82.4, 27.9], [83.4, 27.4], [84.4, 27.3], [85.7, 26.6], [87.0, 26.4], [88.0, 26.3],
  [88.1, 27.3], [88.8, 27.8], [89.2, 27.0], [90.0, 26.5], [91.6, 26.8], [92.1, 27.4], [93.0, 28.2],
  [94.5, 29.0], [95.8, 29.4], [97.2, 28.3], [97.0, 27.4], [96.0, 27.2], [95.3, 26.1], [94.6, 25.0],
  [94.4, 24.2], [93.4, 23.2], [93.2, 22.1], [92.6, 21.9], [92.4, 22.9], [91.6, 23.0], [91.6, 24.1],
  [92.3, 24.9], [91.7, 25.2], [90.4, 25.15], [89.9, 25.4], [89.8, 26.1], [89.0, 26.4], [88.4, 25.3],
  [88.1, 24.5], [88.7, 24.2], [88.9, 23.4], [89.0, 22.6], [88.85, 21.8], [88.2, 21.6], [87.0, 21.5],
  [86.8, 20.3], [85.5, 19.7], [84.8, 19.2], [83.3, 17.8], [82.3, 16.6], [81.2, 16.2], [80.3, 15.4],
  [80.15, 13.9], [80.3, 13.0], [79.9, 11.7], [79.85, 10.3], [78.9, 9.3], [78.1, 8.4], [77.5, 8.05],
  [76.9, 8.4], [76.3, 9.6], [75.7, 11.4], [74.9, 12.8], [74.4, 14.5], [73.8, 15.5], [73.4, 17.0],
  [72.85, 18.9], [72.7, 20.5], [72.65, 21.5], [72.2, 21.2], [71.0, 20.85], [70.2, 21.0], [69.0, 22.3],
  [68.2, 23.7], [68.8, 23.95], [70.0, 24.2], [70.5, 24.5], [71.05, 25.6], [70.0, 26.5], [69.5, 27.2],
  [70.3, 28.0], [71.9, 27.9], [73.0, 29.2], [74.0, 30.2], [74.6, 31.0], [74.6, 32.4], [75.0, 32.8],
  [74.3, 33.9], [73.8, 34.4], [74.5, 35.5],
];

const LON0 = 67.8;
const LON1 = 97.8;
const LAT0 = 6.6;
const LAT1 = 37.2;
const LON_SCALE = Math.cos((22 * Math.PI) / 180); // keep the country's proportions

function inPolygon(lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = INDIA.length - 1; i < INDIA.length; j = i++) {
    const [xi, yi] = INDIA[i]!;
    const [xj, yj] = INDIA[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

interface Ev {
  id: number;
  city: City;
  outcome: string;
  at: string;
}

interface Pulse {
  x: number;
  y: number;
  born: number;
  lime: boolean;
}
interface Arc {
  from: { x: number; y: number };
  to: { x: number; y: number };
  born: number;
  lime: boolean;
  label: string;
  city: string;
}

const ARC_MS = 900;
const PULSE_MS = 2200;
const BUBBLE_MS = 3000;

export function BharatSignalMap() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [total, setTotal] = useState(0);
  const pendingRef = useRef<Ev[]>([]); // events the canvas has yet to animate
  const idRef = useRef(0);
  const orderRef = useRef<number[]>([]);
  const visibleRef = useRef(false);

  const current = events[0];

  // ── Event stream (simulated demo traffic) ──
  useEffect(() => {
    const next = () => {
      if (!visibleRef.current) return;
      if (orderRef.current.length === 0) {
        const idx = CITIES.map((_, i) => i).filter((i) => CITIES[i] !== HUB);
        for (let i = idx.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [idx[i], idx[j]] = [idx[j]!, idx[i]!];
        }
        orderRef.current = idx;
      }
      const city = CITIES[orderRef.current.pop()!]!;
      const ev: Ev = {
        id: ++idRef.current,
        city,
        outcome: OUTCOMES[Math.floor(Math.random() * OUTCOMES.length)]!,
        at: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      };
      pendingRef.current.push(ev);
      setEvents((prev) => [ev, ...prev].slice(0, 6));
      setTotal((n) => n + 1);
    };
    const first = setTimeout(next, 500);
    const iv = setInterval(next, 2600);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
    };
  }, []);

  // ── Canvas ──
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0;
    let H = 0;
    let dpr = 1;
    let dots: { x: number; y: number; ph: number }[] = [];
    let cityPx: { c: City; x: number; y: number }[] = [];
    let hubPx = { x: 0, y: 0 };
    let scale = 1;
    let ox = 0;
    let oy = 0;
    const pulses: Pulse[] = [];
    const arcs: Arc[] = [];
    let raf = 0;
    let colors = { ink: "#fff", violet: "#a259ff", lime: "#d4f53c" };
    let colorsAt = 0;

    const project = (lon: number, lat: number) => ({
      x: ox + (lon - LON0) * LON_SCALE * scale,
      y: oy + (LAT1 - lat) * scale,
    });

    const layout = () => {
      const rect = wrap.getBoundingClientRect();
      W = Math.max(280, rect.width);
      H = Math.min(W * 1.08, 640);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.height = `${H}px`;
      const spanX = (LON1 - LON0) * LON_SCALE;
      const spanY = LAT1 - LAT0;
      scale = Math.min((W - 24) / spanX, (H - 24) / spanY);
      ox = (W - spanX * scale) / 2;
      oy = (H - spanY * scale) / 2;

      const step = Math.max(5, Math.round(W / 92));
      dots = [];
      for (let y = oy; y < oy + spanY * scale; y += step) {
        for (let x = ox; x < ox + spanX * scale; x += step) {
          const lon = LON0 + (x - ox) / (LON_SCALE * scale);
          const lat = LAT1 - (y - oy) / scale;
          if (inPolygon(lon, lat)) dots.push({ x, y, ph: Math.random() * 6.28 });
        }
      }
      cityPx = CITIES.map((c) => ({ c, ...project(c.lon, c.lat) }));
      hubPx = project(HUB.lon, HUB.lat);
    };

    const readColors = (now: number) => {
      if (now - colorsAt < 600) return;
      colorsAt = now;
      const cs = getComputedStyle(document.documentElement);
      colors = {
        ink: cs.getPropertyValue("--ink").trim() || colors.ink,
        violet: cs.getPropertyValue("--violet").trim() || colors.violet,
        lime: cs.getPropertyValue("--lime").trim() || colors.lime,
      };
    };

    const spawn = (ev: Ev, now: number) => {
      const target = cityPx.find((p) => p.c === ev.city);
      if (!target) return;
      arcs.push({
        from: hubPx,
        to: { x: target.x, y: target.y },
        born: now,
        lime: ev.outcome === "Meeting booked" || ev.outcome === "Demo confirmed",
        label: LANG[ev.city.lang].greeting,
        city: ev.city.name,
      });
    };

    const draw = (now: number) => {
      readColors(now);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      while (pendingRef.current.length) spawn(pendingRef.current.shift()!, now);

      // land arcs -> pulses
      for (let i = arcs.length - 1; i >= 0; i--) {
        const a = arcs[i]!;
        if (now - a.born > ARC_MS && !(a as Arc & { landed?: boolean }).landed) {
          (a as Arc & { landed?: boolean }).landed = true;
          pulses.push({ x: a.to.x, y: a.to.y, born: now, lime: a.lime });
        }
        if (now - a.born > ARC_MS + BUBBLE_MS) arcs.splice(i, 1);
      }
      for (let i = pulses.length - 1; i >= 0; i--) if (now - pulses[i]!.born > PULSE_MS) pulses.splice(i, 1);

      const sweepX = ox + (((now * 0.00009) % 1.25) - 0.1) * (W - 2 * ox);

      // dots
      ctx.fillStyle = colors.ink;
      const s = Math.max(1.8, W / 330);
      for (const d of dots) {
        let alpha = 0.3 + 0.1 * Math.sin(now * 0.0016 + d.ph);
        const sw = Math.abs(d.x - sweepX);
        if (sw < 46) alpha += 0.34 * (1 - sw / 46);
        let boost = 0;
        let lime = false;
        for (const p of pulses) {
          const t = (now - p.born) / PULSE_MS;
          const r = t * Math.min(W, H) * 0.3;
          const dist = Math.hypot(d.x - p.x, d.y - p.y);
          const ring = Math.exp(-(((dist - r) / 16) ** 2)) * (1 - t);
          if (ring > boost) {
            boost = ring;
            lime = p.lime;
          }
        }
        if (boost > 0.06) {
          ctx.globalAlpha = Math.min(1, alpha + boost);
          ctx.fillStyle = lime ? colors.lime : colors.violet;
          ctx.fillRect(d.x - s * 0.7, d.y - s * 0.7, s * 1.4, s * 1.4);
          ctx.fillStyle = colors.ink;
        } else {
          ctx.globalAlpha = alpha;
          ctx.fillRect(d.x - s / 2, d.y - s / 2, s, s);
        }
      }
      ctx.globalAlpha = 1;

      // arcs
      for (const a of arcs) {
        const t = Math.min(1, (now - a.born) / ARC_MS);
        const fade = now - a.born > ARC_MS ? Math.max(0, 1 - (now - a.born - ARC_MS) / 1400) : 1;
        const cx = (a.from.x + a.to.x) / 2;
        const cy = Math.min(a.from.y, a.to.y) - Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y) * 0.32;
        ctx.strokeStyle = a.lime ? colors.lime : colors.violet;
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = 0.85 * fade;
        ctx.beginPath();
        const steps = 32;
        for (let i = 0; i <= steps * t; i++) {
          const u = i / steps;
          const x = (1 - u) * (1 - u) * a.from.x + 2 * (1 - u) * u * cx + u * u * a.to.x;
          const y = (1 - u) * (1 - u) * a.from.y + 2 * (1 - u) * u * cy + u * u * a.to.y;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        if (t < 1) {
          const x = (1 - t) * (1 - t) * a.from.x + 2 * (1 - t) * t * cx + t * t * a.to.x;
          const y = (1 - t) * (1 - t) * a.from.y + 2 * (1 - t) * t * cy + t * t * a.to.y;
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, 6.28);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // city markers + labels
      const fontPx = Math.max(9, Math.min(11, W / 55));
      ctx.font = `600 ${fontPx}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.textBaseline = "middle";
      for (const p of cityPx) {
        const active = arcs.some((a) => a.city === p.c.name && now - a.born > ARC_MS);
        ctx.fillStyle = active ? colors.lime : colors.ink;
        ctx.globalAlpha = active ? 1 : 0.85;
        ctx.beginPath();
        ctx.arc(p.x, p.y, active ? 4 : 2.6, 0, 6.28);
        ctx.fill();
        ctx.globalAlpha = active ? 1 : 0.6;
        if (p.c.left) {
          ctx.textAlign = "right";
          ctx.fillText(p.c.name, p.x - 7, p.y + 1);
          ctx.textAlign = "left";
        } else {
          ctx.fillText(p.c.name, p.x + 7, p.y + 1);
        }
      }
      ctx.globalAlpha = 1;

      // hub
      const hp = 6 + 3 * Math.sin(now * 0.004);
      ctx.strokeStyle = colors.violet;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hubPx.x, hubPx.y, hp, 0, 6.28);
      ctx.stroke();
      ctx.fillStyle = colors.violet;
      ctx.beginPath();
      ctx.arc(hubPx.x, hubPx.y, 3.4, 0, 6.28);
      ctx.fill();

      // greeting bubbles
      for (const a of arcs) {
        const age = now - a.born - ARC_MS;
        if (age < 0) continue;
        const k = age < 300 ? age / 300 : age > BUBBLE_MS - 500 ? Math.max(0, (BUBBLE_MS - age) / 500) : 1;
        if (k <= 0) continue;
        const bf = Math.max(11, Math.min(13.5, W / 48));
        ctx.font = `600 ${bf}px "Noto Sans", "Nirmala UI", system-ui, sans-serif`;
        const tw = ctx.measureText(a.label).width;
        const bw = tw + 22;
        const bh = bf + 16;
        let bx = a.to.x - bw / 2;
        bx = Math.max(6, Math.min(W - bw - 6, bx));
        const by = a.to.y - 24 - bh - (1 - k) * -6;
        ctx.globalAlpha = k;
        ctx.fillStyle = a.lime ? colors.lime : colors.violet;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 3);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(a.to.x - 5, by + bh);
        ctx.lineTo(a.to.x + 5, by + bh);
        ctx.lineTo(a.to.x, by + bh + 6);
        ctx.fill();
        ctx.fillStyle = a.lime ? "#111" : "#fff";
        ctx.textBaseline = "middle";
        ctx.fillText(a.label, bx + 11, by + bh / 2 + 1);
        ctx.globalAlpha = 1;
      }
    };

    const loop = (now: number) => {
      if (visibleRef.current) draw(now);
      raf = requestAnimationFrame(loop);
    };

    layout();
    const ro = new ResizeObserver(() => {
      layout();
      if (reduced) draw(performance.now());
    });
    ro.observe(wrap);
    const io = new IntersectionObserver(([e]) => {
      visibleRef.current = !!e?.isIntersecting;
    }, { threshold: 0.05 });
    io.observe(wrap);

    if (reduced) {
      visibleRef.current = true;
      draw(performance.now());
    } else {
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  const currentLang = current ? LANG[current.city.lang] : null;
  const activeKey = current?.city.lang;
  const stats = useMemo(
    () => [
      ["11", "Native languages"],
      ["<150ms", "Voice turnaround"],
      ["24/7", "Autonomous dialing"],
    ],
    [],
  );

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
      {/* Map */}
      <div className="border border-ink bg-card shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/20 px-4 py-2.5">
          <span className="label-mono flex items-center gap-2 text-[10px] text-ink">
            <LiveDot /> SIGNAL MAP · BHARAT
          </span>
          <span className="label-mono flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 bg-violet" /> Call placed
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 bg-lime" /> Meeting booked
            </span>
          </span>
        </div>
        <div ref={wrapRef} className="relative w-full">
          <canvas ref={canvasRef} aria-hidden="true" translate="no" className="block w-full text-ink" />
        </div>
        <div className="border-t border-ink/20 px-4 py-2 font-mono text-[10px] text-muted-foreground">
          Simulated demo traffic · hub: Ahmedabad → 14 city clusters
        </div>
      </div>

      {/* Narration column */}
      <div className="flex flex-col gap-6">
        {/* Greeting card */}
        <div className="border border-ink bg-card p-5 shadow-lg" translate="no">
          <div className="label-mono flex items-center justify-between text-[10px] text-muted-foreground">
            <span>NOW SPEAKING</span>
            <span className="flex items-center gap-1.5 text-emerald-700 dark:text-lime">
              <SpeakingWave active={!!current} /> {currentLang?.name ?? "—"}
            </span>
          </div>
          <div
            key={current?.id ?? 0}
            className="mt-4 min-h-[5.5rem] font-display text-2xl font-extrabold leading-snug text-ink sm:text-3xl"
            style={{ animation: "fade-in-up 0.5s both" }}
          >
            {currentLang?.greeting ?? "…"}
          </div>
          <div className="mt-2 font-mono text-[11px] text-muted-foreground">
            {current ? `${current.city.name} · ${currentLang!.native}` : "Waiting for first call…"}
          </div>

          <div className="mt-5 flex flex-wrap gap-1.5">
            {LANG_ORDER.map((k) => (
              <span
                key={k}
                className={`border px-2 py-1 font-mono text-[10px] transition-all duration-300 ${
                  activeKey === k
                    ? "scale-105 border-violet bg-violet font-bold text-white"
                    : "border-ink/20 text-muted-foreground"
                }`}
              >
                {LANG[k].native}
              </span>
            ))}
          </div>
        </div>

        {/* Feed */}
        <div className="border border-ink bg-card shadow-lg">
          <div className="label-mono flex items-center justify-between border-b border-ink/20 px-4 py-2.5 text-[10px] text-muted-foreground">
            <span>LIVE CALL FEED</span>
            <span className="tabular-nums text-ink">{total} this session</span>
          </div>
          <ul className="divide-y divide-ink/10">
            {events.length === 0 && (
              <li className="px-4 py-3 font-mono text-xs text-muted-foreground">Connecting to the fleet…</li>
            )}
            {events.slice(0, 5).map((e, i) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 font-mono text-xs"
                style={i === 0 ? { animation: "row-flash 1.2s ease-out" } : { opacity: 1 - i * 0.14 }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-muted-foreground tabular-nums">{e.at}</span>
                  <span className="truncate font-bold text-ink">{e.city.name}</span>
                  <span className="text-muted-foreground" translate="no">
                    {LANG[e.city.lang].native}
                  </span>
                </span>
                <span
                  className={`shrink-0 border px-1.5 py-0.5 text-[10px] ${
                    e.outcome === "Meeting booked" || e.outcome === "Demo confirmed"
                      ? "border-lime bg-lime text-lime-foreground font-bold"
                      : "border-ink/20 text-ink"
                  }`}
                >
                  {e.outcome}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-px bg-ink/15 border border-ink/20">
          {stats.map(([v, l]) => (
            <div key={l} className="bg-paper px-3 py-3">
              <div className="font-display text-xl font-extrabold text-ink tabular-nums sm:text-2xl">{v}</div>
              <div className="label-mono mt-0.5 text-[9px] text-muted-foreground">{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

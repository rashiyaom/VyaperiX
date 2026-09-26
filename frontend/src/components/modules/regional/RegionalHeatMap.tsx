/**
 * RegionalHeatMap.tsx — High-Fidelity Location-to-Location Jump Animation Map.
 *
 * Recreates the exact aesthetics, curved arc trajectories, dot-matrix ripple pulses,
 * native-script greeting bubbles, and active hub marker from the homepage Bharat Signal Map.
 *
 * Continuous Animation Guarantee:
 * - Always maintains all 15 Indian base cities so location-to-location jumping arcs
 *   and native greeting speech bubbles NEVER stop, even if no business is searched yet
 *   or only 1 region is returned.
 * - Zero hovering green radar line.
 * - Interactive click on any city triggers immediate jump and selection.
 */

import { useEffect, useRef, useState } from "react";
import type { RegionData } from "./RegionalRankingView";
export type { RegionData };

interface RegionalHeatMapProps {
  regions: RegionData[];
  selectedRegionId: string | null;
  onSelectRegion: (region: RegionData) => void;
  activeBusinessQuery?: string;
}

const LANG_GREETINGS: Record<string, string> = {
  hi: "नमस्ते! व्यापारी X की ओर से कॉल है।",
  gu: "નમસ્તે! વ્યાપારી X તરફથી કૉલ છે.",
  en: "Hello! This is Vyaperi X calling.",
  mr: "नमस्कार! व्यापारी X कडून कॉल आहे.",
  bn: "নমস্কার! ব্যাপারী X থেকে ফোন করা হচ্ছে।",
  ta: "வணக்கம்! வியாபாரி X சார்பில் அழைக்கிறோம்.",
  te: "నమస్కారం! వ్యాపారి X నుండి కాల్ చేస్తున్నాము.",
  kn: "ನಮಸ್ಕಾರ! ವ್ಯಾಪಾರಿ X ಕಡೆಯಿಂದ ಕರೆ ಮಾಡುತ್ತಿದ್ದೇವೆ.",
  ml: "നമസ്കാരം! വ്യാപാരി X-ൽ നിന്നാണ് വിളിക്കുന്നത്.",
  pa: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਵਪਾਰੀ X ਵੱਲੋਂ ਕਾਲ ਹੈ।",
  od: "ନମସ୍କାର! ବ୍ୟାପାରୀ X ତରଫରୁ କଲ୍ କରୁଛୁ।",
};

/** 15 Permanent Indian metropolitan hubs guaranteed to be on the map */
const BASE_INDIAN_CITIES = [
  { id: "delhi", city: "Delhi", state: "Delhi", lon: 77.2, lat: 28.6, lang: "hi", greeting: "नमस्ते! व्यापारी X की ओर से कॉल है।" },
  { id: "jaipur", city: "Jaipur", state: "Rajasthan", lon: 75.8, lat: 26.9, lang: "hi", left: true, greeting: "खम्मा घणी! व्यापारी X की ओर से कॉल है।" },
  { id: "lucknow", city: "Lucknow", state: "Uttar Pradesh", lon: 80.9, lat: 26.85, lang: "hi", greeting: "नमस्ते! व्यापारी X की ओर से कॉल है।" },
  { id: "chandigarh", city: "Chandigarh", state: "Punjab", lon: 76.8, lat: 30.7, lang: "pa", greeting: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਵਪਾਰੀ X ਵੱਲੋਂ ਕਾਲ ਹੈ।" },
  { id: "ahmedabad", city: "Ahmedabad", state: "Gujarat", lon: 72.6, lat: 23.0, lang: "gu", left: true, greeting: "નમસ્તે! વ્યાપારી X તરફથી કૉલ છે." },
  { id: "surat", city: "Surat", state: "Gujarat", lon: 72.85, lat: 21.2, lang: "gu", greeting: "નમસ્તે! વ્યાપારી X તરફથી કૉલ છે." },
  { id: "mumbai", city: "Mumbai", state: "Maharashtra", lon: 72.9, lat: 19.1, lang: "mr", left: true, greeting: "नमस्कार! व्यापारी X कडून कॉल आहे." },
  { id: "pune", city: "Pune", state: "Maharashtra", lon: 73.9, lat: 18.5, lang: "mr", greeting: "नमस्कार! व्यापारी X कडून कॉल आहे." },
  { id: "hyderabad", city: "Hyderabad", state: "Telangana", lon: 78.5, lat: 17.4, lang: "te", greeting: "నమస్కారం! వ్యాపారి X నుండి కాల్ చేస్తున్నాము." },
  { id: "bengaluru", city: "Bengaluru", state: "Karnataka", lon: 77.6, lat: 13.0, lang: "kn", left: true, greeting: "ನಮಸ್ಕಾರ! ವ್ಯಾಪಾರಿ X ಕಡೆಯಿಂದ ಕರೆ ಮಾಡುತ್ತಿದ್ದೇವೆ." },
  { id: "chennai", city: "Chennai", state: "Tamil Nadu", lon: 80.3, lat: 13.1, lang: "ta", greeting: "வணக்கம்! வியாபாரி X சார்பில் அழைக்கிறோம்." },
  { id: "kochi", city: "Kochi", state: "Kerala", lon: 76.3, lat: 10.0, lang: "ml", left: true, greeting: "നമസ്കാരം! വ്യാപാരി X-ൽ നിന്നാണ് വിളിക്കുന്നത്." },
  { id: "kolkata", city: "Kolkata", state: "West Bengal", lon: 88.4, lat: 22.6, lang: "bn", greeting: "নমস্কার! ব্যাপারী X থেকে ফোন করা হচ্ছে।" },
  { id: "bhubaneswar", city: "Bhubaneswar", state: "Odisha", lon: 85.8, lat: 20.3, lang: "od", greeting: "ନମସ୍କାର! ବ୍ୟାପାରୀ X ତରଫରୁ କଲ୍ କରୁଛୁ।" },
  { id: "guwahati", city: "Guwahati", state: "Assam", lon: 91.7, lat: 26.15, lang: "en", greeting: "Hello! This is Vyaperi X calling." },
];

/** Simplified mainland India polygon [lon, lat] */
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
const LON_SCALE = Math.cos((22 * Math.PI) / 180);

function inPolygon(lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = INDIA.length - 1; i < INDIA.length; j = i++) {
    const [xi, yi] = INDIA[i]!;
    const [xj, yj] = INDIA[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
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
  landed?: boolean;
}

const ARC_MS = 1000;
const PULSE_MS = 2200;
const BUBBLE_MS = 3200;

export function RegionalHeatMap({
  regions,
  selectedRegionId,
  onSelectRegion,
  activeBusinessQuery = "",
}: RegionalHeatMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Stores coordinates + merged data for all base cities
  const cityPositionsRef = useRef<{
    id: string;
    city: string;
    state: string;
    left?: boolean | undefined;
    regionData?: RegionData | undefined;
    x: number;
    y: number;
  }[]>([]);

  const selectedIdRef = useRef(selectedRegionId);
  selectedIdRef.current = selectedRegionId;

  const regionsRef = useRef(regions);
  regionsRef.current = regions;

  const arcsRef = useRef<Arc[]>([]);
  const pulsesRef = useRef<Pulse[]>([]);
  const lastSpawnRef = useRef<number>(0);
  const cycleIndexRef = useRef<number>(0);

  // Jump to a specific city with an aesthetic bezier arc
  const triggerJumpToCity = (targetCityName: string, now: number) => {
    const cities = cityPositionsRef.current;
    if (cities.length < 2) return;

    // Use Ahmedabad as the primary outbound hub
    const hub = cities.find((c) => c.id === "ahmedabad") || cities[0]!;
    const target = cities.find((c) => c.city.toLowerCase() === targetCityName.toLowerCase());
    if (!target || target.id === hub.id) return;

    const langKey = target.regionData?.lang || "hi";
    const greetingText =
      LANG_GREETINGS[langKey] || target.regionData?.greeting || "नमस्ते! व्यापारी X की ओर से कॉल है।";

    arcsRef.current.push({
      from: { x: hub.x, y: hub.y },
      to: { x: target.x, y: target.y },
      born: now,
      lime: (target.regionData?.urgency_score ?? 60) >= 70,
      label: greetingText,
      city: target.city,
    });
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0;
    let H = 0;
    let dpr = 1;
    let dots: { x: number; y: number; ph: number }[] = [];
    let hubPx = { x: 0, y: 0 };
    let scale = 1;
    let ox = 0;
    let oy = 0;
    let raf = 0;

    const colors = {
      ink: "#e2e8f0",
      violet: "#a855f7",
      lime: "#d4f53c",
    };

    const project = (lon: number, lat: number) => ({
      x: ox + (lon - LON0) * LON_SCALE * scale,
      y: oy + (LAT1 - lat) * scale,
    });

    const layout = () => {
      const rect = wrap.getBoundingClientRect();
      W = Math.max(300, rect.width);
      H = Math.max(500, Math.min(W * 1.05, 660));
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;

      const spanX = (LON1 - LON0) * LON_SCALE;
      const spanY = LAT1 - LAT0;
      scale = Math.min((W - 28) / spanX, (H - 28) / spanY);
      ox = (W - spanX * scale) / 2;
      oy = (H - spanY * scale) / 2;

      // Rasterise dot matrix
      const step = Math.max(5, Math.round(W / 90));
      dots = [];
      for (let y = oy; y < oy + spanY * scale; y += step) {
        for (let x = ox; x < ox + spanX * scale; x += step) {
          const lon = LON0 + (x - ox) / (LON_SCALE * scale);
          const lat = LAT1 - (y - oy) / scale;
          if (inPolygon(lon, lat)) dots.push({ x, y, ph: Math.random() * 6.28 });
        }
      }

      // Merge base cities with any dynamic region ranking data
      cityPositionsRef.current = BASE_INDIAN_CITIES.map((base) => {
        const matched = regionsRef.current.find(
          (r) => r.id === base.id || r.city.toLowerCase() === base.city.toLowerCase()
        );
        const p = project(base.lon, base.lat);
        return {
          id: base.id,
          city: base.city,
          state: base.state,
          left: base.left,
          regionData: matched,
          x: p.x,
          y: p.y,
        };
      });

      const hubBase = BASE_INDIAN_CITIES.find((b) => b.id === "ahmedabad")!;
      hubPx = project(hubBase.lon, hubBase.lat);
    };

    layout();
    window.addEventListener("resize", layout);

    const draw = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Periodically trigger jumping arcs continuously across cities
      if (now - lastSpawnRef.current > 3000 && cityPositionsRef.current.length > 1) {
        lastSpawnRef.current = now;
        const validTargets = cityPositionsRef.current.filter((c) => c.id !== "ahmedabad");
        if (validTargets.length > 0) {
          cycleIndexRef.current = (cycleIndexRef.current + 1) % validTargets.length;
          const target = validTargets[cycleIndexRef.current]!;
          triggerJumpToCity(target.city, now);
        }
      }

      const arcs = arcsRef.current;
      const pulses = pulsesRef.current;

      // Land arcs -> trigger expanding ripple pulse in dots
      for (let i = arcs.length - 1; i >= 0; i--) {
        const a = arcs[i]!;
        if (now - a.born > ARC_MS && !a.landed) {
          a.landed = true;
          pulses.push({ x: a.to.x, y: a.to.y, born: now, lime: a.lime });
        }
        if (now - a.born > ARC_MS + BUBBLE_MS) arcs.splice(i, 1);
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        if (now - pulses[i]!.born > PULSE_MS) pulses.splice(i, 1);
      }

      // Gentle ambient horizontal light shimmer across dots
      const sweepX = ox + (((now * 0.00008) % 1.25) - 0.1) * (W - 2 * ox);

      // Draw dot matrix with shockwave ripple pulses
      ctx.fillStyle = colors.ink;
      const s = Math.max(1.8, W / 320);
      for (const d of dots) {
        let alpha = 0.28 + 0.08 * Math.sin(now * 0.0016 + d.ph);
        const sw = Math.abs(d.x - sweepX);
        if (sw < 42) alpha += 0.3 * (1 - sw / 42);

        let boost = 0;
        let lime = false;
        for (const p of pulses) {
          const t = (now - p.born) / PULSE_MS;
          const r = t * Math.min(W, H) * 0.32;
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

      // Draw jumping curved arcs with traveling glowing orb
      for (const a of arcs) {
        const t = Math.min(1, (now - a.born) / ARC_MS);
        const fade = now - a.born > ARC_MS ? Math.max(0, 1 - (now - a.born - ARC_MS) / 1400) : 1;
        const cx = (a.from.x + a.to.x) / 2;
        const cy = Math.min(a.from.y, a.to.y) - Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y) * 0.32;

        ctx.strokeStyle = a.lime ? colors.lime : colors.violet;
        ctx.lineWidth = 1.6;
        ctx.globalAlpha = 0.88 * fade;
        ctx.beginPath();
        const steps = 36;
        for (let i = 0; i <= steps * t; i++) {
          const u = i / steps;
          const x = (1 - u) * (1 - u) * a.from.x + 2 * (1 - u) * u * cx + u * u * a.to.x;
          const y = (1 - u) * (1 - u) * a.from.y + 2 * (1 - u) * u * cy + u * u * a.to.y;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Traveling white head orb
        if (t < 1) {
          const x = (1 - t) * (1 - t) * a.from.x + 2 * (1 - t) * t * cx + t * t * a.to.x;
          const y = (1 - t) * (1 - t) * a.from.y + 2 * (1 - t) * t * cy + t * t * a.to.y;
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#ffffff";
          ctx.shadowColor = a.lime ? colors.lime : colors.violet;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(x, y, 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      ctx.globalAlpha = 1;

      // Draw city markers + monospace labels
      const fontPx = Math.max(9, Math.min(11, W / 55));
      ctx.font = `600 ${fontPx}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.textBaseline = "middle";

      for (const p of cityPositionsRef.current) {
        const isSelected = p.id === selectedIdRef.current;
        const active = arcs.some((a) => a.city === p.city && now - a.born > ARC_MS);

        ctx.fillStyle = active ? colors.lime : isSelected ? "#38bdf8" : colors.ink;
        ctx.globalAlpha = active || isSelected ? 1 : 0.85;
        ctx.beginPath();
        ctx.arc(p.x, p.y, active || isSelected ? 4.5 : 2.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = active || isSelected ? 1 : 0.65;
        if (p.left) {
          ctx.textAlign = "right";
          ctx.fillText(p.city, p.x - 8, p.y + 1);
          ctx.textAlign = "left";
        } else {
          ctx.fillText(p.city, p.x + 8, p.y + 1);
        }
      }
      ctx.globalAlpha = 1;

      // Draw Central Hub (Ahmedabad) with pulsing violet beacon ring
      const hp = 6 + 3.5 * Math.sin(now * 0.004);
      ctx.strokeStyle = colors.violet;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(hubPx.x, hubPx.y, hp, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = colors.violet;
      ctx.beginPath();
      ctx.arc(hubPx.x, hubPx.y, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Draw Native-Script Speech Bubbles at destination
      for (const a of arcs) {
        const age = now - a.born - ARC_MS;
        if (age < 0) continue;
        const k =
          age < 300
            ? age / 300
            : age > BUBBLE_MS - 500
            ? Math.max(0, (BUBBLE_MS - age) / 500)
            : 1;
        if (k <= 0) continue;

        const bf = Math.max(11, Math.min(13.5, W / 48));
        ctx.font = `600 ${bf}px "Noto Sans", "Nirmala UI", system-ui, sans-serif`;
        const tw = ctx.measureText(a.label).width;
        const bw = tw + 24;
        const bh = bf + 18;
        let bx = a.to.x - bw / 2;
        bx = Math.max(8, Math.min(W - bw - 8, bx));
        const by = a.to.y - 24 - bh - (1 - k) * -6;

        ctx.globalAlpha = k;
        ctx.fillStyle = a.lime ? colors.lime : colors.violet;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 4);
        ctx.fill();

        // Pointer triangle
        ctx.beginPath();
        ctx.moveTo(a.to.x - 5, by + bh);
        ctx.lineTo(a.to.x + 5, by + bh);
        ctx.lineTo(a.to.x, by + bh + 6);
        ctx.fill();

        ctx.fillStyle = a.lime ? "#0B0C12" : "#ffffff";
        ctx.textBaseline = "middle";
        ctx.fillText(a.label, bx + 12, by + bh / 2 + 1);
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", layout);
    };
  }, []);

  // External selection triggers jump immediately
  useEffect(() => {
    if (!selectedRegionId) return;
    const target = cityPositionsRef.current.find((r) => r.id === selectedRegionId);
    if (target) {
      triggerJumpToCity(target.city, performance.now());
    }
  }, [selectedRegionId]);

  // Click on canvas to select city and trigger jump
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    for (const cp of cityPositionsRef.current) {
      const dist = Math.hypot(cp.x - mouseX, cp.y - mouseY);
      if (dist <= 22) {
        if (cp.regionData) {
          onSelectRegion(cp.regionData);
        } else {
          // Provide placeholder RegionData for unranked click
          onSelectRegion({
            id: cp.id,
            city: cp.city,
            state: cp.state,
            lat: 0,
            lon: 0,
            urgency_score: 50,
            priority: "MODERATE",
            priority_label: "Standard Opportunity",
            priority_badge: "MODERATE",
            weather: { temperature: 28, humidity: 60, rain_mm: 0, summary: "Standard operational weather" },
            news: { headline: `${cp.city} commercial operations`, source: "Regional Wire" },
            voice_hook: `Hello! Calling from Vyaperi on behalf of local commercial services in ${cp.city}.`,
            lead_count: 50,
          });
        }
        triggerJumpToCity(cp.city, performance.now());
        break;
      }
    }
  };

  return (
    <div
      ref={wrapRef}
      className="relative w-full rounded-2xl overflow-hidden bg-[#0B0C12] border border-ink/20 shadow-2xl flex flex-col justify-between"
    >
      {/* Top Header Bar matching homepage reference */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/20 px-4 py-2.5 bg-neutral-950/60">
        <span className="font-mono flex items-center gap-2 text-[10px] text-white tracking-widest uppercase">
          <span className="inline-block h-2 w-2 bg-lime-400 animate-ping" />
          ■ LIVE SIGNAL MAP · BHARAT
        </span>
        <span className="font-mono flex items-center gap-4 text-[10px] text-neutral-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 bg-violet-500 rounded-sm" /> CALL PLACED
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 bg-lime-400 rounded-sm" /> MEETING BOOKED
          </span>
        </span>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="cursor-pointer w-full block"
      />

      {/* Bottom Footer Bar matching homepage reference */}
      <div className="border-t border-ink/20 px-4 py-2 flex items-center justify-between text-[11px] font-mono text-neutral-400 bg-neutral-950/60">
        <span>Live telemetry · hub: Ahmedabad → 14 city clusters</span>
        {activeBusinessQuery && (
          <span className="text-lime-400 font-bold hidden sm:inline">
            Business Target: "{activeBusinessQuery}"
          </span>
        )}
      </div>
    </div>
  );
}

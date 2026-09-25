/**
 * VYAPERI X — Home-page voice agent previews.
 *
 * Every sample is synthesised by Sarvam AI (Bulbul v3) through our backend
 * (`/api/demo-voice/speak`). There is no browser/OS speech synthesis any more, so all
 * visitors hear the same natural voices in the same 11 languages, regardless of device.
 *
 * The endpoint is public, so it is rate limited per visitor. Replays of a sample already
 * heard in this tab are served from memory and do not count against the limit.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Mic, Play, RefreshCw, Square, Volume2 } from "lucide-react";
import { SpeakingWave, Tag } from "./ui";
import { useLang } from "./lang";
import {
  DEMO_LANGUAGES,
  DEMO_MAX_CHARS,
  DEMO_SPEAKERS,
  fetchDemoQuota,
  formatWait,
  getDemoLanguage,
  useDemoVoice,
  type DemoGender,
  type DemoLangCode,
} from "@/lib/demo-voice";

const GENDER_LABEL: Record<DemoGender, string> = { female: "♀ Female Voice", male: "♂ Male Voice" };

/** Shared banner for rate-limit / provider / playback problems. */
function VoiceNotice({
  error,
  blockedUntil,
}: {
  error: { code: string; message: string } | null;
  blockedUntil: number;
}) {
  const { t } = useLang();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (blockedUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [blockedUntil]);

  if (!error) return null;
  const wait = Math.max(0, Math.ceil((blockedUntil - now) / 1000));
  return (
    <div
      role="alert"
      className="flex items-start gap-2 border border-amber-500/50 bg-amber-500/10 px-3 py-2 font-mono text-[11px] leading-relaxed text-ink"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
      <span>
        {error.message}
        {wait > 0 && error.code !== "network" && (
          <span className="ml-1 font-bold">{t("voice.retry", { t: formatWait(wait, t) })}</span>
        )}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Hero strip: one tap per language
────────────────────────────────────────────── */
export function HeroVoicePreview() {
  const { play, activeId, status, error, blockedUntil } = useDemoVoice();
  const { t } = useLang();
  const speaker = DEMO_SPEAKERS.female[0]!;

  return (
    <div className="mt-8 border border-ink/20 bg-card p-3.5 space-y-2.5">
      <div className="label-mono text-[10px] text-muted-foreground flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <Volume2
            className={`h-3.5 w-3.5 ${activeId ? "text-emerald-700 dark:text-lime" : "text-muted-foreground"}`}
          />
          Listen to our AI voice agent in 11 Indian languages
        </span>
        {status === "playing" ? (
          <span className="flex items-center gap-1.5 text-emerald-700 dark:text-lime font-bold">
            <SpeakingWave active={true} />
            Speaking…
          </span>
        ) : (
          <span className="text-muted-foreground/80">Powered by Sarvam AI</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 pt-0.5" translate="no">
        {DEMO_LANGUAGES.map((lang) => {
          const id = `hero-${lang.code}`;
          const isActive = activeId === id;
          const isLoading = isActive && status === "loading";
          return (
            <button
              key={lang.code}
              type="button"
              aria-label={t("voice.play_sample", { lang: t(`langname.${lang.code}`) })}
              aria-pressed={isActive}
              onClick={() =>
                play(id, {
                  text: lang.presets[0]!.text,
                  language: lang.code,
                  gender: "female",
                  speaker: speaker.id,
                })
              }
              className={`px-2.5 py-1.5 border text-xs font-mono flex items-center gap-1.5 rounded transition-all active:scale-95 ${
                isActive
                  ? "bg-violet text-white border-violet"
                  : "bg-paper border-border hover:border-violet text-ink dark:text-neutral-200 dark:border-neutral-700"
              }`}
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : isActive ? (
                <Square className="h-3 w-3 fill-current" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              {lang.native}
            </button>
          );
        })}
      </div>

      <VoiceNotice error={error} blockedUntil={blockedUntil} />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Full interactive studio
────────────────────────────────────────────── */
export function VoiceAgentSynthesizerWidget({ compact = false }: { compact?: boolean }) {
  const [langCode, setLangCode] = useState<DemoLangCode>("hi");
  const [gender, setGender] = useState<DemoGender>("female");
  const [speakerId, setSpeakerId] = useState<string>(DEMO_SPEAKERS.female[0]!.id);
  const lang = getDemoLanguage(langCode);
  const [customText, setCustomText] = useState(lang.presets[0]!.text);

  const { play, stop, activeId, status, error, quota, blockedUntil } = useDemoVoice();
  const { t } = useLang();
  const langName = t(`langname.${langCode}`);
  const [initialQuota, setInitialQuota] = useState(quota);

  useEffect(() => {
    let live = true;
    fetchDemoQuota().then((q) => live && q && setInitialQuota(q));
    return () => {
      live = false;
    };
  }, []);
  const shownQuota = quota ?? initialQuota;

  const speaker = DEMO_SPEAKERS[gender].find((s) => s.id === speakerId) ?? DEMO_SPEAKERS[gender][0]!;
  const busy = status !== "idle";
  const isBlocked = blockedUntil > Date.now();
  const overLimit = customText.length > DEMO_MAX_CHARS;
  const emptyText = !customText.trim();

  const speak = (id: string, text: string) =>
    play(id, { text: text.trim(), language: langCode, gender, speaker: speaker.id });

  const pickLanguage = (code: DemoLangCode) => {
    stop();
    setLangCode(code);
    setCustomText(getDemoLanguage(code).presets[0]!.text);
  };

  const pickGender = (g: DemoGender) => {
    stop();
    setGender(g);
    setSpeakerId(DEMO_SPEAKERS[g][0]!.id);
  };

  const customActive = activeId === "custom";

  return (
    <div
      className={`border-2 border-border bg-card p-5 sm:p-6 rounded-none shadow-xl space-y-5 ${compact ? "" : "max-w-4xl mx-auto"}`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-violet text-white font-display font-extrabold text-base shadow">
            {speaker.name[0]}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-base sm:text-lg font-bold text-ink">{speaker.name}</h3>
              <Tag tone={gender === "female" ? "lime" : "violet"}>{t(`voice.tag_${gender}`)}</Tag>
              <span translate="no">
                <Tag tone="violet">
                  {lang.native === lang.label ? lang.label : `${lang.label} (${lang.native})`}
                </Tag>
              </span>
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              Sarvam Bulbul v3 · Natural Indic neural voice
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status === "playing" && (
            <span className="flex items-center gap-2 font-mono text-xs text-emerald-700 dark:text-lime font-bold">
              <SpeakingWave active={true} />
              <span>Speaking…</span>
            </span>
          )}
          {busy && (
            <button
              type="button"
              onClick={stop}
              className="inline-flex items-center gap-1.5 border border-danger bg-danger text-white px-3 py-2 font-mono text-xs font-bold rounded active:scale-95 shadow"
            >
              <Square className="h-3.5 w-3.5 fill-current" /> Stop
            </button>
          )}
        </div>
      </div>

      {/* Language selector */}
      <div className="space-y-1.5 bg-paper/60 p-3.5 border border-border">
        <div className="label-mono text-[10px] text-muted-foreground">
          {t("voice.select_lang", { n: DEMO_LANGUAGES.length })}
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-6" translate="no">
          {DEMO_LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              aria-pressed={langCode === l.code}
              onClick={() => pickLanguage(l.code)}
              className={`py-1.5 px-1.5 border text-xs font-mono transition-all text-center rounded ${
                langCode === l.code
                  ? "bg-violet text-white border-violet font-bold shadow-sm"
                  : "bg-card border-border hover:bg-secondary text-ink dark:text-neutral-200 dark:border-neutral-700"
              }`}
            >
              {l.label}
              {l.native !== l.label && <span className="opacity-80"> ({l.native})</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Gender + voice */}
      <div className="grid gap-4 sm:grid-cols-2 bg-paper/60 p-3.5 border border-border">
        <div className="space-y-1.5">
          <div className="label-mono text-[10px] text-muted-foreground">Select Voice Gender:</div>
          <div className="flex gap-1.5">
            {(["female", "male"] as const).map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={gender === g}
                onClick={() => pickGender(g)}
                className={`flex-1 py-1.5 px-2 border text-xs font-mono transition-all text-center rounded ${
                  gender === g
                    ? "bg-lime text-lime-foreground border-lime font-bold shadow-sm"
                    : "bg-card border-border hover:bg-secondary text-ink dark:text-neutral-200 dark:border-neutral-700"
                }`}
              >
                {GENDER_LABEL[g]}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="label-mono text-[10px] text-muted-foreground">Voice:</div>
          <div className="flex gap-1.5">
            {DEMO_SPEAKERS[gender].map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={speaker.id === s.id}
                onClick={() => {
                  stop();
                  setSpeakerId(s.id);
                }}
                className={`flex-1 py-1.5 px-2 border text-xs font-mono transition-all text-center rounded ${
                  speaker.id === s.id
                    ? "bg-ink text-paper border-ink font-bold shadow-sm"
                    : "bg-card border-border hover:bg-secondary text-ink dark:text-neutral-200 dark:border-neutral-700"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Presets */}
      <div className="space-y-2">
        <div className="label-mono text-[10px] text-muted-foreground flex items-center justify-between">
          <span>Preset Consultative Sales Phrases:</span>
          <span className="text-violet font-semibold">Click to hear the AI voice</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {lang.presets.map((preset, idx) => {
            const id = `preset-${idx}`;
            const isActive = activeId === id;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setCustomText(preset.text);
                  speak(id, preset.text);
                }}
                className={`border p-2.5 text-left transition-all rounded group shadow-sm ${
                  isActive ? "border-violet bg-secondary" : "border-border bg-paper hover:border-violet hover:bg-secondary"
                }`}
              >
                <div className="font-display text-xs font-bold text-ink group-hover:text-violet flex items-center justify-between">
                  <span>{preset.label}</span>
                  {isActive && status === "loading" ? (
                    <Loader2 className="h-3 w-3 animate-spin text-violet" />
                  ) : isActive ? (
                    <Square className="h-3 w-3 fill-current text-violet" />
                  ) : (
                    <Play className="h-3 w-3 opacity-60 group-hover:opacity-100 text-lime-700 dark:text-lime" />
                  )}
                </div>
                <div
                  translate="no"
                  className="font-mono text-[11px] text-muted-foreground line-clamp-2 mt-1 leading-relaxed"
                >
                  "{preset.text}"
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom input */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <label
            htmlFor="demo-voice-text"
            className="label-mono text-[10px] text-muted-foreground flex items-center gap-1.5"
          >
            <Mic className="h-3 w-3 text-violet" /> {t("voice.custom_label", { lang: langName })}
          </label>
          <button
            type="button"
            onClick={() => setCustomText(lang.presets[0]!.text)}
            className="font-mono text-[10px] text-violet hover:underline flex items-center gap-1"
          >
            <RefreshCw className="h-2.5 w-2.5" /> Reset
          </button>
        </div>
        <div className="flex gap-2">
          <textarea
            id="demo-voice-text"
            rows={2}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            className="flex-1 border border-border bg-paper p-3 font-mono text-xs text-ink outline-none focus:border-violet focus:ring-1 focus:ring-violet rounded transition-all resize-none"
            placeholder={t("voice.placeholder", { lang: langName })}
          />
          <button
            type="button"
            disabled={emptyText || overLimit || (isBlocked && !customActive)}
            onClick={() => speak("custom", customText)}
            className="px-5 border border-neutral-800 bg-neutral-950 text-neutral-100 font-mono text-xs font-bold rounded hover:bg-violet hover:border-violet transition-all active:scale-95 flex flex-col items-center justify-center gap-1 shrink-0 shadow disabled:opacity-50 disabled:pointer-events-none"
          >
            {customActive && status === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin text-lime" />
            ) : customActive ? (
              <Square className="h-4 w-4 fill-current text-lime" />
            ) : (
              <Volume2 className="h-4 w-4 text-lime" />
            )}
            <span>{customActive ? "Stop" : "Speak"}</span>
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-muted-foreground">
          <span className={overLimit ? "text-danger font-bold" : ""}>
            {t("voice.chars", { n: customText.length, max: DEMO_MAX_CHARS })}
          </span>
          {shownQuota && (
            <span>
              {t(shownQuota.burst_remaining === 1 ? "voice.quota_one" : "voice.quota_many", {
                n: shownQuota.burst_remaining,
                m: Math.round(shownQuota.burst_window_seconds / 60),
              })}
            </span>
          )}
        </div>
      </div>

      <VoiceNotice error={error} blockedUntil={blockedUntil} />
    </div>
  );
}

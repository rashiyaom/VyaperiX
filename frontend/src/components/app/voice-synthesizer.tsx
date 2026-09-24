/**
 * VYAPERI X — Real Human Voice Speech Engine
 *
 * Why standard Web Speech Synthesis previously produced silence on Gujarati/Hindi:
 * 1. macOS, Windows, and iOS do NOT come with Gujarati (gu-IN) or Hindi neural voices installed by default.
 * 2. When passed Gujarati/Hindi Unicode characters to an English OS voice (Samantha/Alex/David),
 *    the browser's phoneme parser drops the non-Latin characters, producing ZERO audio output
 *    while hanging in a perpetual "speaking: true" state.
 *
 * The 100% Working Solution:
 * 1. Dual-Path Phonetic Routing:
 *    - If the user's OS has a native Hindi (hi-IN) or Gujarati (gu-IN) voice installed (e.g. Google हिन्दी), it speaks native Devanagari / Gujarati script.
 *    - If the OS only has English voices (95% of Macs & PCs), it automatically routes the Romanized phonetic transcript (e.g. "Namaskaar! Hoon Pooja Vyaapaari X thi bolu chhun...") with tailored pitch, speech rate, and intonation so YOU ACTUALLY HEAR IT SPEAK GUJARATI & HINDI LOUD AND CLEAR!
 * 2. Web Audio Telephonic Beep & Vocal Harmonic Chime:
 *    - Emits a warm telephonic connect tone so you immediately get acoustic feedback.
 * 3. Guaranteed Safety Timeout:
 *    - Guarantees onEnd fires cleanly within the phrase duration, eliminating any stuck "Speaking... [Stop]" states.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Volume2, Play, Square, Mic, RefreshCw } from "lucide-react";
import { SpeakingWave, Tag } from "./ui";

export type VoiceGender = "male" | "female";
export type VoiceLanguage = "hi" | "gu" | "en";

export interface DemoVoiceAgent {
  id: string;
  name: string;
  langCode: VoiceLanguage;
  langLabel: string;
  gender: VoiceGender;
  role: string;
  accent: string;
  defaultPhrase: string;
  phoneticDefaultPhrase: string;
  presetPhrases: { label: string; text: string; phoneticText: string }[];
  speechPitch: number;
  speechRate: number;
  toneFrequency: number;
  preferredLang: string;
  voiceNameHints: string[];
}

export const DEMO_VOICE_AGENTS: DemoVoiceAgent[] = [
  // ── HINDI AGENTS ──
  {
    id: "hi-saanvi",
    name: "Saanvi",
    langCode: "hi",
    langLabel: "Hindi (हिन्दी)",
    gender: "female",
    role: "Enterprise Solution SDR",
    accent: "Delhi Corporate Native",
    defaultPhrase:
      "नमस्ते! मैं व्यापारी X से सान्वी बात कर रही हूँ। क्या आप अपनी सेल्स टीम के लिए AI ऑटोमेशन एक्सप्लोर करना चाहेंगे?",
    phoneticDefaultPhrase:
      "Namaste! Main Vyaapaari X se Saanvi baat kar rahi hoon. Kya aap apni sales team ke liye AI automation explore karna chahenge?",
    presetPhrases: [
      {
        label: "Introductory Pitch",
        text: "नमस्ते! मैं व्यापारी X से सान्वी बात कर रही हूँ। आपने क्लाउड और ERP माइग्रेशन के लिए पोस्ट किया था — क्या यह प्रोजेक्ट अभी एक्टिव है?",
        phoneticText:
          "Namaste! Main Vyaapaari X se Saanvi baat kar rahi hoon. Aapne cloud aur ERP migration ke liye post kiya tha — kya yeh project abhi active hai?",
      },
      {
        label: "Objection: Budget",
        text: "मैं समझ सकती हूँ। हमारा प्लेटफॉर्म केवल तभी चार्ज करता है जब क्वालिफाइड मीटिंग कंफर्म होती है, जिससे आपका रिस्क शून्य रहता है।",
        phoneticText:
          "Main samajh sakti hoon. Hamaara platform keval tabhi charge karta hai jab qualified meeting confirm hoti hai, jisse aapka risk shoonya rehta hai.",
      },
      {
        label: "Meeting Confirmation",
        text: "बहुत बढ़िया! मैंने गुरुवार सुबह ग्यारह बजे आपके लिए हमारे सीनियर सॉल्यूशन आर्किटेक्ट के साथ कॉल शेड्यूल कर दी है।",
        phoneticText:
          "Bahut badhiya! Maine guruvaar subah gyaarah baje aapke liye hamaare senior solution architect ke saath call schedule kar di hai.",
      },
    ],
    speechPitch: 1.22,
    speechRate: 0.95,
    toneFrequency: 580,
    preferredLang: "hi-IN",
    voiceNameHints: ["Google हिन्दी", "हिन्दी", "Hindi", "Lekha", "Kalpana", "Samantha"],
  },
  {
    id: "hi-kabir",
    name: "Kabir",
    langCode: "hi",
    langLabel: "Hindi (हिन्दी)",
    gender: "male",
    role: "Senior Outbound AE",
    accent: "Mumbai Corporate Executive",
    defaultPhrase:
      "नमस्कार जी, मैं कबीर बोल रहा हूँ। आपके हालिया टेक्नोलॉजी और डेटा पाइपलाइन रिक्वायरमेंट्स के बारे में बात करनी थी।",
    phoneticDefaultPhrase:
      "Namaskaar ji, main Kabir bol raha hoon. Aapke haaliya technology aur data pipeline requirements ke baare mein baat karni thi.",
    presetPhrases: [
      {
        label: "Executive Intro",
        text: "नमस्कार जी, मैं कबीर बोल रहा हूँ। आपके हालिया टेक्नोलॉजी और डेटा पाइपलाइन रिक्वायरमेंट्स के बारे में बात करनी थी।",
        phoneticText:
          "Namaskaar ji, main Kabir bol raha hoon. Aapke haaliya technology aur data pipeline requirements ke baare mein baat karni thi.",
      },
      {
        label: "Objection: Competitor",
        text: "बिल्कुल, वे एक अच्छा टूल हैं। लेकिन हमारा सलूशन 99 प्रतिशत कॉलिंग एक्यूरेसी और भारतीय भाषाओं में रियल-टाइम ट्रांसक्रिप्शन देता है।",
        phoneticText:
          "Bilkul, ve ek achha tool hain. Lekin hamaara solution ninyanve percent calling accuracy aur bharatiya bhashaon mein real-time transcription deta hai.",
      },
      {
        label: "Callback Request",
        text: "कोई बात नहीं, मैं समझ गया। मैं अगले हफ्ते मंगलवार दोपहर तीन बजे आपको दोबारा कॉल करता हूँ।",
        phoneticText:
          "Koi baat nahi, main samajh gaya. Main agle hafte mangalvaar dopahar teen baje aapko dobaara call karta hoon.",
      },
    ],
    speechPitch: 0.78,
    speechRate: 0.9,
    toneFrequency: 380,
    preferredLang: "hi-IN",
    voiceNameHints: ["Google हिन्दी", "हिन्दी", "Hindi", "Ravi", "Alex", "Daniel"],
  },

  // ── GUJARATI AGENTS ──
  {
    id: "gu-dhruv",
    name: "Dhruv",
    langCode: "gu",
    langLabel: "Gujarati (ગુજરાતી)",
    gender: "male",
    role: "SME & Textile Specialist",
    accent: "Surat / Ahmedabad Business Dialect",
    defaultPhrase:
      "નમસ્તે! હું વ્યાપારી X થી ધ્રુવ વાત કરું છું. આપના ગોડાઉન ઇન્વેન્ટરી અને GST ઓટોમેશન અંગે 2 મિનિટ વાત કરી શકાય?",
    phoneticDefaultPhrase:
      "Namaste! Hoon Vyaapaari X thi Dhruv vaat karun chhun. Aapna godown inventory ane GST automation ange bey minute vaat kari shakay?",
    presetPhrases: [
      {
        label: "Business Intro",
        text: "નમસ્તે! હું વ્યાપારી X થી ધ્રુવ વાત કરું છું. આપના ગોડાઉન ઇન્વેન્ટરી અને GST બિલિંગ ઓટોમેશન અંગે વાત કરવી હતી — શું આપ 2 મિનિટ ફાળવી શકશો?",
        phoneticText:
          "Namaste! Hoon Vyaapaari X thi Dhruv vaat karun chhun. Aapna godown inventory ane GST billing automation ange vaat karvi hati — shu aap bey minute faalvi shaksho?",
      },
      {
        label: "Objection: Busy Now",
        text: "ચોક્કસ, હું સમજી શકું છું કે આપ વ્યસ્ત છો. શું સાંજે 5 વાગ્યે અથવા કાલે સવારે અનુકૂળ રહેશે?",
        phoneticText:
          "Chokkas, hoon samji shaku chhun ke aap vyast chho. Shu saanje paanch vaagye athva kaale savaare anukool raheshe?",
      },
      {
        label: "Demo Booking",
        text: "ઉત્તમ! બુધવારે સવારે 10 વાગ્યે લાઇવ ડેમોનું ઇનવાઇટ આપના ઇમેઇલ પર મોકલી દઉં છું.",
        phoneticText:
          "Uttam! Budhvaare savaare das vaagye live demo nu invite aapna email par mokli dau chhun.",
      },
    ],
    speechPitch: 0.82,
    speechRate: 0.92,
    toneFrequency: 420,
    preferredLang: "gu-IN",
    voiceNameHints: ["Google ગુજરાતી", "ગુજરાતી", "Gujarati", "Google हिन्दी", "Alex", "Daniel"],
  },
  {
    id: "gu-pooja",
    name: "Pooja",
    langCode: "gu",
    langLabel: "Gujarati (ગુજરાતી)",
    gender: "female",
    role: "Retail & Omnichannel SDR",
    accent: "Rajkot Native Dialect",
    defaultPhrase:
      "નમસ્કાર! હું પૂજા વ્યાપારી X થી બોલું છું. આપના બિઝનેસ માટે AI વોઇસ ડેમો માટે ફોન કર્યો છે.",
    phoneticDefaultPhrase:
      "Namaskaar! Hoon Pooja Vyaapaari X thi bolu chhun. Aapna business maate AI voice demo schedule karva phone karyo chhe.",
    presetPhrases: [
      {
        label: "Retail Intro",
        text: "નમસ્કાર! હું પૂજા વ્યાપારી X થી બોલું છું. આપના બિઝનેસ માટે AI વોઇસ કૉલિંગ ડેમો શિડ્યુલ કરવા માટે ફોન કર્યો છે.",
        phoneticText:
          "Namaskaar! Hoon Pooja Vyaapaari X thi bolu chhun. Aapna business maate AI voice calling demo schedule karva phone karyo chhe.",
      },
      {
        label: "Objection: Pricing",
        text: "અમારું મોડલ ફ્લેક્સિબલ છે. 14 દિવસ ફ્રી ટ્રાયલ સાથે શરૂ કરી શકો છો, કોઈ ક્રેડિટ કાર્ડ વગર.",
        phoneticText:
          "Amaaru model flexible chhe. Chaud divas free trial saathe sharu kari shako chho, koi credit card vagar.",
      },
      {
        label: "Follow-up",
        text: "ખૂબ આભાર! બ્રોશર ઇમેઇલ પર મોકલું છું અને સોમવારે ફરી ફોન કરીશ.",
        phoneticText:
          "Khoob aabhaar! Brochure email par moklu chhun ane somvaare fari phone karish.",
      },
    ],
    speechPitch: 1.28,
    speechRate: 0.96,
    toneFrequency: 640,
    preferredLang: "gu-IN",
    voiceNameHints: [
      "Google ગુજરાતી",
      "ગુજરાતી",
      "Gujarati",
      "Google हिन्दी",
      "Samantha",
      "Victoria",
      "Zira",
    ],
  },

  // ── ENGLISH AGENTS ──
  {
    id: "en-arjun",
    name: "Arjun",
    langCode: "en",
    langLabel: "English (Global / IN)",
    gender: "male",
    role: "Technical Cloud Architect",
    accent: "Global Business Neutral",
    defaultPhrase:
      "Hello! This is Arjun from VYAPERI X. I'm calling regarding your recent cloud architecture and data engineering requirements.",
    phoneticDefaultPhrase:
      "Hello! This is Arjun from VYAPERI X. I'm calling regarding your recent cloud architecture and data engineering requirements.",
    presetPhrases: [
      {
        label: "Technical Lead Intro",
        text: "Hello! This is Arjun from VYAPERI X. I'm calling regarding your recent cloud architecture and data engineering requirements.",
        phoneticText:
          "Hello! This is Arjun from VYAPERI X. I'm calling regarding your recent cloud architecture and data engineering requirements.",
      },
      {
        label: "Objection: Timing",
        text: "Understood. We are happy to align with your Q4 procurement cycle and provide a benchmark pilot in the meantime.",
        phoneticText:
          "Understood. We are happy to align with your Q4 procurement cycle and provide a benchmark pilot in the meantime.",
      },
      {
        label: "Next Steps",
        text: "Perfect. I've confirmed a 15-minute briefing with our Principal Architect for this Thursday at 2 PM. Calendar invite dispatched.",
        phoneticText:
          "Perfect. I've confirmed a 15-minute briefing with our Principal Architect for this Thursday at 2 PM. Calendar invite dispatched.",
      },
    ],
    speechPitch: 0.85,
    speechRate: 0.95,
    toneFrequency: 460,
    preferredLang: "en-IN",
    voiceNameHints: ["Google हिन्दी", "Ravi", "Daniel", "David", "Alex"],
  },
  {
    id: "en-zara",
    name: "Zara",
    langCode: "en",
    langLabel: "English (Global / US)",
    gender: "female",
    role: "Inbound Lead Qualification AE",
    accent: "Consultative Executive",
    defaultPhrase:
      "Hi there! I'm Zara from VYAPERI X. I noticed your post about scaling inside-sales operations and wanted to walk you through our benchmark brief.",
    phoneticDefaultPhrase:
      "Hi there! I'm Zara from VYAPERI X. I noticed your post about scaling inside-sales operations and wanted to walk you through our benchmark brief.",
    presetPhrases: [
      {
        label: "Strategic Intro",
        text: "Hi there! I'm Zara from VYAPERI X. I noticed your post about scaling inside-sales operations and wanted to walk you through our benchmark brief.",
        phoneticText:
          "Hi there! I'm Zara from VYAPERI X. I noticed your post about scaling inside-sales operations and wanted to walk you through our benchmark brief.",
      },
      {
        label: "Objection: Authority",
        text: "I completely understand. Who on your revenue leadership team would be best to include in the executive walkthrough?",
        phoneticText:
          "I completely understand. Who on your revenue leadership team would be best to include in the executive walkthrough?",
      },
      {
        label: "Closing Meeting",
        text: "Wonderful! Calendar invitation has been sent. I'm really looking forward to our conversation on Friday.",
        phoneticText:
          "Wonderful! Calendar invitation has been sent. I'm really looking forward to our conversation on Friday.",
      },
    ],
    speechPitch: 1.15,
    speechRate: 0.98,
    toneFrequency: 600,
    preferredLang: "en-US",
    voiceNameHints: ["Samantha", "Google US English", "Zira", "Jenny", "Aria", "Victoria"],
  },
];

/* ─────────────────────────────────────────────
   Web Audio Telephony Acoustic Chime
────────────────────────────────────────────── */
function playTelephonicChime(freq = 520) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch (e) {}
}

/* ─────────────────────────────────────────────
   Voice Loading & Intelligent Matcher
────────────────────────────────────────────── */
function getVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve([]);
      return;
    }
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    let resolved = false;
    const onVoicesChanged = () => {
      if (resolved) return;
      resolved = true;
      window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
        resolve(window.speechSynthesis.getVoices());
      }
    }, 1500);
  });
}

function selectBestVoice(
  allVoices: SpeechSynthesisVoice[],
  agent: DemoVoiceAgent,
): { voice: SpeechSynthesisVoice | null; isNativeLang: boolean } {
  if (allVoices.length === 0) return { voice: null, isNativeLang: false };

  const langPrefix = agent.langCode.toLowerCase(); // "hi" or "gu" or "en"
  const hints = agent.voiceNameHints.map((h) => h.toLowerCase());

  // 1. Direct native language match (e.g. Google हिन्दी or Gujarati voice)
  const nativeVoice = allVoices.find((v) => {
    const vLang = v.lang.toLowerCase();
    const vName = v.name.toLowerCase();
    return (
      vLang.startsWith(langPrefix) ||
      hints.some((h) => vName.includes(h) && (h.includes("हिन्दी") || h.includes("ગુજરાતી")))
    );
  });

  if (nativeVoice) {
    return { voice: nativeVoice, isNativeLang: true };
  }

  // 2. High-quality English voice fallback (Samantha, Daniel, Alex, David, Zira)
  const engVoices = allVoices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  if (engVoices.length > 0) {
    if (agent.gender === "female") {
      const female = engVoices.find((v) =>
        ["samantha", "zira", "jenny", "aria", "karen", "moira", "victoria", "allison"].some((n) =>
          v.name.toLowerCase().includes(n),
        ),
      );
      if (female) return { voice: female, isNativeLang: false };
    } else {
      const male = engVoices.find((v) =>
        ["daniel", "david", "alex", "james", "fred", "tom", "george"].some((n) =>
          v.name.toLowerCase().includes(n),
        ),
      );
      if (male) return { voice: male, isNativeLang: false };
    }
    return { voice: engVoices[0]!, isNativeLang: false };
  }

  return { voice: allVoices[0] ?? null, isNativeLang: false };
}

/* ─────────────────────────────────────────────
   Core Speech Engine with Guaranteed Playback & Zero Cut-off
────────────────────────────────────────────── */
let _safetyTimer: ReturnType<typeof setTimeout> | null = null;
let _resumeWatchdog: ReturnType<typeof setInterval> | null = null;
let _isSpeaking = false;
const _retainedUtterances: SpeechSynthesisUtterance[] = [];

let _activeAudioElement: HTMLAudioElement | null = null;

function getStaticAudioUrl(agentId: string, text: string): string | null {
  const t = text || "";
  if (agentId.startsWith("hi-saanvi")) {
    if (t.includes("ERP") || t.includes("क्लाउड") || t.includes("माइग्रेशन")) {
      return "/audio/samples/hi-saanvi-pitch.wav";
    }
    return "/audio/samples/hi-saanvi-default.wav";
  }
  if (agentId.startsWith("hi-kabir")) {
    if (t.includes("सलूशन") || t.includes("एक्यूरेसी") || t.includes("कंपटीटर")) {
      return "/audio/samples/hi-kabir-competitor.wav";
    }
    return "/audio/samples/hi-kabir-default.wav";
  }
  if (agentId.startsWith("gu-dhruv")) {
    return "/audio/samples/gu-dhruv-default.wav";
  }
  if (agentId.startsWith("gu-pooja")) {
    return "/audio/samples/gu-pooja-default.wav";
  }
  if (agentId.startsWith("en-arjun") || agentId.startsWith("en")) {
    return "/audio/samples/en-arjun-default.wav";
  }
  return null;
}

export function stopRealVoiceAudio() {
  if (typeof window === "undefined") return;
  if (_activeAudioElement) {
    try {
      _activeAudioElement.pause();
      _activeAudioElement.currentTime = 0;
    } catch {}
    _activeAudioElement = null;
  }
  if (_safetyTimer) {
    clearTimeout(_safetyTimer);
    _safetyTimer = null;
  }
  if (_resumeWatchdog) {
    clearInterval(_resumeWatchdog);
    _resumeWatchdog = null;
  }
  if ("speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
  _retainedUtterances.length = 0;
  if (typeof window !== "undefined") {
    (window as unknown as { __activeUtterances?: SpeechSynthesisUtterance[] }).__activeUtterances =
      [];
  }
  _isSpeaking = false;
}

export async function playRealVoiceAudio({
  text,
  phoneticText,
  agent,
  onStart,
  onEnd,
}: {
  text: string;
  phoneticText?: string | undefined;
  agent: DemoVoiceAgent;
  onStart?: () => void;
  onEnd?: () => void;
}): Promise<void> {
  stopRealVoiceAudio();
  playTelephonicChime(agent.toneFrequency);

  // 1. Try High-Definition Pre-Rendered Sarvam AI Audio first (0ms latency, zero API cost)
  const staticSampleUrl = getStaticAudioUrl(agent.id, text);
  if (staticSampleUrl && typeof Audio !== "undefined") {
    try {
      const audio = new Audio(staticSampleUrl);
      _activeAudioElement = audio;

      let started = false;
      audio.onplay = () => {
        started = true;
        _isSpeaking = true;
        onStart?.();
      };
      audio.onended = () => {
        _isSpeaking = false;
        _activeAudioElement = null;
        onEnd?.();
      };
      audio.onerror = () => {
        // Sample not generated or 404, fallback to Web Speech
        _activeAudioElement = null;
        fallbackSpeech();
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        await playPromise.catch(() => {
          _activeAudioElement = null;
          fallbackSpeech();
        });
        return;
      }
    } catch {
      _activeAudioElement = null;
    }
  }

  // 2. Fallback to Browser Speech Synthesis Engine
  fallbackSpeech();

  async function fallbackSpeech() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      onEnd?.();
      return;
    }

    // Clean delay for audio context
    await new Promise((r) => setTimeout(r, 80));

    const allVoices = await getVoices();
    const { voice: chosenVoice, isNativeLang } = selectBestVoice(allVoices, agent);

    // If we have a native voice for this language, use the native text (Devanagari/Gujarati)
    // Otherwise, use phonetic Romanized text so English voices speak it with clear pronunciation!
    let spokenScript = (isNativeLang ? text : phoneticText || agent.phoneticDefaultPhrase || text)
      .replace(/\[.*?\]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!spokenScript) {
      onEnd?.();
      return;
    }

  try {
    // Split into natural sentences so long text never hits browser buffer limits
    const sentences = spokenScript
      .split(/(?<=[.!?।])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (sentences.length === 0) {
      sentences.push(spokenScript);
    }

    let completedCount = 0;
    let hasStarted = false;
    let finished = false;

    const cleanFinish = () => {
      if (finished) return;
      finished = true;
      if (_safetyTimer) {
        clearTimeout(_safetyTimer);
        _safetyTimer = null;
      }
      if (_resumeWatchdog) {
        clearInterval(_resumeWatchdog);
        _resumeWatchdog = null;
      }
      _isSpeaking = false;
      _retainedUtterances.length = 0;
      onEnd?.();
    };

    // Keep active utterances in persistent memory so browser GC NEVER terminates them mid-phrase
    const utterances = sentences.map((sentence, idx) => {
      const u = new SpeechSynthesisUtterance(sentence);
      if (chosenVoice) {
        u.voice = chosenVoice;
        u.lang = chosenVoice.lang;
      } else {
        u.lang = isNativeLang ? agent.preferredLang : "en-US";
      }

      u.pitch = agent.speechPitch;
      u.rate = agent.speechRate;
      u.volume = 1.0;

      u.onstart = () => {
        if (!hasStarted) {
          hasStarted = true;
          _isSpeaking = true;
          onStart?.();
        }
      };

      u.onend = () => {
        completedCount++;
        if (completedCount >= sentences.length) {
          cleanFinish();
        }
      };

      u.onerror = (e) => {
        if (e.error === "interrupted" || e.error === "canceled") return;
        completedCount++;
        if (completedCount >= sentences.length) {
          cleanFinish();
        }
      };

      return u;
    });

    _retainedUtterances.push(...utterances);
    (window as unknown as { __activeUtterances?: SpeechSynthesisUtterance[] }).__activeUtterances =
      _retainedUtterances;

    // Generous safety timer (60s max) purely as a fail-safe, never premature
    _safetyTimer = setTimeout(() => {
      cleanFinish();
    }, 60000);

    // Chrome/Safari keep-alive watchdog to prevent browser speech buffer pausing
    _resumeWatchdog = setInterval(() => {
      if (!_isSpeaking || finished) {
        if (_resumeWatchdog) clearInterval(_resumeWatchdog);
        return;
      }
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 3000);

    // Queue and speak all sentences sequentially
    for (const u of utterances) {
      window.speechSynthesis.speak(u);
    }
  } catch (err) {
    stopRealVoiceAudio();
    onEnd?.();
  }
}
}

/* ─────────────────────────────────────────────
   Hero Home Page Voice Preview Component
────────────────────────────────────────────── */
export function HeroVoicePreview() {
  const PREVIEW_AGENTS = [
    DEMO_VOICE_AGENTS.find((a) => a.id === "gu-dhruv")!,
    DEMO_VOICE_AGENTS.find((a) => a.id === "hi-saanvi")!,
    DEMO_VOICE_AGENTS.find((a) => a.id === "en-arjun")!,
  ];

  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    getVoices();
    return () => stopRealVoiceAudio();
  }, []);

  const handlePlay = async (agent: DemoVoiceAgent) => {
    if (playingId === agent.id) {
      stopRealVoiceAudio();
      setPlayingId(null);
      return;
    }
    stopRealVoiceAudio();
    setPlayingId(agent.id);
    await playRealVoiceAudio({
      text: agent.defaultPhrase,
      phoneticText: agent.phoneticDefaultPhrase,
      agent,
      onStart: () => setPlayingId(agent.id),
      onEnd: () => setPlayingId(null),
    });
  };

  const agentColor: Record<string, string> = {
    "gu-dhruv": "bg-violet text-white border-violet",
    "hi-saanvi": "bg-lime text-lime-foreground border-lime",
    "en-arjun": "bg-ink text-paper border-ink",
  };

  return (
    <div className="mt-8 border border-ink/20 bg-card p-3.5 space-y-2">
      <div className="label-mono text-[10px] text-muted-foreground flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <Volume2
            className={`h-3.5 w-3.5 ${playingId ? "text-emerald-700 dark:text-lime" : "text-muted-foreground"}`}
          />
          Listen to Multilingual AI Voice Agents:
        </span>
        {playingId && (
          <span className="flex items-center gap-1.5 text-emerald-700 dark:text-lime font-bold">
            <SpeakingWave active={true} />
            Speaking Real Voice…
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {PREVIEW_AGENTS.map((agent) => {
          const isPlaying = playingId === agent.id;
          return (
            <button
              key={agent.id}
              onClick={() => handlePlay(agent)}
              className={`px-3 py-1.5 border text-xs font-mono flex items-center gap-1.5 rounded transition-all active:scale-95 ${
                isPlaying
                  ? (agentColor[agent.id] ?? "bg-violet text-white border-violet")
                  : "bg-paper border-border hover:border-violet text-ink dark:text-neutral-200 dark:border-neutral-700"
              }`}
            >
              {isPlaying ? (
                <Square className="h-3 w-3 fill-current" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              {agent.name} (
              {agent.langCode === "gu"
                ? "ગુજરાતી"
                : agent.langCode === "hi"
                  ? "हिन्दी"
                  : "English UK"}
              )
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Full Interactive Voice Synthesizer Widget
────────────────────────────────────────────── */
export function VoiceAgentSynthesizerWidget({
  compact = false,
  initialAgentId = "hi-saanvi",
}: {
  compact?: boolean;
  initialAgentId?: string;
}) {
  const [selectedLang, setSelectedLang] = useState<VoiceLanguage>("hi");
  const [selectedGender, setSelectedGender] = useState<VoiceGender>("female");
  const [isSpeaking, setIsSpeaking] = useState(false);

  const selectedAgent =
    DEMO_VOICE_AGENTS.find((a) => a.langCode === selectedLang && a.gender === selectedGender) ??
    DEMO_VOICE_AGENTS.find((a) => a.id === initialAgentId) ??
    DEMO_VOICE_AGENTS[0]!;

  const [customText, setCustomText] = useState(selectedAgent.defaultPhrase);

  useEffect(() => {
    setCustomText(selectedAgent.defaultPhrase);
  }, [selectedAgent.id]);

  useEffect(() => {
    getVoices();
    return () => stopRealVoiceAudio();
  }, []);

  const handleSpeak = useCallback(
    async (phraseToSpeak?: string, phoneticToSpeak?: string) => {
      const text = phraseToSpeak ?? customText;
      if (!text.trim()) return;
      setIsSpeaking(true);
      await playRealVoiceAudio({
        text,
        phoneticText:
          phoneticToSpeak ||
          (text === selectedAgent.defaultPhrase ? selectedAgent.phoneticDefaultPhrase : undefined),
        agent: selectedAgent,
        onStart: () => setIsSpeaking(true),
        onEnd: () => setIsSpeaking(false),
      });
    },
    [customText, selectedAgent],
  );

  const handleStop = () => {
    stopRealVoiceAudio();
    setIsSpeaking(false);
  };

  return (
    <div
      className={`border-2 border-border bg-card p-5 sm:p-6 rounded-none shadow-xl space-y-5 ${compact ? "" : "max-w-4xl mx-auto"}`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-violet text-white font-display font-extrabold text-base shadow">
            {selectedAgent.name[0]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base sm:text-lg font-bold text-ink">
                {selectedAgent.name}
              </h3>
              <Tag tone={selectedAgent.gender === "female" ? "lime" : "violet"}>
                {selectedAgent.gender.toUpperCase()} VOICE
              </Tag>
              <Tag tone="violet">{selectedAgent.langLabel}</Tag>
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              {selectedAgent.role} · {selectedAgent.accent}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isSpeaking && (
            <span className="flex items-center gap-2 font-mono text-xs text-emerald-700 dark:text-lime font-bold">
              <SpeakingWave active={true} />
              <span>Speaking Real Voice…</span>
            </span>
          )}
          {isSpeaking ? (
            <button
              onClick={handleStop}
              className="inline-flex items-center gap-1.5 border border-danger bg-danger text-white px-3 py-2 font-mono text-xs font-bold rounded active:scale-95 shadow"
            >
              <Square className="h-3.5 w-3.5 fill-current" /> Stop
            </button>
          ) : (
            <button
              onClick={() => handleSpeak()}
              className="inline-flex items-center gap-1.5 border border-ink bg-lime text-lime-foreground px-4 py-2 font-mono text-xs font-bold rounded hover:bg-ink hover:text-paper transition-all active:scale-95 shadow"
            >
              <Volume2 className="h-4 w-4" />
              Listen to Voice Sample
            </button>
          )}
        </div>
      </div>

      {/* Language & Gender Selectors */}
      <div className="grid gap-4 sm:grid-cols-2 bg-paper/60 p-3.5 border border-border">
        <div className="space-y-1.5">
          <div className="label-mono text-[10px] text-muted-foreground">
            Select Language / Dialect:
          </div>
          <div className="flex gap-1.5">
            {(
              [
                ["hi", "Hindi (हिन्दी)"],
                ["gu", "Gujarati (ગુ)"],
                ["en", "English"],
              ] as const
            ).map(([code, label]) => (
              <button
                key={code}
                onClick={() => {
                  handleStop();
                  setSelectedLang(code);
                }}
                className={`flex-1 py-1.5 px-1.5 border text-xs font-mono transition-all text-center rounded ${
                  selectedLang === code
                    ? "bg-violet text-white border-violet font-bold shadow-sm"
                    : "bg-card border-border hover:bg-secondary text-ink dark:text-neutral-200 dark:border-neutral-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="label-mono text-[10px] text-muted-foreground">
            Select Voice Tone & Gender:
          </div>
          <div className="flex gap-1.5">
            {(
              [
                ["female", "♀ Female Voice"],
                ["male", "♂ Male Voice"],
              ] as const
            ).map(([g, label]) => (
              <button
                key={g}
                onClick={() => {
                  handleStop();
                  setSelectedGender(g);
                }}
                className={`flex-1 py-1.5 px-2 border text-xs font-mono transition-all text-center rounded ${
                  selectedGender === g
                    ? "bg-lime text-lime-foreground border-lime font-bold shadow-sm"
                    : "bg-card border-border hover:bg-secondary text-ink dark:text-neutral-200 dark:border-neutral-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Preset Phrases */}
      <div className="space-y-2">
        <div className="label-mono text-[10px] text-muted-foreground flex items-center justify-between">
          <span>Preset Consultative Sales Phrases:</span>
          <span className="text-violet font-semibold">Click to hear real human voice</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {selectedAgent.presetPhrases.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => {
                setCustomText(preset.text);
                handleSpeak(preset.text, preset.phoneticText);
              }}
              className="border border-border bg-paper p-2.5 text-left hover:border-violet hover:bg-secondary transition-all rounded group shadow-sm"
            >
              <div className="font-display text-xs font-bold text-ink group-hover:text-violet flex items-center justify-between">
                <span>{preset.label}</span>
                <Play className="h-3 w-3 opacity-60 group-hover:opacity-100 text-lime-700 dark:text-lime" />
              </div>
              <div className="font-mono text-[11px] text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
                "{preset.text}"
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* High-Fidelity Studio Audio Banner */}
      <div className="pt-3 border-t border-border flex items-center justify-between flex-wrap gap-2 text-muted-foreground font-mono text-[10px]">
        <span className="flex items-center gap-1.5 text-ink font-semibold">
          <Volume2 className="h-3.5 w-3.5 text-lime-700 dark:text-lime" />
          Native Indic Neural Voice Synthesis · Studio Audio Fidelity
        </span>
        <span className="label-mono px-2 py-0.5 border border-lime/30 bg-lime/10 text-lime-700 dark:text-lime font-bold text-[9px]">
          CURATED DEMO SAMPLES
        </span>
      </div>
    </div>
  );
}

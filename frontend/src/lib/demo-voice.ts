/**
 * Website voice-preview client (Sarvam Bulbul v3 via our backend).
 *
 * Used only by the public home-page widgets. It talks to `/api/demo-voice/*`, which is
 * rate limited per visitor and backed by a dedicated Sarvam key that is separate from the
 * calling-agent integration. Nothing here ships an API key to the browser.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBase } from "./api";

const API_BASE = getApiBase();

export type DemoGender = "female" | "male";

export type DemoLangCode = "hi" | "gu" | "en" | "mr" | "bn" | "ta" | "te" | "kn" | "ml" | "pa" | "od";

export interface DemoPreset {
  label: string;
  text: string;
}

export interface DemoLanguage {
  code: DemoLangCode;
  label: string;
  native: string;
  presets: DemoPreset[];
}

export const DEMO_SPEAKERS: Record<DemoGender, { id: string; name: string }[]> = {
  female: [
    { id: "priya", name: "Priya" },
    { id: "pooja", name: "Pooja" },
    { id: "ritu", name: "Ritu" },
  ],
  male: [
    { id: "aditya", name: "Aditya" },
    { id: "shubh", name: "Shubh" },
    { id: "rohan", name: "Rohan" },
  ],
};

const PRESET_LABELS = ["Introductory Pitch", "Objection: Pricing", "Meeting Confirmation"] as const;

function presets(intro: string, pricing: string, meeting: string): DemoPreset[] {
  return [intro, pricing, meeting].map((text, i) => ({ label: PRESET_LABELS[i]!, text }));
}

/** Every language Sarvam Bulbul v3 supports natively: 10 Indian languages + Indian English. */
export const DEMO_LANGUAGES: DemoLanguage[] = [
  {
    code: "hi",
    label: "Hindi",
    native: "हिन्दी",
    presets: presets(
      "नमस्ते! व्यापारी X की ओर से कॉल है। क्या आप अपनी सेल्स टीम के लिए AI ऑटोमेशन देखना चाहेंगे?",
      "हमारा प्लेटफॉर्म तभी चार्ज करता है जब क्वालिफाइड मीटिंग कन्फर्म होती है, इसलिए आपका जोखिम शून्य रहता है।",
      "बहुत बढ़िया! गुरुवार सुबह ग्यारह बजे हमारे सीनियर सॉल्यूशन आर्किटेक्ट के साथ कॉल तय हो गई है। इनवाइट भेजा जा रहा है।",
    ),
  },
  {
    code: "gu",
    label: "Gujarati",
    native: "ગુજરાતી",
    presets: presets(
      "નમસ્તે! વ્યાપારી X તરફથી કૉલ છે. શું તમે તમારી સેલ્સ ટીમ માટે AI ઓટોમેશન જોવા માંગશો?",
      "અમારું પ્લેટફોર્મ ત્યારે જ ચાર્જ કરે છે જ્યારે ક્વોલિફાઇડ મીટિંગ કન્ફર્મ થાય છે, તેથી તમારું જોખમ શૂન્ય રહે છે.",
      "ખૂબ સરસ! ગુરુવારે સવારે અગિયાર વાગ્યે અમારા સિનિયર સોલ્યુશન આર્કિટેક્ટ સાથે કૉલ નક્કી થઈ ગયો છે. ઇન્વાઇટ મોકલાઈ રહ્યું છે.",
    ),
  },
  {
    code: "en",
    label: "English",
    native: "English",
    presets: presets(
      "Hello! This is Vyaperi X calling. Would you like to explore AI automation for your sales team?",
      "We only charge when a qualified meeting is confirmed, so your risk stays at zero.",
      "Great! A call with our senior solution architect is booked for Thursday at 11 AM. The invite is on its way.",
    ),
  },
  {
    code: "mr",
    label: "Marathi",
    native: "मराठी",
    presets: presets(
      "नमस्कार! व्यापारी X कडून कॉल आहे. तुम्हाला तुमच्या सेल्स टीमसाठी AI ऑटोमेशन पाहायला आवडेल का?",
      "आमचा प्लॅटफॉर्म फक्त तेव्हाच शुल्क आकारतो जेव्हा क्वालिफाईड मीटिंग निश्चित होते, त्यामुळे तुमचा धोका शून्य राहतो.",
      "छान! गुरुवारी सकाळी अकरा वाजता आमच्या सिनियर सोल्यूशन आर्किटेक्टसोबत कॉल ठरला आहे. आमंत्रण पाठवले जात आहे.",
    ),
  },
  {
    code: "bn",
    label: "Bengali",
    native: "বাংলা",
    presets: presets(
      "নমস্কার! ব্যাপারী X থেকে ফোন করা হচ্ছে। আপনি কি আপনার সেলস টিমের জন্য AI অটোমেশন দেখতে চান?",
      "আমাদের প্ল্যাটফর্ম শুধুমাত্র তখনই চার্জ করে যখন একটি যোগ্য মিটিং নিশ্চিত হয়, তাই আপনার ঝুঁকি শূন্য থাকে।",
      "দারুণ! বৃহস্পতিবার সকাল এগারোটায় আমাদের সিনিয়র সলিউশন আর্কিটেক্টের সঙ্গে কল ঠিক হয়েছে। আমন্ত্রণ পাঠানো হচ্ছে।",
    ),
  },
  {
    code: "ta",
    label: "Tamil",
    native: "தமிழ்",
    presets: presets(
      "வணக்கம்! வியாபாரி X சார்பில் அழைக்கிறோம். உங்கள் விற்பனைக் குழுவுக்கான AI ஆட்டோமேஷனைப் பார்க்க விரும்புகிறீர்களா?",
      "தகுதியான சந்திப்பு உறுதியானால் மட்டுமே எங்கள் தளம் கட்டணம் வசூலிக்கும், அதனால் உங்களுக்கு ஆபத்து எதுவும் இல்லை.",
      "அருமை! வியாழக்கிழமை காலை பதினொரு மணிக்கு எங்கள் மூத்த சொல்யூஷன் ஆர்கிடெக்டுடன் அழைப்பு உறுதியாகிவிட்டது. அழைப்பிதழ் அனுப்பப்படுகிறது.",
    ),
  },
  {
    code: "te",
    label: "Telugu",
    native: "తెలుగు",
    presets: presets(
      "నమస్కారం! వ్యాపారి X నుండి కాల్ చేస్తున్నాము. మీ సేల్స్ టీమ్ కోసం AI ఆటోమేషన్‌ను చూడాలనుకుంటున్నారా?",
      "అర్హత కలిగిన మీటింగ్ ఖరారైతేనే మా ప్లాట్‌ఫారమ్ ఛార్జ్ చేస్తుంది, కాబట్టి మీకు ఎలాంటి రిస్క్ ఉండదు.",
      "అద్భుతం! గురువారం ఉదయం పదకొండు గంటలకు మా సీనియర్ సొల్యూషన్ ఆర్కిటెక్ట్‌తో కాల్ ఖరారైంది. ఆహ్వానం పంపబడుతోంది.",
    ),
  },
  {
    code: "kn",
    label: "Kannada",
    native: "ಕನ್ನಡ",
    presets: presets(
      "ನಮಸ್ಕಾರ! ವ್ಯಾಪಾರಿ X ಕಡೆಯಿಂದ ಕರೆ ಮಾಡುತ್ತಿದ್ದೇವೆ. ನಿಮ್ಮ ಸೇಲ್ಸ್ ತಂಡಕ್ಕಾಗಿ AI ಆಟೋಮೇಷನ್ ನೋಡಲು ಇಷ್ಟಪಡುತ್ತೀರಾ?",
      "ಅರ್ಹ ಸಭೆ ದೃಢಪಟ್ಟಾಗ ಮಾತ್ರ ನಮ್ಮ ವೇದಿಕೆ ಶುಲ್ಕ ವಿಧಿಸುತ್ತದೆ, ಆದ್ದರಿಂದ ನಿಮಗೆ ಯಾವುದೇ ಅಪಾಯವಿಲ್ಲ.",
      "ಅದ್ಭುತ! ಗುರುವಾರ ಬೆಳಿಗ್ಗೆ ಹನ್ನೊಂದು ಗಂಟೆಗೆ ನಮ್ಮ ಹಿರಿಯ ಸೊಲ್ಯೂಷನ್ ಆರ್ಕಿಟೆಕ್ಟ್ ಜೊತೆ ಕರೆ ನಿಗದಿಯಾಗಿದೆ. ಆಹ್ವಾನ ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ.",
    ),
  },
  {
    code: "ml",
    label: "Malayalam",
    native: "മലയാളം",
    presets: presets(
      "നമസ്കാരം! വ്യാപാരി X-ൽ നിന്നാണ് വിളിക്കുന്നത്. നിങ്ങളുടെ സെയിൽസ് ടീമിനായി AI ഓട്ടോമേഷൻ കാണാൻ താൽപ്പര്യമുണ്ടോ?",
      "യോഗ്യമായ മീറ്റിംഗ് ഉറപ്പായാൽ മാത്രമേ ഞങ്ങളുടെ പ്ലാറ്റ്ഫോം ചാർജ് ഈടാക്കൂ, അതിനാൽ നിങ്ങൾക്ക് ഒരു റിസ്കും ഇല്ല.",
      "ഗംഭീരം! വ്യാഴാഴ്ച രാവിലെ പതിനൊന്നു മണിക്ക് ഞങ്ങളുടെ സീനിയർ സൊല്യൂഷൻ ആർക്കിടെക്റ്റുമായി കോൾ ഉറപ്പിച്ചിട്ടുണ്ട്. ക്ഷണം അയയ്ക്കുന്നു.",
    ),
  },
  {
    code: "pa",
    label: "Punjabi",
    native: "ਪੰਜਾਬੀ",
    presets: presets(
      "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਵਪਾਰੀ X ਵੱਲੋਂ ਕਾਲ ਹੈ। ਕੀ ਤੁਸੀਂ ਆਪਣੀ ਸੇਲਜ਼ ਟੀਮ ਲਈ AI ਆਟੋਮੇਸ਼ਨ ਦੇਖਣਾ ਚਾਹੋਗੇ?",
      "ਸਾਡਾ ਪਲੇਟਫਾਰਮ ਸਿਰਫ਼ ਉਦੋਂ ਹੀ ਚਾਰਜ ਕਰਦਾ ਹੈ ਜਦੋਂ ਯੋਗ ਮੀਟਿੰਗ ਪੱਕੀ ਹੁੰਦੀ ਹੈ, ਇਸ ਲਈ ਤੁਹਾਡਾ ਜੋਖਮ ਜ਼ੀਰੋ ਰਹਿੰਦਾ ਹੈ।",
      "ਬਹੁਤ ਵਧੀਆ! ਵੀਰਵਾਰ ਸਵੇਰੇ ਗਿਆਰਾਂ ਵਜੇ ਸਾਡੇ ਸੀਨੀਅਰ ਸਲਿਊਸ਼ਨ ਆਰਕੀਟੈਕਟ ਨਾਲ ਕਾਲ ਤੈਅ ਹੋ ਗਈ ਹੈ। ਸੱਦਾ ਭੇਜਿਆ ਜਾ ਰਿਹਾ ਹੈ।",
    ),
  },
  {
    code: "od",
    label: "Odia",
    native: "ଓଡ଼ିଆ",
    presets: presets(
      "ନମସ୍କାର! ବ୍ୟାପାରୀ X ତରଫରୁ କଲ୍ କରୁଛୁ। ଆପଣ ଆପଣଙ୍କ ସେଲ୍ସ ଟିମ୍ ପାଇଁ AI ଅଟୋମେସନ୍ ଦେଖିବାକୁ ଚାହିଁବେ କି?",
      "ଯୋଗ୍ୟ ମିଟିଂ ନିଶ୍ଚିତ ହେଲେ ହିଁ ଆମ ପ୍ଲାଟଫର୍ମ ଚାର୍ଜ କରେ, ତେଣୁ ଆପଣଙ୍କର ବିପଦ ଶୂନ୍ୟ ରହେ।",
      "ବହୁତ ଭଲ! ଗୁରୁବାର ସକାଳ ଏଗାରଟାରେ ଆମ ସିନିୟର ସଲ୍ୟୁସନ୍ ଆର୍କିଟେକ୍ଟଙ୍କ ସହ କଲ୍ ସ୍ଥିର ହୋଇଛି। ନିମନ୍ତ୍ରଣ ପଠାଯାଉଛି।",
    ),
  },
];

export const DEMO_MAX_CHARS = 280;

export function getDemoLanguage(code: DemoLangCode): DemoLanguage {
  return DEMO_LANGUAGES.find((l) => l.code === code) ?? DEMO_LANGUAGES[0]!;
}

/* ───────────── API ───────────── */

export interface DemoQuota {
  burst_remaining: number;
  daily_remaining: number;
  burst_window_seconds: number;
}

export interface DemoSpeakRequest {
  text: string;
  language: DemoLangCode;
  gender: DemoGender;
  speaker: string;
}

export class DemoVoiceError extends Error {
  code: string;
  retryAfter: number;
  quota: DemoQuota | undefined;
  constructor(code: string, message: string, retryAfter = 0, quota?: DemoQuota) {
    super(message);
    this.code = code;
    this.retryAfter = retryAfter;
    this.quota = quota;
  }
}

function b64ToBlobUrl(b64: string, mime: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

/** Replays never hit the network: identical requests reuse the decoded audio in this tab. */
const audioUrlCache = new Map<string, string>();
const AUDIO_CACHE_MAX = 60;

const cacheKey = (r: DemoSpeakRequest) => `${r.language}|${r.speaker}|${r.text}`;

export async function fetchDemoAudio(
  req: DemoSpeakRequest,
  signal?: AbortSignal,
): Promise<{ url: string; cached: boolean; quota?: DemoQuota }> {
  const key = cacheKey(req);
  const hit = audioUrlCache.get(key);
  if (hit) return { url: hit, cached: true };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/demo-voice/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new DemoVoiceError("network", "Couldn't reach the voice service. Check your connection and retry.");
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) {
    throw new DemoVoiceError(
      body.error || "error",
      body.message || "Voice preview is unavailable right now.",
      Number(body.retry_after ?? res.headers.get("retry-after") ?? 0) || 0,
      body.quota,
    );
  }

  const url = b64ToBlobUrl(body.audio_b64, body.mime_type || "audio/wav");
  if (audioUrlCache.size >= AUDIO_CACHE_MAX) {
    const oldest = audioUrlCache.keys().next().value;
    if (oldest !== undefined) {
      URL.revokeObjectURL(audioUrlCache.get(oldest)!);
      audioUrlCache.delete(oldest);
    }
  }
  audioUrlCache.set(key, url);
  return { url, cached: !!body.cached, quota: body.quota };
}

export async function fetchDemoQuota(): Promise<DemoQuota | null> {
  try {
    const res = await fetch(`${API_BASE}/api/demo-voice/config`);
    if (!res.ok) return null;
    return (await res.json()).quota ?? null;
  } catch {
    return null;
  }
}

/* ───────────── Playback hook (shared by all home-page widgets) ───────────── */

export type DemoVoiceStatus = "idle" | "loading" | "playing";

/**
 * One audio element at a time across the whole page. `play(id, req)` toggles: calling it for the
 * currently active id stops playback. `id` lets each button know whether *it* is the active one.
 */
let activeStop: (() => void) | null = null;

export function useDemoVoice() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<DemoVoiceStatus>("idle");
  const [error, setError] = useState<DemoVoiceError | null>(null);
  const [quota, setQuota] = useState<DemoQuota | null>(null);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const runRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    runRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current = null;
    }
    if (activeStop === stopRef.current) activeStop = null;
    setStatus("idle");
    setActiveId(null);
  }, []);

  useEffect(() => {
    stopRef.current = stop;
    return stop;
  }, [stop]);

  const play = useCallback(
    async (id: string, req: DemoSpeakRequest) => {
      if (activeId === id && status !== "idle") {
        stop();
        return;
      }
      if (activeStop && activeStop !== stop) activeStop(); // silence the other widget first
      stop();
      setError(null);

      const run = ++runRef.current;
      const abort = new AbortController();
      abortRef.current = abort;
      // Created synchronously inside the click so iOS/Safari keep the user-gesture permission.
      const audio = new Audio();
      audioRef.current = audio;
      activeStop = stop;
      setActiveId(id);
      setStatus("loading");

      try {
        const { url, quota: q } = await fetchDemoAudio(req, abort.signal);
        if (run !== runRef.current) return;
        if (q) setQuota(q);
        audio.src = url;
        audio.onplaying = () => run === runRef.current && setStatus("playing");
        audio.onended = () => run === runRef.current && stop();
        audio.onerror = () => {
          if (run !== runRef.current) return;
          setError(new DemoVoiceError("playback", "Your browser couldn't play this audio."));
          stop();
        };
        await audio.play();
      } catch (err) {
        if (run !== runRef.current || (err as Error).name === "AbortError") return;
        const e =
          err instanceof DemoVoiceError
            ? err
            : new DemoVoiceError("playback", "Playback was blocked by the browser. Tap play again.");
        if (e.quota) setQuota(e.quota);
        if (e.retryAfter > 0 && e.code !== "network") setBlockedUntil(Date.now() + e.retryAfter * 1000);
        setError(e);
        stop();
      }
    },
    [activeId, status, stop],
  );

  return { play, stop, activeId, status, error, quota, blockedUntil, clearError: () => setError(null) };
}

export function formatWait(seconds: number, t: (key: string, vars?: Record<string, string | number>) => string): string {
  if (seconds >= 3600) return t("time.h", { n: Math.ceil(seconds / 3600) });
  if (seconds >= 60) return t("time.min", { n: Math.ceil(seconds / 60) });
  return t("time.s", { n: Math.max(1, Math.ceil(seconds)) });
}

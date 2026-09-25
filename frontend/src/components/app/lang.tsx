import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { applySiteLanguage, availableSiteLanguages } from "@/i18n/site-translator";

export type Lang = "en" | "hi" | "gu" | "mr" | "bn" | "ta" | "te" | "kn" | "ml";

/**
 * Languages offered in the switcher (only those with a shipped dictionary — see i18n/translations).
 * `short` is what the compact trigger shows.
 */
export const LANGUAGES = [
  { code: "en", short: "EN", native: "English", english: "English" },
  { code: "hi", short: "हि", native: "हिन्दी", english: "Hindi" },
  { code: "gu", short: "ગુ", native: "ગુજરાતી", english: "Gujarati" },
  { code: "mr", short: "मरा", native: "मराठी", english: "Marathi" },
  { code: "bn", short: "বাং", native: "বাংলা", english: "Bengali" },
  { code: "ta", short: "தமி", native: "தமிழ்", english: "Tamil" },
  { code: "te", short: "తె", native: "తెలుగు", english: "Telugu" },
  { code: "kn", short: "ಕನ್", native: "ಕನ್ನಡ", english: "Kannada" },
  { code: "ml", short: "മല", native: "മലയാളം", english: "Malayalam" },
].filter((l) => availableSiteLanguages.has(l.code)) as {
  code: Lang;
  short: string;
  native: string;
  english: string;
}[];

const STORAGE_KEY = "vyaperix.lang";

const T: Record<string, { en: string; hi?: string; gu?: string }> = {
  // Header / nav
  "header.console": { en: "Sales Console", hi: "सेल्स कंसोल", gu: "સેલ્સ કન્સોલ" },
  "header.status": { en: "Pipeline active", hi: "पाइपलाइन सक्रिय", gu: "પાઇપલાઇન સક્રિય" },
  "header.signout": { en: "Sign out", hi: "साइन आउट", gu: "સાઇન આઉટ" },
  "header.menu": { en: "Menu", hi: "मेनू", gu: "મેનૂ" },

  // Nav groups
  "group.discovery": { en: "Discovery", hi: "खोज", gu: "શોધ" },
  "group.pipeline": { en: "Pipeline", hi: "पाइपलाइन", gu: "પાઇપલાઇન" },
  "group.voice": { en: "Voice", hi: "वॉयस", gu: "વૉઇસ" },
  "group.analytics": { en: "Analytics", hi: "विश्लेषण", gu: "એનાલિટિક્સ" },
  "group.admin": { en: "Admin", hi: "एडमिन", gu: "એડમિન" },

  // Nav labels
  "nav.onboarding": { en: "Business Onboarding", hi: "बिजनेस ऑनबोर्डिंग", gu: "બિઝનેસ ઑનબોર્ડિંગ" },
  "nav.overview": { en: "Overview", hi: "अवलोकन", gu: "ઓવરવ્યૂ" },
  "nav.discovery": { en: "Lead Discovery", hi: "लीड खोज", gu: "લીડ શોધ" },
  "nav.intel": { en: "Market Intelligence", hi: "बाज़ार खुफ़िया", gu: "માર્કેટ ઇન્ટેલિજન્સ" },
  "nav.leads": { en: "Lead Management", hi: "लीड प्रबंधन", gu: "લીડ મેનેજમેન્ટ" },
  "nav.review": { en: "Qualification Review", hi: "योग्यता समीक्षा", gu: "ક્વૉલિફિકેશન રિવ્યૂ" },
  "nav.campaigns": { en: "Campaigns", hi: "अभियान", gu: "ઝુંબેશ" },
  "nav.voice": { en: "Voice Agents", hi: "वॉयस एजेंट", gu: "વૉઇસ એજન્ટ" },
  "nav.livecall": { en: "Live Call Demo", hi: "लाइव कॉल स्टूडियो", gu: "લાઇવ કૉલ સ્ટુડિયો" },
  "nav.analytics": { en: "Analytics", hi: "विश्लेषण", gu: "એનાલિટિક્સ" },
  "nav.crm": { en: "CRM & Integrations", hi: "CRM और एकीकरण", gu: "CRM અને ઇન્ટિગ્રેશન" },
  "nav.admin": { en: "Admin Console", hi: "एडमिन कंसोल", gu: "એડમિન કન્સોલ" },
  "nav.workspace": { en: "Workspace", hi: "कार्यक्षेत्र", gu: "વર્કસ્પેસ" },

  // Overview stats
  "stat.leads": { en: "Leads discovered", hi: "लीड खोजे गए", gu: "લીડ શોધ્યા" },
  "stat.calls": { en: "Calls dialled", hi: "कॉल की गईं", gu: "કૉલ ડાયલ" },
  "stat.interested": { en: "Interested", hi: "रुचि रखने वाले", gu: "રુચિ ધરાવતા" },
  "stat.meetings": { en: "Meetings booked", hi: "मीटिंग बुक हुईं", gu: "મીટિંગ બુક" },

  // Overview page
  "page.overview.title": { en: "Sales Overview", hi: "सेल्स अवलोकन", gu: "સેલ્સ ઓવરવ્યૂ" },
  "page.overview.sub": {
    en: "Live pipeline. AI discovering, enriching and calling prospects continuously.",
    hi: "लाइव पाइपलाइन। AI लगातार संभावित ग्राहकों को खोज, समृद्ध और कॉल कर रहा है।",
    gu: "લાઇવ પાઇપલાઇન. AI સતત પ્રોસ્પેક્ટ્સ શોધ, સમૃદ્ધ અને કૉલ કરી રહ્યું છે.",
  },
  "page.overview.callDemoBtn": {
    en: "Live Call Studio",
    hi: "लाइव कॉल स्टूडियो",
    gu: "લાઇવ કૉલ સ્ટુડિયો",
  },
  "page.overview.callStream": {
    en: "Live call stream",
    hi: "लाइव कॉल स्ट्रीम",
    gu: "લાઇવ કૉલ સ્ટ્રીમ",
  },
  "page.overview.funnel": { en: "Pipeline funnel", hi: "पाइपलाइन फ़नल", gu: "પાઇપલાઇન ફ઼નલ" },
  "page.overview.today": { en: "today", hi: "आज", gu: "આજે" },
  "page.overview.recent": { en: "Recent leads", hi: "हाल के लीड", gu: "તાજેતરના લીડ" },

  // Discovery
  "page.disc.title": { en: "Lead Discovery Radar", hi: "लीड खोज रडार", gu: "લીડ શોધ રડાર" },
  "page.disc.sub": {
    en: "AI continuously scans public sources for high-intent buying signals.",
    hi: "AI सार्वजनिक स्रोतों से उच्च-इरादे के क्रय संकेतों को लगातार स्कैन करता है।",
    gu: "AI સાર્વજનિક સ્ત્રોતોમાંથી ઉચ્ચ-ઇરાદો ખરીદ સિગ્નલ સ્કૅન કરે છે.",
  },
  "page.disc.live": { en: "Live scanning", hi: "लाइव स्कैन", gu: "લાઇવ સ્કૅન" },
  "page.disc.pause": { en: "Paused", hi: "रुकी हुई", gu: "રોકેલ" },
  "page.disc.push": { en: "Push discovery", hi: "डिस्कवरी पुश करें", gu: "ડિસ્કવરી પુશ" },

  // Campaigns
  "page.camp.title": { en: "Campaigns Engine", hi: "अभियान इंजन", gu: "ઝુંબેશ એન્જિન" },
  "page.camp.sub": {
    en: "Schedule and monitor AI voice campaigns.",
    hi: "AI वॉयस अभियान शेड्यूल और मॉनिटर करें।",
    gu: "AI વૉઇસ ઝુંબેશ શેડ્યૂલ અને મૉનિટર કરો.",
  },
  "page.camp.new": { en: "+ New campaign", hi: "+ नया अभियान", gu: "+ નવી ઝુંબેશ" },
  "page.camp.cancel": { en: "Cancel", hi: "रद्द करें", gu: "રદ કરો" },

  // Voice Agents
  "page.voice.title": { en: "Voice Agents", hi: "वॉयस एजेंट", gu: "વૉઇસ એજન્ટ" },
  "page.voice.sub": {
    en: "Configure multilingual AI calling agents and sales playbooks.",
    hi: "बहुभाषी AI कॉलिंग एजेंट और सेल्स प्लेबुक कॉन्फ़िगर करें।",
    gu: "બહુભાષી AI કૉલિંગ એજન્ટ અને સેલ્સ પ્લેબુક ગોઠવો.",
  },

  // Live call
  "page.call.title": { en: "Live Call Studio", hi: "लाइव कॉल स्टूडियो", gu: "લાઇવ કૉલ સ્ટુડિયો" },
  "page.call.sub": {
    en: "Replay AI voice call transcripts in multiple languages.",
    hi: "बहु-भाषा में AI वॉयस कॉल ट्रांसक्रिप्ट री-प्ले करें।",
    gu: "ઘણી ભાષામાં AI વૉઇસ કૉલ ટ્રાન્સ્ક્રિપ્ટ ફરીથી ચલાવો.",
  },
  "page.call.play": {
    en: "Play transcript",
    hi: "ट्रांसक्रिप्ट चलाएं",
    gu: "ટ્રાન્સ્ક્રિપ્ટ ચલાવો",
  },
  "page.call.playing": { en: "Playing…", hi: "चल रही है…", gu: "ચાલી રહ્યું છે…" },

  // Login
  "login.tagline": {
    en: "Lead to Revenue Machine",
    hi: "लीड से रेवेन्यू मशीन",
    gu: "લીડ ટુ રેવેન્યૂ મશીન",
  },
  "login.desc": {
    en: "AI discovers prospects, enriches contacts and voice-qualifies them in your language — automatically, 24/7.",
    hi: "AI 24/7 स्वचालित रूप से आपकी भाषा में संभावित ग्राहकों को खोजता, संपर्क समृद्ध करता और योग्यता जाँचता है।",
    gu: "AI 24/7 સ્વચાલિત રીતે તમારી ભાષામાં સંભાવ્ય ગ્રાહકો શોધે, સંપર્ક સમૃદ્ધ કરે અને ક્વૉલિફાઇ કરે.",
  },
  "login.signin": { en: "Sign in", hi: "साइन इन", gu: "સાઇન ઇન" },
  "login.trial": { en: "Free Trial", hi: "फ्री ट्रायल", gu: "ફ્રી ટ્રાયલ" },
  "login.api": { en: "API Key", hi: "API की", gu: "API કી" },
  "login.email": { en: "Work email", hi: "कार्य ईमेल", gu: "કામ ઇમેઇલ" },
  "login.password": { en: "Password", hi: "पासवर्ड", gu: "પાસવર્ડ" },
  "login.name": { en: "Full name", hi: "पूरा नाम", gu: "પૂરું નામ" },
  "login.website": { en: "Company website", hi: "कंपनी वेबसाइट", gu: "કંપની વેબસાઇટ" },
  "login.cta.trial": {
    en: "Start free trial",
    hi: "फ्री ट्रायल शुरू करें",
    gu: "ફ્રી ટ્રાયલ શરૂ કરો",
  },
  "login.cta.signin": {
    en: "Sign in to dashboard",
    hi: "डैशबोर्ड में साइन इन करें",
    gu: "ડૅશબૉર્ડ પર સાઇન ઇન",
  },
  "login.demo": { en: "Role Switcher", hi: "रोल स्विचर", gu: "રોલ સ્વિચર" },
  "login.back": { en: "Back to home", hi: "होम पर वापस", gu: "ઘરે પાછા" },

  // Site header nav
  "site.sandbox": { en: "Sandbox", hi: "सैंडबॉक्स", gu: "સૅન્ડ્બૉક્સ" },
  "site.pipeline": { en: "Pipeline", hi: "पाइપલાઇન", gu: "પાઇપલાઇન" },
  "site.voice": { en: "Voice Fleet", hi: "वॉयस", gu: "વૉઇસ" },
  "site.capabs": { en: "Capabilities", hi: "क्षमताएं", gu: "ક્ષમતાઓ" },
  "site.console": { en: "Console", hi: "कंसोल", gu: "કન્સોલ" },
  "site.starttrial": { en: "Start free trial", hi: "फ्री ट्रायल", gu: "ફ્રી ટ્રાયલ" },
  "site.trial_short": { en: "Trial", hi: "ट्रायल", gu: "ટ્રાયલ" },

  // Home-page sentences with dynamic parts or inline markup (whole sentences, so word order can differ)
  "site.voice.intro": {
    en: "Test our autonomous voice fleet in real-time. Choose between male and female voices across 11 Indian languages — Hindi, Gujarati, English, Marathi, Bengali, Tamil, Telugu, Kannada, Malayalam, Punjabi and Odia. Pick a preset sales phrase or type your own script to hear it spoken by Sarvam AI.",
    hi: "हमारे स्वायत्त वॉयस फ्लीट को रियल-टाइम में आज़माएँ। 11 भारतीय भाषाओं — हिंदी, गुजराती, अंग्रेज़ी, मराठी, बंगाली, तमिल, तेलुगु, कन्नड़, मलयालम, पंजाबी और ओड़िया — में पुरुष या महिला आवाज़ चुनें। कोई तैयार सेल्स वाक्य चुनें या अपनी स्क्रिप्ट लिखें, और उसे Sarvam AI की आवाज़ में सुनें।",
    gu: "અમારા સ્વાયત્ત વૉઇસ ફ્લીટને રિયલ-ટાઇમમાં અજમાવો. 11 ભારતીય ભાષાઓ — હિન્દી, ગુજરાતી, અંગ્રેજી, મરાઠી, બંગાળી, તમિલ, તેલુગુ, કન્નડ, મલયાલમ, પંજાબી અને ઓડિયા — માં પુરુષ કે સ્ત્રી અવાજ પસંદ કરો. તૈયાર સેલ્સ વાક્ય પસંદ કરો અથવા તમારી પોતાની સ્ક્રિપ્ટ લખો, અને તેને Sarvam AI ના અવાજમાં સાંભળો.",
  },
  "voice.select_lang": {
    en: "Select Language ({n} supported):",
    hi: "भाषा चुनें ({n} उपलब्ध):",
    gu: "ભાષા પસંદ કરો ({n} ઉપલબ્ધ):",
  },
  "voice.custom_label": {
    en: "Type a custom script in {lang}:",
    hi: "{lang} में अपनी स्क्रिप्ट लिखें:",
    gu: "{lang} માં તમારી સ્ક્રિપ્ટ લખો:",
  },
  "voice.placeholder": {
    en: "Type anything in {lang}…",
    hi: "{lang} में कुछ भी लिखें…",
    gu: "{lang} માં કંઈપણ લખો…",
  },
  "voice.chars": { en: "{n}/{max} characters", hi: "{n}/{max} अक्षर", gu: "{n}/{max} અક્ષરો" },
  "voice.quota_one": {
    en: "{n} fresh voice sample left in this {m}-minute window · replays are free",
    hi: "इस {m}-मिनट की अवधि में {n} नया वॉयस सैंपल बचा है · दोबारा सुनना मुफ़्त है",
    gu: "આ {m}-મિનિટની અવધિમાં {n} નવો વૉઇસ સેમ્પલ બાકી છે · ફરી સાંભળવું મફત છે",
  },
  "voice.quota_many": {
    en: "{n} fresh voice samples left in this {m}-minute window · replays are free",
    hi: "इस {m}-मिनट की अवधि में {n} नए वॉयस सैंपल बचे हैं · दोबारा सुनना मुफ़्त है",
    gu: "આ {m}-મિનિટની અવધિમાં {n} નવા વૉઇસ સેમ્પલ બાકી છે · ફરી સાંભળવું મફત છે",
  },
  "voice.retry": { en: "Try again in {t}.", hi: "{t} बाद फिर कोशिश करें।", gu: "{t} પછી ફરી પ્રયાસ કરો." },
  "voice.play_sample": { en: "Play {lang} sample", hi: "{lang} सैंपल सुनें", gu: "{lang} સેમ્પલ સાંભળો" },
  "voice.tag_female": { en: "FEMALE VOICE", hi: "महिला आवाज़", gu: "સ્ત્રી અવાજ" },
  "voice.tag_male": { en: "MALE VOICE", hi: "पुरुष आवाज़", gu: "પુરુષ અવાજ" },
  "time.s": { en: "{n}s", hi: "{n} सेकंड", gu: "{n} સેકન્ડ" },
  "time.min": { en: "{n} min", hi: "{n} मिनट", gu: "{n} મિનિટ" },
  "time.h": { en: "{n}h", hi: "{n} घंटे", gu: "{n} કલાક" },
  "map.session": { en: "{n} this session", hi: "इस सत्र में {n}", gu: "આ સત્રમાં {n}" },
  "langname.en": { en: "English", hi: "अंग्रेज़ी", gu: "અંગ્રેજી" },
  "langname.hi": { en: "Hindi", hi: "हिंदी", gu: "હિન્દી" },
  "langname.gu": { en: "Gujarati", hi: "गुजराती", gu: "ગુજરાતી" },
  "langname.mr": { en: "Marathi", hi: "मराठी", gu: "મરાઠી" },
  "langname.bn": { en: "Bengali", hi: "बंगाली", gu: "બંગાળી" },
  "langname.ta": { en: "Tamil", hi: "तमिल", gu: "તમિલ" },
  "langname.te": { en: "Telugu", hi: "तेलुगु", gu: "તેલુગુ" },
  "langname.kn": { en: "Kannada", hi: "कन्नड़", gu: "કન્નડ" },
  "langname.ml": { en: "Malayalam", hi: "मलयालम", gu: "મલયાલમ" },
  "langname.pa": { en: "Punjabi", hi: "पंजाबी", gu: "પંજાબી" },
  "langname.od": { en: "Odia", hi: "ओड़िया", gu: "ઓડિયા" },
  "login.h1": { en: "11-Step Autonomous Pipeline", hi: "11-चरणीय स्वायत्त पाइपलाइन", gu: "11-પગલાંની સ્વાયત્ત પાઇપલાઇન" },
  "login.h2": {
    en: "Lead Radar → Intelligence → Voice SDRs",
    hi: "लीड रडार → इंटेलिजेंस → वॉयस SDR",
    gu: "લીડ રડાર → ઇન્ટેલિજન્સ → વૉઇસ SDR",
  },
  "login.h3": {
    en: "Close Enterprise Deals on Autopilot",
    hi: "एंटरप्राइज़ डील ऑटोपायलट पर क्लोज़ करें",
    gu: "એન્ટરપ્રાઇઝ ડીલ ઑટોપાઇલટ પર ક્લોઝ કરો",
  },
  "hero.turn1": { en: "Turn Raw Company", hi: "कंपनी की कच्ची जानकारी को", gu: "કંપનીની કાચી માહિતીને" },
  "hero.turn2": { en: "Assets into Board-Grade", hi: "बोर्ड-स्तरीय", gu: "બોર્ડ-સ્તરીય" },
  "hero.turn3": { en: "Intelligence", hi: "इंटेलिजेंस में बदलें", gu: "ઇન્ટેલિજન્સમાં ફેરવો" },
};

type Vars = Record<string, string | number>;
type LangCtx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string, vars?: Vars) => string };

const lookup = (key: string, lang: Lang, vars?: Vars): string => {
  const entry = T[key] as Record<string, string | undefined> | undefined;
  const text = entry?.[lang] ?? entry?.["en"] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text;
};

const Ctx = createContext<LangCtx>({
  lang: "en",
  setLang: () => {},
  t: (k, v) => lookup(k, "en", v),
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  // Restore the saved choice after hydration (initial render stays "en" so SSR markup matches).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
      if (saved && LANGUAGES.some((l) => l.code === saved)) setLangState(saved);
    } catch {
      /* storage blocked — stay on English */
    }
  }, []);

  // Translate the page body (hardcoded copy) from the pre-generated dictionaries.
  useEffect(() => {
    void applySiteLanguage(lang);
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  };
  const t = (key: string, vars?: Vars): string => lookup(key, lang, vars);
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useLang() {
  return useContext(Ctx);
}

/**
 * Compact language dropdown: a small bordered trigger (matches the header controls) that opens a
 * short list. The list is portalled and fixed-positioned so it is never clipped by the mobile menu.
 */
export function LangSwitcher({ dark = false }: { dark?: boolean }) {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0]!;

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || btnRef.current?.contains(target)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const dismiss = () => setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [open]);

  return (
    <div translate="no" className="shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language: ${current.english}`}
        className={`flex items-center gap-1 border px-1.5 py-1 sm:px-2.5 sm:py-1.5 font-mono text-[9px] sm:text-[10px] font-bold uppercase transition-colors ${
          dark
            ? "border-paper/30 text-paper hover:bg-paper/10"
            : "border-ink/30 text-ink hover:bg-ink/5"
        }`}
      >
        {current.short}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            translate="no"
            role="listbox"
            aria-label="Select language"
            style={{ position: "fixed", top: pos.top, right: pos.right }}
            className="z-[300] w-44 border border-ink bg-paper py-1 shadow-xl"
          >
            {LANGUAGES.map((l) => {
              const active = l.code === lang;
              return (
                <button
                  key={l.code}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setLang(l.code);
                    setOpen(false);
                    btnRef.current?.focus();
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left font-mono text-xs transition-colors ${
                    active ? "bg-ink text-paper" : "text-ink hover:bg-secondary"
                  }`}
                >
                  <span className="font-bold">{l.native}</span>
                  {active ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <span className="text-[10px] text-muted-foreground">{l.english}</span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

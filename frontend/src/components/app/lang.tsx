import { createContext, useContext, useState, type ReactNode } from "react";

export type Lang = "en" | "hi" | "gu";

const T: Record<string, Record<Lang, string>> = {
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
};

type LangCtx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string };

const Ctx = createContext<LangCtx>({
  lang: "en",
  setLang: () => {},
  t: (k) => T[k]?.en ?? k,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  const t = (key: string): string => T[key]?.[lang] ?? T[key]?.en ?? key;
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useLang() {
  return useContext(Ctx);
}

export function LangSwitcher({ dark = false }: { dark?: boolean }) {
  const { lang, setLang } = useLang();
  const langs: { code: Lang; label: string }[] = [
    { code: "en", label: "EN" },
    { code: "hi", label: "हि" },
    { code: "gu", label: "ગુ" },
  ];
  return (
    <div className="flex gap-px border border-ink/30 shrink-0">
      {langs.map(({ code, label }) => (
        <button
          key={code}
          onClick={() => setLang(code)}
          className={`px-1.5 py-1 sm:px-2.5 sm:py-1.5 font-mono text-[9px] sm:text-[10px] font-bold uppercase transition-colors shrink-0 ${
            lang === code
              ? dark
                ? "bg-paper text-ink"
                : "bg-ink text-paper"
              : dark
                ? "bg-transparent text-paper/60 hover:text-paper"
                : "bg-transparent text-ink/60 hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

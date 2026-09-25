/**
 * Runtime applier for the pre-generated site translations.
 *
 * Dictionaries live in ./translations/<lang>.json ({ "English string": "translation" }) and are produced
 * offline by scripts/i18n/translate_strings.py. At runtime this module only does exact-match lookups — it
 * never calls a translation API, so it costs nothing per visitor and works offline.
 *
 * How it coexists with React: it only rewrites `nodeValue` / a few attributes in place (never adds, moves
 * or removes nodes). When React later writes a fresh English value, the MutationObserver re-translates it.
 * Strings without a dictionary entry are left in English, so a missing translation degrades gracefully.
 * Anything inside `translate="no"` (e.g. the language switcher, native-script demo content) is skipped.
 */

export type SiteLangCode = "en" | "hi" | "gu" | "mr" | "bn" | "ta" | "te" | "kn" | "ml";

type Dict = Record<string, string>;

const loaders = import.meta.glob<{ default: Dict }>("./translations/*.json");
const dictCache = new Map<string, Dict>();

/** Languages that ship a complete dictionary (English is the source, always available). */
export const availableSiteLanguages: ReadonlySet<string> = new Set([
  "en",
  ...Object.keys(loaders).map((p) => p.replace("./translations/", "").replace(".json", "")),
]);

const ATTRS = ["placeholder", "title", "aria-label"] as const;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE", "TITLE"]);

// What we wrote, so we can (a) ignore our own mutations and (b) restore English.
const textApplied = new WeakMap<Text, { orig: string; out: string }>();
const attrApplied = new WeakMap<Element, Map<string, { orig: string; out: string }>>();

let dict: Dict | null = null;
let observer: MutationObserver | null = null;
let pending = new Set<Node>();
let scheduled = false;
let generation = 0;

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function skipped(el: Element | null): boolean {
  return !el || SKIP_TAGS.has(el.tagName) || !!el.closest('[translate="no"]');
}

function translateText(node: Text) {
  if (!dict) return;
  const cur = node.nodeValue ?? "";
  const prev = textApplied.get(node);
  if (prev && cur === prev.out) return; // our own write
  if (skipped(node.parentElement)) return;
  const out = dict[norm(cur)];
  if (!out) {
    textApplied.delete(node);
    return;
  }
  const lead = /^\s*/.exec(cur)![0];
  const trail = /\s*$/.exec(cur)![0];
  const next = lead + out + trail;
  textApplied.set(node, { orig: cur, out: next });
  node.nodeValue = next;
}

function translateAttrs(el: Element) {
  if (!dict || skipped(el)) return;
  for (const a of ATTRS) {
    const cur = el.getAttribute(a);
    if (!cur) continue;
    const map = attrApplied.get(el) ?? new Map();
    const prev = map.get(a);
    if (prev && cur === prev.out) continue;
    const out = dict[norm(cur)];
    if (!out) {
      map.delete(a);
      continue;
    }
    map.set(a, { orig: cur, out });
    attrApplied.set(el, map);
    el.setAttribute(a, out);
  }
}

function walk(root: Node, fn: (n: Text) => void, attrFn?: (e: Element) => void) {
  if (root.nodeType === Node.TEXT_NODE) return fn(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (skipped(el)) return;
  if (attrFn) {
    attrFn(el);
    el.querySelectorAll("[placeholder],[title],[aria-label]").forEach((e) => attrFn(e));
  }
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = w.nextNode())) fn(n as Text);
}

function flush() {
  scheduled = false;
  const nodes = pending;
  pending = new Set();
  nodes.forEach((n) => {
    if (n.isConnected) walk(n, translateText, translateAttrs);
  });
}

function onMutations(muts: MutationRecord[]) {
  for (const m of muts) {
    if (m.type === "childList") m.addedNodes.forEach((n) => pending.add(n));
    else if (m.type === "characterData") pending.add(m.target);
    else if (m.target.nodeType === Node.ELEMENT_NODE) pending.add(m.target);
  }
  if (!scheduled && pending.size) {
    scheduled = true;
    requestAnimationFrame(flush);
  }
}

function restoreEnglish() {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = w.nextNode())) {
    const t = n as Text;
    const rec = textApplied.get(t);
    if (rec && t.nodeValue === rec.out) t.nodeValue = rec.orig;
    textApplied.delete(t);
  }
  document.body.querySelectorAll("[placeholder],[title],[aria-label]").forEach((el) => {
    const map = attrApplied.get(el);
    map?.forEach((rec, a) => {
      if (el.getAttribute(a) === rec.out) el.setAttribute(a, rec.orig);
    });
    attrApplied.delete(el);
  });
}

async function loadDict(lang: string): Promise<Dict | null> {
  const cached = dictCache.get(lang);
  if (cached) return cached;
  const loader = loaders[`./translations/${lang}.json`];
  if (!loader) return null;
  const mod = await loader();
  dictCache.set(lang, mod.default);
  return mod.default;
}

/** Switch the page to `lang` (or back to English). Safe to call repeatedly. */
export async function applySiteLanguage(lang: SiteLangCode): Promise<void> {
  if (typeof document === "undefined") return;
  const gen = ++generation;

  observer?.disconnect();
  observer = null;
  if (dict) restoreEnglish();
  dict = null;
  document.documentElement.lang = lang;
  if (lang === "en") return;

  const loaded = await loadDict(lang);
  if (gen !== generation || !loaded) return; // superseded, or no dictionary shipped for this language
  dict = loaded;

  walk(document.body, translateText, translateAttrs);
  observer = new MutationObserver(onMutations);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRS],
  });
}

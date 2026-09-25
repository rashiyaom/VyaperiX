"""
Collect every translatable English string rendered on the public site pages.

Drives the running frontend (default http://localhost:8080) in headless Chromium, scrolls the page and
clicks through interactive widgets so tabbed / stepped content is rendered, and records all visible text
nodes plus placeholder/title/aria-label attributes.

Output: frontend/src/i18n/source-strings.json  (sorted list of unique English strings)

Skipped on purpose: strings without Latin letters, strings that already contain Indic script (demo
content such as the Hindi call transcript and voice presets), and anything inside [translate="no"].

Usage:  python scripts/i18n/collect_strings.py [base_url]
"""
import asyncio, json, os, re, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
PAGES = ["/", "/login"]
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "src", "i18n", "source-strings.json")

INDIC = re.compile(r"[ऀ-෿]")
LATIN = re.compile(r"[A-Za-z]")

COLLECTOR = r"""
() => {
  const seen = (window.__i18nSeen = window.__i18nSeen || new Set());
  const skipTags = new Set(['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','CODE','PRE']);
  const grab = (root) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const p = n.parentElement;
      if (!p || skipTags.has(p.tagName) || p.closest('[translate="no"]')) continue;
      const t = n.nodeValue.replace(/\s+/g, ' ').trim();
      if (t) seen.add(t);
    }
    root.querySelectorAll('[placeholder],[title],[aria-label]').forEach((el) => {
      if (el.closest('[translate="no"]')) return;
      for (const a of ['placeholder','title','aria-label']) {
        const v = el.getAttribute(a); if (v && v.trim()) seen.add(v.replace(/\s+/g,' ').trim());
      }
    });
  };
  if (!window.__i18nObs) {
    window.__i18nObs = new MutationObserver(() => grab(document.body));
    window.__i18nObs.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true});
  }
  grab(document.body);
}
"""

async def click_all(page, selector, limit=60):
    els = page.locator(selector)
    n = min(await els.count(), limit)
    for i in range(n):
        try:
            await els.nth(i).click(timeout=800, no_wait_after=True)
            await page.wait_for_timeout(120)
        except Exception:
            pass

async def main():
    strings = set()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await (await b.new_context(viewport={"width": 1400, "height": 900})).new_page()
        for path in PAGES:
            await page.goto(BASE + path, wait_until="networkidle")
            await page.evaluate(COLLECTOR)
            h = await page.evaluate("document.body.scrollHeight")
            for y in range(0, h + 900, 500):            # trigger scroll-reveal sections
                await page.evaluate(f"window.scrollTo(0,{y})"); await page.wait_for_timeout(90)
            # step through tabs / carousels / sandbox (skip nav links & external anchors)
            await click_all(page, "main button:not([type=submit]), section button")
            await page.evaluate("window.scrollTo(0,0)")
            await page.wait_for_timeout(400)
            strings |= set(await page.evaluate("[...window.__i18nSeen]"))
        await b.close()
    keep = sorted(s for s in strings if LATIN.search(s) and not INDIC.search(s) and len(s) > 2)
    # Drop typewriter/animation fragments: a string that is a mid-word prefix of another captured string.
    keep = [s for s in keep if not any(t != s and t.startswith(s) and t[len(s)].isalnum() for t in keep)]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(keep, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(keep)} strings, {sum(map(len, keep))} chars -> {os.path.normpath(OUT)}")

asyncio.run(main())

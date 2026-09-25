"""
Measure how much of the rendered site is actually translated, per language.

For each language: open the page, switch language via the real switcher, scroll through, and count visible
text nodes that still contain Latin letters (i.e. remained English). Brand tokens, URLs, numbers and
acronym-only strings are ignored. Prints the % translated and the most common leftovers.

Usage: python scripts/i18n/coverage.py [base_url] [lang ...]
"""
import asyncio, re, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].startswith("http") else "http://localhost:8080"
LANGS = [a for a in sys.argv[1:] if not a.startswith("http")] or ["hi", "gu", "mr", "bn", "ta", "te", "kn", "ml"]
PAGES = ["/", "/login"]
NATIVE = {"hi": "हिन्दी", "gu": "ગુજરાતી", "mr": "मराठी", "bn": "বাংলা", "ta": "தமிழ்", "te": "తెలుగు", "kn": "ಕನ್ನಡ", "ml": "മലയാളം"}

JS = r"""
() => {
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const p = n.parentElement;
    if (!p || ['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','CODE','PRE'].includes(p.tagName) || p.closest('[translate="no"]')) continue;
    const t = n.nodeValue.replace(/\s+/g,' ').trim();
    if (t) out.push(t);
  }
  return out;
}
"""
LATIN = re.compile(r"[A-Za-z]{3,}")
INDIC = re.compile(r"[ऀ-෿]")
IGNORE = re.compile(r"^(vyaperi x|[A-Z0-9 &/+._:-]{1,12})$", re.I)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for code in LANGS:
            total = left = 0
            leftovers = {}
            for path in PAGES:
                page = await (await b.new_context(viewport={"width": 1400, "height": 900})).new_page()
                await page.goto(BASE + path, wait_until="networkidle")
                await page.evaluate("window.scrollTo(0, 750)"); await page.wait_for_timeout(500)
                await page.locator("button[aria-haspopup=listbox]").first.click()
                await page.get_by_role("option", name=NATIVE[code]).click()
                await page.wait_for_timeout(1500)
                for y in range(0, await page.evaluate("document.body.scrollHeight"), 600):
                    await page.evaluate(f"window.scrollTo(0,{y})"); await page.wait_for_timeout(80)
                for t in await page.evaluate(JS):
                    if not LATIN.search(t) and not INDIC.search(t):
                        continue
                    if IGNORE.match(t) or "://" in t:
                        continue
                    total += 1
                    if LATIN.search(t) and not INDIC.search(t):
                        left += 1
                        leftovers[t] = leftovers.get(t, 0) + 1
                await page.close()
            pct = 100 * (total - left) / max(total, 1)
            print(f"[{code}] {pct:5.1f}% translated  ({left} English strings left of {total})")
            for t, _ in sorted(leftovers.items(), key=lambda kv: -len(kv[0]))[:6]:
                print("      left:", t[:80].encode("ascii", "replace").decode())
        await b.close()

asyncio.run(main())

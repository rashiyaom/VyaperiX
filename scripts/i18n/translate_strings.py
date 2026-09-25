"""
One-time (incremental) translation of the site's English strings with Sarvam Translate.

Reads  frontend/src/i18n/source-strings.json   (from collect_strings.py)
Writes frontend/src/i18n/translations/<code>.json   ({english: translated})

Only strings missing from a language file are sent, so re-running after copy changes costs almost
nothing. Runs entirely at build/dev time — visitors never trigger translation calls.

Key: SARVAM_WEBSITE_DEMO_API_KEY from backend/.env (the website key, not the calling-agent keys).

Usage:  python scripts/i18n/translate_strings.py [lang ...]     (default: all languages below)
"""
import asyncio, json, os, sys
import httpx
from dotenv import dotenv_values

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
SRC = os.path.join(ROOT, "frontend", "src", "i18n", "source-strings.json")
OUT_DIR = os.path.join(ROOT, "frontend", "src", "i18n", "translations")
LANGS = {"hi": "hi-IN", "gu": "gu-IN", "mr": "mr-IN", "bn": "bn-IN", "ta": "ta-IN", "te": "te-IN", "kn": "kn-IN", "ml": "ml-IN"}
URL = "https://api.sarvam.ai/translate"
BATCH_CHARS = 1200      # several short strings per request (one per line) to stay under rate limits
BATCH_MAX = 10
MIN_INTERVAL = 1.2      # seconds between request starts (the API rate-limits aggressively)

_last = 0.0


async def call(client, key, text, target):
    """One Sarvam Translate request with pacing + backoff. Returns translated text or None."""
    global _last
    for attempt in range(7):
        wait = _last + MIN_INTERVAL - asyncio.get_event_loop().time()
        if wait > 0:
            await asyncio.sleep(wait)
        _last = asyncio.get_event_loop().time()
        try:
            r = await client.post(
                URL,
                headers={"api-subscription-key": key},
                json={"input": text, "source_language_code": "en-IN", "target_language_code": target,
                      "model": "sarvam-translate:v1"},
            )
        except httpx.HTTPError:
            await asyncio.sleep(3 * (attempt + 1))
            continue
        if r.status_code == 200:
            return (r.json().get("translated_text") or "").strip() or None
        if r.status_code in (429, 500, 502, 503):
            await asyncio.sleep(5 * (attempt + 1))
            continue
        print(f"  ! {target} {r.status_code}: {r.text[:120]}")
        return None
    return None


def make_batches(strings):
    batch, size = [], 0
    for s in strings:
        if batch and (size + len(s) > BATCH_CHARS or len(batch) >= BATCH_MAX):
            yield batch
            batch, size = [], 0
        batch.append(s)
        size += len(s) + 1
    if batch:
        yield batch


async def translate_batch(client, key, batch, target):
    """Translate a list of strings; returns {src: translation}. Falls back to one-by-one if lines don't align."""
    if len(batch) > 1:
        out = await call(client, key, "\n".join(batch), target)
        lines = [l.strip() for l in out.split("\n") if l.strip()] if out else []
        if len(lines) == len(batch):
            return dict(zip(batch, lines))
        print(f"  ~ {target}: batch of {len(batch)} misaligned ({len(lines)} lines), retrying individually")
    res = {}
    for s in batch:
        t = await call(client, key, s, target)
        if t:
            res[s] = t
    return res


async def run_lang(client, key, code, strings):
    path = os.path.join(OUT_DIR, f"{code}.json")
    done = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    todo = [s for s in strings if s not in done]
    print(f"[{code}] {len(done)} cached, {len(todo)} to translate ({sum(map(len, todo))} chars)", flush=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    n = 0
    for batch in make_batches(todo):
        done.update(await translate_batch(client, key, batch, LANGS[code]))
        n += len(batch)
        json.dump(done, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=True)
        print(f"[{code}] {n}/{len(todo)}", flush=True)
    missing = [s for s in strings if s not in done]
    print(f"[{code}] done, {len(missing)} missing", flush=True)


async def main():
    key = (dotenv_values(os.path.join(ROOT, "backend", ".env")).get("SARVAM_WEBSITE_DEMO_API_KEY") or "").strip()
    if not key:
        sys.exit("SARVAM_WEBSITE_DEMO_API_KEY missing in backend/.env")
    strings = json.load(open(SRC, encoding="utf-8"))
    wanted = sys.argv[1:] or list(LANGS)
    async with httpx.AsyncClient(timeout=40) as client:
        for code in wanted:
            await run_lang(client, key, code, strings)

asyncio.run(main())

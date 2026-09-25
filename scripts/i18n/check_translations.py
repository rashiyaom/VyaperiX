"""
Sanity-check the generated dictionaries: coverage, digits preserved, target script present, sane length.
Exit code 1 if anything looks wrong. Usage: python scripts/i18n/check_translations.py
"""
import json, os, re, sys

ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "src", "i18n")
SCRIPT = {"hi": "\u0900-\u097F", "mr": "\u0900-\u097F", "gu": "\u0A80-\u0AFF", "bn": "\u0980-\u09FF",
          "ta": "\u0B80-\u0BFF", "te": "\u0C00-\u0C7F", "kn": "\u0C80-\u0CFF", "ml": "\u0D00-\u0D7F"}
SHIPPED = sorted(f[:-5] for f in os.listdir(os.path.join(ROOT, "translations")) if f.endswith(".json"))
src = json.load(open(os.path.join(ROOT, "source-strings.json"), encoding="utf-8"))
bad_total = 0
for code in SHIPPED:
    rng = SCRIPT[code]
    path = os.path.join(ROOT, "translations", f"{code}.json")
    d = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    missing = [s for s in src if s not in d]
    issues = []
    for s, t in d.items():
        if s not in src or t == s:  # identical = intentionally untranslated (brands, URLs, codes)
            continue
        letters = re.findall(r"[A-Za-z]", s)
        if len(letters) >= 6 and not re.search(f"[{rng}]", t):
            issues.append((s, t, "no target-script characters"))
        if sorted(re.findall(r"\d+", s)) != sorted(re.findall(r"\d+", t.translate(str.maketrans("०१२३४५६७८९૦૧૨૩૪૫૬૭૮૯০১২৩৪৫৬৭৮৯", "0123456789" * 3)))):
            issues.append((s, t, "digits differ"))
        if len(t) > 6 * len(s) + 20:
            issues.append((s, t, "suspiciously long"))
    print(f"[{code}] {len(d)} entries, {len(missing)} missing, {len(issues)} flagged")
    for s, t, why in issues[:5]:
        print("    ", why, "|", ascii(s[:50]), "->", ascii(t[:50]))
    bad_total += len(missing) + len(issues)
sys.exit(1 if bad_total else 0)

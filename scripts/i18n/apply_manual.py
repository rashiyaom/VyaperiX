"""
Apply hand-written Hindi/Gujarati translations (manual_translations.txt) on top of translations/{hi,gu}.json.

  * entries in manual_translations.txt always win
  * strings that are no longer in source-strings.json are pruned
  * terminology / typography is normalised (see NORMALISE)
  * prints every source string that still has no entry, and every entry left un-reviewed

Usage: python scripts/i18n/apply_manual.py
"""
import json, os, re, sys

ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "src", "i18n")
MANUAL = os.path.join(os.path.dirname(__file__), "manual_translations.txt")

# Consistency fixes applied to every value (machine-made entries included).
NORMALISE = {
    "hi": [("एआई", "AI"), ("वॉइस", "वॉयस"), ("सर्बम", "Sarvam"), ("अंग्रेजी", "अंग्रेज़ी"), ("​", ""), ("‍", "")],
    "gu": [("એઆઇ", "AI"), ("એઆઈ", "AI"), ("વોઇસ", "વૉઇસ"), ("વોઈસ", "વૉઇસ"), ("સર્વમ", "Sarvam"),
           ("સ્ત્રોત", "સ્રોત"), ("​", ""), ("‍", "")],
}

src = json.load(open(os.path.join(ROOT, "source-strings.json"), encoding="utf-8"))
manual = {}
for line in open(MANUAL, encoding="utf-8"):
    line = line.rstrip("\n")
    if not line.strip() or line.startswith("#"):
        continue
    parts = line.split(" ⇒ ")
    if len(parts) != 3:
        sys.exit(f"bad manual line ({len(parts)} parts): {line[:80]}")
    manual[parts[0]] = (parts[1], parts[2])

for idx, code in enumerate(("hi", "gu")):
    path = os.path.join(ROOT, "translations", f"{code}.json")
    old = json.load(open(path, encoding="utf-8"))
    new, unreviewed, missing = {}, [], []
    for s in src:
        if s in manual:
            v = manual[s][idx]
        elif s in old:
            v = old[s]
            unreviewed.append(s)
        else:
            missing.append(s)
            continue
        for a, b in NORMALISE[code]:
            v = v.replace(a, b)
        new[s] = v.strip()
    json.dump(new, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=True)
    print(f"[{code}] {len(new)}/{len(src)} written | from manual: {len(new) - len(unreviewed)} | machine-only kept: {len(unreviewed)} | missing: {len(missing)}")
    for s in missing:
        print("   MISSING:", s[:80].encode("ascii", "replace").decode())
    if code == "hi":
        print("   manual entries not in source (stale, ignored):", [m for m in manual if m not in set(src)][:20])
        left = unreviewed
print("\nmachine-only entries (not in manual file):")
for s in left:
    print("  -", s[:90].encode("ascii", "replace").decode())

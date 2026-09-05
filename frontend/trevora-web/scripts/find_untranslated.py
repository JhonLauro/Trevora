"""
Every user-facing string still hard-coded in English.

Finds the shapes that actually reach a screen and ignores the ones that never
do: comments, imports, className/key/id/href/type/role values, and anything
that is plainly a token rather than a sentence.

Usage:
    python scripts/find_untranslated.py            # summary per file
    python scripts/find_untranslated.py --list     # every string, with its file
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

# Routed pages only: three pages are on disk but unreachable, and translating
# them is work nobody will ever see.
DEAD = {"DashboardPage", "VehicleProfileSelectionPage", "VehicleServiceHistoryPage"}

TEXT_ATTRS = ("title", "label", "aria-label", "placeholder", "alt", "confirmLabel",
              "subtitle", "body", "foot", "hint", "ariaLabel", "helpText", "caption")

# Attributes whose values are never shown to a person.
CODE_ATTRS = ("className", "key", "id", "href", "to", "type", "name", "role", "value",
              "htmlFor", "src", "path", "d", "fill", "stroke", "viewBox", "xmlns")


def strip_noise(src):
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    src = re.sub(r"^\s*//.*$", "", src, flags=re.M)
    src = re.sub(r"^import .*$", "", src, flags=re.M)
    return src


def looks_like_prose(s):
    s = s.strip()
    if len(s) < 3 or len(s) > 200:
        return False
    if not s[0].isupper():
        return False
    if not re.search(r"[a-z]", s):          # ALLCAPS tokens
        return False
    if re.fullmatch(r"[A-Za-z0-9_.\-/]+", s) and " " not in s:
        return False                         # single token: PHP, MG3, ACTIVE
    if s.startswith(("http", "/", "#", "data:")):
        return False
    return True


def find(path):
    src = strip_noise(path.read_text(encoding="utf-8"))
    found = set()

    # JSX text nodes, including ones spread over lines
    for m in re.finditer(r">([^<>{}]+)<", src):
        for line in m.group(1).split("\n"):
            if looks_like_prose(line):
                found.add(line.strip())

    # user-facing attributes only
    for attr in TEXT_ATTRS:
        for m in re.finditer(attr + r'=(?:"([^"]*)"|\'([^\']*)\')', src):
            value = m.group(1) or m.group(2) or ""
            if looks_like_prose(value):
                found.add(value.strip())

    # quoted literals that are clearly sentences, not identifiers
    for m in re.finditer(r"'([^'\\\n]{6,200})'", src):
        value = m.group(1)
        if " " in value and looks_like_prose(value):
            found.add(value.strip())

    return found


def main():
    tally = {}
    for path in sorted(SRC.rglob("*.jsx")):
        if path.stem in DEAD:
            continue
        hits = find(path)
        if hits:
            tally[str(path.relative_to(SRC))] = sorted(hits)

    total = sum(len(v) for v in tally.values())
    if "--list" in sys.argv:
        print(json.dumps(tally, ensure_ascii=False, indent=1))
    elif "--json" in sys.argv:
        (ROOT / "scripts" / "_untranslated.json").write_text(
            json.dumps(tally, ensure_ascii=False, indent=1), encoding="utf-8")
        print("wrote scripts/_untranslated.json")
    else:
        print("untranslated strings: " + str(total) + " across " + str(len(tally)) + " files")
        for f, v in sorted(tally.items(), key=lambda x: -len(x[1])):
            print("  " + str(len(v)).rjust(4) + "  " + f)


main()

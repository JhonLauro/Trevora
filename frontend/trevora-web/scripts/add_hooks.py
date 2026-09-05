"""
Give every component that calls t() its own useT(), and no others.

Inserts after the line that *closes* the signature, not after the line that
opens it: a component whose props are destructured across several lines would
otherwise receive `const t = useT();` in the middle of its parameter list.
"""
import pathlib
import re

SRC = pathlib.Path(__file__).resolve().parent.parent / "src"
HOOK = "  const t = useT();"
# PascalCase only. A camelCase function is a plain helper, and React forbids
# calling a hook from one -- placing it there produced code that threw as
# soon as the helper ran. Helpers import translate() instead.
DECL = re.compile(r"^(?:export default |export )?function [A-Z]")
BOUND = re.compile(r"const\s+t\s*=\s*useT\(\)|const\s*\{[^}]*\bt\b[^}]*\}\s*=\s*useLanguage\(\)")
# Any t( call, not just t('literal'). Missing t(item.labelKey) is what
# stripped ShellNav's hook and left it calling an unbound t.
CALL = re.compile(r"(?<![\w.])t\(")

added = 0
for path in sorted(SRC.rglob("*.jsx")):
    lines = path.read_text(encoding="utf-8").split("\n")
    if not any(CALL.search(l) for l in lines):
        continue
    lines = [l for l in lines if l.strip() != HOOK.strip()]

    starts = [i for i, l in enumerate(lines) if DECL.match(l)]
    if not starts:
        continue
    ends = starts[1:] + [len(lines)]

    inserts = []
    for a, b in zip(starts, ends):
        body = "\n".join(lines[a:b])
        if not CALL.search(body) or BOUND.search(body):
            continue
        # walk to the line that closes the signature
        at = a
        while at < b and not lines[at].rstrip().endswith("{"):
            at += 1
        while at < b and not re.search(r"\)\s*\{\s*$", lines[at]):
            at += 1
            if at >= b:
                at = a
                break
        inserts.append(at)

    for at in sorted(inserts, reverse=True):
        lines.insert(at + 1, HOOK)
    added += len(inserts)
    path.write_text("\n".join(lines), encoding="utf-8")

print("  placed " + str(added) + " hook(s)")

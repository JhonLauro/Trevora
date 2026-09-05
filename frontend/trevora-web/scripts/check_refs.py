"""
Every component used in JSX is defined or imported in the same file.

There is no linter in this project, which is why "WhereItWentPanel is not
defined" reached the browser instead of failing a build: Vite compiles a free
identifier happily, and only React discovers it, on whichever route renders it.

This is not a general undefined-variable check -- that needs a real linter --
but it catches the shape automated edits produce: a component whose declaration
was damaged, renamed or dropped while its usage stayed behind.

Run with: python scripts/check_refs.py   (also runs before a build)
"""
import pathlib
import re
import sys

SRC = pathlib.Path(__file__).resolve().parent.parent / "src"

USED = re.compile(r"<([A-Z][A-Za-z0-9_]*)[\s/>]")
FUNC = re.compile(r"^(?:export default |export )?function ([A-Z][A-Za-z0-9_]*)", re.M)
# `const Icon = item.icon` is a component too, and lives inside a function body,
# so this deliberately does not anchor to column 0.
CONST = re.compile(r"\bconst\s+([A-Z][A-Za-z0-9_]*)\s*=", re.M)
DESTRUCT = re.compile(r"\bconst\s*\{([^}]*)\}\s*=", re.M)
# Also `{ icon: Icon }` in a parameter list or a map callback.
RENAMED = re.compile(r"[:{,]\s*([A-Z][A-Za-z0-9_]*)\s*[,}]")
BUILTIN = {"React", "Fragment", "Suspense", "StrictMode"}

problems = []
for path in sorted(SRC.rglob("*.jsx")):
    src = path.read_text(encoding="utf-8")

    defined = set(FUNC.findall(src)) | set(CONST.findall(src)) | set(RENAMED.findall(src))
    for group in DESTRUCT.findall(src):
        for part in group.split(","):
            name = part.split(":")[-1].strip()
            if name and name[0].isupper():
                defined.add(name)

    imported = set()
    for m in re.finditer(r"import\s+([^;]*?)\s+from", src, re.S):
        clause = m.group(1)
        for piece in re.findall(r"\{([^}]*)\}", clause):
            for part in piece.split(","):
                name = part.strip().split(" as ")[-1].strip()
                if name:
                    imported.add(name)
        # Default and namespace imports. Splitting on a bare "as" would cut
        # AccessRequestToasts in half, so the alias keyword is matched as a word.
        head = re.sub(r"\{[^}]*\}", "", clause)
        head = re.sub(r"\bas\b", " ", head).replace("*", "")
        for part in head.split(","):
            name = part.strip()
            if name and (name[0].isalpha() or name[0] == "_"):
                imported.add(name)

    for name in sorted(set(USED.findall(src)) - defined - imported - BUILTIN):
        problems.append(str(path.relative_to(SRC.parent)) + ": <" + name + "> is used but never defined or imported")

if problems:
    print("reference check failed (" + str(len(problems)) + " problem(s)):")
    for p in problems:
        print("  " + p)
    sys.exit(1)

print("refs ok - every JSX component resolves in its own file")

"""
Swap literal UI strings for t() calls.

Pure string surgery, no regex: the three shapes that hand editing kept getting
wrong are each handled explicitly, so the output is always valid JSX.

    title="How do you..."  ->  title={t('key')}      not title="{t(...)}"
    subtitle='Step 2...'   ->  subtitle={t('key')}   not subtitle=t(...)
    >How do you...<        ->  >{t('key')}<

Takes { "file.jsx": { "exact string": "key" } } and reports every literal it
could not find, so a typo in the map is loud rather than silent.
"""
import json
import pathlib
import sys

SRC = pathlib.Path(__file__).resolve().parent.parent / "src"


def apply(text, literal, key):
    call = "t('" + key + "')"
    before = text
    # 1. attribute values, both quote styles -> braced expression
    text = text.replace('="' + literal + '"', "={" + call + "}")
    text = text.replace("='" + literal + "'", "={" + call + "}")
    # 2. object property values -> plain expression
    text = text.replace(": '" + literal + "'", ": " + call)
    text = text.replace(': "' + literal + '"', ": " + call)
    # 3. JSX text on one line
    text = text.replace(">" + literal + "<", ">{" + call + "}<")
    # 4. JSX text alone on its own line, indentation preserved
    out = []
    for line in text.split("\n"):
        if line.strip() == literal:
            out.append(line[: len(line) - len(line.lstrip())] + "{" + call + "}")
        else:
            out.append(line)
    text = "\n".join(out)
    # 5. a bare quoted literal anywhere else (ternaries, arrays, pushes)
    text = text.replace("'" + literal + "'", call)
    return text, text != before


def main(map_path):
    mapping = json.loads(pathlib.Path(map_path).read_text(encoding="utf-8"))
    swapped, missed = 0, []
    for rel, pairs in mapping.items():
        path = SRC / rel
        text = path.read_text(encoding="utf-8")
        for literal, key in pairs.items():
            text, hit = apply(text, literal, key)
            if hit:
                swapped += 1
            else:
                missed.append(rel + ": " + literal[:58])
        if "i18n/index.jsx" not in text:
            depth = len(pathlib.PurePosixPath(rel).parts) - 1
            up = "../" * depth if depth else "./"
            lines = text.split("\n")
            for i, line in enumerate(lines):
                if line.startswith("import "):
                    lines.insert(i + 1, "import { useT } from '" + up + "i18n/index.jsx';")
                    break
            text = "\n".join(lines)
        path.write_text(text, encoding="utf-8")
    print("  applied " + str(swapped) + " swap(s)")
    if missed:
        print("  could not find " + str(len(missed)) + ":")
        for m in missed:
            print("    " + m)


main(sys.argv[1])

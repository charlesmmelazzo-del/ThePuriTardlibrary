#!/usr/bin/env python3
"""Convert two-column "parallel reading edition" PDFs into the library's book JSON.

The expected PDF layout is described in docs/CHATGPT_PDF_PROMPT.md. In short, every
content page has:
  * a running header line: book title on the left, the current division on the right
    ("Preface", "Chapter I / The foundation in Romans 8:13", "Sermon 3 / ...");
  * a column-heading line "ORIGINAL TEXT" (left) and "MODERN ENGLISH" (right);
  * numbered paragraph pairs labelled in both columns, e.g. "PREF.02", "IV.13",
    "IV.01 / CHAPTER OUTLINE", "IV.20 / SOURCE NOTES", "IV.13 (continued)";
  * a footer ending in "page / total".
Pages without the column headings (title page, contents, glossary, etc.) are ignored.
An optional "BOOK INFO" page supplies the title, author, year and description.

Usage:
  python3 scripts/pdf-to-book.py part1.pdf [part2.pdf ...] content/books/book.json \
      [--title ... --author ... --year 1656 --description ...] \
      [--cover /covers/x.webp] [--skip-prefix ED]

Requires: pip install pdfplumber
"""
import argparse
import json
import re
import sys
from collections import OrderedDict

import pdfplumber

LABEL = re.compile(r"^([A-Z][A-Z0-9]*)\.(\d+)\b(.*)$")
INFO_KEYS = {"title", "author", "year", "description"}


def lines_of(words):
    """Group words into text lines, top to bottom."""
    lines = []
    for w in sorted(words, key=lambda w: (round(w["top"]), w["x0"])):
        if lines and abs(lines[-1]["top"] - w["top"]) < 3:
            lines[-1]["words"].append(w)
            lines[-1]["bottom"] = max(lines[-1]["bottom"], w["bottom"])
        else:
            lines.append({"top": w["top"], "bottom": w["bottom"], "words": [w]})
    for ln in lines:
        ln["words"].sort(key=lambda w: w["x0"])
        ln["text"] = " ".join(w["text"] for w in ln["words"])
    return lines


def join_lines(lines):
    """Join wrapped lines into text, starting a new paragraph at larger vertical gaps."""
    if not lines:
        return ""
    gaps = [b["top"] - a["top"] for a, b in zip(lines, lines[1:]) if b["top"] > a["top"]]
    step = sorted(gaps)[len(gaps) // 2] if gaps else 0
    paras, cur = [], lines[0]["text"]
    for prev, ln in zip(lines, lines[1:]):
        gap = ln["top"] - prev["top"]
        if ln.get("new_page"):
            cur += " " + ln["text"]  # a pair continued from the previous page
        elif step and gap > step * 1.6:
            paras.append(cur)
            cur = ln["text"]
        elif cur.endswith("-") and not cur.endswith(" -") and ln["text"][:1].isalpha():
            cur += ln["text"]  # real compound hyphen at a line end: no space
        else:
            cur += " " + ln["text"]
    paras.append(cur)
    return "\n\n".join(re.sub(r"\s+", " ", p).strip() for p in paras)


def header_division(line):
    """Right-hand part of the running header (split at the widest gap between words)."""
    ws = line["words"]
    if len(ws) < 2:
        return ""
    gaps = [(ws[i + 1]["x0"] - ws[i]["x1"], i) for i in range(len(ws) - 1)]
    width, i = max(gaps)
    if width < 20:
        return ""
    return " ".join(w["text"] for w in ws[i + 1:])


def division_title(text, key):
    text = re.sub(r"\s*/\s*", ": ", text.strip())
    return text or key


def parse_info(lines):
    info, last = {}, None
    for ln in lines[1:]:
        m = re.match(r"^([A-Za-z ]+):\s*(.*)$", ln["text"])
        if m and m.group(1).strip().lower() in INFO_KEYS:
            last = m.group(1).strip().lower()
            info[last] = m.group(2).strip()
        elif last == "description":
            info[last] += " " + ln["text"].strip()
    if "year" in info:
        y = re.search(r"\d{3,4}", info["year"])
        info["year"] = int(y.group()) if y else None
    return info


def convert(pdf_paths, skip_prefixes):
    parts = OrderedDict()  # label prefix -> {"title", "pairs": OrderedDict(label -> pair)}
    info = {}
    current = {"original": None, "modern": None}
    for path in pdf_paths:
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                words = page.extract_words(keep_blank_chars=False, use_text_flow=False)
                lines = lines_of(words)
                if not lines:
                    continue
                if lines[0]["text"].strip().upper() == "BOOK INFO":
                    info.update(parse_info(lines))
                    continue
                head = next((l for l in lines if "ORIGINAL TEXT" in l["text"] and "MODERN ENGLISH" in l["text"]), None)
                if not head:
                    continue  # front/back matter without parallel columns
                split_x = next(w["x0"] for w in head["words"] if w["text"] == "MODERN") - 4
                footer = next(
                    (l for l in reversed(lines) if re.search(r"\d+\s*/\s*\d+$", l["text"]) and l["top"] > page.height * 0.8),
                    None,
                )
                bottom = footer["top"] - 1 if footer else page.height
                division = header_division(lines[0]) if lines[0] is not head else ""

                body = [w for w in words if w["top"] > head["bottom"] + 1 and w["bottom"] < bottom]
                for side, x_test in (("original", lambda w: w["x0"] < split_x), ("modern", lambda w: w["x0"] >= split_x)):
                    first_line = True
                    for ln in lines_of([w for w in body if x_test(w)]):
                        m = LABEL.match(ln["text"])
                        if m:
                            prefix, num = m.group(1), int(m.group(2))
                            label = f"{prefix}.{num:03d}"
                            part = parts.setdefault(prefix, {"title": division_title(division, prefix), "pairs": OrderedDict()})
                            part["pairs"].setdefault(label, {"original": [], "modern": []})
                            current[side] = (prefix, label)
                            first_line = False
                            continue
                        if current[side] is None:
                            print(f"warning: text before any label ({path} p.{page.page_number}): {ln['text'][:60]!r}", file=sys.stderr)
                            continue
                        prefix, label = current[side]
                        target = parts[prefix]["pairs"][label][side]
                        if first_line and target:
                            ln["new_page"] = True  # pair continues from the previous page without a label
                        first_line = False
                        target.append(ln)

    chapters = []
    for prefix, part in parts.items():
        if prefix in skip_prefixes:
            continue
        paragraphs = []
        for pair in part["pairs"].values():
            original, modern = join_lines(pair["original"]), join_lines(pair["modern"])
            if original or modern:
                paragraphs.append({"original": original, "modern": modern})
        chapters.append({"title": part["title"], "sections": [{"title": "", "paragraphs": paragraphs}]})
    return info, chapters


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inputs", nargs="+", help="one or more PDFs (in reading order), then the output .json path")
    ap.add_argument("--title")
    ap.add_argument("--author")
    ap.add_argument("--year", type=int)
    ap.add_argument("--description")
    ap.add_argument("--cover", default="")
    ap.add_argument("--skip-prefix", action="append", default=[], help="pair-label prefix to leave out, e.g. ED")
    a = ap.parse_args()
    if len(a.inputs) < 2 or not a.inputs[-1].endswith(".json"):
        ap.error("give one or more PDFs followed by the output .json path")
    pdfs, out = a.inputs[:-1], a.inputs[-1]

    info, chapters = convert(pdfs, set(a.skip_prefix))
    book = {
        "title": a.title or info.get("title", ""),
        "author": a.author or info.get("author", ""),
        "year": a.year or info.get("year"),
        "description": a.description or info.get("description", ""),
        "cover_url": a.cover,
        "chapters": chapters,
    }
    if not book["title"]:
        sys.exit("No title found: add a BOOK INFO page to the PDF or pass --title.")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(book, f, ensure_ascii=False, indent=1)
    n = sum(len(s["paragraphs"]) for c in chapters for s in c["sections"])
    print(f"{book['title']} — {book['author']} ({book['year']})")
    print(f"{len(chapters)} divisions, {n} paragraph pairs -> {out}")
    for c in chapters:
        print(f"  {c['title']}: {len(c['sections'][0]['paragraphs'])}")


if __name__ == "__main__":
    main()

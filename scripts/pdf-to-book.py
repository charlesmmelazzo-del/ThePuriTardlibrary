#!/usr/bin/env python3
"""Convert a two-column "parallel reading edition" PDF into the library's book JSON.

The PDFs this handles have, on each page, a running header naming the part of the book
("Author's preface", "Chapter I / The foundation in Romans 8:13"), column headings
"ORIGINAL TEXT" and "MODERN ENGLISH", and numbered paragraph pairs such as "PREF.02" or
"IV.13" (optionally "IV.01 / CHAPTER OUTLINE" or "IV.20 / SOURCE NOTES") with the original
on the left and the modern rendering on the right. Pages without those column headings
(title page, contents, reading key, editorial notes) are skipped.

Usage:
  python3 scripts/pdf-to-book.py book.pdf content/books/book.json \
      --title "..." --author "..." --year 1656 --cover /covers/x.webp \
      --description "..." [--skip-prefix ED]

Requires: pip install pdfplumber
"""
import argparse
import json
import re
import sys
from collections import OrderedDict

import pdfplumber

LABEL = re.compile(r"^([A-Z]+)\.(\d+)(?:\s*/\s*(.+))?$")
ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}


def roman_to_int(s):
    total, prev = 0, 0
    for ch in reversed(s):
        v = ROMAN.get(ch, 0)
        total = total - v if v < prev else total + v
        prev = max(prev, v)
    return total


def lines_of(words):
    """Group words into text lines (sorted top to bottom)."""
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
    """Join wrapped lines into paragraphs, starting a new paragraph at larger vertical gaps."""
    if not lines:
        return ""
    gaps = [b["top"] - a["top"] for a, b in zip(lines, lines[1:])]
    step = sorted(gaps)[len(gaps) // 2] if gaps else 0
    paras, cur = [], lines[0]["text"]
    for prev, ln, gap in zip(lines, lines[1:], gaps):
        if step and gap > step * 1.6:
            paras.append(cur)
            cur = ln["text"]
        elif cur.endswith("-") and not cur.endswith(" -") and ln["text"][:1].isalpha():
            cur += ln["text"]  # real compound hyphen at a line end: no space
        else:
            cur += " " + ln["text"]
    paras.append(cur)
    return "\n\n".join(re.sub(r"\s+", " ", p).strip() for p in paras)


def part_of(header):
    """Map a running header to (key, chapter title)."""
    m = re.search(r"Chapter\s+([IVXLC]+)\s*/\s*(.+)$", header)
    if m:
        num = m.group(1)
        return f"CH{roman_to_int(num):02d}", f"Chapter {num}: {m.group(2).strip()}"
    if re.search(r"preface", header, re.I) and not re.search(r"editor", header, re.I):
        return "PREF", "Preface"
    if re.search(r"editor", header, re.I):
        return "ED", "Editor’s prefatory note"
    return None, None


def convert(pdf_path, skip_prefixes):
    parts = OrderedDict()  # key -> {"title", "pairs": OrderedDict(label -> {...})}
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            words = page.extract_words(keep_blank_chars=False, use_text_flow=False)
            lines = lines_of(words)
            head = next((l for l in lines if "ORIGINAL TEXT" in l["text"] and "MODERN ENGLISH" in l["text"]), None)
            if not head:
                continue  # front/back matter without parallel columns
            split_x = next(w["x0"] for w in head["words"] if w["text"] == "MODERN") - 4
            footer = next((l for l in lines if re.search(r"\d+\s*/\s*\d+$", l["text"]) and l["top"] > page.height * 0.8), None)
            bottom = footer["top"] - 1 if footer else page.height
            header_text = lines[0]["text"] if lines else ""
            key, title = part_of(header_text)
            if key is None:
                print(f"warning: unrecognized header on page {page.page_number}: {header_text!r}", file=sys.stderr)
                continue
            part = parts.setdefault(key, {"title": title, "pairs": OrderedDict()})

            body = [w for w in words if w["top"] > head["bottom"] + 1 and w["bottom"] < bottom]
            left = lines_of([w for w in body if w["x0"] < split_x])
            right = lines_of([w for w in body if w["x0"] >= split_x])

            for side, side_lines in (("original", left), ("modern", right)):
                current = None
                for ln in side_lines:
                    m = LABEL.match(ln["text"])
                    if m:
                        current = ln["text"].split("/")[0].strip()
                        pair = part["pairs"].setdefault(current, {"kind": (m.group(3) or "").strip().lower(), "original": [], "modern": []})
                        continue
                    if current is None:
                        print(f"warning: text before any label on page {page.page_number}: {ln['text'][:60]!r}", file=sys.stderr)
                        continue
                    part["pairs"][current][side].append(ln)

    chapters = []
    for key, part in parts.items():
        if any(key == p or key.startswith(p) for p in skip_prefixes):
            continue
        paragraphs = []
        for label, pair in part["pairs"].items():
            original, modern = join_lines(pair["original"]), join_lines(pair["modern"])
            if not (original or modern):
                continue
            paragraphs.append({"original": original, "modern": modern})
        chapters.append({"title": part["title"], "sections": [{"title": "", "paragraphs": paragraphs}]})
    return chapters


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("out")
    ap.add_argument("--title", required=True)
    ap.add_argument("--author", default="")
    ap.add_argument("--year", type=int)
    ap.add_argument("--description", default="")
    ap.add_argument("--cover", default="")
    ap.add_argument("--skip-prefix", action="append", default=[], help="part keys to leave out, e.g. ED")
    a = ap.parse_args()
    chapters = convert(a.pdf, a.skip_prefix)
    book = {
        "title": a.title,
        "author": a.author,
        "year": a.year,
        "description": a.description,
        "cover_url": a.cover,
        "chapters": chapters,
    }
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(book, f, ensure_ascii=False, indent=1)
    n = sum(len(s["paragraphs"]) for c in chapters for s in c["sections"])
    print(f"{len(chapters)} chapters, {n} paragraph pairs -> {a.out}")
    for c in chapters:
        print(f"  {c['title']}: {len(c['sections'][0]['paragraphs'])}")


if __name__ == "__main__":
    main()

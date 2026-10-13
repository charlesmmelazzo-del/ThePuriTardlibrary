# ChatGPT prompt: making a book PDF for the library

**How to use it:** copy everything inside the box below into ChatGPT, then on the last line write the book, for example:
`Do this for: The Rare Jewel of Christian Contentment by Jeremiah Burroughs`.

ChatGPT may not finish a long book in one go. When it stops, say "continue with the next part" until it has sent every part. Upload all the PDFs to the **Puritan PDF** folder in Google Drive, plus a cover image if you have one, and tell Claude they're there.

````text
Create a complete parallel-text PDF of the book named at the end of this message. Put the
author's original English on the left and a faithful modern-English rendering on the right,
paragraph by paragraph. The PDF will be read by a computer program and turned into a reading
app, so follow the layout rules EXACTLY. Use Python (ReportLab) to build the PDF with real,
selectable text (not images).

=== WHAT TO INCLUDE ===
- The whole work, unabridged: the author's own front matter (dedication, epistle to the
  reader, preface, introduction), every chapter, and the author's own conclusion.
- Original text: use a reliable public-domain transcription (for example Christian Classics
  Ethereal Library, CCEL). Reproduce it exactly. Do not modernize, shorten or correct it.
- Footnotes and marginal references from the source: put a marker like [1] in the text and
  collect the notes in one "SOURCE NOTES" pair at the end of that chapter (see labels below).

=== WHAT TO LEAVE OUT ===
- NO title page, "about this edition" page, table of contents, reading guide, glossary,
  word list, study questions, summaries, introductions by you, or editorial/sources page.
- NO prefaces, notes or introductions written by later editors (only the author's own).
- NO images, tables, sidebars, pull quotes, or text in the margins.

=== THE MODERN ENGLISH (right column) ===
- A complete, faithful rendering of the paragraph beside it. Not a summary or paraphrase that
  drops points. Every argument, example, list item and distinction must still be there.
- Clear, natural, contemporary English for an ordinary adult reader. Break up very long
  sentences and replace archaic words and grammar (thee/thou, -eth, "wherefore", etc.).
- Keep the author's numbering and structure ("First… Secondly…", "1.", "(1.)").
- Scripture references in modern form (Romans 8:13, not Rom. viii. 13). Render quoted
  Scripture in plain modern wording.
- Greek, Hebrew or Latin phrases: keep them, followed by a short English translation.
- Do not add commentary, headings, or explanations that are not in the original.

=== PAGE 1: BOOK INFO (exactly this format, nothing else on the page) ===
BOOK INFO
Title: <the book's usual short title>
Author: <author's full name>
Year: <year first published>
Description: <2–3 plain sentences describing what the book is about, for a library listing>

=== EVERY OTHER PAGE ===
Landscape US Letter. Two equal columns: left = original, right = modern English.
From top to bottom, each page has:

1. RUNNING HEADER (one line): the book title at the left margin, and the current division
   right-aligned at the right margin, with a wide gap between them. Write the division as:
     Preface                         (or Dedication, To the Reader, Introduction, Conclusion)
     Chapter I / <short title>       (use the author's own chapter title if there is one;
                                      otherwise a short descriptive title of 8 words or fewer)
     Sermon 3 / <short title>        (for sermons, letters, discourses, etc.)
   Keep the division text exactly the same on every page of that division.

2. COLUMN HEADINGS (one line, on EVERY page): "ORIGINAL TEXT" at the top of the left column
   and "MODERN ENGLISH" at the top of the right column, on the same line.

3. NUMBERED PAIRS. Each paragraph of the original is one pair. Print the pair's label on its
   own line at the top of the pair in BOTH columns, then the original paragraph under the
   left label and its modern rendering under the right label. Start the next pair below the
   longer of the two.
   - Label format: <DIVISION CODE>.<two-digit number>, e.g. PREF.01, PREF.02, I.01, I.02,
     XIV.38. Numbering restarts at 01 in each division.
   - Division codes: letters and digits only, starting with a letter, no spaces or dots,
     unique for each division:
       DED = dedication, READER = epistle to the reader, PREF = preface,
       INTRO = introduction, CONCL = conclusion,
       I, II, III, IV … = chapters (Roman numerals),
       S1, S2 … = sermons, L1, L2 … = letters, P1C1, P1C2, P2C1 … = Part 1 Chapter 1, etc.
   - Optional suffixes on the label line: "I.01 / CHAPTER OUTLINE" for an author's chapter
     summary, and "I.20 / SOURCE NOTES" for the notes pair at the end of a chapter.
   - If a pair does not fit on the page, continue it at the top of the next page under the
     label repeated with "(continued)", e.g. "I.07 (continued)", in both columns.
   - One paragraph per pair. Only if an original paragraph is extremely long (over about
     300 words) may you split it at a sentence boundary into two consecutive pairs.
   - Do not leave blank lines inside a pair. Do not put headings inside the columns.

4. FOOTER (one line at the bottom): "<Author> / <Title>" on the left and "<page> / <total>"
   on the right, e.g. "John Owen / The Mortification of Sin            12 / 212".

=== LONG BOOKS ===
If the book is too long for one response, split it into several PDFs at division
boundaries. Never abridge to make it fit. Put the BOOK INFO page only in Part 1. Name the
files "<Title> - Part 1 of N.pdf", "<Title> - Part 2 of N.pdf", and so on. Use the same layout,
codes and numbering in every part. When I say "continue", make the next part.

=== CHECK BEFORE SENDING ===
- Every pair has a label in both columns, and the left and right labels match.
- No pair is missing its original or its modern text, and no paragraph was skipped.
- The column headings appear on every page after BOOK INFO.
- Nothing appears outside the header, the two columns and the footer.

Do this for: <BOOK TITLE by AUTHOR>
````

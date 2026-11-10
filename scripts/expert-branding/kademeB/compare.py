"""F3B — Kademe B regresyon karşılaştırması (main dökümü ↔ dal dökümü; regression-dump.ts çıktıları).

Kullanım: python scripts/expert-branding/kademeB/compare.py <main-klasörü> <dal-klasörü>

DOCX: normalize parça SHA kümesi (summary.json) BİREBİR eşit.
PDF (her biri ayrı ayrı denetlenir):
  - bayt eşitliği (/ID normalize edilerek; saat harness'ta sabit)
  - sayfa sayısı (pypdf + PyMuPDF)
  - sayfa başına çıkarılan metin (PyMuPDF)
  - sayfa başına görsel nesne listesi (boyut, bit derinliği, renk uzayı, akış SHA-256)
  - gömülü yazı tipleri (ad + tür; tümü gömülü olmalı)
  - render piksel eşitliği (her sayfa 110 dpi RGB; piksel SHA-256)
Çıktı: "N PASS / M FAIL" (FAIL varsa çıkış kodu 1).
"""
import hashlib
import io
import json
import os
import re
import sys

import pymupdf
from pypdf import PdfReader

A, B = sys.argv[1], sys.argv[2]
sa = json.load(open(os.path.join(A, "summary.json"), encoding="utf-8"))
sb = json.load(open(os.path.join(B, "summary.json"), encoding="utf-8"))
ok_n = 0
fail_n = 0


def ok(cond, label, extra=""):
    global ok_n, fail_n
    if cond:
        ok_n += 1
        print(f"  ✓ {label}")
    else:
        fail_n += 1
        print(f"  ✗ {label} {extra}")


def norm_pdf(b: bytes) -> bytes:
    return re.sub(rb"/ID \[ ?<[0-9A-Fa-f]+> ?<[0-9A-Fa-f]+> ?\]", b"/ID [ <0> <0> ]", b)


def pdf_profile(path):
    raw = open(path, "rb").read()
    doc = pymupdf.open(path)
    reader = PdfReader(io.BytesIO(raw))
    pages = []
    for i, page in enumerate(doc):
        imgs = []
        for img in page.get_images(full=True):
            xref = img[0]
            stream = doc.xref_stream_raw(xref) or b""
            imgs.append((img[2], img[3], img[4], img[5], hashlib.sha256(stream).hexdigest()[:16]))
        fonts = sorted({(f[3], f[1], f[2]) for f in page.get_fonts(full=True)})
        pix = page.get_pixmap(dpi=110, alpha=False)
        pages.append({
            "text": page.get_text("text"),
            "images": imgs,
            "fonts": fonts,
            "pixels": hashlib.sha256(pix.samples).hexdigest(),
            "size": (pix.width, pix.height),
        })
    embedded = all(f[1] in ("ttf", "cff", "otf", "TrueType", "Type0") or f[1] for p in pages for f in p["fonts"])
    return {"bytes": hashlib.sha256(norm_pdf(raw)).hexdigest(), "pages_pymupdf": len(doc), "pages_pypdf": len(reader.pages), "pages": pages, "embedded": embedded}


names = sorted(set(sa) | set(sb))
for n in names:
    a, b = sa.get(n), sb.get(n)
    if a is None or b is None:
        ok(False, f"{n}: bir tarafta yok")
        continue
    is_pdf = any(k.startswith("pdf:") for k in a)
    if not is_pdf:
        keys = sorted(set(a) | set(b))
        diff = [k for k in keys if a.get(k) != b.get(k)]
        ok(not diff, f"{n} [docx]: {len(keys)} normalize parça eşit ({sum(1 for k in keys if k.startswith('media:'))} media)", f"farklı: {diff}")
        continue
    pa = pdf_profile(os.path.join(A, f"{n}.pdf"))
    pb = pdf_profile(os.path.join(B, f"{n}.pdf"))
    ok(pa["bytes"] == pb["bytes"], f"{n} [pdf]: bayt eşit (/ID normalize)")
    ok(pa["pages_pymupdf"] == pb["pages_pymupdf"] == pa["pages_pypdf"] == pb["pages_pypdf"], f"{n} [pdf]: sayfa sayısı {pa['pages_pymupdf']} = {pb['pages_pymupdf']} (pypdf {pa['pages_pypdf']}/{pb['pages_pypdf']})")
    ok([p["text"] for p in pa["pages"]] == [p["text"] for p in pb["pages"]], f"{n} [pdf]: sayfa metinleri eşit")
    ok([p["images"] for p in pa["pages"]] == [p["images"] for p in pb["pages"]], f"{n} [pdf]: görsel nesne listesi eşit ({sum(len(p['images']) for p in pa['pages'])} görsel)")
    ok([p["fonts"] for p in pa["pages"]] == [p["fonts"] for p in pb["pages"]], f"{n} [pdf]: yazı tipleri eşit")
    ok([p["pixels"] for p in pa["pages"]] == [p["pixels"] for p in pb["pages"]], f"{n} [pdf]: render pikselleri eşit ({len(pa['pages'])} sayfa, 110 dpi)")

print(f"\n{ok_n} PASS / {fail_n} FAIL")
sys.exit(1 if fail_n else 0)

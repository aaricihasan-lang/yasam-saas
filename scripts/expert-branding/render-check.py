"""F3A — Word'ün ürettiği PDF'lerden PNG (kapak + son 2 sayfa) ve yerleşim denetimi.

Kullanım: python scripts/expert-branding/render-check.py <pdf-klasörü> <png-klasörü> [<markasız-pdf-klasörü>]
Denetimler:
  - kapak tek sayfada kalır: kapağın son satırı (modüle göre işaret) 1. sayfada; 2. sayfada YOK
  - markasız eşine göre sayfa sayısı farkı (imza bloğu en fazla +1 sayfa)
  - alt bilgi kurum satırı ile gövde metni çakışmaz: son sayfada alt bilgi bloğunun üst sınırı
    gövdenin son metin satırının altında
Çıktı: <png-klasörü>/render-check.json ve "N PASS / M FAIL"
"""
import glob
import json
import os
import sys

import pymupdf

PDF_DIR, PNG_DIR = sys.argv[1], sys.argv[2]
BASE_DIR = sys.argv[3] if len(sys.argv) > 3 else None
os.makedirs(PNG_DIR, exist_ok=True)

COVER_MARK = {
    "dy-": "yasamsistemi.com",
    "beslenme-": "yasamsistemi.com",
    "hd-pro1": "PROFESYONEL ANALİZ RAPORU",
    "nkb-": "Bütünsel farkındalık, kişisel dönüşüm",
    "klasik-": "Bütünsel farkındalık, kişisel dönüşüm",
    "hd-iliski": "başarı garantisi değildir",
    "hd-grup": "başarı garantisi değildir",
}


def mark_for(name):
    for k, v in COVER_MARK.items():
        if name.startswith(k):
            return v
    return None


def norm(t):
    return " ".join(t.split())


base_pages = {}
if BASE_DIR:
    for pdf in glob.glob(os.path.join(BASE_DIR, "*.pdf")):
        case = os.path.basename(pdf).split("__")[0]
        base_pages[case] = len(pymupdf.open(pdf))

results = []
passed = failed = 0
for pdf in sorted(glob.glob(os.path.join(PDF_DIR, "*.pdf"))):
    name = os.path.splitext(os.path.basename(pdf))[0]
    case = name.split("__")[0]
    doc = pymupdf.open(pdf)
    n = len(doc)
    p1 = norm(doc[0].get_text())
    p2 = norm(doc[1].get_text()) if n > 1 else ""
    mark = mark_for(name)
    cover_ok = bool(mark) and mark in p1 and mark not in p2
    delta = n - base_pages[case] if case in base_pages else None
    pages_ok = delta is None or 0 <= delta <= 1
    # Alt bilgi çakışması: son sayfada, sayfanın alt %12'sindeki (alt bilgi) bloklar ile gövde blokları
    # dikeyde örtüşmemeli.
    last = doc[n - 1]
    h = last.rect.height
    blocks = [b for b in last.get_text("blocks") if b[4].strip()]
    foot = [b for b in blocks if b[1] > h * 0.88]
    body = [b for b in blocks if b[1] <= h * 0.88]
    overlap = bool(foot and body and max(b[3] for b in body) > min(b[1] for b in foot))
    shots = []
    for i in sorted({0, max(0, n - 2), n - 1}):
        out = os.path.join(PNG_DIR, f"{name}-s{i + 1:02d}.png")
        doc[i].get_pixmap(dpi=70).save(out)
        shots.append(os.path.basename(out))
    ok = cover_ok and pages_ok and not overlap
    passed += ok
    failed += not ok
    results.append({"name": name, "pages": n, "basePages": base_pages.get(case), "coverOnOnePage": cover_ok, "pagesOk": pages_ok, "footerOverlap": overlap, "png": shots})
    if not ok:
        print(f"  FAIL {name}: kapak={cover_ok} sayfa={n}/{base_pages.get(case)} cakisma={overlap}")

json.dump(results, open(os.path.join(PNG_DIR, "render-check.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"render-check: {passed} PASS / {failed} FAIL")

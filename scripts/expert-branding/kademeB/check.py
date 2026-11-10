"""F3B — Kademe B markalı örneklerin PDF sağlamlığı + Word render denetimi (samples.ts manifest'i).

Kullanım:
  python scripts/expert-branding/kademeB/check.py <örnek-klasörü> [<word-pdf-klasörü>]

PDF (jsPDF çıktıları; manifest'teki her PDF):
  - pypdf ve PyMuPDF ile açılır; sayfa sayıları eşit
  - tüm yazı tipleri GÖMÜLÜ (PyMuPDF ext ≠ "n/a")
  - sayfa sayısı: markasız ≤ n ≤ markasız + 1
  - beklenen markalama metinleri VAR, gösterilmemesi gerekenler YOK (boşluk duyarsız)
  - görsel sayısı: markasız + (logo ? 1 : 0)
  - gövde metni alt bilgi alanına TAŞMAZ (modül alt bilgi sınırı) ve sayfa dışına çıkmaz
  - son sayfa PNG (70 dpi) → <örnek>/png/
Word render (isteğe bağlı; Word COM ile üretilmiş PDF'ler, ad: <docx-adı>.pdf; markasızlar <ad>__markasiz.pdf). Yerel üretim
(PowerShell; belgeler salt-okunur açılır, KAYDEDİLMEZ; Temp dışı bir klasörde): Start-Job içinde tek Word örneği →
  $w = New-Object -ComObject Word.Application; $w.Visible=$false; $w.DisplayAlerts=0
  foreach (<docx>) { $d = $w.Documents.Open($docx, $false, $true, $false); $d.ExportAsFixedFormat($pdf, 17); $d.Close(0) }; $w.Quit()
  - sayfa sayısı markasız ≤ n ≤ markasız + 1 (Kupa yıllık takvim: tek A3 → A3 + A4 devam kararı izinli)
  - beklenen metinler Word çıktısında VAR
  - son sayfada gövde blokları alt bilgi bloklarıyla dikeyde ÇAKIŞMAZ
  - son 2 sayfa PNG → <örnek>/png-word/
Çıktı: <örnek>/check.json ; "N PASS / M FAIL"
"""
import glob
import json
import os
import re
import sys

import pymupdf
from pypdf import PdfReader

SAMPLES = sys.argv[1]
WORD_PDF = sys.argv[2] if len(sys.argv) > 2 else None
MM = 72 / 25.4
# Alt bilgi alanının üst sınırı (pt): Hacamat kurumsal alt bilgisi 297 − 22 mm'deki çizgiyle başlar; Atlas'ta yalnız
# "Sayfa X / Y" satırı 297 − 9 mm taban çizgisinde (üstü ≈ 285 mm).
FOOTER_TOP = {"hacamat": (297 - 22) * MM, "atlas": 285 * MM}

man = json.load(open(os.path.join(SAMPLES, "manifest.json"), encoding="utf-8"))
P = F = 0
fails = []
rows = []


def ok(cond, label):
    global P, F
    if cond:
        P += 1
    else:
        F += 1
        fails.append(label)
        print(f"  ✗ {label}")


def squash(t):
    return re.sub(r"\s+", "", t)


os.makedirs(os.path.join(SAMPLES, "png"), exist_ok=True)
for m in man:
    if m["kind"] != "pdf":
        continue
    path = os.path.join(SAMPLES, m["file"])
    base = os.path.join(SAMPLES, m["base"])
    label = os.path.basename(path)
    doc = pymupdf.open(path)
    bdoc = pymupdf.open(base)
    reader = PdfReader(path)
    n, bn = len(doc), len(bdoc)
    ok(len(reader.pages) == n, f"{label}: pypdf ve PyMuPDF aynı sayfa sayısı ({len(reader.pages)}/{n})")
    # jsPDF standart 14 yazı tipini kaynak sözlüğüne her zaman ekler (kullanılmasa da); denetim METİNDE KULLANILAN yazı tipleri.
    fonts = {f[3]: f[1] for p in doc for f in p.get_fonts(full=True)}
    used = {sp["font"] for p in doc for bl in p.get_text("dict")["blocks"] for ln in bl.get("lines", []) for sp in ln["spans"] if sp["text"].strip()}
    used_ext = {u: fonts.get(u, fonts.get(u.split("+")[-1], "?")) for u in used}
    ok(used and all(e not in ("n/a", "?") for e in used_ext.values()), f"{label}: kullanılan tüm yazı tipleri gömülü {used_ext}")
    ok(bn <= n <= bn + 1, f"{label}: sayfa sayısı {n} (markasız {bn})")
    mod = m["caseName"].split("-")[0]
    top = FOOTER_TOP.get(mod)
    # Gövde metni: üst bilgi (≤ 14 mm) ve alt bilgi bölgesindeki bloklar hariç → sayfa sınırından akan dipnot birleşik aranır.
    text = squash("".join(b[4] for p in doc for b in p.get_text("blocks", sort=True) if b[3] > 14 * MM and (top is None or b[1] < top)))
    for s in m["expect"]["present"]:
        ok(squash(s) in text, f"{label}: metin VAR: {s[:40]}")
    for s in m["expect"]["absent"]:
        ok(squash(s) not in text, f"{label}: metin YOK: {s[:40]}")
    # Benzersiz görsel nesneleri (jsPDF tüm görselleri her sayfanın kaynaklarına ekler → xref kümesi sayılır).
    imgs = len({i[0] for p in doc for i in p.get_images()})
    bimgs = len({i[0] for p in bdoc for i in p.get_images()})
    ok(imgs == bimgs + (1 if m["expect"]["logo"] else 0), f"{label}: benzersiz görsel {imgs} (markasız {bimgs})")
    over = []
    for i, p in enumerate(doc):
        h, w = p.rect.height, p.rect.width
        for b in p.get_text("blocks"):
            if not b[4].strip():
                continue
            if b[2] > w + 0.5 or b[0] < -0.5:
                over.append((i + 1, "yatay", round(b[2])))
            if top and b[1] < top and b[3] > top + 1:
                over.append((i + 1, "altbilgi", round(b[3]), b[4][:30]))
    ok(not over, f"{label}: taşma / alt bilgi çakışması yok {over[:3]}")
    png = os.path.join(SAMPLES, "png", f"{os.path.splitext(label)[0]}-s{n:02d}.png")
    doc[n - 1].get_pixmap(dpi=70).save(png)
    rows.append({"file": m["file"], "pages": n, "basePages": bn, "usedFonts": used_ext, "images": imgs, "png": os.path.basename(png)})

if WORD_PDF:
    os.makedirs(os.path.join(SAMPLES, "png-word"), exist_ok=True)
    by_file = {os.path.splitext(os.path.basename(m["file"]))[0]: m for m in man if m["kind"] == "docx"}
    for pdf in sorted(glob.glob(os.path.join(WORD_PDF, "*.pdf"))):
        name = os.path.splitext(os.path.basename(pdf))[0]
        if name.endswith("__markasiz"):
            continue
        m = by_file.get(name)
        if not m:
            continue
        base = os.path.join(WORD_PDF, f"{m['caseName']}__markasiz.pdf")
        doc = pymupdf.open(pdf)
        n = len(doc)
        bn = len(pymupdf.open(base)) if os.path.exists(base) else None
        label = f"WORD {name}"
        if bn is not None:
            lim = bn + 1 if not m["caseName"].startswith("kupa-takvim-yillik") else bn + 2
            ok(bn <= n <= lim, f"{label}: sayfa sayısı {n} (markasız {bn})")
        text = squash("".join(p.get_text() for p in doc))
        for s in m["expect"]["present"]:
            # Word, allCaps etiketleri büyük harfle gösterir ("İMZA" değil "İmza" yazılır; etiket dışı alanlar birebir).
            ok(squash(s) in text or squash(s).upper() in text.upper(), f"{label}: metin VAR: {s[:40]}")
        if m["caseName"] == "kupa-takvim-yillik" and os.path.exists(base):
            # Tek A3 takvim: imza kartı sığmazsa A3 sayfası markasızla AYNI kalmalı, kart A4 devam sayfasına gitmeli.
            ok(squash(doc[0].get_text()) == squash(pymupdf.open(base)[0].get_text()) or n == 1, f"{label}: A3 sayfası markasızla aynı (kart A4 devamda)")
        last = doc[n - 1]
        h = last.rect.height
        blocks = [b for b in last.get_text("blocks") if b[4].strip()]
        foot = [b for b in blocks if b[1] > h * 0.88]
        body = [b for b in blocks if b[1] <= h * 0.88]
        overlap = bool(foot and body and max(b[3] for b in body) > min(b[1] for b in foot))
        ok(not overlap, f"{label}: son sayfada gövde ↔ alt bilgi çakışması yok")
        for i in sorted({max(0, n - 2), n - 1}):
            last_png = os.path.join(SAMPLES, "png-word", f"{name}-s{i + 1:02d}.png")
            doc[i].get_pixmap(dpi=70).save(last_png)
        rows.append({"word": name, "pages": n, "basePages": bn, "overlap": overlap})

json.dump(rows, open(os.path.join(SAMPLES, "check.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"check: {P} PASS / {F} FAIL")
sys.exit(1 if F else 0)

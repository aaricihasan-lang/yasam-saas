#!/usr/bin/env python3
"""
Yerel web yazı tipi üretimi (next/font/google → next/font/local geçişi). CI'da ÇALIŞMAZ; yalnız yeniden üretim / denetim için.

  python scripts/fonts/yerel-font-uret.py [--kaynak-dir <önbellek>]   (gereken: fontTools ≥ 4.50, brotli)

Kaynak: resmî google/fonts deposu, SABİT commit (GF_COMMIT). Her kaynak dosyanın SHA-256'sı doğrulanır; eşleşmezse durur.
Üretim kuralları — next/font/google'ın build'de indirdiği dosyalarla aynı içerik (bkz. app/_fonts/FONTLAR.md):
  * Unicode: önceki CSS'in ETKİN kapsamı birebir — next/font/google çağrısındaki alt kümelerin unicode-range'leri
    (Geist / Geist Mono: yalnız "latin"; diğerleri: "latin" + "latin-ext"). Google dosyalarındaki aralık dışı ek
    karakterler (Ă, birleşik aksanlar) eski CSS'te de unicode-range ile dışarıda kaldığından alınmaz.
    Not: Geist yalnız-latin olduğundan İ Ğ ğ Ş ş eskisi gibi yedek yazı tipiyle çizilir (görünüm korunur).
  * OpenType özellikleri: Google'ın sunduğu dosyadaki özellik listesi (aile başına).
  * Değişken eksenler korunur. Fraunces: API'nin istemediği WONK ekseni Google varsayılanı 0'a sabitlenir
    (WONK=0 ve WONK=1 sabitlemesi glif / GSUB / metrik olarak birebir aynı çıktı verir; yalnız ad meta verisi farklı).
  * Playfair Display: OFL "Reserved Font Name" içerdiğinden alt küme ALINMAZ — özgün dosya bayt bayt kopyalanır.
  * Ad tablosu (telif / lisans kayıtları) tamamen korunur.
"""
import argparse
import hashlib
import io
import os
import shutil
import sys
import urllib.parse
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

GF_COMMIT = "5bb28733cec313b63fbd415b574b5ae35c8aa8b8"  # google/fonts main, 2026-11-08
LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
LATIN_EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF"
YALNIZ_LATIN = LATIN
LATIN_VE_EXT = LATIN + "," + LATIN_EXT
# Kaynakta olup Google'ın sunduğu alt küme dosyalarında OLMAYAN aralık-içi karakterler (eski sitede yedek yazı tipiyle
# çiziliyordu) → birebir görünüm için alınmaz. Google'ın v5/v6/v38/v20/v23/v12 dosyalarıyla karşılaştırılarak çıkarıldı.
HARIC = {
    "geist.woff2": "U+2020,U+2021,U+2028,U+2029,U+2030",
    "geist-mono.woff2": "U+2020,U+2021,U+2028,U+2029,U+2030",
    "fraunces.woff2": "U+2010,U+2021,U+2030,U+2052",
    "jost.woff2": "U+2010,U+2012,U+2021,U+2030,U+2031,U+203D",
    "manrope.woff2": "U+2011,U+201F,U+2021,U+2030,U+2060",
    "unbounded.woff2": "U+2021,U+2030",
}

# (çıktı, google/fonts yolu, kaynak SHA-256, Google'ın sunduğu dosyadaki özellikler, ek işlem, karakter kapsamı)
FONTLAR = [
    ("geist.woff2", "ofl/geist/Geist[wght].ttf", "73894e0448cae90a92b6c2f8732b7bb9acb7b94c418bff559dad4a18e1de9659",
     ["ccmp", "dnom", "frac", "liga", "locl", "numr", "pnum", "tnum", "kern", "mark", "mkmk"], None, YALNIZ_LATIN),
    ("geist-mono.woff2", "ofl/geistmono/GeistMono[wght].ttf", "d00e590b8eb3a59acc329b2d044fd143ae935090b7da33199ebee27cc7de8196",
     ["ccmp", "dnom", "frac", "locl", "numr", "mark", "mkmk"], None, YALNIZ_LATIN),
    ("fraunces.woff2", "ofl/fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf", "177ff6c0f14e5550a3c624247cd1189611d4eb65d000b14944c63d967958abbb",
     ["liga", "rvrn", "kern"], {"WONK": 0}, LATIN_VE_EXT),
    ("jost.woff2", "ofl/jost/Jost[wght].ttf", "6343b70971000b04c5d401c96ae08ce371086135e999d5e1e1413039c0213076",
     ["tnum", "kern"], None, LATIN_VE_EXT),
    ("manrope.woff2", "ofl/manrope/Manrope[wght].ttf", "3ae11c49db0455a3cc33e37d380f20fdb8c7f8b41dc07625c177e3d87a9d6ae6",
     ["calt", "dnom", "frac", "liga", "locl", "numr", "pnum", "tnum", "kern"], None, LATIN_VE_EXT),
    ("unbounded.woff2", "ofl/unbounded/Unbounded[wght].ttf", "323b511be380c8d474ef030686b71aedde501f8d9cd46da558b7c40454372c3f",
     ["ccmp", "dnom", "frac", "liga", "locl", "numr", "pnum", "rlig", "tnum", "kern", "mark", "mkmk"], None, LATIN_VE_EXT),
    ("playfair-display.ttf", "ofl/playfairdisplay/PlayfairDisplay[wght].ttf", "c40f2293766a503bc70cce9e512ef844a4ccb7cbcde792fe2ea31d191917d8d6",
     None, "KOPYA", None),
]
LISANSLAR = {
    "geist": "1781d2806a07d91c4edf4740b88449fab7d0eadad53f7c351b94cd4d4eb8c00f",
    "geistmono": "1781d2806a07d91c4edf4740b88449fab7d0eadad53f7c351b94cd4d4eb8c00f",
    "fraunces": "bdf4c22802eaf804f998195871c6b8938aac2ac14b2d78a8bd66a6f1eced833b",
    "jost": "1af3438a4d5f0ed2bdbc5751a5a67ebf6d537334161184b7fbb68503ef0ea0c5",
    "manrope": "58172e0c0fac2cda8a37b348164bb55e44b0e69051e557e92b1d3f6910141f7b",
    "unbounded": "31e5d4e83955e7103c34570dd49b0570ef490800bd65b42923c0dd02445263b3",
    "playfairdisplay": "566be814f8e96e93dfa16101331557eb6b5467e9e03f627c0910fe93ca12300e",
}


def indir(yol, beklenen, onbellek):
    yerel = os.path.join(onbellek, yol.replace("/", "__")) if onbellek else None
    if yerel and os.path.exists(yerel):
        veri = open(yerel, "rb").read()
    else:
        url = f"https://raw.githubusercontent.com/google/fonts/{GF_COMMIT}/{urllib.parse.quote(yol)}"
        veri = urllib.request.urlopen(url, timeout=120).read()
        if yerel:
            open(yerel, "wb").write(veri)
    gercek = hashlib.sha256(veri).hexdigest()
    if gercek != beklenen:
        sys.exit(f"SHA-256 UYUŞMUYOR: {yol}\n  beklenen {beklenen}\n  gelen    {gercek}")
    return veri


def main():
    # fontTools alt küme sırası küme (set) sırasına bağlı → sabit hash tohumuyla yeniden başlatılır; aynı girdi = aynı baytlar.
    if os.environ.get("PYTHONHASHSEED") != "0":
        os.environ["PYTHONHASHSEED"] = "0"
        os.execv(sys.executable, [sys.executable] + sys.argv)
    ap = argparse.ArgumentParser()
    ap.add_argument("--kaynak-dir", help="indirilen kaynak dosyalar için önbellek dizini")
    ap.add_argument("--cikti-dir", default=os.path.join(os.path.dirname(__file__), "..", "..", "app", "_fonts"))
    a = ap.parse_args()
    if a.kaynak_dir:
        os.makedirs(a.kaynak_dir, exist_ok=True)
    os.makedirs(os.path.join(a.cikti_dir, "lisanslar"), exist_ok=True)

    for cikti, yol, sha, ozellikler, ek, kapsam in FONTLAR:
        veri = indir(yol, sha, a.kaynak_dir)
        hedef = os.path.join(a.cikti_dir, cikti)
        if ek == "KOPYA":
            open(hedef, "wb").write(veri)
        else:
            font = TTFont(io.BytesIO(veri), recalcTimestamp=False)  # head.modified kaynağınki kalır → aynı girdi = aynı baytlar
            if ek:
                font = instancer.instantiateVariableFont(font, ek)
                ara = io.BytesIO()
                font.save(ara)  # sabitlenmiş ekseni diske yazıp yeniden okumadan alt küme gvar tembel kaydında hata verir
                font = TTFont(io.BytesIO(ara.getvalue()), recalcTimestamp=False)
            secenek = subset.Options()
            secenek.layout_features = ozellikler
            secenek.name_IDs = ["*"]
            secenek.name_languages = ["*"]
            secenek.notdef_outline = True
            secenek.flavor = "woff2"
            secenek.hinting = False
            alt = subset.Subsetter(options=secenek)
            haric = set(subset.parse_unicodes(HARIC.get(cikti, ""))) if HARIC.get(cikti) else set()
            alt.populate(unicodes=sorted(set(subset.parse_unicodes(kapsam)) - haric))
            alt.subset(font)
            font.flavor = "woff2"
            font.save(hedef)
        print(f"{cikti:28} {os.path.getsize(hedef):>8} B  sha256 {hashlib.sha256(open(hedef, 'rb').read()).hexdigest()}")

    for aile, sha in LISANSLAR.items():
        veri = indir(f"ofl/{aile}/OFL.txt", sha, a.kaynak_dir)
        open(os.path.join(a.cikti_dir, "lisanslar", f"OFL-{aile}.txt"), "wb").write(veri)
    print("lisanslar: " + ", ".join(sorted(LISANSLAR)))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Yerel web yazı tipi üretimi (next/font/google → next/font/local geçişi). CI'da ÇALIŞMAZ; yalnız yeniden üretim / denetim için.

  python scripts/fonts/yerel-font-uret.py [--kaynak-dir <önbellek>]   (gereken: fontTools ≥ 4.50, brotli)

Kaynak: resmî google/fonts deposu, SABİT commit (GF_COMMIT). Her kaynak dosyanın SHA-256'sı doğrulanır; eşleşmezse durur.
Üretim kuralları — next/font/google'ın build'de indirdiği dosyalarla aynı içerik (bkz. app/_fonts/FONTLAR.md):
  * Unicode: önceki CSS'in ETKİN kapsamı birebir (KAPSAM). next/font/google'da `subsets` yalnız ön yüklemeyi seçer; üretilen
    CSS Google'ın döndürdüğü TÜM alt kümeleri (latin-ext, kiril, Vietnamca …) unicode-range'leriyle içerir. Bu yüzden Geist dahil
    Türkçe harfler (İ Ğ ğ Ş ş …) önceden de yazı tipinin kendisiyle çiziliyordu — yerel dosyalar aynı kapsamı taşır.
  * OpenType özellikleri: Google'ın sunduğu dosyadaki özellik listesi (aile başına).
  * Değişken eksenler korunur. Fraunces: API'nin istemediği WONK ekseni Google varsayılanı 0'a sabitlenir
    (WONK=0 ve WONK=1 sabitlemesi glif / GSUB / metrik olarak birebir aynı çıktı verir; yalnız ad meta verisi farklı).
  * Playfair Display: OFL "Reserved Font Name" içerdiğinden alt küme ALINMAZ — özgün dosya bayt bayt kopyalanır.
  * Ad tablosu (telif / lisans kayıtları) tamamen korunur.
  * Global Geist / Fraunces / Jost (root layout) üretilmez: Google'ın sunduğu alt küme dosyaları indirilip doğrulanır
    (GOOGLE_ALT_KUME) — önceki build'le bayt bayt aynı.
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
# Önceki next/font/google CSS'inin ETKİN kapsamı (aile başına): Google'ın o istek için döndürdüğü TÜM alt kümelerde
# (subsets yalnız ön yüklemeyi seçer; CSS bütün alt kümeleri içerir) her dosyanın karakterleri ∩ o alt kümenin unicode-range'i.
# Google Fonts API, 2026-11-10 (Geist v5, Geist Mono v6, Fraunces v38, Jost v20, Manrope v23, Unbounded v12) yanıtlarından hesaplandı.
KAPSAM = {
    "fraunces.woff2": "U+0020-007E,U+00A0-0148,U+014A-017E,U+018F,U+0192,U+01A0-01A1,U+01AF-01B0,U+01C4-01CC,U+01D9-01DA,U+01E6-01E7,U+01EA-01EB,U+01FA-021B,U+022A-022D,U+0230-0233,U+0237,U+0259,U+02B9-02BA,U+02BC,U+02C6-02C7,U+02DA,U+02DC-02DD,U+0300-0301,U+0303-0304,U+0308,U+1E08-1E09,U+1E0C-1E0F,U+1E14-1E17,U+1E1C-1E1D,U+1E20-1E21,U+1E24-1E25,U+1E2A-1E2B,U+1E2E-1E2F,U+1E36-1E37,U+1E3A-1E3B,U+1E42-1E43,U+1E46-1E49,U+1E4C-1E53,U+1E5A-1E5B,U+1E5E-1E5F,U+1E62-1E65,U+1E6C-1E6F,U+1E78-1E7B,U+1E80-1E85,U+1E92-1E93,U+1E97,U+1E9E,U+1EA0-1EF9,U+2013-2014,U+2018-201A,U+201C-201E,U+2020,U+2022,U+2026,U+2032-2033,U+2039-203A,U+2044,U+20A1,U+20A3-20A4,U+20A6-20A7,U+20A9,U+20AB-20AD,U+20B1-20B2,U+20B5,U+20B9-20BA,U+20BC-20BD,U+2122,U+2212,U+2215",
    "geist-mono.woff2": "U+0020-007E,U+00A0-00AC,U+00AE-0113,U+0116-012B,U+012E-0131,U+0134-0137,U+0139-013E,U+0141-0148,U+014A-014D,U+0150-017E,U+018F,U+0192,U+01A0-01A1,U+01AF-01B0,U+01CD-01CE,U+01E4-01E9,U+0218-021B,U+0237,U+0259,U+02B9,U+02BC,U+02C6-02C8,U+02DA,U+02DC-02DD,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0400-045F,U+0462-0463,U+046A-046B,U+0472-0475,U+0490-0493,U+0496-0497,U+049A-049B,U+04A2-04A3,U+04AE-04B3,U+04B6-04B7,U+04BA-04BB,U+04C0,U+04CF,U+04D8-04D9,U+04E2-04E3,U+04E8-04E9,U+04EE-04EF,U+1E20-1E21,U+1E80-1E85,U+1E9E,U+1EA0-1EF9,U+2013-2014,U+2018-201A,U+201C-201E,U+2020,U+2022,U+2026,U+2032-2033,U+2039-203A,U+2044,U+20AA,U+20AC,U+20B1,U+20B4,U+20B9,U+20BD,U+2116,U+2122,U+2191,U+2193,U+2212,U+2500-259F,U+A78B-A78C",
    "jost.woff2": "U+0000,U+000D,U+0020-007E,U+00A0-017E,U+0192,U+0212-0213,U+0218-021B,U+0237,U+02C6-02C7,U+02DA,U+02DC-02DD,U+0301,U+0304,U+0308,U+0400-0401,U+0403,U+040C-040E,U+0410-0451,U+0453,U+045C-045E,U+1E80-1E89,U+1E9E,U+1EF2-1EF3,U+2013-2014,U+2018-201A,U+201C-201E,U+2020,U+2022,U+2026,U+2039-203A,U+2044,U+20AC,U+20BD,U+2122,U+2212,U+2215",
    "manrope.woff2": "U+000D,U+0020-007E,U+00A0-0113,U+0116-012B,U+012E-0131,U+0134-0137,U+0139-013E,U+0141-0148,U+014A-014D,U+0150-017E,U+0192,U+01A0-01A1,U+01AF-01B0,U+0218-021B,U+0259,U+02C6-02C7,U+02DA,U+02DC-02DD,U+0374-0375,U+037E,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03CE,U+0400-045F,U+0490-0491,U+04AE-04AF,U+04BA-04BB,U+04E8-04E9,U+1E80-1E85,U+1E9E,U+1EA0-1EF9,U+2013-2014,U+2018-201A,U+201C-201E,U+2020,U+2022,U+2026,U+2039-203A,U+2044,U+20A3,U+20A9-20AC,U+20AE,U+20B1,U+20B4,U+20B9-20BA,U+20BD,U+20BF,U+2116,U+2122,U+2191,U+2193,U+2212,U+2215",
    "unbounded.woff2": "U+0020-007E,U+00A0-00B4,U+00B6-0181,U+0186-018A,U+018E-0194,U+0196-01A1,U+01A4-01A5,U+01A9-01AA,U+01AC-01B9,U+01C0-01F5,U+01F8-0220,U+0226-0233,U+0237-023E,U+0241-0254,U+0256-0257,U+0259,U+025B,U+025F-0261,U+0263-026A,U+026C,U+026F,U+0271-0272,U+0275,U+0278,U+027D-027E,U+0283-0284,U+0288-028C,U+028E,U+0292,U+0294-0295,U+0298,U+029D,U+02A7,U+02B0-02B3,U+02B7-02B9,U+02BB-02BC,U+02BE-02C1,U+02C6-02C9,U+02DA,U+02DC-02DD,U+02E1-02E3,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+0400-045F,U+0490-0491,U+1D7D,U+1DBB,U+1DBF,U+1E00-1E9B,U+1E9E,U+1EA0-1EF9,U+2013-2014,U+2018-201A,U+201C-201E,U+2020,U+2022,U+2026,U+2039-203A,U+2044,U+20A1,U+20A3-20A4,U+20A6,U+20A9,U+20AB-20AD,U+20B1-20B2,U+20B4-20B5,U+20B8-20BA,U+20BC-20BD,U+2116,U+2122,U+2191,U+2193,U+2212,U+2215,U+2C63-2C66,U+2C6D-2C70,U+2C72-2C73,U+A726-A727,U+A78B-A78D,U+A798-A799,U+A7AA,U+A7AC-A7AE,U+A7B2-A7B7",
}

# (çıktı, google/fonts yolu, kaynak SHA-256, Google'ın sunduğu dosyadaki özellikler, ek işlem, karakter kapsamı)
FONTLAR = [
    ("geist-mono.woff2", "ofl/geistmono/GeistMono[wght].ttf", "d00e590b8eb3a59acc329b2d044fd143ae935090b7da33199ebee27cc7de8196",
     ["ccmp", "dnom", "frac", "locl", "numr", "mark", "mkmk"], None, KAPSAM["geist-mono.woff2"]),
    ("fraunces.woff2", "ofl/fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf", "177ff6c0f14e5550a3c624247cd1189611d4eb65d000b14944c63d967958abbb",
     ["liga", "rvrn", "kern"], {"WONK": 0}, KAPSAM["fraunces.woff2"]),
    ("jost.woff2", "ofl/jost/Jost[wght].ttf", "6343b70971000b04c5d401c96ae08ce371086135e999d5e1e1413039c0213076",
     ["tnum", "kern"], None, KAPSAM["jost.woff2"]),
    ("manrope.woff2", "ofl/manrope/Manrope[wght].ttf", "3ae11c49db0455a3cc33e37d380f20fdb8c7f8b41dc07625c177e3d87a9d6ae6",
     ["calt", "dnom", "frac", "liga", "locl", "numr", "pnum", "tnum", "kern"], None, KAPSAM["manrope.woff2"]),
    ("unbounded.woff2", "ofl/unbounded/Unbounded[wght].ttf", "323b511be380c8d474ef030686b71aedde501f8d9cd46da558b7c40454372c3f",
     ["ccmp", "dnom", "frac", "liga", "locl", "numr", "pnum", "rlig", "tnum", "kern", "mark", "mkmk"], None, KAPSAM["unbounded.woff2"]),
    ("playfair-display.ttf", "ofl/playfairdisplay/PlayfairDisplay[wght].ttf", "c40f2293766a503bc70cce9e512ef844a4ccb7cbcde792fe2ea31d191917d8d6",
     None, "KOPYA", None),
]
# Google Fonts'un sunduğu ALT KÜME dosyaları (global Geist / Fraunces / Jost; app/_fonts/google). Önceki next/font/google
# build'inin indirdiği dosyalarla BAYT BAYT aynı (aynı istek + next/font'un User-Agent'ı); alt küme ayrımı korunduğu için Türkçe
# harflerin harf aralığı ve satır kırılması önceki gibidir. Yeniden üretilmez — indirilir ve sabit SHA-256 ile doğrulanır.
# Fraunces / Jost latin + latin-ext: depoda zaten bulunan public/premium/fonts dosyaları (Doğal Destek ile ortak; kopya yok).
GOOGLE_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36"
GOOGLE_ALT_KUME = [
    ("app/_fonts/google/geist-cyrillic-ext.woff2",
     "https://fonts.gstatic.com/s/geist/v5/gyByhwUxId8gMEwRGFWNOITddY4.woff2",
     "b7a545bbb08256bd809f11cfe66d88da3e22d169ea4407737b1ef0ec1ed3d791"),
    ("app/_fonts/google/geist-cyrillic.woff2",
     "https://fonts.gstatic.com/s/geist/v5/gyByhwUxId8gMEwYGFWNOITddY4.woff2",
     "6129fc8571c3e0cb0a4c41f5160c974a843b055009dc4ad8858bd808e18a2d86"),
    ("app/_fonts/google/geist-vietnamese.woff2",
     "https://fonts.gstatic.com/s/geist/v5/gyByhwUxId8gMEwTGFWNOITddY4.woff2",
     "f689f638f29fff460a2d5749edb5d5c38d7bef0389f32032d871f23fc6ebb008"),
    ("app/_fonts/google/geist-latin-ext.woff2",
     "https://fonts.gstatic.com/s/geist/v5/gyByhwUxId8gMEwSGFWNOITddY4.woff2",
     "58a6b173d5ca1dec92166ea3c6cb1a84a4144556d10928ac14e8e6b40e4787bd"),
    ("app/_fonts/google/geist-latin.woff2",
     "https://fonts.gstatic.com/s/geist/v5/gyByhwUxId8gMEwcGFWNOITd.woff2",
     "9b6f5ff45b278c744b5f379a2c4ecbaf858a842b8eaf82ac8d21b699ca16c608"),
    ("app/_fonts/google/fraunces-vietnamese.woff2",
     "https://fonts.gstatic.com/s/fraunces/v38/6NUI8FyLNQOQZAnv9bYEvCeYdG9Ea92uemAO_kikR_BPumo3.woff2",
     "871c9b3232eccd35c9f2fb7b9f598c313c41d1e93525df35f9f54a8b9dd56df8"),
    ("public/premium/fonts/5307092570128b5a-s.p.16191ingcc7md.woff2",
     "https://fonts.gstatic.com/s/fraunces/v38/6NUI8FyLNQOQZAnv9bYEvCeYdG9Ea92uemAO_0ikR_BPumo3.woff2",
     "0346b5001571b34d8d4d229a4d823d20d51a42bb48159118602837d4fe4ad4d4"),
    ("public/premium/fonts/b67966e0b83b2cd0-s.p.0fuf3937kiol3.woff2",
     "https://fonts.gstatic.com/s/fraunces/v38/6NUI8FyLNQOQZAnv9bYEvCeYdG9Ea92uemAO8UikR_BPug.woff2",
     "ae1d21f0a3120a56e7b163af66f709b58f140d024c0ac4f0a362662c7692a738"),
    ("app/_fonts/google/jost-cyrillic.woff2",
     "https://fonts.gstatic.com/s/jost/v20/92zatBhPNqw73oDd4jQmfxIC7w.woff2",
     "184c3af415cddd52af31cf70166bf351adb70b09e64fdb1948109192a26c2c0d"),
    ("public/premium/fonts/9b8f0e32b229dbc1-s.p.0dguglgc-iz4q.woff2",
     "https://fonts.gstatic.com/s/jost/v20/92zatBhPNqw73ord4jQmfxIC7w.woff2",
     "b2a539cd1f2bbf123e66bafa988bbd32249a7ba3335aec377a9fc1b37734b1ed"),
    ("public/premium/fonts/81cef6a21128489e-s.p.2csanl8cs02r-.woff2",
     "https://fonts.gstatic.com/s/jost/v20/92zatBhPNqw73oTd4jQmfxI.woff2",
     "235d8f8964bfdf105fc0c3e4c77b5e70f31bee1dad611d59318b5f2a5cb64d90"),
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
            alt.populate(unicodes=subset.parse_unicodes(kapsam))
            alt.subset(font)
            font.flavor = "woff2"
            font.save(hedef)
        print(f"{cikti:28} {os.path.getsize(hedef):>8} B  sha256 {hashlib.sha256(open(hedef, 'rb').read()).hexdigest()}")

    kok = os.path.join(os.path.dirname(__file__), "..", "..")
    for hedef, url, sha in GOOGLE_ALT_KUME:
        yol = os.path.join(kok, hedef)
        if os.path.exists(yol) and hashlib.sha256(open(yol, "rb").read()).hexdigest() == sha:
            print(f"{hedef:60} doğrulandı")
            continue
        veri = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": GOOGLE_UA}), timeout=120).read()
        if hashlib.sha256(veri).hexdigest() != sha:
            sys.exit(f"SHA-256 UYUŞMUYOR: {url}")
        os.makedirs(os.path.dirname(yol), exist_ok=True)
        open(yol, "wb").write(veri)
        print(f"{hedef:60} indirildi + doğrulandı")

    for aile, sha in LISANSLAR.items():
        veri = indir(f"ofl/{aile}/OFL.txt", sha, a.kaynak_dir)
        open(os.path.join(a.cikti_dir, "lisanslar", f"OFL-{aile}.txt"), "wb").write(veri)
    print("lisanslar: " + ", ".join(sorted(LISANSLAR)))


if __name__ == "__main__":
    main()

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
  * Değişken eksenler korunur.
  * Playfair Display: OFL "Reserved Font Name" içerdiğinden alt küme ALINMAZ — özgün dosya bayt bayt kopyalanır.
  * Ad tablosu (telif / lisans kayıtları) tamamen korunur.
  * Geist / Geist Mono / Fraunces / Jost / Unbounded / Manrope üretilmez: Google'ın sunduğu alt küme dosyaları indirilip doğrulanır
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
# Kaynaktan alt küme üretilen aile kalmadı: hepsi Google'ın sunduğu alt küme dosyaları (GOOGLE_ALT_KUME); Playfair Display
# özgün dosyanın kopyasıdır. Üretim yolu (subset) gelecekte gerekirse diye korunur.
KAPSAM = {}

# (çıktı, google/fonts yolu, kaynak SHA-256, Google'ın sunduğu dosyadaki özellikler, ek işlem, karakter kapsamı)
FONTLAR = [
    ("playfair-display.ttf", "ofl/playfairdisplay/PlayfairDisplay[wght].ttf", "c40f2293766a503bc70cce9e512ef844a4ccb7cbcde792fe2ea31d191917d8d6",
     None, "KOPYA", None),
]
# Google Fonts'un sunduğu ALT KÜME dosyaları (app/_fonts/google): global Geist / Geist Mono / Fraunces / Jost; Atlas Unbounded /
# Manrope; tek ağırlıklı Jost 500 / 400 etiketleri. Önceki next/font/google
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
    ("app/_fonts/google/geist-mono-cyrillic-ext.woff2",
     "https://fonts.gstatic.com/s/geistmono/v6/or3nQ6H-1_WfwkMZI_qYFrodmhHkjkotbA.woff2",
     "e27f657e38d52887baa3b6b2f812bef93dfdd356f0810e40edd4ee284cc7e9f6"),
    ("app/_fonts/google/geist-mono-cyrillic.woff2",
     "https://fonts.gstatic.com/s/geistmono/v6/or3nQ6H-1_WfwkMZI_qYFrMdmhHkjkotbA.woff2",
     "75b3bedbebc35f347c0ae3b416aa871941555357e7b0f83767eb5987875589ed"),
    ("app/_fonts/google/geist-mono-symbols2.woff2",
     "https://fonts.gstatic.com/s/geistmono/v6/or3nQ6H-1_WfwkMZI_qYFg08vz7MhEIVVeA.woff2",
     "d67e4a94ba498635f764ddca7d1ec4271f5642f032eb24b426764480f66f8497"),
    ("app/_fonts/google/geist-mono-vietnamese.woff2",
     "https://fonts.gstatic.com/s/geistmono/v6/or3nQ6H-1_WfwkMZI_qYFrgdmhHkjkotbA.woff2",
     "16e1d48b6dd29eb240aec5db36184eb182933c082cd43de7f35af686d58087d2"),
    ("app/_fonts/google/geist-mono-latin-ext.woff2",
     "https://fonts.gstatic.com/s/geistmono/v6/or3nQ6H-1_WfwkMZI_qYFrkdmhHkjkotbA.woff2",
     "745994b5cd950ec201b66526375f057d540847cccfc70f4f24f5f571d26d3923"),
    ("app/_fonts/google/geist-mono-latin.woff2",
     "https://fonts.gstatic.com/s/geistmono/v6/or3nQ6H-1_WfwkMZI_qYFrcdmhHkjko.woff2",
     "5f3d6ad60f29d6cb708414ec6887163d63bf197377ef5417d2483ff31ace6c3b"),
    ("app/_fonts/google/unbounded-cyrillic-ext.woff2",
     "https://fonts.gstatic.com/s/unbounded/v12/Yq6W-LOTXCb04q32xlpwtsZfvRIkSYZH.woff2",
     "5501f713602e4960a52d096d6a4afb72b5d163c5bf27173e93da41a6837e3a2d"),
    ("app/_fonts/google/unbounded-cyrillic.woff2",
     "https://fonts.gstatic.com/s/unbounded/v12/Yq6W-LOTXCb04q32xlpwv8ZfvRIkSYZH.woff2",
     "c3880f0c5afb7890a102bc4b9c8257703664388f708b4be880ec5f5f68e8ea9d"),
    ("app/_fonts/google/unbounded-vietnamese.woff2",
     "https://fonts.gstatic.com/s/unbounded/v12/Yq6W-LOTXCb04q32xlpwtMZfvRIkSYZH.woff2",
     "54a956ea5b2cfddfea2d336dd36bfcba64f40fa8b2d41685d9d4edf4a2910ab8"),
    ("app/_fonts/google/unbounded-latin-ext.woff2",
     "https://fonts.gstatic.com/s/unbounded/v12/Yq6W-LOTXCb04q32xlpwtcZfvRIkSYZH.woff2",
     "ed84482df7b95e6a56a113de1ba2a8d54337f499ba19d54ca697a7e15427ff5f"),
    ("app/_fonts/google/unbounded-latin.woff2",
     "https://fonts.gstatic.com/s/unbounded/v12/Yq6W-LOTXCb04q32xlpwu8ZfvRIkSQ.woff2",
     "d7f07f8a308ce0a7287d79a65a85cfbc0f4741ef426bf1a3902d24392cc71723"),
    ("app/_fonts/google/manrope-cyrillic-ext.woff2",
     "https://fonts.gstatic.com/s/manrope/v23/xn7gYHE41ni1AdIRggqxSvfedN62Zw.woff2",
     "347c589d57130c68f9829c2cd24969eed590328078ff921ca6000a56e5a2cc84"),
    ("app/_fonts/google/manrope-cyrillic.woff2",
     "https://fonts.gstatic.com/s/manrope/v23/xn7gYHE41ni1AdIRggOxSvfedN62Zw.woff2",
     "93bef303b8220d2f59dbe8db119891c9f38d94f48a26d373c28256fb2b50cba7"),
    ("app/_fonts/google/manrope-greek.woff2",
     "https://fonts.gstatic.com/s/manrope/v23/xn7gYHE41ni1AdIRggSxSvfedN62Zw.woff2",
     "6b478f45d63e18352735fd427e92ae4704800a998ec3337c01b59e4f6ef87d44"),
    ("app/_fonts/google/manrope-vietnamese.woff2",
     "https://fonts.gstatic.com/s/manrope/v23/xn7gYHE41ni1AdIRggixSvfedN62Zw.woff2",
     "ddbf28cebf2fbbf800d307f020689bed6d1a96c5a22aed50fee23bf7de80d0f1"),
    ("app/_fonts/google/manrope-latin-ext.woff2",
     "https://fonts.gstatic.com/s/manrope/v23/xn7gYHE41ni1AdIRggmxSvfedN62Zw.woff2",
     "27eccb1f8944bc26f6511601bac9284786feb5e5bbb0c8035ff09ac63aaf7c52"),
    ("app/_fonts/google/manrope-latin.woff2",
     "https://fonts.gstatic.com/s/manrope/v23/xn7gYHE41ni1AdIRggexSvfedN4.woff2",
     "8bd97e6bbbc1f602a8f791530eed1064c9a357d5731bbc76e3fc587fb068728f"),
    ("app/_fonts/google/jost-500-cyrillic.woff2",
     "https://fonts.gstatic.com/s/jost/v20/92zPtBhPNqw79Ij1E865zBUv7myRJTVFNIgun_HKOEp-Cw.woff2",
     "0e535fec0bf5e53445aa835d8ea667dabea2d00e2b356fb9492c3f16f77e3505"),
    ("app/_fonts/google/jost-500-latin-ext.woff2",
     "https://fonts.gstatic.com/s/jost/v20/92zPtBhPNqw79Ij1E865zBUv7myRJTVPNIgun_HKOEp-Cw.woff2",
     "59516d45ab9b34bb74e1c8de5bb93df757d428bb3b9653adc1b2258964fe4f8d"),
    ("app/_fonts/google/jost-500-latin.woff2",
     "https://fonts.gstatic.com/s/jost/v20/92zPtBhPNqw79Ij1E865zBUv7myRJTVBNIgun_HKOEo.woff2",
     "1af44df083279dd8d8d80ff7be66d7132cce3c5be0c2f80c46d06f9559882239"),
    ("app/_fonts/google/jost-400-cyrillic.woff2",
     "https://fonts.gstatic.com/s/jost/v20/92zPtBhPNqw79Ij1E865zBUv7myjJTVFNIgun_HKOEp-Cw.woff2",
     "c7a905112b2f751b32417df6d8a9446b3fce90211ba14b69906fd600a2699185"),
    ("app/_fonts/google/jost-400-latin-ext.woff2",
     "https://fonts.gstatic.com/s/jost/v20/92zPtBhPNqw79Ij1E865zBUv7myjJTVPNIgun_HKOEp-Cw.woff2",
     "f0f29b491ceac5bbaf1024d9cbfd0e3be5607c565012124ab4b6b45f56b6af21"),
    ("app/_fonts/google/jost-400-latin.woff2",
     "https://fonts.gstatic.com/s/jost/v20/92zPtBhPNqw79Ij1E865zBUv7myjJTVBNIgun_HKOEo.woff2",
     "b249869fc8fb37ef0328d6f603283863ce373f52d1a4af6380f54d991f45dec1"),
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

"""catalog.json (naif_katalog_uret.py) + dogrulama.json → lib/astrology/sadeSati/saturnCatalog.ts (deterministik; elle düzenlenmez).

Kullanım: python -X utf8 ts_uret.py <catalog.json> <dogrulama.json> <hedef.ts>
dogrulama.json: {"seV1": {...}, "horizons": {...}, "astronomyEngine": {...}} — karşılaştırma özetleri (QA klasöründen).
"""
import hashlib
import json
import sys

cat = json.load(open(sys.argv[1], encoding="utf-8"))
val = json.load(open(sys.argv[2], encoding="utf-8"))
out_path = sys.argv[3]
m = cat["meta"]
ev = cat["events"]
canon = "\n".join(f'{e["utc"]}|{e["from"]}|{e["to"]}|{e["motion"]}|{e["toleranceMinutesPer1Arcsec"]:.2f}' for e in ev)
sha = hashlib.sha256(canon.encode()).hexdigest()
if sha != m["sha256"] or len(ev) != m["eventCount"]:
    sys.exit("DUR: catalog.json SHA-256 / olay sayısı tutarsız")
se, hz, ae = val["seV1"], val["horizons"], val["astronomyEngine"]
validation = (
    f"Swiss Ephemeris v1 kataloğu (yalnız çapraz kontrol): {se['olay']}/{se['olay']} topoloji aynı, retro {se['retro']}/{se['retro']} aynı sırada; "
    f"medyan |fark| {se['medyan_dk']:.3f} dk, en büyük {se['en_buyuk_dk']:.3f} dk. "
    f"JPL Horizons DE441 (görünür boylam, olay anlarında): medyan {hz['medyan_as']:.2f}″, en büyük {hz['en_buyuk_as']:.2f}″ "
    f"(2079 Güneş kavuşumu; Horizons ışık bükülmesi farkı, ΔT değil). astronomy-engine (VSOP87): topoloji {ae['olay']}/{ae['olay']} aynı."
)
L = []
L.append("// OTOMATİK ÜRETİLDİ — elle düzenlemeyin. Üretici: scripts/astrology/sade-sati-katalog/ts_uret.py (naif_katalog_uret.py çıktısından).")
L.append("// Satürn sidereal (Lahiri) burç geçiş kataloğu. Üretimde efemeris kütüphanesi ÇALIŞMAZ; yalnız bu sürümlü veri okunur.")
L.append("// Kaynak: NASA/JPL NAIF DE440 SPICE çekirdeği (de440s.bsp, değiştirilmemiş) + Skyfield (MIT) ile çevrimdışı üretim.")
L.append("// Swiss Ephemeris ve JPL Horizons yalnız çapraz doğrulamadır (ürün verisi bunlardan türetilmez).")
L.append("")
L.append("export type SaturnIngress = {")
L.append("  /** Geçiş anı (UT1 ≈ UTC, saniyeye yuvarlı). */")
L.append("  utc: string;")
L.append("  from: SaturnSign;")
L.append("  to: SaturnSign;")
L.append('  motion: "direct" | "retrograde";')
L.append("  /** 1 yay saniyesi konum farkının bu hızda doğurduğu zaman kayması (dakika) — duraklamaya yakın geçişlerde büyür. */")
L.append("  tolMinPerArcsec: number;")
L.append("};")
L.append('export type SaturnSign = "aries" | "taurus" | "gemini" | "cancer" | "leo" | "virgo" | "libra" | "scorpio" | "sagittarius" | "capricorn" | "aquarius" | "pisces";')
L.append("")
L.append("export const SATURN_CATALOG_META = {")
L.append(f'  id: "{m["catalog"]}",')
L.append(f'  version: "{m["version"]}",')
L.append("  /** SHA-256: her olay `utc|from|to|motion|tol(2 ondalık)` satırı, \"\\n\" ile birleşik (attach.ts çalışma anında doğrular). */")
L.append(f'  sha256: "{m["sha256"]}",')
L.append(f'  eventCount: {m["eventCount"]},')
L.append(f'  coverageFromUtc: "{m["coverageUtc"]["from"]}",')
L.append(f'  coverageToUtc: "{m["coverageUtc"]["to"]}",')
L.append(f'  scanFromUtc: "{m["scanUtc"]["from"]}",')
L.append(f'  scanToUtc: "{m["scanUtc"]["to"]}",')
L.append('  ayanamsa: "lahiri" as const,')
for k in ("ephemeris", "frame", "timeScale", "method", "generator", "generatedAtUtc", "bspSha256"):
    L.append(f"  {k}: {json.dumps(m[k], ensure_ascii=False)},")
L.append(f"  ayanamsaDefinition: {json.dumps(m['ayanamsa'], ensure_ascii=False)},")
L.append(f"  validation: {json.dumps(validation, ensure_ascii=False)},")
L.append("} as const;")
L.append("")
L.append(f"/** Kapsam öncesindeki ilk olaydan önceki Satürn burcu (tarama başlangıcı {m['scanUtc']['from']}). */")
L.append(f'export const SATURN_SIGN_BEFORE_FIRST: SaturnSign = "{ev[0]["from"]}";')
L.append("")
L.append("export const SATURN_INGRESSES: readonly SaturnIngress[] = [")
for e in ev:
    L.append(f'  {{ utc: "{e["utc"]}", from: "{e["from"]}", to: "{e["to"]}", motion: "{e["motion"]}", tolMinPerArcsec: {e["toleranceMinutesPer1Arcsec"]} }},')
L.append("];")
open(out_path, "w", encoding="utf-8", newline="\n").write("\n".join(L) + "\n")
print("yazıldı", out_path, len(ev), sha)

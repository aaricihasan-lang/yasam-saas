"""catalog.json + jpl_dogrulama.json → lib/astrology/sadeSati/saturnCatalog.ts (deterministik; elle düzenlenmez)."""
import json
import sys

out_path = sys.argv[1]
cat = json.load(open("catalog.json", encoding="utf-8"))
jpl = json.load(open("jpl_dogrulama.json", encoding="utf-8"))["ozet"]
m = cat["meta"]
lines = []
lines.append("// OTOMATİK ÜRETİLDİ — elle düzenlemeyin. Üretici: ham/katalog/ts_uret.py (katalog_uret.py çıktısından).")
lines.append("// Satürn sidereal (Lahiri) burç geçiş kataloğu. Üretimde efemeris kütüphanesi ÇALIŞMAZ; yalnız bu sürümlü veri okunur.")
lines.append("// Kaynak: Swiss Ephemeris ile çevrimdışı üretim (geliştirme aracı); bağımsız doğrulama NASA/JPL Horizons (DE441).")
lines.append("")
lines.append("export type SaturnIngress = {")
lines.append("  /** Geçiş anı (UTC, saniyeye yuvarlı). */")
lines.append("  utc: string;")
lines.append("  from: SaturnSign;")
lines.append("  to: SaturnSign;")
lines.append('  motion: "direct" | "retrograde";')
lines.append("  /** 1 yay saniyesi konum farkının bu hızda doğurduğu zaman kayması (dakika) — duraklamaya yakın geçişlerde büyür. */")
lines.append("  tolMinPerArcsec: number;")
lines.append("};")
lines.append('export type SaturnSign = "aries" | "taurus" | "gemini" | "cancer" | "leo" | "virgo" | "libra" | "scorpio" | "sagittarius" | "capricorn" | "aquarius" | "pisces";')
lines.append("")
lines.append("export const SATURN_CATALOG_META = {")
lines.append(f'  id: "{m["catalog"]}",')
lines.append(f'  version: "{m["version"]}",')
lines.append(f'  sha256: "{m["sha256"]}",')
lines.append(f'  coverageFromUtc: "{m["coverageUtc"]["from"]}",')
lines.append(f'  coverageToUtc: "{m["coverageUtc"]["to"]}",')
lines.append(f'  ayanamsa: "lahiri" as const,')
lines.append(f'  ephemeris: {json.dumps(m["ephemeris"], ensure_ascii=False)},')
lines.append(f'  frame: {json.dumps(m["frame"], ensure_ascii=False)},')
lines.append(f'  validation: {json.dumps("JPL Horizons DE441: %d/%d geçiş; medyan |fark| %.2f dk; en büyük %.2f dk (≤2,5″ konum eşdeğeri; uzak yıllarda ΔT öngörü farkı)" % (jpl["horizons_dogrulanan"], jpl["olay"], jpl["medyan_mutlak_fark_dk"], jpl["en_buyuk_fark_dk"]), ensure_ascii=False)},')
lines.append("} as const;")
lines.append("")
lines.append(f"/** Kapsam öncesindeki ilk olaydan önceki Satürn burcu (tarama başlangıcı {cat['meta']['scanUtc']['from']}). */")
lines.append(f'export const SATURN_SIGN_BEFORE_FIRST: SaturnSign = "{cat["events"][0]["from"]}";')
lines.append("")
lines.append("export const SATURN_INGRESSES: readonly SaturnIngress[] = [")
for e in cat["events"]:
    lines.append(f'  {{ utc: "{e["utc"]}", from: "{e["from"]}", to: "{e["to"]}", motion: "{e["motion"]}", tolMinPerArcsec: {e["toleranceMinutesPer1Arcsec"]} }},')
lines.append("];")
open(out_path, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
print("yazıldı", out_path, len(cat["events"]))

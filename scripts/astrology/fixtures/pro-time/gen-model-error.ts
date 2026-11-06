/**
 * Z12 tavan fixture'ı üreteci (model-error.json). Ağ / Roxy YOK. Yeniden üretim:
 *   npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/fixtures/pro-time/gen-model-error.ts
 *
 * Referans DEĞERLER JPL DE440'tır (reference.json `years[].lon`, skyfield 1.55 ile aynı TT'de üretildi). Bu betik yalnız
 * astronomy-engine'in o TT'deki hatasını (″) kaydeder. Z12 bu kayda +0,3″ ekleyerek ÜST TAVAN kullanır: motor iyileşirse test
 * geçmeye devam eder, zaman ya da konum zinciri bozulursa (ör. TT +1 s → Ay ≈0,55″) tavan aşılır.
 * Ayrıca gövde başına GENEL tavan: bağımsız 3.000 örneklik DE440 ölçümünün (QA kanıtı kanit/zaman/konum-hata-once-sonra.json,
 * 1900–2100, "sonra" en büyük değeri) 1,5 katı — ölçüm örnekleminin dışındaki yıllar (1850) için de kaba koruma.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as Astronomy from "astronomy-engine";
import { ephemerisTime, type TimeScales } from "@/lib/astrology/time";

const FX = join(process.cwd(), "scripts/astrology/fixtures/pro-time");
const REF = JSON.parse(readFileSync(join(FX, "reference.json"), "utf8")) as { years: { utc: string; ttJd: number; lon: Record<string, number> }[] };
const AE: Record<string, Astronomy.Body> = {
  sun: Astronomy.Body.Sun, moon: Astronomy.Body.Moon, mercury: Astronomy.Body.Mercury, venus: Astronomy.Body.Venus, mars: Astronomy.Body.Mars,
  jupiter: Astronomy.Body.Jupiter, saturn: Astronomy.Body.Saturn, neptune: Astronomy.Body.Neptune,
};
const arcsec = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180) * 3600;
const msOfJd = (jd: number) => (jd - 2440587.5) * 86_400_000;
const rows = REF.years.map((r) => {
  const s = { ttMs: msOfJd(r.ttJd) } as TimeScales;
  return { utc: r.utc, err: Object.fromEntries(Object.keys(AE).map((b) => [b, Math.round(arcsec(Astronomy.Ecliptic(Astronomy.GeoVector(AE[b], ephemerisTime(s), true)).elon, r.lon[b]) * 1000) / 1000])) };
});
const out = {
  note: "astronomy-engine 2.1.19 ↔ JPL DE440 (aynı TT) hata kaydı, ″. Z12 tavanı = kayıt + marginArcsec. Referans değerler reference.json'dadır.",
  marginArcsec: 0.3,
  bodyCeilingArcsec: { source: "kanit/zaman/konum-hata-once-sonra.json (3.000 an, 1900–2100, DE440) en büyük × 1,5", sun: 3.2, moon: 8.6, mercury: 17.3, venus: 30.5, mars: 19.3, jupiter: 15.2, saturn: 19.3, neptune: 28.3 },
  rows,
};
writeFileSync(join(FX, "model-error.json"), JSON.stringify(out, null, 1) + "\n");
console.log("yazıldı", rows.length, "satır");

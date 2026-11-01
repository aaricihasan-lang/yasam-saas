/**
 * Fixture üretici — 200 GERÇEK sağlayıcı Natal yanıtı (Placidus) → kanonik NatalTechnical (ağ çağrısı YOK).
 *
 * Kaynak: ASTRO-GECE-4-MOTOR (31.10.2026) merkezi defterinde kayıtlı /astrology/natal-chart yanıtları (WT-02 194 + WT-04 6;
 * tamamı SENTETİK doğum verisi). Ham yanıtlar depo DIŞINDA (QA klasörü); depoya yalnız mevcut adaptörün (projectRoxyNatal)
 * ürettiği TEKNİK katman girer — sağlayıcı yorum metni fixture'a YAZILMAZ. Yorumlardaki ev atfı sayımı ayrı özet dosyasına
 * (yalnız sayılar) yazılır.
 *
 * Çalıştırma (yalnız yeniden üretim):
 *   PRO_NATAL_RAW_DIR="C:/YasamSistemi-QA/ASTRO-GECE-4-MOTOR-2026-10-31/ham" \
 *   npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/fixtures/pro-natal-houses/gen-natal-technical.ts
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { projectRoxyNatal, parseNatalOptions } from "@/lib/astrology/providers/roxy/natal";
import { natalInterpretationHouseRefs } from "@/lib/astrology/houses/natalLocal";

const RAW = process.env.PRO_NATAL_RAW_DIR;
if (!RAW) throw new Error("PRO_NATAL_RAW_DIR gerekli (ham yanıt klasörü)");
const OUT = __dirname;

type Ledger = { no: number; ev: string; endpoint: string; key?: string; wt?: string; purpose?: string };
const ledger = readFileSync(join(RAW, "roxy-defter.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Ledger);
const rez = ledger.filter((x) => x.ev === "REZERV" && x.endpoint === "/astrology/natal-chart" && x.key);

const cases: { id: string; ledgerNo: number; technical: unknown }[] = [];
const refs: { id: string; bodies: number; aspects: number; patterns: number; overall: number; bodyTexts: number; aspectTexts: number; patternTexts: number }[] = [];
let skipped = 0;
const FULL = 20;
for (const r of rez) {
  const f = join(RAW, "yanit", `${r.key}.json`);
  if (!existsSync(f)) {
    skipped++;
    continue;
  }
  const j = JSON.parse(readFileSync(f, "utf8")) as { body: Record<string, unknown>; raw: unknown };
  const opts = parseNatalOptions({ houseSystem: j.body.houseSystem, nodeType: j.body.nodeType });
  if (!opts) throw new Error(`seçenek geçersiz: no ${r.no}`);
  const p = projectRoxyNatal(j.raw, opts);
  if (!p.ok) throw new Error(`projeksiyon başarısız: no ${r.no}: ${p.errors.slice(0, 3).join("; ")}`);
  const id = `N${String(cases.length + 1).padStart(3, "0")}`;
  // Boyut: ilk FULL vaka tam teknik katman (açı/desen/özet "değişmedi" testi için); diğerlerinde ev türetmesine girmeyen
  // açı/desen listeleri çıkarılır (trimmed: true). Konum, ev, açı noktaları ve yankı her vakada TAM.
  const tech = p.value.technical;
  const full = cases.length < FULL;
  cases.push({ id, ledgerNo: r.no, ...(full ? {} : { trimmed: true }), technical: full ? tech : { ...tech, aspects: [], patterns: [] } });
  const i = p.value.interpretation;
  refs.push({ id, ...natalInterpretationHouseRefs(i), bodyTexts: i.bodies.length, aspectTexts: i.aspects.length, patternTexts: i.patterns.length });
}

writeFileSync(
  join(OUT, "roxy-natal-technical-2026-10-31.json"),
  JSON.stringify({
    source: "Sağlayıcı /astrology/natal-chart (190 placidus + 10 whole-sign) gerçek yanıtları → projectRoxyNatal teknik katmanı (ilk 20 vaka tam; diğerlerinde açı/desen listesi çıkarıldı). Yanıt dili İngilizce (gece testlerinde lang gönderilmedi). Sentetik doğum verisi; ASTRO-GECE-4-MOTOR 31.10.2026 merkezi defter (WT-02 + WT-04). Yorum metni YOK.",
    cases,
  }),
);
writeFileSync(
  join(OUT, "roxy-natal-interp-house-refs-2026-10-31.json"),
  JSON.stringify({ source: "Aynı 200 yanıtın sağlayıcı yorumlarında ev atfı SAYIMI (natalInterpretationHouseRefs). Metin içermez.", cases: refs }, null, 0),
);
console.log(`yazıldı: ${cases.length} vaka (atlanan ${skipped})`);

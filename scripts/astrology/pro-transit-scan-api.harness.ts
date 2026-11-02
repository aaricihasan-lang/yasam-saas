/**
 * GÖKYÜZÜ ATLASI — TRANSİT TARAMASI (#646) ürün entegrasyonu testleri (lib/astrology/engine/transitScan + teknik kaydı).
 * Ücretli çağrı YOK; ağ YOK; DB YOK. Girdi: depodaki GERÇEK Natal golden yanıtı (sentetik kişi).
 * Denetlenen: teknik kaydı; birimin Natal (Placidus) birimiyle BİREBİR aynı olması (yeni ücretli çağrı yok); seçenek doğrulaması
 * (orb 0,1–15 varsayılan 1, aralık ≤ 1 yıl, alt kümeler); birleştiricinin motoru (scanTransits) aynı girdilerle çağırdığı; natal
 * noktaların Natal katmanından alındığı; saat bilinmiyor maskesi (Yükselen/MC hedefleri gizlenir).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-transit-scan-api.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTechnique, TECHNIQUE_IDS, type UnitContext } from "@/lib/astrology/engine/techniques";
import { TRANSIT_SCAN_ID, combineTransitScan, parseTransitScanSelection } from "@/lib/astrology/engine/transitScan";
import { scanTransits } from "@/lib/astrology/transits/scan";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
import { TRANSIT_SCAN_TECHNICAL_SCHEMA, transitScanRangeIssue } from "@/lib/astrology/model/westernTransitScan";
import { parseNatalOptions, projectRoxyNatal } from "@/lib/astrology/providers/roxy/natal";
import type { NatalTechnical } from "@/lib/astrology/model/western";

const ROOT = join(__dirname, "..", "..");
let pass = 0;
let fail = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    console.log(`FAIL ${name}\n     ${(e as Error).message.split("\n").join("\n     ")}`);
  }
}

const golden = JSON.parse(readFileSync(join(ROOT, "scripts/astrology/fixtures/roxy-natal-golden-2026-10-07.json"), "utf8"));
const proj = projectRoxyNatal(golden, parseNatalOptions({ houseSystem: "placidus", nodeType: "true" })!);
if (!proj.ok) throw new Error("golden natal projeksiyonu başarısız");
const NATAL = proj.value.technical as NatalTechnical;
const CTX: UnitContext = { birth: { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 }, birthUtc: "1990-07-15T11:30:00Z", partner: null };
const BASE = { start: "2026-11-01", end: "2027-01-31" };

async function main() {
  await t("T01 teknik kaydı: kimlik, Batı, saat GEREKMEZ, tek kişi, zamandan bağımsız birim, primaryPart 0", () => {
    assert.ok((TECHNIQUE_IDS as readonly string[]).includes(TRANSIT_SCAN_ID));
    const d = getTechnique(TRANSIT_SCAN_ID)!;
    assert.equal(d.family, "western");
    assert.equal(d.requiresKnownTime, false);
    assert.equal(d.timeDependent, false);
    assert.equal(d.primaryPart, 0);
  });

  await t("T02 birim = Natal (Placidus) birimi: aynı input_hash; aralık / orb / seçimler önbellek anahtarını DEĞİŞTİRMEZ", () => {
    const natal = getTechnique("western.natal")!;
    const scan = getTechnique(TRANSIT_SCAN_ID)!;
    for (const nodeType of ["true", "mean"]) {
      const a = natal.units(CTX, natal.parseOptions({ houseSystem: "placidus", nodeType }, new Date())!);
      for (const extra of [{}, { orb: 5, end: "2027-10-31" }, { bodies: ["saturn"], points: ["sun"], aspects: ["trine"], stations: false }]) {
        const b = scan.units(CTX, scan.parseOptions({ ...BASE, nodeType, ...extra }, new Date())!);
        assert.equal(b.length, 1);
        assert.equal(b[0].technique, "western.natal");
        assert.equal(b[0].inputHash, a[0].inputHash);
      }
    }
  });

  await t("T03 seçenekler: varsayılanlar (orb 1, 9 gezegen, 9 nokta, 5 açı, istasyon + burç girişi, TSİ); sınırlar", () => {
    const o = parseTransitScanSelection(BASE)!;
    assert.equal(o.orb, 1);
    assert.equal(o.bodies.length, 9);
    assert.ok(!(o.bodies as string[]).includes("moon"));
    assert.equal(o.points.length, 9);
    assert.equal(o.aspects.length, 5);
    assert.equal(o.stations && o.ingresses, true);
    assert.equal(o.displayTz, "Europe/Istanbul");
    assert.equal(parseTransitScanSelection({ ...BASE, orb: 0.05 }), null);
    assert.equal(parseTransitScanSelection({ ...BASE, orb: 15.1 }), null);
    assert.equal(parseTransitScanSelection({ ...BASE, orb: 2.34 })!.orb, 2.3);
    assert.equal(parseTransitScanSelection({ start: "2026-01-01", end: "2027-01-01" })!.end, "2027-01-01", "366 gün kabul");
    assert.equal(parseTransitScanSelection({ start: "2026-01-01", end: "2027-01-02" }), null, "367 gün ret");
    assert.equal(parseTransitScanSelection({ start: "2027-01-01", end: "2026-12-31" }), null);
    assert.equal(parseTransitScanSelection({ start: "1899-12-31", end: "1900-01-10" }), null);
    assert.equal(parseTransitScanSelection({ ...BASE, bodies: [] }), null);
    assert.equal(parseTransitScanSelection({ ...BASE, bodies: ["moon"] }), null, "Ay ilk sürümde yok");
    assert.equal(parseTransitScanSelection({ ...BASE, points: ["vertex"] }), null);
    assert.equal(parseTransitScanSelection({ ...BASE, aspects: ["quincunx"] }), null);
    assert.equal(parseTransitScanSelection({ ...BASE, displayTz: "Mars/Olympus" }), null);
    assert.ok(transitScanRangeIssue("2026-01-01", "2027-01-02"));
  });

  await t("T04 birleştirici: motor aynı girdilerle (natal boylamlar Natal katmanından; bitiş günü dahil) — pencereler birebir", () => {
    const out = combineTransitScan([NATAL], { ...BASE, orb: 1 });
    assert.equal(out.schema, TRANSIT_SCAN_TECHNICAL_SCHEMA);
    const by = new Map(NATAL.bodies.map((b) => [b.id as string, b.longitude]));
    assert.equal(out.natal.find((p) => p.id === "sun")!.lon, by.get("sun"));
    assert.equal(out.natal.find((p) => p.id === "asc")!.lon, NATAL.angles!.ascendant.longitude);
    const ref = scanTransits({
      startUtcMs: Date.UTC(2026, 10, 1),
      endUtcMs: Date.UTC(2027, 1, 1),
      bodies: out.bodies,
      natalPoints: out.natal,
      aspects: out.aspects,
      defaultOrb: 1,
      include: { natal: true, mundane: false, stations: true, ingresses: true },
    });
    assert.ok(!("error" in ref));
    assert.deepEqual(out.scan.windows, ref.windows);
    assert.deepEqual(out.scan.events, ref.events.filter((e) => e.type !== "closest_approach"));
    assert.ok(out.scan.windows.length > 20);
    assert.ok(out.scan.events.some((e) => e.type === "station") && out.scan.events.some((e) => e.type === "ingress"));
  });

  await t("T05 alt küme seçimi + ek olay kapatma: yalnız seçilen gövde / nokta / açı; istasyon ve burç girişi yok", () => {
    const out = combineTransitScan([NATAL], { ...BASE, bodies: ["venus", "mars"], points: ["sun", "moon"], aspects: ["square", "trine"], stations: false, ingresses: false });
    assert.ok(out.scan.windows.every((w) => ["venus", "mars"].includes(w.a) && ["sun", "moon"].includes(w.b) && ["square", "trine"].includes(w.aspect)));
    assert.ok(out.scan.events.every((e) => e.type !== "station" && e.type !== "ingress"));
  });

  await t("T06 1 yıl tarama: süre < 10 sn, kayıt boyutu < 1 MB (technical_snapshot sınırı)", () => {
    const a = Date.now();
    const out = combineTransitScan([NATAL], { start: "2026-11-01", end: "2027-11-01", orb: 15 });
    const ms = Date.now() - a;
    const bytes = JSON.stringify(out).length;
    console.log(`     ölçüm: ${ms} ms, ${bytes} bayt, ${out.scan.windows.length} pencere, ${out.scan.events.length} olay`);
    assert.ok(ms < 10_000);
    assert.ok(bytes < 1_000_000);
  });

  await t("T07 saat bilinmiyor: Yükselen/MC hedefli pencere ve olaylar gizlenir; Ay uyarısı; istasyon/burç girişi korunur", () => {
    const out = combineTransitScan([NATAL], BASE);
    const m = maskTechnical(TRANSIT_SCAN_ID, out, { primary: false, partner: null });
    const t2 = m.technical as typeof out;
    assert.equal(m.masked, true);
    assert.ok(t2.scan.windows.every((w) => w.b !== "asc" && w.b !== "mc"));
    assert.ok(t2.scan.events.every((e) => e.other !== "asc" && e.other !== "mc"));
    assert.equal(t2.scan.events.filter((e) => e.type === "station").length, out.scan.events.filter((e) => e.type === "station").length);
    assert.ok(t2.natal.every((p) => p.id !== "asc" && p.id !== "mc"));
    assert.ok(m.warnings.some((w) => /Yükselen\/MC/.test(w)));
    assert.equal(maskTechnical(TRANSIT_SCAN_ID, out, { primary: true, partner: null }).masked, false);
  });

  console.log(`\nSONUÇ pro-transit-scan-api: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}
void main();

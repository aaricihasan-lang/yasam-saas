/**
 * GÖKYÜZÜ ATLASI — KLASİK ASALET ve ALMUTEN (#644) ürün entegrasyonu testleri (lib/astrology/engine/classicalDignities + teknik kaydı).
 * Ücretli çağrı YOK; ağ YOK; DB YOK. Girdi: depodaki GERÇEK Natal golden yanıtı (sentetik kişi, Placidus, gerçek düğüm).
 * Denetlenen: teknik kaydı; birimin Natal birimiyle BİREBİR aynı olması (aynı input_hash → aynı önbellek satırı, yeni ücretli çağrı
 * yok); seçenek doğrulaması (varsayılan Lilly 1647); birleştiricinin motoru (buildNatalDignities) aynı girdilerle çağırdığı; gündüz /
 * gece = Güneş'in geometrik irtifası; klasik ev sistemi türetmesi; saat bilinmiyor maskesi; kutup / yerel ev ön kontrolü kapsamı.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-classical-dignities-api.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTechnique, TECHNIQUE_IDS, type UnitContext } from "@/lib/astrology/engine/techniques";
import { CLASSICAL_DIGNITIES_ID, combineClassicalDignities, parseClassicalDignitiesOptions } from "@/lib/astrology/engine/classicalDignities";
import { localNatalPrecheck } from "@/lib/astrology/engine/natalHouses";
import { buildNatalDignities } from "@/lib/astrology/dignities/natal";
import { natalSect } from "@/lib/astrology/dignities/accidentalNatal";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
import { CLASSICAL_DIGNITIES_TECHNICAL_SCHEMA } from "@/lib/astrology/model/westernClassicalDignities";
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
const CTX: UnitContext = {
  birth: { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 },
  birthUtc: "1990-07-15T11:30:00Z",
  partner: null,
};

async function main() {
  await t("D01 teknik kaydı: kimlik, Batı ailesi, saat gerekli, tek kişi, zamandan bağımsız, primaryPart 0", () => {
    assert.ok((TECHNIQUE_IDS as readonly string[]).includes(CLASSICAL_DIGNITIES_ID));
    const d = getTechnique(CLASSICAL_DIGNITIES_ID)!;
    assert.equal(d.family, "western");
    assert.equal(d.requiresKnownTime, true);
    assert.equal(d.requiresPartner, false);
    assert.equal(d.timeDependent, false);
    assert.equal(d.primaryPart, 0);
  });

  await t("D02 birim = Natal birimi (aynı uç, gövde, adaptör, input_hash; teknik etiketi western.natal) — 8 ev sisteminde ve iki düğümde", () => {
    const natal = getTechnique("western.natal")!;
    const dig = getTechnique(CLASSICAL_DIGNITIES_ID)!;
    for (const houseSystem of ["placidus", "whole-sign", "equal", "koch", "regiomontanus", "campanus", "porphyry", "alcabitius"]) {
      for (const nodeType of ["true", "mean"]) {
        const a = natal.units(CTX, natal.parseOptions({ houseSystem, nodeType }, new Date())!);
        const b = dig.units(CTX, dig.parseOptions({ school: "dorothean-egyptian", houseSystem, nodeType }, new Date())!);
        assert.equal(b.length, 1);
        assert.equal(b[0].technique, "western.natal");
        assert.equal(b[0].inputHash, a[0].inputHash, `${houseSystem}/${nodeType}`);
        assert.deepEqual(b[0].body, a[0].body);
        assert.equal(b[0].endpoint, a[0].endpoint);
        assert.equal(b[0].adapterVersion, a[0].adapterVersion);
      }
    }
  });

  await t("D03 seçenekler: varsayılan Lilly 1647 / Placidus / gerçek düğüm; geçersiz ekol / ev sistemi / düğüm → null", () => {
    assert.deepEqual(parseClassicalDignitiesOptions({}), { school: "lilly-1647", houseSystem: "placidus", nodeType: "true" });
    assert.deepEqual(parseClassicalDignitiesOptions({ school: "dorothean-egyptian", houseSystem: "regiomontanus", nodeType: "mean" }), { school: "dorothean-egyptian", houseSystem: "regiomontanus", nodeType: "mean" });
    assert.equal(parseClassicalDignitiesOptions({ school: "valens" }), null);
    assert.equal(parseClassicalDignitiesOptions({ houseSystem: "topocentric" }), null);
    assert.equal(parseClassicalDignitiesOptions({ nodeType: "osculating" }), null);
  });

  await t("D04 projeksiyon Natal'ınkiyle aynı (önbellek satırı Natal satırıyla birebir)", () => {
    const natal = getTechnique("western.natal")!;
    const dig = getTechnique(CLASSICAL_DIGNITIES_ID)!;
    const u = natal.units(CTX, { houseSystem: "placidus", nodeType: "true" })[0];
    const a = natal.project(u, golden, { houseSystem: "placidus", nodeType: "true" });
    const b = dig.project(u, golden, { school: "lilly-1647", houseSystem: "placidus", nodeType: "true" });
    assert.ok(a.ok && b.ok);
    assert.deepEqual(b.technical, a.technical);
    assert.equal(b.technicalSchema, a.technicalSchema);
    assert.equal(b.projectionVersion, a.projectionVersion);
  });

  await t("D05 birleştirici: motor aynı girdilerle (konum+hız, ASC/MC, Placidus cusp'ları, gerçek düğüm, geometrik sect) — çıktı birebir", () => {
    const out = combineClassicalDignities([NATAL], { school: "lilly-1647", houseSystem: "placidus", nodeType: "true" });
    assert.equal(out.schema, CLASSICAL_DIGNITIES_TECHNICAL_SCHEMA);
    assert.equal(out.houseSystem, "placidus");
    const by = new Map(NATAL.bodies.map((b) => [b.id, b]));
    const pos = Object.fromEntries(["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"].map((p) => [p, { lon: by.get(p as never)!.longitude, speed: by.get(p as never)!.speed }]));
    const sect = natalSect({ utcMs: Date.UTC(1990, 6, 15, 11, 30), latitude: 41.0082, longitude: 28.9784, sunLon: pos.sun.lon, asc: NATAL.angles!.ascendant.longitude });
    assert.ok(!("error" in sect));
    assert.equal(out.sect.day, sect.day);
    assert.equal(out.sect.day, true, "14:30 İstanbul, Temmuz → gündüz");
    const ref = buildNatalDignities({
      positions: pos as never,
      asc: NATAL.angles!.ascendant.longitude,
      mc: NATAL.angles!.midheaven.longitude,
      houses: { system: "placidus", cusps: [...NATAL.houses].sort((a, b) => a.number - b.number).map((h) => h.longitude) },
      isDay: sect.day,
      northNode: by.get("north_node")!.longitude,
      prenatalSyzygy: out.syzygy?.lon ?? null,
      school: "lilly-1647",
    });
    assert.deepEqual(out.dignities, ref);
    assert.equal(out.dignities.planets.length, 7);
    assert.ok(out.dignities.lordOfGenitureLilly !== null, "Lilly'de LoG sıralaması var");
    assert.equal(out.dignities.figureAlmutens.find((f) => f.preset === "greeks_ca532")!.standard, true);
  });

  await t("D06 doğum öncesi lunasyon: doğumdan ÖNCE, ≤ 15 gün; kavuşum/dolunay etiketi; dolunayda Ay derecesi (açık not)", () => {
    const out = combineClassicalDignities([NATAL], { school: "lilly-1647", houseSystem: "placidus", nodeType: "true" });
    assert.ok(out.syzygy);
    const dt = Date.UTC(1990, 6, 15, 11, 30) - Date.parse(out.syzygy.atUtc);
    assert.ok(dt > 0 && dt <= 15.5 * 86_400_000, `fark ${dt / 86_400_000} gün`);
    assert.equal(out.syzygy.point, "moon");
  });

  await t("D07 Dorothean: asal puan yöntemi yok → Lord of the Geniture hesaplanmaz; ekol bilgisi çıktıda", () => {
    const out = combineClassicalDignities([NATAL], { school: "dorothean-egyptian", houseSystem: "placidus", nodeType: "true" });
    assert.equal(out.dignities.school.id, "dorothean-egyptian");
    assert.equal(out.dignities.lordOfGenitureLilly, null);
  });

  await t("D08 klasik ev sistemi (Regiomontanus): evler Natal'daki gibi türetilir, ev başı almutenleri o sistemle", () => {
    const out = combineClassicalDignities([NATAL], { school: "lilly-1647", houseSystem: "regiomontanus", nodeType: "true" });
    assert.equal(out.houseSystem, "regiomontanus");
    assert.equal(out.dignities.cuspAlmutens?.system, "regiomontanus");
    const plac = combineClassicalDignities([NATAL], { school: "lilly-1647", houseSystem: "placidus", nodeType: "true" });
    const c1 = out.dignities.cuspAlmutens!.items.map((i) => i.lon);
    const c2 = plac.dignities.cuspAlmutens!.items.map((i) => i.lon);
    assert.equal(c1[0].toFixed(6), c2[0].toFixed(6), "ASC aynı");
    assert.notDeepEqual(c1, c2, "ara ev başları farklı");
  });

  await t("D09 saat bilinmiyor: kayıtlı sonuç saati bilinmeyen bağlamda açılırsa teknik veri gösterilmez + uyarı", () => {
    const out = combineClassicalDignities([NATAL], { school: "lilly-1647", houseSystem: "placidus", nodeType: "true" });
    const m = maskTechnical(CLASSICAL_DIGNITIES_ID, out, { primary: false, partner: null });
    assert.equal(m.technical, null);
    assert.equal(m.masked, true);
    assert.ok(m.warnings.some((w) => /Doğum saati bilinmiyor/.test(w)));
    assert.equal(maskTechnical(CLASSICAL_DIGNITIES_ID, out, { primary: true, partner: null }).masked, false);
  });

  await t("D10 yerel ev ön kontrolü ve kutup engeli bu tekniği kapsar (Natal ile aynı kurallar)", () => {
    assert.equal(localNatalPrecheck(CLASSICAL_DIGNITIES_ID, [NATAL], { houseSystem: "regiomontanus", nodeType: "true" }), null);
    const svc = readFileSync(join(ROOT, "lib/astrology/engine/service.ts"), "utf8");
    assert.match(svc, /\(def\.id === "western\.natal" \|\| def\.id === "western\.classical_dignities"\) && natalHouseSystemUndefinedAtPolar/);
    assert.match(svc, /"western\.classical_dignities": "arızi asalet evlere/);
  });

  console.log(`\nSONUÇ pro-classical-dignities-api: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}
void main();

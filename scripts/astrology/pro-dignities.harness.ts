/**
 * GÖKYÜZÜ ATLASI — WT-02 (2026-10-31): PROFESYONEL klasik asalet / kabul / almuten katmanı testleri (ÜRÜNE BAĞLI DEĞİL).
 *
 * Kaynaklar: mevcut horary tabloları (CA s. 104/113/115), bağımsız yeniden uygulama (yalnız tablo verisinden), depodaki gerçek
 * Roxy natal golden (fixtures/roxy-natal-golden-2026-10-07.json; yeni çağrı YOK), astronomy-engine (Ay evresi).
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-dignities.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CLASSICAL_PLANETS, DOMICILE, EXALTATION, SIGNS, TERMS, TRIPLICITY, elementOf, faceRuler, signOf, type ClassicalPlanet } from "@/lib/astrology/horary/western/tables";
import { PROFILE_LILLY_1647, PROFILE_DOROTHEAN_EGYPTIAN, essentialDignity, signOnlyDignity } from "@/lib/astrology/horary/western/calc";
import { natalEssential, boundaryInfo } from "@/lib/astrology/pro/dignities/essential";
import { almutenOfDegree, figureAlmuten, houseCuspAlmutens } from "@/lib/astrology/pro/dignities/almuten";
import { pairReception, receptionMatrix } from "@/lib/astrology/pro/dignities/reception";
import { natalAccidental, natalSect, prenatalSyzygy } from "@/lib/astrology/pro/dignities/accidentalNatal";
import { buildNatalDignities } from "@/lib/astrology/pro/dignities/natal";
import { ALMUTEN_POLICIES, FIGURE_PRESETS } from "@/lib/astrology/pro/dignities/schools";

let pass = 0;
let fail = 0;
const rows: string[] = [];
function t(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    rows.push(`PASS\t${name}`);
  } catch (e) {
    fail++;
    rows.push(`FAIL\t${name}\t${(e as Error).message.split("\n")[0]}`);
    console.log(`✗ ${name}\n  ${(e as Error).message}`);
  }
}
const EPS = 1 / 3600 / 1000; // 1 milisaniye-yay altı
const ARCSEC = 1 / 3600;

// ── 1. Tablo bütünlüğü ──────────────────────────────────────────────────────────────────────────
t("T01 Mısır terimleri: gezegen toplamları küçük yıllar (57/79/66/82/76)", () => {
  const tot: Record<string, number> = {};
  for (const row of Object.values(TERMS.egyptian)) {
    let prev = 0;
    for (const [p, e] of row) {
      tot[p] = (tot[p] ?? 0) + e - prev;
      prev = e;
    }
  }
  assert.deepEqual(tot, { jupiter: 79, venus: 82, mercury: 76, mars: 66, saturn: 57 });
});
t("T02 Her iki terim tablosu: 12 burç × 5 terim, artan bitiş, son 30, her satırda 5 farklı gezegen, ışık yok", () => {
  for (const v of ["egyptian", "lilly"] as const)
    for (const s of SIGNS) {
      const row = TERMS[v][s];
      assert.equal(row.length, 5, `${v} ${s}`);
      assert.equal(row[4][1], 30);
      for (let i = 1; i < 5; i++) assert.ok(row[i][1] > row[i - 1][1]);
      assert.equal(new Set(row.map((r) => r[0])).size, 5);
      assert.ok(row.every((r) => r[0] !== "sun" && r[0] !== "moon"));
    }
});
t("T03 Lilly terim toplamları (bilgi): Jüpiter 80, Mars 65 — küçük yıllardan farklı (CA s. 104 tablosunun özelliği, hata değil)", () => {
  const tot: Record<string, number> = {};
  for (const row of Object.values(TERMS.lilly)) {
    let prev = 0;
    for (const [p, e] of row) {
      tot[p] = (tot[p] ?? 0) + e - prev;
      prev = e;
    }
  }
  assert.deepEqual(tot, { jupiter: 80, venus: 82, mercury: 76, mars: 65, saturn: 57 });
});
t("T04 Burç yöneticisi: her klasik gezegen (ışıklar hariç) iki burç, ışıklar bir burç", () => {
  const c: Record<string, number> = {};
  for (const s of SIGNS) c[DOMICILE[s]] = (c[DOMICILE[s]] ?? 0) + 1;
  assert.deepEqual(c, { mars: 2, venus: 2, mercury: 2, moon: 1, sun: 1, jupiter: 2, saturn: 2 });
  assert.equal(new Set(CLASSICAL_PLANETS.map((p) => EXALTATION[p].sign)).size, 7);
});
t("T05 Dekanlar: 36 yüz, Koç 0° Mars, Kalde sırası, 10° sınırları", () => {
  const ch: ClassicalPlanet[] = ["saturn", "jupiter", "mars", "sun", "venus", "mercury", "moon"];
  for (let d = 0; d < 36; d++) {
    const exp = ch[(2 + d) % 7];
    assert.equal(faceRuler(d * 10), exp, `dekan ${d} başı`);
    assert.equal(faceRuler(d * 10 + 10 - ARCSEC), exp, `dekan ${d} sonu`);
  }
  assert.equal(faceRuler(359.9999), "mars"); // Balık 3. dekan Mars → Koç 1. dekan Mars (Kalde zinciri kesintisiz)
});

// ── 2. Sınırlar ──────────────────────────────────────────────────────────────────────────────────
t("B01 12 burç sınırı: 29°59′59″ önceki burç, 0°00′00″ yeni burç; domicile değişir", () => {
  for (let i = 0; i < 12; i++) {
    const edge = i * 30;
    const before = (edge - ARCSEC + 360) % 360;
    assert.equal(signOf(before), SIGNS[(i + 11) % 12]);
    assert.equal(signOf(edge), SIGNS[i]);
    const ruler = DOMICILE[SIGNS[i]];
    assert.equal(natalEssential(ruler, edge, true, "lilly-1647").essential.domicile, true);
    if (DOMICILE[SIGNS[(i + 11) % 12]] !== ruler) assert.equal(natalEssential(ruler, before, true, "lilly-1647").essential.domicile, false);
  }
});
t("B02 Tüm terim sınırları (2 varyant × 12 × 4 iç sınır): 1″ önce eski, sınırda yeni yönetici", () => {
  let n = 0;
  for (const school of ["lilly-1647", "dorothean-egyptian"] as const) {
    const v = school === "lilly-1647" ? "lilly" : "egyptian";
    for (let i = 0; i < 12; i++) {
      const row = TERMS[v][SIGNS[i]];
      for (let k = 0; k < 4; k++) {
        const e = i * 30 + row[k][1];
        assert.equal(natalEssential(row[k][0], e - ARCSEC, true, school).essential.term, true, `${v} ${SIGNS[i]} ${row[k][1]} önce`);
        assert.equal(natalEssential(row[k + 1][0], e, true, school).essential.term, true, `${v} ${SIGNS[i]} ${row[k][1]} sınır`);
        assert.equal(natalEssential(row[k][0], e, true, school).essential.term, false);
        n++;
      }
    }
  }
  assert.equal(n, 96);
});
t("B03 boundaryInfo: terim sınırına 30″ → near (1′); 2′ → near değil; burç sonu dakika", () => {
  const e = 6; // Lilly Koç: Jüpiter 0–6
  assert.equal(boundaryInfo(e - 0.5 / 60, "lilly").near, true);
  assert.equal(boundaryInfo(e - 2 / 60, "lilly").near, false);
  assert.ok(Math.abs(boundaryInfo(29.5, "lilly").signEndArcmin - 30) < 1e-9);
});

// ── 3. Mevcut Lilly ile uyum ───────────────────────────────────────────────────────────────────────
t("L01 5.040 rastgele (gezegen, boylam, gündüz/gece): natalEssential.score === essentialDignity.score (Lilly), satır toplamı = skor", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 5040; i++) {
    const pl = CLASSICAL_PLANETS[i % 7];
    const lon = rnd() * 360;
    const day = rnd() < 0.5;
    const a = natalEssential(pl, lon, day, "lilly-1647");
    const b = essentialDignity(pl, lon, day, PROFILE_LILLY_1647);
    assert.equal(a.score, b.score, `${pl} ${lon}`);
    assert.equal(a.reasons.reduce((s, r) => s + (r.points ?? 0), 0), b.score);
    assert.deepEqual(a.essential, b);
  }
});
t("L02 Dorothean seti: varsayılan politika puan VERMEZ (null); lilly_ca115 politikası → sayı + mixedPolicy", () => {
  const a = natalEssential("saturn", 5, true, "dorothean-egyptian");
  assert.equal(a.score, null);
  assert.equal(a.mixedPolicy, false);
  assert.deepEqual(a.essential, essentialDignity("saturn", 5, true, PROFILE_DOROTHEAN_EGYPTIAN));
  const b = natalEssential("saturn", 5, true, "dorothean-egyptian", "lilly_ca115");
  assert.equal(b.mixedPolicy, true);
  // Koç 5°: Satürn — düşüş (−4), Dorothean ateş ortak yönetici (+3), Mısır terimi Jüpiter, yüz Mars → −1
  assert.equal(b.score, -1);
  assert.equal(b.triplicityAsParticipating, true);
});
t("L03 Örnek: Güneş Koç 19° gündüz (Lilly) = yücelme 4 + üçlü 3 + yüz 1 = 8; gece = 5", () => {
  assert.equal(natalEssential("sun", 19, true, "lilly-1647").score, 8);
  assert.equal(natalEssential("sun", 19, false, "lilly-1647").score, 5);
});
t("L04 Peregrine: Güneş İkizler 5° → −5 ve tek satır 'peregrine'", () => {
  const a = natalEssential("sun", 65, true, "lilly-1647");
  assert.equal(a.score, -5);
  assert.deepEqual(a.reasons.map((r) => r.key), ["peregrine"]);
});
t("L05 Düşüş + diğer asaletler birlikte: Venüs Başak 10° gündüz = düşüş −4 + üçlü (toprak gündüz Venüs) +3 + terim (Lilly 7–13 Venüs) +2 + yüz (Başak 10–20 Venüs) +1 = +2", () => {
  const a = natalEssential("venus", 160, true, "lilly-1647");
  assert.deepEqual(a.reasons.map((r) => r.key), ["triplicity", "term", "face", "fall"]);
  assert.equal(a.score, 2);
  assert.equal(natalEssential("venus", 160, false, "lilly-1647").score, -1);
});
t("L06 signOnlyDignity, yeni katmanın domicile/exaltation/detriment/fall bayraklarıyla tutarlı (7 gezegen × 12 burç)", () => {
  for (const pl of CLASSICAL_PLANETS)
    for (let i = 0; i < 12; i++) {
      const e = natalEssential(pl, i * 30 + 15, true, "lilly-1647").essential;
      const s = signOnlyDignity(pl, i * 30 + 15);
      const exp = e.domicile ? "domicile" : e.exaltation ? "exaltation" : e.detriment ? "detriment" : e.fall ? "fall" : "peregrine";
      assert.equal(s, exp, `${pl} ${SIGNS[i]}`);
    }
});

// ── 4. Gündüz / gece ─────────────────────────────────────────────────────────────────────────────
t("D01 Üçlü yöneticisi sect'e göre: ateş gündüz Güneş / gece Jüpiter (iki set); Lilly su gündüz=gece Mars", () => {
  for (const school of ["lilly-1647", "dorothean-egyptian"] as const) {
    assert.equal(natalEssential("sun", 125, true, school).essential.triplicity, true);
    assert.equal(natalEssential("jupiter", 125, false, school).essential.triplicity, true);
    assert.equal(natalEssential("jupiter", 125, true, school).essential.triplicity, false);
  }
  assert.equal(natalEssential("mars", 100, true, "lilly-1647").essential.triplicity, true);
  assert.equal(natalEssential("mars", 100, false, "lilly-1647").essential.triplicity, true);
  assert.equal(natalEssential("venus", 100, true, "lilly-1647").essential.triplicity, false);
  assert.equal(natalEssential("venus", 100, true, "dorothean-egyptian").essential.triplicity, true);
});
t("D02 natalSect: İstanbul 2024-06-21 10:00Z gündüz, 22:00Z gece; irtifa işaretli; ufka yakın bayrağı", () => {
  const d = natalSect({ utcMs: Date.parse("2024-06-21T10:00:00Z"), latitude: 41.0, longitude: 29.0, sunLon: 90.2 });
  const n = natalSect({ utcMs: Date.parse("2024-06-21T22:00:00Z"), latitude: 41.0, longitude: 29.0, sunLon: 90.7 });
  assert.ok(!("error" in d) && !("error" in n));
  if ("error" in d || "error" in n) return;
  assert.equal(d.day, true);
  assert.equal(n.day, false);
  assert.ok(d.sunAltitude > 60 && n.sunAltitude < -15);
  assert.equal(d.nearHorizon, false);
});
t("D03 natalSect geçersiz girdi → hata nesnesi (uydurma yok)", () => {
  const r = natalSect({ utcMs: NaN, latitude: 0, longitude: 0, sunLon: 0 });
  assert.ok("error" in r);
});

// ── 5. Arızi: hareket / Güneş evresi sınırları ─────────────────────────────────────────────────────
const basePos = { saturn: 300, jupiter: 200, mars: 40, sun: 100, venus: 160, mercury: 80, moon: 250 } as Record<ClassicalPlanet, number>;
const acc = (pl: ClassicalPlanet, lon: number, speed: number, pos = basePos) => natalAccidental({ planet: pl, lon, speed, house: 3, positions: { ...pos, [pl]: lon }, northNode: null }, "lilly-1647");
const keys = (r: ReturnType<typeof acc>) => r.items.map((i) => i.key);
t("A01 Retro/direkt: Mars hız −0,1 → retrograde −5; +0,6 → direct +4 + swift; Güneş/Ay için yön kalemi yok", () => {
  assert.ok(keys(acc("mars", 40, -0.1)).includes("retrograde"));
  assert.equal(acc("mars", 40, -0.1).items.find((i) => i.key === "retrograde")!.points, -5);
  assert.ok(keys(acc("mars", 40, 0.6)).includes("direct") && keys(acc("mars", 40, 0.6)).includes("swift"));
  assert.ok(!keys(acc("sun", 100, 1)).some((k) => k === "direct" || k === "retrograde"));
  assert.ok(!keys(acc("moon", 250, 13)).some((k) => k === "direct" || k === "retrograde"));
});
t("A02 Yanma sınırları (Güneş 100°, Venüs aynı burç): 17′ cazimi; 17′+1″ combust; 8°30′ combust; 8°30′+1″ ışın altı; 17° ışın altı; 17°+1″ serbest", () => {
  const sun = 100;
  const at = (d: number) => keys(acc("venus", sun + d, 1, { ...basePos, sun }));
  assert.ok(at(17 / 60).includes("cazimi"));
  assert.ok(at(17 / 60 + ARCSEC).includes("combust"));
  assert.ok(at(8.5).includes("combust"));
  assert.ok(at(8.5 + ARCSEC).includes("under_beams"));
  assert.ok(at(-8.5).includes("combust"));
});
t("A03 Yanma burç şartı (CA s. 113): Güneş Yengeç 29°, Venüs Aslan 3° (4° fark, farklı burç) → ışın altı, yanık değil", () => {
  const k = keys(acc("venus", 123, 1, { ...basePos, sun: 119 }));
  assert.ok(k.includes("under_beams") && !k.includes("combust"));
});
t("A04 Işın altı dış sınırı: 17° ışın altı, 17°+1″ serbest (farklı burç)", () => {
  assert.ok(keys(acc("venus", 100 + 17, 1, { ...basePos, sun: 100 })).includes("under_beams"));
  assert.ok(keys(acc("venus", 100 + 17 + ARCSEC, 1, { ...basePos, sun: 100 })).includes("free_from_combustion"));
});
t("A05 Natal: ev kalemi ev sistemine bağlı işaretli; sabit yıldız kalemi yok; geçersiz ev hata", () => {
  const r = acc("mars", 40, 0.6);
  assert.equal(r.items.find((i) => i.key === "house_3")!.houseSystemDependent, true);
  assert.ok(!r.items.some((i) => i.category === "star"));
  assert.throws(() => natalAccidental({ planet: "mars", lon: 1, speed: 1, house: 13, positions: basePos, northNode: null }, "lilly-1647"));
});
t("A06 Dorothean seti arızi puan vermez (points null, total null) — kalemler listelenir", () => {
  const r = natalAccidental({ planet: "mars", lon: 40, speed: 0.6, house: 1, positions: basePos, northNode: null }, "dorothean-egyptian");
  assert.equal(r.total, null);
  assert.ok(r.items.length > 0 && r.items.every((i) => i.points === null));
});

// ── 6. Kabul ─────────────────────────────────────────────────────────────────────────────────────
const indepRulers = (lon: number, day: boolean, trip: "lilly" | "dorothean", terms: "lilly" | "egyptian") => {
  // Bağımsız yeniden uygulama (yalnız tablo verisi; calc.ts fonksiyonları KULLANILMAZ).
  const s = SIGNS[Math.floor((((lon % 360) + 360) % 360) / 30)];
  const d = (((lon % 360) + 360) % 360) % 30;
  const ex = CLASSICAL_PLANETS.find((p) => EXALTATION[p].sign === s) ?? null;
  const tr = TRIPLICITY[trip][(["fire", "earth", "air", "water"] as const)[SIGNS.indexOf(s) % 4]];
  let term: ClassicalPlanet = "saturn";
  for (const [p, e] of TERMS[terms][s]) if (d < e) { term = p; break; }
  const ch: ClassicalPlanet[] = ["saturn", "jupiter", "mars", "sun", "venus", "mercury", "moon"];
  const face = ch[(2 + Math.floor((((lon % 360) + 360) % 360) / 10)) % 7];
  return { domicile: DOMICILE[s], exaltation: ex, triplicity: day ? tr[0] : tr[1], participating: tr[2], term, face } as Record<string, ClassicalPlanet | null>;
};
t("R01 Kabul — tüm kombinasyonlar: 21 çift × 72 × 72 (5° ızgara) × gündüz/gece × 2 ekol; tür ve sınıf bağımsız uygulamayla aynı", () => {
  let n = 0;
  const counts: Record<string, number> = {};
  for (const school of ["lilly-1647", "dorothean-egyptian"] as const) {
    const [trip, terms] = school === "lilly-1647" ? (["lilly", "lilly"] as const) : (["dorothean", "egyptian"] as const);
    for (const day of [true, false])
      for (let i = 0; i < 7; i++)
        for (let j = i + 1; j < 7; j++)
          for (let x = 0; x < 72; x++)
            for (let y = 0; y < 72; y++) {
              const a = CLASSICAL_PLANETS[i];
              const b = CLASSICAL_PLANETS[j];
              const la = x * 5 + 2.5;
              const lb = y * 5 + 2.5;
              const r = pairReception({ id: a, lon: la }, { id: b, lon: lb }, day, school);
              const ra = indepRulers(la, day, trip, terms);
              const rb = indepRulers(lb, day, trip, terms);
              const bA = Object.keys(ra).filter((k) => ra[k] === b);
              const aB = Object.keys(rb).filter((k) => rb[k] === a);
              assert.deepEqual([...r.bReceivesA].sort(), bA.sort());
              assert.deepEqual([...r.aReceivesB].sort(), aB.sort());
              const shared = bA.filter((k) => aB.includes(k));
              const exp = !bA.length && !aB.length ? "none" : bA.length && aB.length ? (shared.length ? "mutual" : "mixed") : "one_sided";
              assert.equal(r.type, exp);
              counts[r.type] = (counts[r.type] ?? 0) + 1;
              n++;
            }
  }
  assert.equal(n, 2 * 2 * 21 * 72 * 72);
  assert.ok(counts.none > 0 && counts.one_sided > 0 && counts.mutual > 0 && counts.mixed > 0);
  rows.push(`INFO\tR01 dağılım ${JSON.stringify(counts)}`);
});
t("R02 Mars Terazi 10° + Venüs Koç 10° → karşılıklı ev kabulü, Lilly +5, açı karşıtlık", () => {
  const r = pairReception({ id: "mars", lon: 190 }, { id: "venus", lon: 10 }, true, "lilly-1647");
  assert.equal(r.type, "mutual");
  assert.deepEqual(r.lillyMutual, { by: "domicile", points: 5 });
  assert.equal(r.aspect.signAngle, 180);
  assert.equal(r.aspect.withinMoieties, true);
});
t("R03 Güneş Boğa 5° + Ay Koç 5° (gündüz) → karşılıklı YÜCELME (+4); ortak tür exaltation; burç açısı yok (aversion)", () => {
  const r = pairReception({ id: "sun", lon: 35 }, { id: "moon", lon: 5 }, true, "lilly-1647");
  assert.equal(r.type, "mutual");
  assert.ok(r.sharedKinds.includes("exaltation"));
  assert.deepEqual(r.lillyMutual, { by: "exaltation", points: 4 });
  assert.equal(r.aspect.aversion, true);
});
t("R04 Ay Koç 1° + Mars Boğa 5° (gündüz) → KARIŞIK kabul (ev+yüz ↔ yücelme), Lilly puanı null", () => {
  const r = pairReception({ id: "moon", lon: 1 }, { id: "mars", lon: 35 }, true, "lilly-1647");
  assert.equal(r.type, "mixed");
  assert.deepEqual([...r.bReceivesA].sort(), ["domicile", "face"]);
  assert.deepEqual(r.aReceivesB, ["exaltation"]);
  assert.equal(r.lillyMutual, null);
});
t("R05 Venüs Koç 25° + Mars İkizler 2° → tek taraflı (Mars kabul eder: ev + terim)", () => {
  const r = pairReception({ id: "venus", lon: 25 }, { id: "mars", lon: 62 }, true, "lilly-1647");
  assert.equal(r.type, "one_sided");
  assert.equal(r.receiver, "mars");
  assert.deepEqual([...r.bReceivesA].sort(), ["domicile", "term"]);
});
t("R06 Matris 21 çift; Dorothean setinde lillyMutual hep null", () => {
  const m = receptionMatrix(basePos, true, "dorothean-egyptian");
  assert.equal(m.all.length, 21);
  assert.ok(m.all.every((x) => x.lillyMutual === null));
});

// ── 7. Almuten ───────────────────────────────────────────────────────────────────────────────────
t("M01 Koç 19° gündüz (Lilly): Güneş 8 (yücelme+üçlü+yüz) tek kazanan", () => {
  const a = almutenOfDegree(19, true, "lilly-1647");
  assert.deepEqual(a.winners, ["sun"]);
  assert.equal(a.max, 8);
  assert.equal(a.tie, false);
});
t("M02 Koç 19° GECE: Güneş 5 ↔ Mars 5 EŞİT → tie, iki kazanan da listelenir (tek kazanan uydurulmaz)", () => {
  const a = almutenOfDegree(19, false, "lilly-1647");
  assert.equal(a.tie, true);
  assert.deepEqual([...a.winners].sort(), ["mars", "sun"]);
  assert.equal(a.max, 5);
});
t("M03 Puan bütünlüğü: her derecede (0,5° ızgara × 2 sect × 2 ekol × 3 politika) dağıtılan toplam = 5+4(varsa)+3×rol+2+1", () => {
  for (const school of ["lilly-1647", "dorothean-egyptian"] as const)
    for (const pol of Object.keys(ALMUTEN_POLICIES) as (keyof typeof ALMUTEN_POLICIES)[])
      for (const day of [true, false])
        for (let l = 0.25; l < 360; l += 0.5) {
          const a = almutenOfDegree(l, day, school, pol);
          const s = signOf(l);
          const hasEx = CLASSICAL_PLANETS.some((p) => EXALTATION[p].sign === s);
          const tr = TRIPLICITY[school === "lilly-1647" ? "lilly" : "dorothean"][elementOf(s)];
          const roles = ALMUTEN_POLICIES[pol].triplicity === "all_three" ? tr.filter(Boolean).length : ALMUTEN_POLICIES[pol].triplicity === "sect_plus_participating" ? 1 + (tr[2] ? 1 : 0) : 1;
          const total = a.scores.reduce((t, x) => t + x.total, 0);
          assert.equal(total, 5 + (hasEx ? 4 : 0) + 3 * roles + 2 + 1, `${school} ${pol} ${l}`);
          assert.ok(a.winners.length >= 1);
        }
});
t("M04 Lilly su üçlüsü 'all_three': Mars gündüz+gece rolüyle 6 puan; 'sect_only' 3", () => {
  const sect = almutenOfDegree(95, true, "lilly-1647", "lilly_ca115_sect").scores.find((x) => x.planet === "mars")!;
  const all = almutenOfDegree(95, true, "lilly-1647", "lilly_ca115_all_triplicity").scores.find((x) => x.planet === "mars")!;
  assert.equal(all.total - sect.total, 3);
});
t("M05 Eşitlik oranı raporu: Lilly sect politikasında 0,1° ızgarada tie derecelerinin payı > 0 (eşitlik gerçek durumdur)", () => {
  let ties = 0;
  let n = 0;
  for (let l = 0.05; l < 360; l += 0.1) for (const d of [true, false]) {
      n++;
      if (almutenOfDegree(l, d, "lilly-1647").tie) ties++;
    }
  rows.push(`INFO\tM05 tie oranı ${(100 * ties / n).toFixed(2)}% (${ties}/${n})`);
  assert.ok(ties > 0);
});
t("M06 Ev cusp almuten'leri: 12 kayıt; geçersiz dizi hata", () => {
  const c = Array.from({ length: 12 }, (_, i) => i * 30 + 7);
  const r = houseCuspAlmutens(c, true, "lilly-1647");
  assert.equal(r.length, 12);
  assert.equal(r[0].house, 1);
  assert.throws(() => houseCuspAlmutens(c.slice(0, 11), true, "lilly-1647"));
});
t("M07 Harita almuten'i: eksik doğum öncesi kavuşum → toplam null; Yunan (CA s. 532) seti standard; diğerleri standard değil", () => {
  const places = { sun: 19, moon: 125, asc: 200, mc: 110, fortune: 306, prenatal_syzygy: null };
  const ib = figureAlmuten(places, true, "lilly-1647", "ibn_ezra_5");
  assert.equal(ib.totals, null);
  assert.deepEqual(ib.missing, ["prenatal_syzygy"]);
  const gr = figureAlmuten(places, true, "lilly-1647", "greeks_ca532");
  assert.equal(gr.standard, true);
  assert.equal(figureAlmuten(places, true, "lilly-1647", "lilly_hylegiacal5_ca507").standard, false);
  // Elle: Güneş Koç 19° gündüz → Güneş 8, Mars 5, Merkür 2; Ay Aslan 5° gündüz → Güneş 5+3=8, Satürn terim 2 (Lilly Aslan 0–6), yüz Satürn 1 → Satürn 3
  const sun = gr.totals!.find((x) => x.planet === "sun")!;
  assert.equal(sun.total, 16);
  assert.deepEqual(gr.winners, ["sun"]);
  assert.equal(FIGURE_PRESETS.greeks_ca532.verified, true);
});

// ── 8. Doğum öncesi kavuşum ──────────────────────────────────────────────────────────────────────
t("S01 2024-04-09T00:00Z öncesi: yeni ay 2024-04-08 ~18:21Z (tam güneş tutulması günü), ±3 dk", () => {
  const r = prenatalSyzygy(Date.parse("2024-04-09T00:00:00Z"), "moon");
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.kind, "new");
  assert.ok(Math.abs(Date.parse(r.atUtc) - Date.parse("2024-04-08T18:21:00Z")) < 3 * 60_000, r.atUtc);
  assert.ok(Math.abs(((r.sunLon - r.moonLon + 540) % 360) - 180) < 0.01);
});
t("S02 2024-03-26T00:00Z öncesi: dolunay 2024-03-25 ~07:00Z; nokta kuralı parametre (moon/sun/ufuk üstü)", () => {
  const m = prenatalSyzygy(Date.parse("2024-03-26T00:00:00Z"), "moon");
  const s = prenatalSyzygy(Date.parse("2024-03-26T00:00:00Z"), "sun");
  const h = prenatalSyzygy(Date.parse("2024-03-26T00:00:00Z"), "luminary_above_horizon", { latitude: 41, longitude: 29 });
  assert.ok(!("error" in m) && !("error" in s) && !("error" in h));
  if ("error" in m || "error" in s || "error" in h) return;
  assert.equal(m.kind, "full");
  assert.ok(Math.abs(Date.parse(m.atUtc) - Date.parse("2024-03-25T07:00:00Z")) < 5 * 60_000, m.atUtc);
  assert.ok(Math.abs(((m.point - s.point + 360) % 360) - 180) < 0.01);
  assert.equal(h.chosen, "sun"); // 07:00Z İstanbul'da (10:00 yerel) Güneş ufuk üstünde
  assert.equal(prenatalSyzygy(Date.parse("2024-03-26T00:00:00Z"), "luminary_above_horizon").hasOwnProperty("error"), true);
});

// ── 9. Birleşik natal rapor (gerçek Roxy golden, yeni çağrı yok) ───────────────────────────────────
t("N01 Roxy natal golden (1990-07-15 İstanbul) → buildNatalDignities: 7 gezegen, 21 çift, 12 cusp almuten'i, Roxy dignity = burç düzeyi sınıf", () => {
  const g = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8"));
  const name: Record<string, ClassicalPlanet> = { Sun: "sun", Moon: "moon", Mercury: "mercury", Venus: "venus", Mars: "mars", Jupiter: "jupiter", Saturn: "saturn" };
  const positions = {} as Record<ClassicalPlanet, { lon: number; speed: number }>;
  const roxyDig: Record<string, string> = {};
  for (const p of g.planets)
    if (name[p.name]) {
      positions[name[p.name]] = { lon: p.longitude, speed: p.speed };
      roxyDig[name[p.name]] = p.dignity;
    }
  const r = buildNatalDignities({ positions, asc: g.ascendant.longitude, mc: g.midheaven.longitude, houses: { system: g.houseSystem, cusps: g.houses.map((h: { longitude: number }) => h.longitude) }, isDay: g.partOfFortune.sect === "day", northNode: null, prenatalSyzygy: null, school: "lilly-1647" });
  assert.equal(r.planets.length, 7);
  assert.equal(r.receptions.all.length, 21);
  assert.equal(r.cuspAlmutens!.items.length, 12);
  assert.ok(r.lordOfGenitureLilly !== null);
  const mism: string[] = [];
  for (const pl of CLASSICAL_PLANETS) if (roxyDig[pl] !== signOnlyDignity(pl, positions[pl].lon)) mism.push(`${pl}: roxy=${roxyDig[pl]} biz=${signOnlyDignity(pl, positions[pl].lon)}`);
  rows.push(`INFO\tN01 Roxy dignity uyuşmazlık: ${mism.length ? mism.join("; ") : "yok"}`);
  assert.equal(mism.length, 0, mism.join("; "));
});
t("N02 Eksik veri: hız null → arızi null + uyarı; Lilly 'Lord of Geniture' hesaplanmaz; uydurma yok", () => {
  const positions = Object.fromEntries(CLASSICAL_PLANETS.map((p) => [p, { lon: basePos[p], speed: p === "mars" ? null : 1 }])) as Record<ClassicalPlanet, { lon: number; speed: number | null }>;
  const r = buildNatalDignities({ positions, asc: 10, mc: 280, houses: { system: "placidus", cusps: Array.from({ length: 12 }, (_, i) => (i * 30 + 10) % 360) }, isDay: true, northNode: null, prenatalSyzygy: null, school: "lilly-1647" });
  assert.equal(r.planets.find((x) => x.planet === "mars")!.accidental, null);
  assert.equal(r.lordOfGenitureLilly, null);
  assert.ok(r.warnings.some((w) => w.startsWith("mars")));
  assert.throws(() => buildNatalDignities({ positions: { ...positions, sun: { lon: NaN, speed: 1 } }, asc: 0, mc: 0, houses: null, isDay: true, northNode: null, prenatalSyzygy: null, school: "lilly-1647" }));
});
t("N03 Ekol karışımı uyarısı: Dorothean + lilly_ca115 politika → 'EKOL KARIŞIMI' uyarısı", () => {
  const positions = Object.fromEntries(CLASSICAL_PLANETS.map((p) => [p, { lon: basePos[p], speed: 1 }])) as Record<ClassicalPlanet, { lon: number; speed: number }>;
  const r = buildNatalDignities({ positions, asc: 10, mc: 280, houses: null, isDay: true, northNode: null, prenatalSyzygy: null, school: "dorothean-egyptian", scorePolicy: "lilly_ca115" });
  assert.ok(r.warnings.some((w) => w.startsWith("EKOL KARIŞIMI")));
});

void EPS;
console.log(rows.join("\n"));
console.log(`\npro-dignities: ${pass} geçti, ${fail} kaldı`);
if (fail) process.exit(1);

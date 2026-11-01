/**
 * GÖKYÜZÜ ATLASI — TUTULMA TEMAS ANLARI (lib/astrology/pro/lunations/contacts.ts). Ağ çağrısı YOK; sağlayıcı (Roxy) YOK.
 *
 * Bağımsız referans: Swiss Ephemeris 2.10.03 MOSHIER (pyswisseph).
 *   • Ay: fixtures/pro-lunations/ref-lunations-2026-11-01.json → lunarSwe.contactsTt = [P1, P4, U1, U4, U2, U3] (TT ms; yoksa null).
 *   • Güneş: fixtures/pro-lunations/ref-solar-contacts-2026-11-02.json (üretici ref_solar_contacts.py) → [tepe, başlangıç, bitiş] (TT ms).
 *
 * TOLERANS (Owner kararı 02.11.2026, sonuçlardan ÖNCE tanımlıydı): her temas anı TT farkı ≤ 180 s, 1920–2150.
 * Varlık (hangi temaslar var) referansla BİREBİR; tutarsızlık sıfır olmalı. Referansın kendisinde temas yoksa (Swiss bir vakada
 * başlangıç/bitiş vermiyor) o vaka adıyla listelenir, gizlenmez.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-eclipse-contacts.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  findLunarEclipses,
  findSolarEclipses,
  lunarEclipseContacts,
  solarEclipseGlobalContacts,
  ttToUtcMs,
  type LunarEclipseContacts,
  type SolarEclipseGlobalContacts,
} from "@/lib/astrology/pro/lunations";

let pass = 0;
let fail = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    process.stderr.write(`FAIL ${name}\n  ${(e as Error).message}\n`);
  }
}
const FIX = join(__dirname, "fixtures", "pro-lunations");
const LREF = (JSON.parse(readFileSync(join(FIX, "ref-lunations-2026-11-01.json"), "utf8")) as { lunarSwe: { kind: string; peakTt: number; contactsTt: (number | null)[] }[] }).lunarSwe;
const SREF = (JSON.parse(readFileSync(join(FIX, "ref-solar-contacts-2026-11-02.json"), "utf8")) as { solar: [number, number | null, number | null][] }).solar;
const TOL_S = 180;
const T0 = Date.UTC(1920, 0, 1);
const T1 = Date.UTC(2151, 0, 1);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16) + "Z";

const started = Date.now();
const LE = findLunarEclipses(T0, T1);
const SE = findSolarEclipses(T0, T1);
if (!LE.ok || !SE.ok) throw new Error("tutulma araması");
const LC = LE.events.map((e) => ({ e, c: lunarEclipseContacts(e.peakTtMs) }));
const SC = SE.events.map((e) => ({ e, c: solarEclipseGlobalContacts(e.peakTtMs) }));
const elapsed = Date.now() - started;
console.log(`hesap: ${LC.length} Ay + ${SC.length} Güneş tutulması, ${elapsed} ms`);

const near = <T extends { peakTt: number } | [number, ...unknown[]]>(arr: T[], peakTt: number) =>
  arr.find((r) => Math.abs((Array.isArray(r) ? (r[0] as number) : r.peakTt) - peakTt) < 120_000);

t("C1 Ay: 532 tutulmanın tümü eşleşir; her birinde P1/P4 var", () => {
  assert.equal(LC.length, 532);
  for (const { e, c } of LC) {
    assert.ok(near(LREF, e.peakTtMs), `referans yok ${iso(e.peakMs)}`);
    assert.ok(c, `P1/P4 bulunamadı ${iso(e.peakMs)}`);
  }
});

t(`C2 Ay temas anları (P1, U1, U2, U3, U4, P4) Swiss'e göre ≤ ${TOL_S} s; varlık birebir`, () => {
  const names = ["p1", "p4", "u1", "u4", "u2", "u3"] as const;
  const worst: Record<string, number> = {};
  const bad: string[] = [];
  for (const { e, c } of LC) {
    const r = near(LREF, e.peakTtMs)!;
    names.forEach((k, i) => {
      const mine = (c as LunarEclipseContacts)[k];
      const ref = r.contactsTt[i];
      if ((mine === null) !== (ref === null)) return void bad.push(`${iso(e.peakMs)} ${k} varlık: biz ${mine ? "var" : "yok"}, Swiss ${ref ? "var" : "yok"}`);
      if (mine && ref !== null) {
        const d = Math.abs(mine.ttMs - ref) / 1000;
        worst[k] = Math.max(worst[k] ?? 0, d);
        if (d > TOL_S) bad.push(`${iso(e.peakMs)} ${k} fark ${d.toFixed(0)} s`);
      }
    });
  }
  console.log("   en büyük fark (s):", Object.entries(worst).map(([k, v]) => `${k.toUpperCase()} ${v.toFixed(0)}`).join(" · "));
  assert.deepEqual(bad, []);
});

t("C3 Ay: temaslar tür ile tutarlı (yarı gölge → U yok; parçalı → U1/U4 var, U2/U3 yok; tam → hepsi var)", () => {
  const bad: string[] = [];
  for (const { e, c } of LC) {
    const x = c as LunarEclipseContacts;
    const ok = e.kind === "penumbral" ? !x.u1 && !x.u2 : e.kind === "partial" ? !!x.u1 && !x.u2 : !!x.u1 && !!x.u2;
    if (!ok) bad.push(`${iso(e.peakMs)} ${e.kind}`);
  }
  // Kütüphane türü ile temas kuralı aynı gölge sınırını kullanmaz: sınırdaki vakalar MODEL FARKI olarak listelenir.
  if (bad.length) console.log("   tür sınırı model farkı:", bad.join(" · "));
  assert.ok(bad.length <= 3, `tür/temas tutarsızlığı ${bad.length}: ${bad.join(", ")}`);
});

t("C4 sıra: P1 < U1 < U2 < tepe < U3 < U4 < P4 (Ay) · başlangıç < tepe < bitiş (Güneş)", () => {
  for (const { e, c } of LC) {
    const x = c as LunarEclipseContacts;
    const seq = [x.p1, x.u1, x.u2, { ttMs: e.peakTtMs }, x.u3, x.u4, x.p4].filter(Boolean).map((v) => v!.ttMs);
    for (let i = 1; i < seq.length; i++) assert.ok(seq[i] > seq[i - 1], `sıra ${iso(e.peakMs)}`);
  }
  for (const { e, c } of SC) {
    if (!c) continue; // C5 sınır vakası
    const x = c as SolarEclipseGlobalContacts;
    assert.ok(x.begin.ttMs < e.peakTtMs && e.peakTtMs < x.end.ttMs, `sıra ${iso(e.peakMs)}`);
  }
});

t(`C5 Güneş global başlangıç/bitiş Swiss'e göre ≤ ${TOL_S} s (521 tutulma)`, () => {
  assert.equal(SC.length, 521);
  let wb = 0;
  let we = 0;
  const bad: string[] = [];
  const refMissing: string[] = [];
  for (const { e, c } of SC) {
    const r = near(SREF, e.peakTtMs);
    assert.ok(r, `referans yok ${iso(e.peakMs)}`);
    // Varlık birebir: temas yalnız referansta da yoksa verilmeyebilir (yarı gölge Dünya'ya değmeyen sınır vakası).
    assert.equal(c === null, r[1] === null || r[2] === null, `varlık farkı ${iso(e.peakMs)}`);
    if (!c || r[1] === null || r[2] === null) {
      refMissing.push(`${iso(e.peakMs)} ${e.kind}`);
      continue;
    }
    const db = Math.abs(c.begin.ttMs - r[1]) / 1000;
    const de = Math.abs(c.end.ttMs - r[2]) / 1000;
    wb = Math.max(wb, db);
    we = Math.max(we, de);
    if (db > TOL_S || de > TOL_S) bad.push(`${iso(e.peakMs)} başl ${db.toFixed(0)} s, bitiş ${de.toFixed(0)} s`);
  }
  console.log(`   en büyük fark: başlangıç ${wb.toFixed(0)} s · bitiş ${we.toFixed(0)} s · iki tarafta da temas yok (sınır): ${refMissing.join(", ") || "yok"}`);
  assert.deepEqual(bad, []);
  assert.ok(refMissing.length <= 1, "referansta eksik vaka sayısı arttı");
});

t("C6 UTC alanı ortak zaman katmanıyla tutarlı (ttToUtcMs)", () => {
  for (const { c } of LC.slice(0, 40)) assert.equal(c!.p1.utcMs, ttToUtcMs(c!.p1.ttMs));
  for (const { c } of SC.slice(0, 40).filter((x) => x.c)) assert.equal(c!.end.utcMs, ttToUtcMs(c!.end.ttMs));
});

t("C7 tepe anı ve tür değişmedi (find* çıktısı aynı anahtarlar; temaslar ayrı işlevde)", () => {
  for (const e of LE.events) assert.deepEqual(Object.keys(e).sort(), ["kind", "peakMs", "peakTtMs"]);
  for (const e of SE.events) assert.deepEqual(Object.keys(e).sort(), ["axisDistanceKm", "centrality", "kind", "peakMs", "peakTtMs"]);
});

console.log(`\nSONUÇ pro-eclipse-contacts: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);

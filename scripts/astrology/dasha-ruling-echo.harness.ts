/**
 * ASTROLOJİ — DASHA / KP RULING YANKI TOLERANSI harness'i (ATL-P2-01, ATL-P2-02 — 2026-10-20).
 *
 * Kaynak: GERÇEK Roxy yanıtları (ATLAS-1000 bağımsız doğrulama; sentetik kişiler): saniyeli (LMT) ofsetli doğumlarda daha önce
 * reddedilen 56 vedic.dasha + 56 kp.dasha + 0,833333 sa ofsetli 7 kp.ruling ve örnek geçen yanıtlar. Bağımsız: PyJHora 4.8.7
 * vedic dasha 56/56 TAM; D1 Ay JPL ≤0,83″. Gerçek Roxy çağrısı YOK.
 *
 *   A) Önceden reddedilen 112 dasha + 7 ruling artık KABUL; örnek geçenler aynen geçer.
 *   B) Yanlış an hâlâ REDDEDİLİR: ilk mahadasha +31 sn / +61 sn / +1 gün kaymış; dakikaya oturmamış yankı; ruling anı ≥1 sn kaymış.
 *   C) Ruling ve dasha teknik değerleri (dönem listesi, lord'lar) değişmez — yalnız yankı denetimi gevşetildi.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/dasha-ruling-echo.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTechnique, type CalcUnit } from "@/lib/astrology/engine/techniques";
import { projectRoxyKpRuling } from "@/lib/astrology/providers/roxy/kp";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
type Case = { job: string; tech: "vedic.dasha" | "kp.dasha" | "kp.ruling"; previouslyRejected: boolean; sent: string; echoed: string; want: string | null; body: J; raw: J };
const FIX = JSON.parse(readFileSync(join(__dirname, "fixtures", "dasha-ruling-lmt-echo.json"), "utf8")) as { cases: Case[] };

let pass = 0;
let fail = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}

function projectDasha(c: Case, raw: J = c.raw) {
  const def = getTechnique(c.tech)!;
  const opt = c.tech === "kp.dasha" ? { ayanamsa: c.body.ayanamsa, nodeType: c.body.nodeType ?? "mean", mahadasha: null, antardasha: null } : { ayanamsa: c.body.ayanamsa, mahadasha: null, antardasha: null };
  return def.project({ body: c.body } as unknown as CalcUnit, structuredClone(raw), opt);
}
function projectRuling(c: Case, raw: J = c.raw) {
  return projectRoxyKpRuling(structuredClone(raw), { atUtc: c.want!, local: c.body.datetime, utcOffsetHours: c.body.timezone, place: { latitude: c.body.latitude, longitude: c.body.longitude }, withBirth: !!c.body.birthDate });
}
const shiftIso = (s: string, ms: number) => new Date(Date.parse(s.endsWith("Z") ? s : `${s}Z`) + ms).toISOString().slice(0, 19);
const firstStartKey = (raw: J) => (raw.mahadashas?.[0]?.startDate !== undefined ? "startDate" : "start");

t("A: önceden reddedilen 56 vedic.dasha + 56 kp.dasha (saniyeli LMT doğumları) artık kabul; geçen örnekler aynen geçer", () => {
  const counts: Record<string, number> = {};
  for (const c of FIX.cases.filter((x) => x.tech !== "kp.ruling")) {
    const r = projectDasha(c);
    assert.ok(r.ok, `${c.job} ${c.tech}: ${!r.ok ? r.errors.join("; ") : ""}`);
    counts[`${c.tech} ${c.previouslyRejected ? "RED→OK" : "OK"}`] = (counts[`${c.tech} ${c.previouslyRejected ? "RED→OK" : "OK"}`] ?? 0) + 1;
  }
  assert.equal(counts["vedic.dasha RED→OK"], 56);
  assert.equal(counts["kp.dasha RED→OK"], 56);
  console.log(`     ${JSON.stringify(counts)}`);
});

t("A: önceden reddedilen 7 kp.ruling (0,833333 sa ofset, yankı +1/+2 ms) artık kabul; geçen örnekler aynen geçer", () => {
  let n = 0;
  for (const c of FIX.cases.filter((x) => x.tech === "kp.ruling")) {
    const r = projectRuling(c);
    assert.ok(r.ok, `${c.job}: ${!r.ok ? r.errors.join("; ") : ""}`);
    if (c.previouslyRejected) n += 1;
  }
  assert.equal(n, 7);
});

t("B: yanlış an hâlâ reddedilir — ilk mahadasha +31 sn / +61 sn / +1 gün; saniyeli (dakikaya oturmamış) yankı", () => {
  for (const c of FIX.cases.filter((x) => x.tech !== "kp.ruling")) {
    const key = firstStartKey(c.raw);
    for (const d of [31_000, 61_000, 86_400_000, -61_000]) {
      const raw = structuredClone(c.raw);
      raw.mahadashas[0][key] = shiftIso(String(c.echoed), d);
      const r = projectDasha(c, raw);
      assert.equal(r.ok, false, `${c.job} ${c.tech} ${d} ms kaymış yankı kabul edildi`);
    }
  }
  // Gönderilen saniyeli an aynen yankılansa da kabul (eski davranış korunur).
  const c = FIX.cases.find((x) => x.tech === "vedic.dasha" && x.previouslyRejected)!;
  const raw = structuredClone(c.raw);
  raw.mahadashas[0][firstStartKey(raw)] = c.sent;
  assert.ok(projectDasha(c, raw).ok, "birebir yankı kabul edilmeli");
});

t("B: kp.ruling anı ≥1 sn kaymışsa hâlâ reddedilir", () => {
  for (const c of FIX.cases.filter((x) => x.tech === "kp.ruling")) {
    for (const d of [1_000, -1_000, 60_000]) {
      const raw = structuredClone(c.raw);
      raw.datetime = new Date(Date.parse(`${c.want}:00Z`) + d).toISOString();
      const r = projectRuling(c, raw);
      assert.equal(r.ok, false, `${c.job} ${d} ms kaymış ruling kabul edildi`);
    }
  }
});

t("C: kabul edilen dasha'da 9 mahadasha, ilk dönem gönderilen doğum anına (≤30 sn) bağlı; teknik değerler sağlayıcıdan aynen", () => {
  for (const c of FIX.cases.filter((x) => x.tech === "vedic.dasha" && x.previouslyRejected).slice(0, 10)) {
    const r = projectDasha(c);
    if (!r.ok) throw new Error(c.job);
    const tt = r.technical as J;
    const list = tt.mahadashas ?? tt.periods ?? tt.list;
    assert.ok(Array.isArray(list) && list.length === 9, `${c.job}: 9 dönem`);
  }
});

console.log(`\nastrology dasha/ruling echo harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);

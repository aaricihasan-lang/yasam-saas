/**
 * KP ZAMAN KONTROLÜ harness'i (14.11.2026) — sağlayıcının saniyeli / dakikaya yuvarlanmış geçiş anları.
 *
 * Kaynak: Profesyonel Kapsam 10-30 P0 adayı (kp.ts changeInstant: `time` = datetime HH:MM şartı), Roxy Tam Kapsam 10-31 Ç4 ve büyük
 * denetim 10-30 C-WD-0972 (2001-12-31T23:59:57Z geçişi sağlayıcıda 2002-01-01T00:00 → ürün tüm yanıtı "pencere dışı" diye reddetti,
 * 4 kredi boşa). Temel: GERÇEK kp-sublord-moon / kp-rasi-moon yanıtları (golden); yalnız an alanları sentetik olarak değiştirilir.
 * Ağ / Roxy YOK.
 *
 *   A) Gerçek yanıtlar aynen geçer (regresyon: eski davranış korunur).
 *   B) Saniyeli datetime + kesilmiş ya da yuvarlanmış dakikalık time (gün / ay / YIL devri dahil) → KABUL; an = datetime (saniyesiyle).
 *   C) Gerçekten farklı an → RED: 60 sn, 1 dk, 1 saat, 1 gün, saniyeli time'da 1 sn fark, bozuk biçim.
 *   D) Pencere sınırı: yalnız bitişten sonraki gün TAM 00:00:00 kabul (yuvarlama payı); 00:00:01, 00:01, başlangıçtan önce → RED.
 *   E) C-WD-0972 benzeri yanıt artık kaydedilebilir (sonuç reddedilmez → kredi boşa gitmez); rasi geçişleri aynı kuralı kullanır.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/kp-zaman-kontrolu.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoxyKpRasiChanges, projectRoxyKpSublordChanges } from "@/lib/astrology/providers/roxy/kp";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const G = (n: string) => JSON.parse(readFileSync(join(__dirname, "fixtures", "golden", `${n}.json`), "utf8")) as { body: J; response: J };

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.log(`FAIL ${name}\n     ${(e as Error).message.split("\n").slice(0, 12).join("\n     ")}`);
  }
}

const SUB = G("kp-sublord-moon");
const RASI = G("kp-rasi-moon");
const ex = (g: { body: J }) => ({ planet: "moon" as const, startDate: String(g.body.startDate), endDate: String(g.body.endDate) });
const sub = (raw: J) => projectRoxyKpSublordChanges(raw, ex(SUB));
/** Gerçek yanıtın i. satırının an alanlarını değiştir (diğer her şey gerçek). */
function withRow(i: number, patch: { date?: unknown; time?: unknown; datetime?: unknown }, g = SUB): J {
  const r = structuredClone(g.response);
  Object.assign(r.changes[i], patch);
  return r;
}
const errorsOf = (x: J) => (x.ok ? [] : (x.errors as string[]));

async function main() {
  const n = SUB.response.changes.length;
  assert.ok(n >= 10);

  await t("A) gerçek sub-lord ve rasi yanıtları aynen geçer (eski davranış korunur); anlar dakika hassasiyetinde ':00Z'", () => {
    const a = sub(SUB.response);
    assert.ok(a.ok, JSON.stringify(errorsOf(a)));
    assert.equal(a.part.changes.length, n);
    assert.ok(a.part.changes.every((c) => /:00Z$/.test(c.atUtc)));
    const r = projectRoxyKpRasiChanges(RASI.response, ex(RASI));
    assert.ok(r.ok, JSON.stringify(errorsOf(r)));
  });

  await t("B) saniyeli datetime + KESİLMİŞ dakikalık time → KABUL; an saniyesiyle datetime'dan", () => {
    const c = SUB.response.changes[3];
    const x = sub(withRow(3, { datetime: `${c.date}T${c.time}:47` }));
    assert.ok(x.ok, JSON.stringify(errorsOf(x)));
    assert.equal(x.part.changes[3].atUtc, `${c.date}T${c.time}:47Z`);
  });

  await t("B) saniyeli datetime + YUKARI yuvarlanmış time (aynı gün ve gün devri: 23:59:31 → ertesi gün 00:00) → KABUL", () => {
    const c = SUB.response.changes[3];
    const [h, m] = c.time.split(":").map(Number);
    const prev = `${String(m === 0 ? h - 1 : h).padStart(2, "0")}:${String(m === 0 ? 59 : m - 1).padStart(2, "0")}`;
    const up = sub(withRow(3, { datetime: `${c.date}T${prev}:45` }));
    assert.ok(up.ok, JSON.stringify(errorsOf(up)));
    // Gün devri: son satır (pencere içinde) 2026-10-08T23:59:31 → date 2026-10-09, time 00:00.
    const last = n - 1;
    const r = withRow(last, { date: "2026-10-09", time: "00:00", datetime: "2026-10-08T23:59:31" });
    const day = sub(r);
    assert.equal(errorsOf(day).filter((e) => /time|date/.test(e)).length, 0, JSON.stringify(errorsOf(day)));
  });

  await t("B) yıl devri (C-WD-0972 biçimi): datetime 2001-12-31T23:59:57, date 2002-01-01, time 00:00 → an tutarlı (time ↔ datetime hatası YOK)", () => {
    const r = { planet: "Moon", startDate: "2001-12-25", endDate: "2001-12-31", totalChanges: 1, changes: [{ ...SUB.response.changes[0], date: "2002-01-01", time: "00:00", datetime: "2001-12-31T23:59:57" }] };
    const x = projectRoxyKpSublordChanges(r, { planet: "moon" as const, startDate: "2001-12-25", endDate: "2001-12-31" });
    assert.equal(errorsOf(x).filter((e) => /time|date|biçim|pencere/.test(e)).length, 0, JSON.stringify(errorsOf(x)));
  });

  await t("C) gerçekten FARKLI an → RED: +60 sn, +1 dk, −1 dk, +1 saat, ertesi gün aynı saat, saniyeli time'da 1 sn, bozuk biçim", () => {
    const c = SUB.response.changes[3];
    const at = Date.parse(`${c.datetime}Z`);
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19);
    const bad: [string, J][] = [
      ["+60 sn (dakikalık time)", { datetime: iso(at + 60_000), time: c.time, date: c.date }],
      ["+1 dk time", { time: iso(at + 60_000).slice(11, 16) }],
      ["−1 dk time", { time: iso(at - 60_000).slice(11, 16) }],
      ["+1 saat time", { time: iso(at + 3_600_000).slice(11, 16) }],
      ["ertesi gün", { date: iso(at + 86_400_000).slice(0, 10) }],
      ["saniyeli time 1 sn", { datetime: `${c.date}T${c.time}:10`, time: `${c.time}:11` }],
      ["time biçimi", { time: "7:5" }],
      ["time saat 24", { time: "24:00" }],
      ["date biçimi", { date: "2026/10/07" }],
      ["datetime biçimi", { datetime: "2026-10-07 12:00" }],
    ];
    for (const [name, patch] of bad) {
      const x = sub(withRow(3, patch));
      assert.equal(x.ok, false, name);
      // Ret nedeni AN denetimi olmalı (başka bir denetimin yan etkisi değil).
      assert.ok(errorsOf(x).some((e) => /changes\[3\]: (time ↔ datetime|date ↔ datetime|time biçimi|date biçimi|datetime biçimi)/.test(e)), `${name}: ${JSON.stringify(errorsOf(x))}`);
    }
  });

  await t("C) saniyeli time saniyesine kadar aynıysa KABUL (ör. 12:34:10 = datetime 12:34:10)", () => {
    const c = SUB.response.changes[3];
    const x = sub(withRow(3, { datetime: `${c.date}T${c.time}:10`, time: `${c.time}:10` }));
    assert.ok(x.ok, JSON.stringify(errorsOf(x)));
  });

  await t("D) pencere: bitişten sonraki gün TAM 00:00:00 KABUL (yuvarlama payı); 00:00:01, 00:01 ve başlangıçtan önceki an RED", () => {
    const end = String(SUB.body.endDate);
    const next = new Date(Date.parse(`${end}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const last = n - 1;
    const ok = sub(withRow(last, { date: next, time: "00:00", datetime: `${next}T00:00:00` }));
    assert.equal(errorsOf(ok).filter((e) => /pencere/.test(e)).length, 0, JSON.stringify(errorsOf(ok)));
    for (const [d, tm, dt] of [
      [next, "00:00", `${next}T00:00:01`],
      [next, "00:01", `${next}T00:01:00`],
    ])
      assert.ok(errorsOf(sub(withRow(last, { date: d, time: tm, datetime: dt }))).some((e) => /pencere/.test(e)), dt);
    const start = String(SUB.body.startDate);
    const before = new Date(Date.parse(`${start}T00:00:00Z`) - 60_000).toISOString().slice(0, 19);
    assert.ok(errorsOf(sub(withRow(0, { date: before.slice(0, 10), time: before.slice(11, 16), datetime: before }))).some((e) => /pencere/.test(e)));
  });

  await t("E) C-WD-0972 benzeri tam yanıt: pencere sonu 23:59:57 geçişi '00:00 ertesi gün' olarak gelse de sonuç KAYDEDİLEBİLİR; rasi de aynı kural", () => {
    // Gerçek yanıtın son satırı pencerenin son anına taşınır (sağlayıcı yuvarlaması); zincir/KP denetimleri aynen geçmeli.
    const last = n - 1;
    const end = String(SUB.body.endDate);
    const next = new Date(Date.parse(`${end}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const x = sub(withRow(last, { date: next, time: "00:00", datetime: `${next}T00:00:00` }));
    assert.ok(x.ok, JSON.stringify(errorsOf(x)));
    assert.equal(x.part.changes[last].atUtc, `${next}T00:00:00Z`);
    const rl = RASI.response.changes.length - 1;
    const rEnd = String(RASI.body.endDate);
    const rNext = new Date(Date.parse(`${rEnd}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const rr = structuredClone(RASI.response);
    Object.assign(rr.changes[rl], { date: rNext, time: "00:00", datetime: `${rNext}T00:00:00` });
    const y = projectRoxyKpRasiChanges(rr, ex(RASI));
    assert.ok(y.ok, JSON.stringify(errorsOf(y)));
  });

  console.log(`\nastrology KP zaman kontrolü harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

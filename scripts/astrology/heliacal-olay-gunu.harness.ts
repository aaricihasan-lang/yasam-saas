/**
 * HELİAKAL OLAY GÜNÜ (24.10.2026, owner kararı P2) — `event()` olay-günü zaman derecesi kuralı.
 *
 * Kök neden: eski kural "olay günü zaman derecesi sınıra yakın olmalı" (|td − kalamsa| ≤ 5°, Ay 15°) idi. Sağlayıcı alanlarının
 * ÖLÇÜLMÜŞ anlamı (QA 40-sekiz-teknik/forecast-heliacal; bağımsız DE440 yeniden üretimi 1.512/1.512): last/nextEvent = günlük
 * görünürlük durumunun DEĞİŞTİĞİ ilk gün; udaya ⇒ o gün td > kalamsa (görünür), asta ⇒ o gün td ≤ kalamsa (görünmez). Olay
 * gününde td'nin sınıra ne kadar yakın olacağı fiziksel olarak sınırlı DEĞİLDİR: Ay günde ~12–15° uzanım kazanır ve ekliptiğin
 * ufka açısı uygunsa ilk görüldüğü gün td 28–33° olur; Venüs iç kavuşumunda taraf değiştirdiği gün yeni ufuktaki td 1,28 olabilir.
 * Eski kural bu üç GERÇEK ve DOĞRU yanıtı (Londra 2024-02-15 Ay 33,4151; İstanbul 2023-01-25 Ay 29,607; Buenos Aires 2025-03-23
 * Venüs 1,2807) bütünüyle reddediyordu (istek ücretli, sonuç yok).
 * Yeni kural (en dar): olay türüyle YÖN uyumu — udaya: td > k − VIS_TOL; asta: td ≤ k + VIS_TOL. Diğer bütün fail-closed
 * denetimler (alan/biçim, aralık, kalamsa kümesi, görünürlük, olay türü ↔ durum, olay günü sırası, tekrar, sıra) AYNEN.
 * Fixture'lar: fixtures/heliacal-olay/*.json — 18 GERÇEK sağlayıcı yanıtı (yer + gün; kişi verisi yok) + golden 1990-07-15.
 * Bunlardan 4'ü (h000–h003) eski kuralın reddedeceği günler için bağımsız modelle ÖNCEDEN seçilip çağrıldı (Stockholm, Wellington).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { projectRoxyVedicHeliacal } from "@/lib/astrology/providers/roxy/vedicNoktalar";
import { vedicNoktaReport } from "@/lib/astrology/report/vedicNoktalarReport";
import { VedicHeliacalPanel } from "@/app/admin/astroloji/_components/VedicNoktalarPanels";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
type Fx = { endpoint: string; body: J; response: J; opts: Parameters<typeof projectRoxyVedicHeliacal>[1]; _kaynak: string };
const DIR = join(__dirname, "fixtures", "heliacal-olay");
const FX: Record<string, Fx> = Object.fromEntries(readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => [f.replace(/\.json$/, ""), JSON.parse(readFileSync(join(DIR, f), "utf8"))]));
const GOLD = JSON.parse(readFileSync(join(__dirname, "fixtures", "golden", "vedic-heliacal.json"), "utf8"));
const GOLD_OPTS = { date: "1990-07-15", latitude: 41.0082, longitude: 28.9784, utcOffsetHours: 3, label: null, timeZone: null };
const ERR = (g: string, w: string) => `${g}.${w}: olay günü zaman derecesi olay türüyle uyuşmuyor`;

let pass = 0, fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try { await fn(); pass++; console.log(`PASS ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${(e as Error).message.split("\n")[0]}`); }
}
const proj = (k: string, mut?: (r: J) => void) => { const r = structuredClone(FX[k].response); mut?.(r); return projectRoxyVedicHeliacal(r, FX[k].opts); };
const gr = (r: J, n: string) => r.grahas.find((x: J) => x.graha === n);

async function main() {
  assert.equal(Object.keys(FX).length, 18, "18 gerçek yanıt fixture'ı");

  // ═══ A) Gerçek yanıtların tamamı kabul edilir (önce: 3 haksız red) ═══════════
  for (const k of Object.keys(FX).sort()) {
    await t(`A: gerçek yanıt ${k} (enlem ${FX[k].opts.latitude}) kabul`, () => {
      const r = proj(k);
      assert.ok(r.ok, !r.ok ? r.errors.join("; ") : "");
      if (r.ok) assert.equal(r.technical.grahas.length, FX[k].response.grahas.length, "graha düşmedi");
    });
  }
  await t("A: golden 1990-07-15 İstanbul hâlâ kabul", () => assert.ok(projectRoxyVedicHeliacal(structuredClone(GOLD.response), GOLD_OPTS).ok));

  // ═══ B) Kök neden vakaları — değerler aynen taşınır ═══════════════════════════
  await t("B: Ay ilk görünüşü (Londra 51,5°K, 2024-02-15): udaya olay günü td 33,4151 > 12 + 15 → kabul, değer aynen", () => {
    const r = proj("2024-02-15-r000");
    assert.ok(r.ok, !r.ok ? r.errors.join("; ") : "");
    if (r.ok) { const m = r.technical.grahas.find((g) => g.id === "moon")!; assert.equal(m.lastEvent!.type, "udaya"); assert.equal(m.lastEvent!.timeDegrees, 33.4151); assert.equal(m.lastEvent!.kalamsa, 12); }
  });
  await t("B: Ay ilk görünüşü (İstanbul 41°K, 2023-01-25): udaya td 29,607 → kabul", () => {
    const r = proj("2023-01-25-r002");
    assert.ok(r.ok, !r.ok ? r.errors.join("; ") : "");
    if (r.ok) assert.equal(r.technical.grahas.find((g) => g.id === "moon")!.lastEvent!.timeDegrees, 29.607);
  });
  await t("B: Venüs iç kavuşumu taraf değişimi (Buenos Aires 34,6°G, 2025-03-23, geri): asta td 1,2807 ≤ 8 → kabul", () => {
    const r = proj("2025-03-23-f001");
    assert.ok(r.ok, !r.ok ? r.errors.join("; ") : "");
    if (r.ok) { const v = r.technical.grahas.find((g) => g.id === "venus")!; assert.equal(v.retrograde, true); assert.equal(v.lastEvent!.type, "asta"); assert.equal(v.lastEvent!.timeDegrees, 1.2807); assert.equal(v.lastEvent!.kalamsa, 8); }
  });
  await t("B: YÜKSEK ENLEM (Stockholm 59,3°K) — bağımsız modelin öngördüğü Ay udaya td 37,25 ve 29,85 gerçek yanıtta (37,2533 / 29,8525) → kabul", () => {
    for (const [k, v] of [["2026-04-20-h000", 37.2533], ["2025-12-24-h001", 29.8525]] as const) {
      const r = proj(k);
      assert.ok(r.ok, !r.ok ? `${k}: ${r.errors.join("; ")}` : "");
      if (r.ok) { const m = r.technical.grahas.find((g) => g.id === "moon")!; assert.equal(m.lastEvent!.type, "udaya"); assert.equal(m.lastEvent!.timeDegrees, v); }
    }
  });
  await t("B: GÜNEY (Wellington 41,3°G) — Ay udaya td 27,0326 (öngörü 27,033) ve Venüs iç kavuşum asta td 3,0258 → kabul", () => {
    const r = proj("2026-05-21-h002");
    assert.ok(r.ok, !r.ok ? r.errors.join("; ") : "");
    if (r.ok) assert.equal(r.technical.grahas.find((g) => g.id === "moon")!.lastEvent!.timeDegrees, 27.0326);
    const v = proj("2025-03-26-h003");
    assert.ok(v.ok, !v.ok ? v.errors.join("; ") : "");
    if (v.ok) { const ve = v.technical.grahas.find((g) => g.id === "venus")!; assert.equal(ve.lastEvent!.type, "asta"); assert.equal(ve.retrograde, true); }
  });
  await t("B: kapsam — Merkür geri (12) ve ileri (14), doğu/batı ufku, kuzey/güney/ekvator, 59°K, 1687–2150 gerçek yanıtlarda temsil ediliyor", () => {
    const all = Object.values(FX).flatMap((f) => f.response.grahas.map((g: J) => ({ ...g, lat: f.opts.latitude })));
    const me = all.filter((g) => g.graha === "Mercury");
    assert.ok(me.some((g) => g.retrograde && g.kalamsa === 12) && me.some((g) => !g.retrograde && g.kalamsa === 14), "Merkür geri + ileri");
    assert.ok(all.some((g) => g.horizon === "east") && all.some((g) => g.horizon === "west"), "doğuş (doğu) + batış (batı) ufku");
    const lats = Object.values(FX).map((f) => f.opts.latitude);
    assert.ok(lats.some((x) => x < -30) && lats.some((x) => Math.abs(x) < 1) && lats.some((x) => x > 59), "güney, ekvator, yüksek enlem");
    const ev = all.flatMap((g) => [g.lastEvent, g.nextEvent]).filter(Boolean);
    assert.ok(ev.some((e: J) => e.type === "udaya") && ev.some((e: J) => e.type === "asta"), "doğuş (udaya) + batış (asta) olayları");
  });
  await t("B: yön kuralı 18 gerçek yanıttaki BÜTÜN olaylarda geçerli (udaya td > k, asta td ≤ k)", () => {
    let n = 0;
    for (const f of Object.values(FX)) for (const g of f.response.grahas) for (const e of [g.lastEvent, g.nextEvent]) {
      if (!e) continue; n++;
      assert.ok(e.type === "udaya" ? e.timeDegrees > e.kalamsa - 0.05 : e.timeDegrees <= e.kalamsa + 0.05, `${f.opts.date} ${g.graha} ${e.type} ${e.timeDegrees}/${e.kalamsa}`);
    }
    assert.ok(n >= 200, `olay sayısı ${n}`);
  });

  // ═══ C) Gerçek hatalı yanıtlar hâlâ REDDEDİLİR ═════════════════════════════════
  const bad: [string, string, (r: J) => void, string][] = [
    ["udaya ama olay günü görünmez (td 5 < 12) — hatalı zaman derecesi", "2024-02-15-r000", (r) => (gr(r, "Moon").lastEvent.timeDegrees = 5), ERR("moon", "lastEvent")],
    ["asta ama olay günü görünür (td 20 > 8)", "2025-03-23-f001", (r) => (gr(r, "Venus").lastEvent.timeDegrees = 20), ERR("venus", "lastEvent")],
    ["udaya sınırın 0,2° altında (yuvarlama payı dışı)", "2024-02-15-r000", (r) => (gr(r, "Moon").lastEvent.timeDegrees = 11.8), ERR("moon", "lastEvent")],
    ["imkânsız zaman derecesi (400°)", "2024-02-15-r000", (r) => (gr(r, "Moon").lastEvent.timeDegrees = 400), "moon.lastEvent: alan"],
    ["olay zaman derecesi sayı değil", "2023-01-25-r002", (r) => (gr(r, "Moon").lastEvent.timeDegrees = "33"), "moon.lastEvent: alan"],
    ["hatalı yön (ufuk 'north')", "2025-03-23-f001", (r) => (gr(r, "Venus").lastEvent.horizon = "north"), "venus.lastEvent: alan"],
    ["hatalı olay türü", "2025-03-23-f001", (r) => (gr(r, "Venus").lastEvent.type = "set"), "venus.lastEvent: alan"],
    ["olay türü durumla çelişir (görünmezken son olay udaya)", "2025-03-23-f001", (r) => { const v = gr(r, "Venus"); v.lastEvent.type = "udaya"; v.lastEvent.timeDegrees = 9; }, "venus: son olay mevcut durumla uyuşmuyor"],
    ["hatalı olay tarihi (son olay değerlendirme gününden sonra)", "2024-02-15-r000", (r) => (gr(r, "Moon").lastEvent.datetime = "2024-02-20T18:00:00"), "moon: son olay değerlendirme gününden sonra"],
    ["hatalı olay tarihi (sonraki olay geçmişte)", "2024-02-15-r000", (r) => (gr(r, "Moon").nextEvent.datetime = "2024-01-01T06:00:00"), "moon: sonraki olay değerlendirme gününden önce"],
    ["takvimde olmayan gün", "2023-01-25-r002", (r) => (gr(r, "Moon").lastEvent.datetime = "2023-02-30T18:00:00"), "moon.lastEvent: alan"],
    ["olay kalamsa grahanın sınırı değil", "2025-03-23-f001", (r) => (gr(r, "Venus").lastEvent.kalamsa = 12), "venus.lastEvent: kalamsa grahanın sınırı değil"],
    ["görünürlük td ile çelişir", "2024-02-15-r000", (r) => (gr(r, "Moon").visible = false), "moon: görünürlük zaman derecesi / kalamsa ile uyuşmuyor"],
    ["eksik alan (olay datetime yok)", "2023-01-25-r002", (r) => delete gr(r, "Moon").lastEvent.datetime, "moon.lastEvent: alan"],
    ["eksik alan (nextEvent anahtarı yok)", "2023-01-25-r002", (r) => delete gr(r, "Moon").nextEvent, "grahas[]: alan"],
    ["istenen gün değil", "2023-01-25-r002", (r) => (r.date = "2023-01-26"), "date: istenen gün değil"],
  ];
  for (const [n, k, m, e] of bad) {
    await t(`C: RED — ${n}`, () => {
      const r = proj(k, m);
      assert.equal(r.ok, false, "kabul edildi");
      if (!r.ok) assert.ok(r.errors.includes(e), r.errors.join("; "));
    });
  }
  await t("C: RED — bozuk kök / grahas dizi değil", () => {
    assert.equal(projectRoxyVedicHeliacal(null, FX["2023-01-25-r002"].opts).ok, false);
    assert.equal(projectRoxyVedicHeliacal({ date: "2023-01-25", grahas: {} }, FX["2023-01-25-r002"].opts).ok, false);
  });

  // ═══ D) Yuvarlama payı (VIS_TOL 0,05) korunur ════════════════════════════════
  await t("D: udaya td sınırın 0,03° altında (yuvarlama payı) → kabul; asta td sınırın 0,03° üstünde → kabul", () => {
    assert.ok(proj("2024-02-15-r000", (r) => (gr(r, "Moon").lastEvent.timeDegrees = 11.97)).ok);
    assert.ok(proj("2025-03-23-f001", (r) => (gr(r, "Venus").lastEvent.timeDegrees = 8.03)).ok);
  });
  await t("D: normal geçerli olay (sınıra yakın) değişmeden kabul — golden Jüpiter/Merkür", () => {
    const r = projectRoxyVedicHeliacal(structuredClone(GOLD.response), GOLD_OPTS);
    assert.ok(r.ok);
    if (r.ok) for (const g of r.technical.grahas) for (const e of [g.lastEvent, g.nextEvent]) if (e) assert.ok(e.type === "udaya" ? e.timeDegrees > e.kalamsa - 0.05 : e.timeDegrees <= e.kalamsa + 0.05);
  });

  // ═══ E) Önceden reddedilen sonuç ekran + Word/PDF modelinde aynen gösterilir ════
  await t("E: Londra 2024-02-15 — ekran paneli (SSR) Ay udaya olayını 33,42° / 12° ile gösterir; marka adı yok", () => {
    const r = proj("2024-02-15-r000");
    assert.ok(r.ok);
    if (!r.ok) return;
    const html = renderToStaticMarkup(createElement(VedicHeliacalPanel, { t: r.technical, kbLookup: null }));
    assert.match(html, /data-testid="astro-heliacal-panel"/);
    assert.equal((html.match(/data-heliacal="/g) ?? []).length, 6, "6 graha satırı");
    assert.match(html, /33,42° \/ sınır 12°/);
    assert.ok(!/roxy/i.test(html));
  });
  await t("E: Buenos Aires 2025-03-23 — Word/PDF rapor modeli Venüs (geri) asta olayını 1,28° / 8° ile yazar", () => {
    const r = proj("2025-03-23-f001");
    assert.ok(r.ok);
    if (!r.ok) return;
    const out: string[] = [];
    const b = { h: (_l: number, s: string) => out.push(s), p: (s: string) => out.push(s), kv: (rows: [string, string][]) => out.push(...rows.flat()), table: (c: string[], rows: string[][]) => out.push(...c, ...rows.flat()), bullets: (x: string[]) => out.push(...x) };
    vedicNoktaReport(b, "vedic.heliacal", r.technical as unknown as Record<string, unknown>);
    const txt = out.join("\n");
    assert.match(txt, /Venüs \(Shukra\) \(geri\)/);
    assert.match(txt, /1,28° \/ 8°/);
    assert.ok(!/eksik/.test(txt) && !/roxy/i.test(txt));
  });

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });

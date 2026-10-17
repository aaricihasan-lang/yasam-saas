/**
 * Manuel test Madde 14 + 20 — SAF birim testleri (DB/ağ YOK).
 *  14) alan başına kaynak girdileri (sıra, boş atlama, birleştirme yok), çakra girdileri, tek/çok kaynak
 *  20) sekme gruplama: Beslenme + Randevular kırılmaz grup; sıra/DOM düzeni aynen
 * Çalıştır: npx tsx scripts/manual-14-20/unit.harness.ts
 */
import { buildStoneSourcesView, chakraEntriesBySource, fieldEntriesBySource, isMultiSource } from "../../lib/dogaltas/stoneSources";
import { reportChakraEntries, reportFieldEntries } from "../../lib/dogaltas/stoneSourceReport";
import {
  CLIENT_DETAIL_TAB_DEFS,
  groupClientDetailTabs,
  visibleClientDetailTabs,
} from "../../lib/danisan/clientDetailTabs";

let pass = 0, fail = 0;
function ok(c: unknown, m: string, d: unknown = "") { if (c) pass++; else fail++; console.log(`  ${c ? "PASS" : "FAIL"} ${m}${!c && d ? " → " + JSON.stringify(d).slice(0, 300) : ""}`); }

// ── 14 ──
const stone = { primary_source_name: "Ahmet Eğitmen", physical_effects: "AAA", spiritual_effects: "   ", care: null, chakras: ["Kök Çakra"] };
const extras = [
  { id: "m", source_name: "Mehmet Eğitmen", sort_order: 1, created_at: "2026-10-02", physical_effects: "BBB", spiritual_effects: "B-ruh", chakras: null },
  { id: "k", source_name: "Kristal Şifa Kitabı", sort_order: 2, created_at: "2026-10-03", physical_effects: null, care: "K-bakım", chakras: [" ", "Kalp Çakrası"] },
];
const view = buildStoneSourcesView(stone, extras);
const phys = fieldEntriesBySource(view, "physical_effects");
ok(phys.length === 2 && phys[0]!.name === "Ahmet Eğitmen" && phys[0]!.text === "AAA" && phys[0]!.isPrimary && phys[1]!.name === "Mehmet Eğitmen" && phys[1]!.text === "BBB",
  "14: Fiziksel Etkiler → kaynak başına AYRI girdi (Ahmet AAA, Mehmet BBB), sıra korunur", phys);
ok(!phys.some((e) => e.sourceId === "k"), "14: içeriği olmayan kaynak (Kitap) girdi üretmez");
const spir = fieldEntriesBySource(view, "spiritual_effects");
ok(spir.length === 1 && spir[0]!.sourceId === "m", "14: yalnız boşluktan ibaret metin (Ahmet ruhsal) boş sayılır", spir);
ok(fieldEntriesBySource(view, "care").map((e) => e.sourceId).join() === "k", "14: Bakım yalnız Kitap'ta");
const ch = chakraEntriesBySource(view);
ok(ch.length === 2 && ch[0]!.chakras.join() === "Kök Çakra" && ch[1]!.sourceId === "k" && ch[1]!.chakras.join() === "Kalp Çakrası", "14: çakralar kaynak başına (boş çip atlanır)", ch);
ok(isMultiSource(view) && !isMultiSource(view.slice(0, 1)), "14: tek kaynakta kaynak blokları KAPALI (eski görünüm)");
const longText = "Uzun ".repeat(5000) + "SON\n  girinti  ";
const v2 = buildStoneSourcesView({ physical_effects: longText }, [{ id: "x", source_name: "X", physical_effects: "x" }]);
ok(fieldEntriesBySource(v2, "physical_effects")[0]!.text === longText, "14: metin aynen (kırpma/kısaltma yok)");
const rs = view.map((s) => ({ name: s.name, fields: s.fields }));
ok(reportFieldEntries(rs, "physical_effects").map((e) => `${e.name}:${e.text}`).join("|") === "Ahmet Eğitmen:AAA|Mehmet Eğitmen:BBB", "14: Word girdileri aynı ayrımı korur");
ok(reportChakraEntries(rs).length === 2, "14: Word çakra girdileri kaynak başına");

// ── 20 ──
const allIds = CLIENT_DETAIL_TAB_DEFS.map((t) => t.id);
const g = groupClientDetailTabs(CLIENT_DETAIL_TAB_DEFS);
ok(JSON.stringify(g.flat().map((t) => t.id)) === JSON.stringify(allIds), "20: gruplama DOM/sekme sırasını DEĞİŞTİRMEZ");
// Owner kesin sırası (2026-10-17) Beslenme ile Randevular'ı ayırdı → kırılmaz çift YOK; her sekme tek başına.
ok(g.every((x) => x.length === 1), "sekme sırası güncellemesi: gruplanan çift yok (doğal sarma)", g.map((x) => x.map((t) => t.id)));
for (const perms of [null, () => true, (k: string) => k !== "yasam_hafizasi", (k: string) => k !== "human_design"] as const) {
  const vis = visibleClientDetailTabs(perms as never);
  const gv = groupClientDetailTabs(vis);
  ok(gv.every((x) => x.length === 1) && JSON.stringify(gv.flat()) === JSON.stringify(vis),
    `izin varyantında sıra aynen, gruplama yok (${vis.length} sekme)`);
}
ok(groupClientDetailTabs([{ id: "randevular" }, { id: "beslenme" }]).every((x) => x.length === 1), "20: ters sıra / bitişik değilse gruplama yok (sessiz yeniden sıralama yok)");
ok(groupClientDetailTabs([]).length === 0, "20: boş liste güvenli");

console.log(`\nmanual-14-20 unit: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);

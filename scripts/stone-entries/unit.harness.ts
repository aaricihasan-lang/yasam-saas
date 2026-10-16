/**
 * Bilgi kaydı bazlı kaynak modeli + "Doğaltaş Önerileri" sekmesi — SAF birim testleri (DB/ağ YOK).
 * Çalıştır: npx tsx scripts/stone-entries/unit.harness.ts
 */
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { Packer } from "docx";
import { buildStoneSourcesView } from "../../lib/dogaltas/stoneSources";
import {
  buildFieldEntries,
  entrySourceSummary,
  buildAllFieldEntries,
  legacyEntryId,
  nextEntrySortOrder,
  parseLegacyEntryId,
  validateEntryPayload,
} from "../../lib/dogaltas/stoneEntries";
import { buildStoneReportDoc, type StoneReportRow } from "../../app/api/dogaltas/stones/[id]/word-report/buildStoneReport";
import { CLIENT_DETAIL_TAB_DEFS } from "../../lib/danisan/clientDetailTabs";

let pass = 0, fail = 0;
function ok(c: unknown, m: string, d: unknown = "") { if (c) pass++; else fail++; console.log(`  ${c ? "PASS" : "FAIL"} ${m}${!c && d ? " → " + JSON.stringify(d).slice(0, 300) : ""}`); }
async function docText(doc: Parameters<typeof Packer.toBuffer>[0]): Promise<string> {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  const raw = (await zip.file("word/document.xml")?.async("string")) ?? "";
  return raw.split("</w:p>").map((p) => Array.from(p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((x) => x[1]).join("")).join("\n")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

(async () => {
  const S = "11111111-1111-4111-8111-111111111111";
  const stone = { primary_source_name: "Kristal Şifa Kitabı", physical_effects: "ESKİ A. ESKİ B.\nESKİ C.", care: "   " };
  const extras = [{ id: S, source_name: "Ahmet Hoca", sort_order: 1, created_at: "2026-10-01", physical_effects: "Ahmet eski metin" }];
  const view = buildStoneSourcesView(stone, extras);
  const rows = [
    { id: "e2", field_key: "physical_effects", content: "BBB", source_name: "Mehmet Hoca", sort_order: 1, created_at: "2026-10-03" },
    { id: "e1", field_key: "physical_effects", content: "AAA", source_name: "Ahmet Hoca", sort_order: 0, created_at: "2026-10-02" },
    { id: "eX", field_key: "spiritual_effects", content: "ruhsal", source_name: "Ahmet Hoca", sort_order: 0, created_at: "2026-10-02" },
    { id: "eConv", field_key: "general_info", content: "dönüşmüş", source_name: "Kristal Şifa Kitabı", sort_order: -1000, created_at: "2026-10-05" },
    { id: "eNew", field_key: "general_info", content: "sonra eklenen", source_name: "Mehmet Hoca", sort_order: 0, created_at: "2026-10-04" },
  ];
  const phys = buildFieldEntries(view, rows, "physical_effects");
  ok(phys.map((e) => e.content).join("|") === "ESKİ A. ESKİ B.\nESKİ C.|Ahmet eski metin|AAA|BBB", "sıra: eski birincil → eski ek kaynak → yeni kayıtlar (sort_order)", phys.map((e) => e.content));
  ok(phys[0]!.legacy && phys[0]!.sourceName === "Kristal Şifa Kitabı" && phys[1]!.legacy && phys[1]!.sourceName === "Ahmet Hoca" && !phys[2]!.legacy, "eski kayıtlar işaretli + kaynakları (birincil adı / ek kaynak adı)");
  ok(phys[0]!.content.includes("\n") && phys.length === 4, "eski metin BÖLÜNMEDİ (tek kayıt)");
  ok(buildFieldEntries(view, rows, "care").length === 0, "yalnız boşluktan ibaret eski metin kayıt sayılmaz");
  const gi = buildFieldEntries(view, rows, "general_info");
  ok(gi[0]!.id === "eConv" && gi[1]!.id === "eNew", "dönüşmüş eski kayıt (sort -1000) ilk sırada kalır — düzenleme en alta atmaz");
  ok(parseLegacyEntryId(legacyEntryId("primary", "care"))?.field === "care" && parseLegacyEntryId(legacyEntryId(S, "care"))?.origin === S, "eski kayıt kimliği gidiş-dönüş");
  ok(parseLegacyEntryId("legacy:primary:chakras") === null && parseLegacyEntryId("legacy:x;drop:care") === null && parseLegacyEntryId("e1") === null, "geçersiz eski kimlikler reddedilir (yapısal alan / enjeksiyon)");
  ok(nextEntrySortOrder(phys) === 2 && nextEntrySortOrder([]) === 0 && nextEntrySortOrder([{ sortOrder: -1000 }]) === 0, "yeni kayıt sırası = max+1 (en az 0)");
  ok(!validateEntryPayload({ field_key: "chakras", content: "x", source_name: "y" }, { requireAll: true }).ok, "yapısal alan (çakra) bilgi kaydı olamaz");
  ok(!validateEntryPayload({ field_key: "care", content: "  ", source_name: "y" }, { requireAll: true }).ok, "boş metin reddedilir");
  ok(!validateEntryPayload({ field_key: "care", content: "x", source_name: " " }, { requireAll: true }).ok, "kaynak zorunlu");
  const vv = validateEntryPayload({ field_key: "care", content: "  metin\n ", source_name: "  Ahmet   Hoca " }, { requireAll: true });
  ok(vv.ok && vv.content === "  metin\n " && vv.sourceName === "Ahmet Hoca", "metin AYNEN, kaynak boşluk-normalize", vv);
  const summary = entrySourceSummary(buildAllFieldEntries(view, rows));
  ok(summary.map((x) => `${x.name}:${x.count}`).join("|") === "Kristal Şifa Kitabı:2|Mehmet Hoca:2|Ahmet Hoca:3", "kaynak özeti: kayıt sayılarıyla, ilk görülme sırası", summary);

  // ── Word ──
  const base: StoneReportRow = {
    id: "s1", tenant_id: "t", stone_name: "ADAMİN", short_description: null, general_info: null, source_note: null,
    physical_effects: "Eski fiziksel", spiritual_effects: null, other_effects: null, warning_text: null, warning_tags: null, feng_shui: null,
    meditation: null, care: null, application: null, chakras: null, assignments: null, images: null, created_at: "2026-01-01T00:00:00Z", updated_at: null,
    primary_source_name: "Kristal Şifa Kitabı",
  };
  const now = new Date("2026-10-16T10:00:00Z");
  const plain = await docText(buildStoneReportDoc({ stone: base, imageBuf: null, isLibrary: false, now }).doc);
  const plainE = await docText(buildStoneReportDoc({ stone: base, imageBuf: null, isLibrary: false, now, entries: [] }).doc);
  ok(plain === plainE && !plain.includes("•  "), "kayıt yokken Word eski düzen (boş entries ile birebir)");
  const txt = await docText(buildStoneReportDoc({ stone: base, imageBuf: null, isLibrary: false, now, entries: [
    { id: "a", field_key: "physical_effects", content: "Akciğerlere giden kan akışını iyileştirir.", source_name: "Ahmet Hoca", sort_order: 0 },
    { id: "b", field_key: "physical_effects", content: "Aktif endokrin bezlerini destekler.", source_name: "Mehmet Hoca", sort_order: 1 },
  ] }).doc);
  ok(txt.includes("•  Eski fiziksel\nKaynak: Kristal Şifa Kitabı\n•  Akciğerlere giden kan akışını iyileştirir.\nKaynak: Ahmet Hoca\n•  Aktif endokrin bezlerini destekler.\nKaynak: Mehmet Hoca"),
    "Word: Fiziksel Etkiler → her bilgi madde + hemen altında kendi kaynağı (eski metin dahil)", txt.slice(txt.indexOf("Fiziksel"), txt.indexOf("Fiziksel") + 300));
  ok(/Bilgi Kaynakları/.test(txt) && txt.includes("Kristal Şifa Kitabı · Ahmet Hoca · Mehmet Hoca"), "Word: özette kayıtlarda geçen kaynaklar");

  // ── Danışan sekmesi ──
  const tr = JSON.parse(readFileSync("messages/tr/clients.detail.json", "utf8"));
  const en = JSON.parse(readFileSync("messages/en/clients.detail.json", "utf8"));
  const find = (o: Record<string, unknown>): Record<string, string> | null => {
    for (const v of Object.values(o)) if (v && typeof v === "object") {
      const t = (v as Record<string, unknown>).tab;
      if (t && typeof t === "object" && "taslar" in (t as object)) return t as Record<string, string>;
      const r = find(v as Record<string, unknown>); if (r) return r;
    }
    return null;
  };
  ok(find(tr)?.taslar === "Doğaltaş Önerileri", "sekme etiketi TR: Doğaltaş Önerileri");
  ok(find(en)?.taslar === "Natural Stone Suggestions", "sekme etiketi EN tutarlı");
  const def = CLIENT_DETAIL_TAB_DEFS.find((t) => t.id === "taslar") as { id: string; labelKey: string; requiresModule?: string } | undefined;
  ok(def && def.labelKey === "taslar" && def.requiresModule === undefined, "sekme id / ?tab=taslar / izin AYNI (yalnız etiket değişti)");
  ok(JSON.stringify(tr).includes("📄 Taşlar Word"), "başka anlamdaki 'Taşlar' (sekme Word butonu) topluca DEĞİŞTİRİLMEDİ");

  console.log(`\nstone-entries unit: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();

/**
 * WT9 — çoklu kaynak SAF birim testleri (DB/ağ YOK): ad anahtarı (SQL ile aynı kural), doğrulama,
 * görünüm modeli, arama eşleşmesi, öneri listesi, Word belge kurucusu (gerçek DOCX metni).
 * Çalıştır: npx tsx scripts/wt9/unit.harness.ts
 */
import JSZip from "jszip";
import { Packer } from "docx";
import {
  buildStoneSourcesView,
  normalizeSourceName,
  pickSourceFields,
  sourceDisplayName,
  sourceHasContent,
  sourceMatchesQuery,
  sourceNameKey,
  uniqueSourceNames,
  validateSourcePayload,
  SOURCE_FIELD_MAX,
} from "../../lib/dogaltas/stoneSources";
import { buildStoneReportDoc, type StoneReportRow } from "../../app/api/dogaltas/stones/[id]/word-report/buildStoneReport";

let pass = 0, fail = 0;
function ok(c: unknown, m: string, d = "") { if (c) pass++; else fail++; console.log(`  ${c ? "PASS" : "FAIL"} ${m}${!c && d ? " → " + d : ""}`); }

async function docText(doc: Parameters<typeof Packer.toBuffer>[0]): Promise<string> {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  const raw = (await zip.file("word/document.xml")?.async("string")) ?? "";
  return raw.split("</w:p>").map((p) => Array.from(p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((x) => x[1]).join("")).join("\n")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

(async () => {
  // ── ad anahtarı (SQL dogaltas_source_name_key ile aynı) ──
  ok(sourceNameKey("  Kristal   Şifa KİTABI ") === sourceNameKey("kristal şifa kitabı"), "anahtar: boşluk + Türkçe büyük/küçük (İ→i)");
  ok(sourceNameKey("ISIK") === "ısık" && sourceNameKey("Işık") === "ışık", "anahtar: I→ı (Türkçe kural)");
  ok(sourceNameKey("Ahmet Hoca") !== sourceNameKey("Ahmet Hoca Notu"), "anahtar: farklı adlar ayrı");
  ok(normalizeSourceName(" a \n b ") === "a b" && normalizeSourceName(42) === "", "normalize: boşluk/tip");

  // ── doğrulama ──
  let v = validateSourcePayload({ source_name: "X", general_info: "metin", feng_shui: "   ", meditation: "", chakras: [" Kalp ", ""] }, { requireName: true });
  ok(v.ok && v.values.general_info === "metin" && v.values.feng_shui === null && v.values.meditation === null && JSON.stringify(v.values.chakras) === '["Kalp"]', "doğrulama: boş/boşluk → NULL, çakra temizlenir");
  const long = "Ş".repeat(20000);
  v = validateSourcePayload({ general_info: long }, { requireName: false });
  ok(v.ok && v.values.general_info === long, "doğrulama: uzun metin AYNEN (kısaltma yok)");
  v = validateSourcePayload({ general_info: "a".repeat(SOURCE_FIELD_MAX + 1) }, { requireName: false });
  ok(!v.ok, "doğrulama: üst sınır aşımı reddedilir");
  v = validateSourcePayload({ general_info: 5 }, { requireName: false });
  ok(!v.ok, "doğrulama: metin olmayan değer reddedilir");
  v = validateSourcePayload({}, { requireName: true });
  ok(!v.ok, "doğrulama: yeni kaynakta ad zorunlu");
  v = validateSourcePayload({ tenant_id: "x", stone_id: "y", id: "z", general_info: "ok" }, { requireName: false });
  ok(v.ok && !("tenant_id" in v.values) && !("stone_id" in v.values), "doğrulama: izinli olmayan alan (tenant/stone/id) ALINMAZ");

  // ── görünüm modeli ──
  const stone = { id: "s1", primary_source_name: null, general_info: "Birincil", chakras: ["Kök"], updated_at: "t" };
  const extras = [
    { id: "b", source_name: "B", sort_order: 2, created_at: "2026-01-02", physical_effects: "B fiz" },
    { id: "a", source_name: "A", sort_order: 1, created_at: "2026-01-03", other_effects: "A mide" },
  ];
  const view = buildStoneSourcesView(stone, extras);
  ok(view.length === 3 && view[0]!.isPrimary && view[0]!.name === null && view[1]!.name === "A" && view[2]!.name === "B", "görünüm: birincil ilk, ek kaynaklar sort_order");
  ok(sourceDisplayName(view[0]!.name) === "Kaynak belirtilmemiş", "görünüm: adsız birincil → 'Kaynak belirtilmemiş'");
  ok(view[0]!.fields.general_info === "Birincil" && view[1]!.fields.general_info === null, "görünüm: kaynak alanları karışmaz");
  ok(sourceMatchesQuery(view[1]!, "MİDE") && !sourceMatchesQuery(view[2]!, "mide"), "arama: yalnız eşleşen kaynak (Türkçe büyük harf)");
  ok(!sourceHasContent(pickSourceFields({ general_info: "  ", chakras: [] })) && sourceHasContent(pickSourceFields({ care: "x" })), "boş kaynak dolu sayılmaz");
  ok(JSON.stringify(uniqueSourceNames(["Kristal Şifa Kitabı", "kristal şifa KİTABI", null, " ", "Ahmet"])) === JSON.stringify(["Ahmet", "Kristal Şifa Kitabı"]), "öneriler: tekil + Türkçe sıralı");

  // ── Word belge kurucusu ──
  const base: StoneReportRow = {
    id: "s1", tenant_id: "t", stone_name: "Akik", short_description: null, general_info: "Birincil genel", source_note: null,
    physical_effects: null, spiritual_effects: null, other_effects: null, warning_text: null, warning_tags: null, feng_shui: null,
    meditation: null, care: null, application: null, chakras: null, assignments: null, images: null, created_at: "2026-01-01T00:00:00Z", updated_at: null,
  };
  let txt = await docText(buildStoneReportDoc({ stone: base, imageBuf: null, isLibrary: false, now: new Date("2026-10-09T10:00:00Z") }).doc);
  ok(!/KAYNAK:/.test(txt) && !/Bilgi Kaynağı/.test(txt), "Word: eski tek kaynak (adsız, ek yok) → rapor eskisiyle aynı (kaynak etiketi yok)");
  txt = await docText(buildStoneReportDoc({
    stone: { ...base, primary_source_name: "Kristal Şifa Kitabı" }, imageBuf: null, isLibrary: false, now: new Date("2026-10-09T10:00:00Z"),
    extraSources: [
      { name: "Ahmet Hoca Eğitim Notu", fields: pickSourceFields({ physical_effects: "Ahmet fiziksel " + "uzun ".repeat(3000) + "SON", chakras: ["Kalp"] }) },
      { name: "Boş Kaynak", fields: pickSourceFields({}) },
    ],
  }).doc);
  ok(txt.includes("KAYNAK: KRİSTAL ŞİFA KİTABI") && txt.includes("KAYNAK: AHMET HOCA EĞİTİM NOTU") && txt.includes("Ek Kaynak 1: Ahmet Hoca Eğitim Notu"), "Word: her kaynak kendi KAYNAK başlığıyla");
  ok(txt.indexOf("Birincil genel") < txt.indexOf("Ek Kaynak 1:") && txt.includes("SON") && txt.includes("Kalp"), "Word: birincil önce, ek kaynak metni tam (kesilmeden) + çakra");
  ok(txt.includes("Ek Kaynak 2: Boş Kaynak") && txt.includes("Bu kaynakta henüz bilgi girilmemiş."), "Word: boş kaynak açıkça belirtilir");
  ok(/Bilgi Kaynakları/.test(txt) && txt.includes("Kristal Şifa Kitabı · Ahmet Hoca Eğitim Notu · Boş Kaynak"), "Word: özet sayfasında kaynak listesi");

  console.log(`\nWT9 unit: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();

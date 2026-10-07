/**
 * Doğaltaş Mineral + Kombinasyon Word raporu — PREMIUM DÜZEN harness'ı (2026-10-07).
 *
 * Sentetik veriyle (DB yok) gerçek belge oluşturucuları çalıştırır, DOCX'i JSZip ile açar ve doğrular:
 *   - geçerli zip + document.xml parse edilir (bozuk DOCX yok),
 *   - İçindekiler DOLU: her başlık için TOC girişi; giriş sırası = gövde sırası,
 *   - her TOC girişi bir yer imine (bookmark) InternalHyperlink + PAGEREF ile bağlı; tüm yer imleri var,
 *   - başlıklar gerçek Heading stilinde (Heading2),
 *   - içerik kaybı yok: her alan değeri / her variant / kaynak / not belgede,
 *   - Türkçe karakterler korunur, updateFields açık, kapakta header/footer yok (titlePage),
 *   - eski boş TOC FIELD'ı ve "Genel Özet" bölücü sayfası YOK.
 * Opsiyonel: OUT_DIR verilirse DOCX'ler yazılır (Word COM sayfa-no doğrulaması için).
 *
 * Çalıştır: npx tsx scripts/dogaltas-word-premium-harness.ts
 */
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { Packer } from "docx";
import { buildMineralReportDocument, type MineralRow } from "../lib/dogaltas/mineralReportDoc";
import { buildCombinationReportDocument, type CombinationRow } from "../lib/dogaltas/combinationReportDoc";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { pass++; } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const OUT_DIR = process.env.OUT_DIR;
const TR = "ĞÜŞİÖÇ ğüşıöç";
const LONG = Array.from({ length: 60 }, (_, i) => `Uzun açıklama cümlesi ${i + 1} — şifa, ılık, çağ, öğün, İğne ${TR}.`).join(" ");

function xmlText(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Parsed = { doc: string; settings: string; text: string; files: string[]; buf: Buffer };
async function parse(buf: Buffer): Promise<Parsed> {
  const zip = await JSZip.loadAsync(buf);
  const doc = await zip.file("word/document.xml")!.async("string");
  const settings = (await zip.file("word/settings.xml")?.async("string")) ?? "";
  return { doc, settings, text: xmlText(doc), files: Object.keys(zip.files), buf };
}

/** Ortak premium düzen kontrolleri; TOC girişleri (anchor sırası) ile H2 yer imleri eşleşmeli. */
function commonChecks(label: string, p: Parsed, titles: string[]) {
  check(`${label}: document.xml var`, p.files.includes("word/document.xml"));
  check(`${label}: updateFields açık`, /<w:updateFields(?: w:val="(true|1)")?\/>/.test(p.settings));
  check(`${label}: titlePage (kapakta üst/alt bilgi yok)`, /<w:titlePg\/>|<w:titlePg w:val="(true|1)"\/>/.test(p.doc));
  check(`${label}: eski boş TOC alanı yok`, !/TOC \\o/.test(p.doc));
  check(`${label}: "Genel Özet" bölücü yok`, !p.text.includes("Genel Özet"));
  check(`${label}: İçindekiler başlığı var`, p.text.includes("İçindekiler"));
  check(`${label}: Rapor Özeti var`, p.text.includes("Rapor Özeti"));

  const anchors = [...p.doc.matchAll(/<w:hyperlink [^>]*w:anchor="([^"]+)"/g)].map((m) => m[1]!);
  const pagerefs = [...p.doc.matchAll(/PAGEREF ([A-Za-z0-9_]+) \\h/g)].map((m) => m[1]!);
  const bookmarks = [...p.doc.matchAll(/<w:bookmarkStart [^>]*w:name="([^"]+)"/g)].map((m) => m[1]!);
  check(`${label}: TOC giriş sayısı = başlık sayısı (${titles.length})`, anchors.length === titles.length, `anchor=${anchors.length}`);
  check(`${label}: PAGEREF sayısı = başlık sayısı`, pagerefs.length === titles.length, `pageref=${pagerefs.length}`);
  check(`${label}: PAGEREF sırası = anchor sırası`, JSON.stringify(pagerefs) === JSON.stringify(anchors));
  check(`${label}: yer imleri benzersiz`, new Set(bookmarks).size === bookmarks.length);
  const bmIds = [...p.doc.matchAll(/<w:bookmarkStart [^>]*w:id="(\d+)"/g)].map((m) => m[1]!);
  const endIds = [...p.doc.matchAll(/<w:bookmarkEnd w:id="(\d+)"/g)].map((m) => m[1]!);
  check(`${label}: yer imi w:id benzersiz (OOXML)`, new Set(bmIds).size === bmIds.length, `ids=${bmIds.length} uniq=${new Set(bmIds).size}`);
  check(`${label}: bookmarkStart/End eşleşir`, JSON.stringify(bmIds) === JSON.stringify(endIds));
  const bmSet = new Set(bookmarks);
  check(`${label}: her TOC hedefinin yer imi var`, anchors.every((a) => bmSet.has(a)), anchors.filter((a) => !bmSet.has(a)).slice(0, 3).join(","));
  check(`${label}: yer imi sırası = TOC sırası (gövde sırası)`, JSON.stringify(bookmarks.filter((b) => anchors.includes(b))) === JSON.stringify(anchors));
  check(`${label}: yer imi adları Word kuralına uygun (≤40, harfle başlar)`, bookmarks.every((b) => b.length <= 40 && /^[A-Za-z][A-Za-z0-9_]*$/.test(b)));

  // TOC giriş metinleri sırasıyla başlıklar
  const tocTitles = [...p.doc.matchAll(/<w:hyperlink [^>]*w:anchor="[^"]+"[^>]*>([\s\S]*?)<\/w:hyperlink>/g)].map((m) => xmlText(m[1]!));
  check(`${label}: TOC metinleri = başlıklar (sıra dahil)`, JSON.stringify(tocTitles) === JSON.stringify(titles),
    tocTitles.find((t, i) => t !== titles[i]) ?? "");

  // Her yer imi bir Heading2 paragrafının içinde
  const h2Paras = [...p.doc.matchAll(/<w:p>(?:(?!<\/w:p>)[\s\S])*?<w:pStyle w:val="Heading2"\/>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g)].map((m) => m[0]);
  const h2WithBm = h2Paras.filter((x) => /<w:bookmarkStart /.test(x));
  check(`${label}: her başlık gerçek Heading2 + yer imli`, h2WithBm.length === titles.length, `h2bm=${h2WithBm.length}`);
  for (const t of titles.slice(0, 400)) {
    if (!p.doc.includes(esc(t))) { check(`${label}: başlık metni belgede: ${t}`, false); break; }
  }
}

// ─── Mineral fixture'ları ───
function mineral(i: number, opts: { stones?: number; long?: boolean } = {}): MineralRow {
  const n = String(i + 1).padStart(2, "0");
  return {
    id: `m-${n}`,
    name: `ZZ_Mineral ${n} ${i % 3 === 0 ? "Çinko-İyot" : i % 3 === 1 ? "Şeker Ğ" : "Öz Ü"}`,
    kategori: i % 4 === 0 ? null : `Kategori ${i % 5} ç`,
    source_id: i % 2 ? `Kaynak ${i}` : null,
    aciklama: opts.long ? LONG : `Açıklama ${n} — ${TR}`,
    fiziksel: [`Fiziksel ${n} a`, `Fiziksel ${n} b`],
    zihinsel: [`Zihinsel ${n}`],
    fizyoloji: i % 2 ? [`Fizyoloji ${n}`] : [],
    eksiklik_belirtileri: [`Eksiklik ${n}`],
    fazlalik_belirtileri: [`Fazlalık ${n}`],
    doz_asimi: [`Doz aşımı ${n}`],
    iceren_taslar: Array.from({ length: opts.stones ?? 3 }, (_, k) => `Taş ${n}-${k + 1} %${(k * 7) % 100} Ametist`),
    organ_etkileri: [`Organ ${n}`],
    cakralar: [`Çakra ${n}`],
    created_at: "2026-10-07T09:00:00.000Z",
  } as MineralRow;
}

async function mineralCase(label: string, minerals: MineralRow[]) {
  const doc = buildMineralReportDocument(minerals, `Test (${minerals.length})`, "ZZ_Uzman Ş");
  const buf = await Packer.toBuffer(doc);
  const p = await parse(buf);
  const titles = minerals.map((m) => m.name || "İsimsiz Mineral");
  commonChecks(label, p, titles);
  // İçerik bütünlüğü: tüm alan değerleri
  const missing: string[] = [];
  for (const m of minerals) {
    const vals = [
      m.aciklama, m.kategori, m.source_id,
      ...(m.fiziksel ?? []), ...(m.zihinsel ?? []), ...(m.fizyoloji ?? []), ...(m.eksiklik_belirtileri ?? []),
      ...(m.fazlalik_belirtileri ?? []), ...(m.doz_asimi ?? []), ...(m.iceren_taslar ?? []),
      ...(m.organ_etkileri ?? []), ...(m.cakralar ?? []),
    ].filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    for (const v of vals) if (!p.text.includes(v.trim())) missing.push(`${m.name}: ${v.slice(0, 40)}`);
    const stoneCount = (m.iceren_taslar ?? []).length;
    if (stoneCount > 0 && !p.text.includes(`İçeren Taşlar (${stoneCount})`)) missing.push(`${m.name}: İçeren Taşlar (${stoneCount}) başlığı`);
  }
  check(`${label}: içerik kaybı yok`, missing.length === 0, missing.slice(0, 3).join(" | "));
  check(`${label}: Türkçe karakterler`, p.text.includes(TR));
  // Sayfa sonları: kapak→özet (1) + Mineral Kayıtları (1) + (bilgilendirme notu bölümü olabilir). Mineral başına sayfa sonu YOK.
  const breaks = (p.doc.match(/<w:pageBreakBefore\/>|<w:br w:type="page"\/>/g) ?? []).length;
  check(`${label}: mineral başına sayfa sonu yok (breaks=${breaks})`, breaks <= 4);
  if (OUT_DIR) fs.writeFileSync(path.join(OUT_DIR, `mineral-${label}.docx`), buf);
  return p;
}

// ─── Kombinasyon fixture'ları ───
function comboRows(titles: number, variantsTotal: number, opts: { longNotes?: boolean } = {}): CombinationRow[] {
  const rows: CombinationRow[] = [];
  // ilk başlıklara fazladan variant dağıt
  const extra = variantsTotal - titles;
  for (let t = 0; t < titles; t++) {
    const vcount = 1 + (t < extra ? 1 : 0) + (t === 0 && extra > titles ? extra - titles : 0);
    for (let v = 0; v < vcount; v++) {
      rows.push({
        id: `c-${t}-${v}`,
        issue: `ZZ_Kombinasyon ${String(t + 1).padStart(3, "0")} ${t % 2 ? "Uyku-Şifa" : "Ğüç İçin"}`,
        description: t % 3 === 0 ? null : `Kategori ${t % 4} ö`,
        variant_index: v,
        source: v % 2 ? null : `Kaynak ${t}-${v}`,
        stones_text: `Ametist + Kuvars ${t}-${v} (${TR})`,
        notes_text: opts.longNotes ? `${LONG} [n1-${t}-${v}]` : `Not1 ${t}-${v}`,
        notes_text_2: v % 2 ? `Not2 ${t}-${v}` : null,
        notes_text_3: t % 5 === 0 ? `Not3 ${t}-${v}` : null,
        created_at: "2026-10-07T09:00:00.000Z",
      } as CombinationRow);
    }
  }
  return rows;
}

async function comboCase(label: string, rows: CombinationRow[], mode: "all" | "selected" | "single" = "all") {
  const doc = buildCombinationReportDocument(rows, mode, mode === "single" ? rows[0]!.issue ?? "" : undefined, "ZZ_Uzman Ş");
  const buf = await Packer.toBuffer(doc);
  const p = await parse(buf);
  const titles = [...new Set(rows.map((r) => r.issue?.trim() || "İsimsiz"))].sort((a, b) => a.localeCompare(b, "tr-TR"));
  commonChecks(label, p, titles);
  const missing: string[] = [];
  for (const r of rows) {
    for (const v of [r.source, r.stones_text, r.notes_text, r.notes_text_2, r.notes_text_3, r.description]) {
      if (v && v.trim() && !p.text.includes(v.trim())) missing.push(`${r.id}: ${v.slice(0, 30)}`);
    }
  }
  check(`${label}: variant/kaynak/not kaybı yok`, missing.length === 0, missing.slice(0, 3).join(" | "));
  // Variant başlık sayısı: çok-variantlı gruplarda "Variant i/n", tekli gruplarda "Kombinasyon"
  const variantHeads = (p.text.match(/Variant \d+\/\d+/g) ?? []).length;
  const multi = titles.reduce((n, t) => {
    const c = rows.filter((r) => (r.issue?.trim() || "İsimsiz") === t).length;
    return n + (c > 1 ? c : 0);
  }, 0);
  check(`${label}: tüm variant başlıkları (${multi})`, variantHeads === multi, `bulunan=${variantHeads}`);
  check(`${label}: TOC variantlarla şişmez (giriş=${titles.length}, satır=${rows.length})`,
    (p.doc.match(/<w:hyperlink [^>]*w:anchor=/g) ?? []).length === titles.length);
  check(`${label}: Türkçe karakterler`, p.text.includes(TR));
  if (OUT_DIR) fs.writeFileSync(path.join(OUT_DIR, `combo-${label}.docx`), buf);
}

async function main() {
  if (OUT_DIR) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log("Mineral raporu…");
  await mineralCase("m1", [mineral(0)]);
  await mineralCase("m5", Array.from({ length: 5 }, (_, i) => mineral(i)));
  await mineralCase("m39", Array.from({ length: 39 }, (_, i) => mineral(i, { stones: i % 7 === 0 ? 0 : (i % 5) * 6 + 1 })));
  await mineralCase("many-stones", [mineral(0, { stones: 120 }), mineral(1, { stones: 45 })]);
  const zero = await mineralCase("zero-stones", [mineral(0, { stones: 0 }), mineral(1, { stones: 0 })]);
  check("zero-stones: İçeren Taşlar başlığı yok", !zero.text.includes("İçeren Taşlar"));
  await mineralCase("long-text", [mineral(0, { long: true }), mineral(1, { long: true, stones: 30 })]);
  await mineralCase("nameless", [{ ...mineral(0), name: "" } as MineralRow]);

  console.log("Kombinasyon raporu…");
  await comboCase("c1", comboRows(1, 1), "single");
  await comboCase("c5", comboRows(5, 9), "selected");
  await comboCase("c139", comboRows(139, 196));
  await comboCase("many-variants", comboRows(2, 30));
  await comboCase("long-notes", comboRows(4, 8, { longNotes: true }));
  await comboCase("nameless", [{ ...comboRows(1, 1)[0]!, issue: "   " } as CombinationRow, ...comboRows(2, 2)]);

  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

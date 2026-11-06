/**
 * Mineral Bankası Word raporu — örnek DOCX üretici (görsel kabul / Word render testi için).
 *
 * Kullanım: npx tsx scripts/dogaltas-mineral-word-premium/generate-samples.ts <çıktı-klasörü>
 *
 * Her senaryo gerçek oluşturucu (buildMineralReportDocument) ile DOCX üretir; ayrıca her dosya için
 * beklenen metin parçalarını (<ad>.expect.json) yazar → render betiği içerik kaybını Word çıktısında
 * da denetler. Veritabanına erişmez.
 */
import fs from "node:fs";
import path from "node:path";
import { Packer } from "docx";
import { buildMineralReportDocument, type MineralRow } from "../../lib/dogaltas/mineralReportDoc";

const OUT = process.argv[2];
if (!OUT) {
  console.error("Kullanım: generate-samples.ts <çıktı-klasörü>");
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });

const LONG =
  "Bu mineral, geleneksel kaynaklarda dengeleyici ve destekleyici bir unsur olarak anılır. " +
  "Kaynaklar, günlük yaşamda dengeli beslenme ve düzenli uyku ile birlikte değerlendirilmesini önerir. ";

function mineral(i: number, opts: { stones?: number; long?: boolean; longName?: boolean } = {}): MineralRow {
  const n = String(i + 1).padStart(3, "0");
  const variant = i % 3 === 0 ? "Çinko-İyot" : i % 3 === 1 ? "Şeker Ğ" : "Öz Ü";
  const name = opts.longName
    ? `ZZ Mineral ${n} — Uzun Adlı Örnek Kayıt Çok Uzun Bir Başlık İçin Satır Kırılımı Denemesi ${variant} ÖĞÜŞİÇ`
    : `ZZ Mineral ${n} ${variant}`;
  const k = opts.long ? 9 : 3;
  const list = (p: string) => Array.from({ length: k }, (_, j) => `${p} ${n}-${j + 1}${opts.long ? " — " + LONG.slice(0, 90) : ""}`);
  return {
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    name,
    aciklama: opts.long ? `${name} açıklaması. ` + LONG.repeat(10) : `${name} için kısa açıklama (İ/ı/ğ/ü/ş/ö/ç).`,
    kategori: i % 4 === 3 ? null : ["Makro Mineral", "İz Element", "Ağır Metal Dışı Öğe"][i % 3]!,
    source_id: `zz-mineral-${n}`,
    fiziksel: list("Fiziksel"),
    zihinsel: list("Zihinsel"),
    fizyoloji: list("Fizyoloji"),
    eksiklik_belirtileri: list("Eksiklik"),
    fazlalik_belirtileri: list("Fazlalık"),
    doz_asimi: list("Doz aşımı"),
    iceren_taslar: Array.from({ length: opts.stones ?? 6 }, (_, j) => `Taş ${n}-${j + 1}`),
    organ_etkileri: list("Organ"),
    cakralar: ["Kalp Çakrası", "Taç Çakra"],
    created_at: "2026-11-06T11:17:35.931844+00:00",
  };
}

/** Owner'ın canlıdan indirdiği belgenin içeriğine denk sentetik kayıt (yalnız ad + açıklama dolu). */
const OWNER_EQUIV: MineralRow = {
  id: "00000000-0000-4000-8000-0000000000aa",
  name: "ametist test",
  aciklama: "Deneme açıklaması",
  kategori: null,
  source_id: "ametist-test",
  fiziksel: [], zihinsel: [], fizyoloji: [], eksiklik_belirtileri: [], fazlalik_belirtileri: [],
  doz_asimi: [], iceren_taslar: [], organ_etkileri: [], cakralar: [],
  created_at: "2026-11-06T11:17:35.931844+00:00",
};

const TR_ROW: MineralRow = {
  ...mineral(0, { stones: 5 }),
  name: "İĞÜŞÖÇ ığüşöç Iİ — TÜRKÇE KARAKTER DENEMESİ",
  aciklama: "Çok önemli: ŞİMDİLİK İĞNE, ÜZÜM, ÖĞLE, ÇİĞDEM; küçük harf: ığüşöç. Noktasız I ve noktalı İ ayrı korunmalı.",
  kategori: "Özel Kategori İĞÜŞÖÇ",
  fiziksel: ["Işık duyarlılığı", "İştah düzensizliği"],
  zihinsel: ["Odaklanma güçlüğü (ÇĞÜŞÖİ)"],
  cakralar: ["Üçüncü Göz", "Boğaz Çakrası"],
};

const SPARSE: MineralRow[] = [
  { ...OWNER_EQUIV, id: "00000000-0000-4000-8000-0000000000b1", name: "Yalnız Ad Dolu", aciklama: null, source_id: null, created_at: null },
  { ...OWNER_EQUIV, id: "00000000-0000-4000-8000-0000000000b2", name: "", aciklama: "Adı boş kayıt", source_id: "bos-ad" },
  { ...mineral(2, { stones: 0 }), fiziksel: null, zihinsel: [], fizyoloji: null, doz_asimi: null, kategori: null },
];

const CASES: [string, MineralRow[], string][] = [
  ["00-owner-esdeger", [OWNER_EQUIV], "Tüm Mineraller"],
  ["01-tek-kisa", [mineral(0)], "Seçili Mineraller"],
  ["02-tek-uzun", [mineral(0, { long: true, stones: 24 })], "Seçili Mineraller"],
  ["03-iki", [mineral(0), mineral(1)], "Seçili Mineraller"],
  ["04-bes", Array.from({ length: 5 }, (_, i) => mineral(i)), "Filtrelenmiş Sonuçlar"],
  ["05-otuz", Array.from({ length: 30 }, (_, i) => mineral(i, { stones: (i % 5) * 4 })), "Tüm Mineraller"],
  ["06-yuzyirmi", Array.from({ length: 120 }, (_, i) => mineral(i, { stones: i % 9 })), "Tüm Mineraller"],
  ["07-uzun-ad-metin", [mineral(0, { longName: true, long: true, stones: 40 }), mineral(1, { longName: true, long: true })], "Seçili Mineraller"],
  ["08-turkce", [TR_ROW], "Seçili Mineraller"],
  ["09-bos-alanlar", SPARSE, "Seçili Mineraller"],
];

function expectedTexts(rows: MineralRow[]): string[] {
  const out: string[] = [];
  for (const m of rows) {
    out.push(m.name || "İsimsiz Mineral");
    if (m.aciklama?.trim()) out.push(m.aciklama.trim().slice(0, 60));
    if (m.kategori) out.push(m.kategori);
    if (m.source_id) out.push(m.source_id);
    for (const k of ["fiziksel", "zihinsel", "fizyoloji", "eksiklik_belirtileri", "fazlalik_belirtileri", "doz_asimi", "iceren_taslar", "organ_etkileri", "cakralar"] as const) {
      for (const v of m[k] ?? []) out.push(String(v).slice(0, 40));
    }
  }
  return out;
}

(async () => {
  for (const [name, rows, label] of CASES) {
    const doc = buildMineralReportDocument(rows, label, "ZZ Uzman Şİ");
    const buf = await Packer.toBuffer(doc);
    fs.writeFileSync(path.join(OUT, `${name}.docx`), buf);
    fs.writeFileSync(path.join(OUT, `${name}.expect.json`), JSON.stringify({ count: rows.length, label, texts: expectedTexts(rows) }));
    console.log(`${name}: ${rows.length} mineral, ${buf.length} bayt`);
  }
})();

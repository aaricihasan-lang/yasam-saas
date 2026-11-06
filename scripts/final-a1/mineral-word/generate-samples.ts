/**
 * TEK MİNERAL (Mineral Detayı → Word) raporu — örnek DOCX üretici (Word render / görsel kabul için).
 *
 * Kullanım: npx tsx scripts/final-a1/mineral-word/generate-samples.ts <çıktı-klasörü>
 * Sonra:    powershell -File scripts/dogaltas-mineral-word-premium/render-check.ps1 -Dir <klasör> -Pdf
 *
 * Her senaryo gerçek oluşturucu (buildMineralDetailDocument) ile DOCX üretir ve beklenen metinleri
 * (<ad>.expect.json) yazar → render betiği içerik kaybını Word metninde de denetler. DB'ye erişmez.
 */
import fs from "node:fs";
import path from "node:path";
import { Packer } from "docx";
import { buildMineralDetailDocument, type MineralRow } from "../../../app/api/dogaltas/minerals/[id]/word-report/mineralDetailDoc";

const OUT = process.argv[2];
if (!OUT) {
  console.error("Kullanım: generate-samples.ts <çıktı-klasörü>");
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });

const SENT =
  "Geleneksel kaynaklarda dengeleyici ve destekleyici bir unsur olarak anılır; dengeli beslenme ve düzenli uyku ile birlikte değerlendirilmesi önerilir. ";
const EMPTY = {
  fiziksel: [], zihinsel: [], fizyoloji: [], eksiklik_belirtileri: [], fazlalik_belirtileri: [],
  doz_asimi: [], iceren_taslar: [], organ_etkileri: [], cakralar: [],
};

function full(opts: { long?: boolean; stones?: number; name?: string } = {}): MineralRow {
  const k = opts.long ? 8 : 3;
  const list = (p: string) => Array.from({ length: k }, (_, j) => `${p} ${j + 1}${opts.long ? " — " + SENT.slice(0, 110) : ""}`);
  return {
    id: "00000000-0000-4000-8000-000000000101",
    name: opts.name ?? "Magnezyum",
    aciklama: opts.long ? SENT.repeat(14) : "Kas, sinir ve enerji metabolizmasında görev alan makro mineral.",
    kategori: "Makro Mineral",
    source_id: "magnezyum",
    fiziksel: list("Fiziksel"),
    zihinsel: list("Zihinsel"),
    fizyoloji: list("Fizyoloji"),
    eksiklik_belirtileri: list("Eksiklik"),
    fazlalik_belirtileri: list("Fazlalık"),
    doz_asimi: list("Doz aşımı"),
    iceren_taslar: Array.from({ length: opts.stones ?? 8 }, (_, j) => `Taş ${j + 1}`),
    organ_etkileri: list("Organ"),
    cakralar: ["Kalp Çakrası", "Solar Pleksus"],
    created_at: "2026-11-06T11:17:35.931844+00:00",
  };
}

const OWNER_EQUIV: MineralRow = {
  id: "00000000-0000-4000-8000-0000000000aa", name: "ametist test", aciklama: "Deneme açıklaması",
  kategori: null, source_id: "ametist-test", ...EMPTY, created_at: "2026-11-06T11:17:35.931844+00:00",
};
const LIVE_EQUIV: MineralRow = {
  id: "00000000-0000-4000-8000-0000000000bb", name: "ZZ DT KABUL 0611 MİNERAL-1",
  aciklama: "ZZ DT KABUL 0611 test kaydı — owner onaylı canlı kabul. SİLMEYİN (kalıcı test).",
  kategori: "ZZ DT KABUL KATEGORİ-A", source_id: "zz-dt-kabul-0611-mineral-1", ...EMPTY,
  fiziksel: ["Zzkabulfiz eklem ağrısı"], zihinsel: ["Zzkabulzih odaklanma"], fizyoloji: ["Zzkabulfizyo İÇGÜDÜ dengesi"],
  iceren_taslar: ["ZZKABULTAŞ AMETRİN"], created_at: "2026-11-06T12:05:00.000000+00:00",
};
const SHORT: MineralRow = {
  ...OWNER_EQUIV, id: "00000000-0000-4000-8000-0000000000cc", name: "Çinko", kategori: "İz Element", source_id: "cinko",
  aciklama: "Bağışıklık ve doku onarımında görev alır.", fiziksel: ["Cilt sağlığı", "Yara iyileşmesi"],
  zihinsel: ["Odak"], iceren_taslar: ["Sfalerit", "Smitsonit"], cakralar: ["Kök Çakra"],
};
const TR_ROW: MineralRow = {
  ...full({ stones: 5 }),
  name: "İĞÜŞÖÇ ığüşöç Iİ — TÜRKÇE KARAKTER DENEMESİ",
  aciklama: "Çok önemli: ŞİMDİLİK İĞNE, ÜZÜM, ÖĞLE, ÇİĞDEM; küçük harf: ığüşöç. Noktasız I ve noktalı İ ayrı korunmalı.",
  kategori: "Özel Kategori İĞÜŞÖÇ",
  fiziksel: ["Işık duyarlılığı", "İştah düzensizliği"],
  zihinsel: ["Odaklanma güçlüğü (ÇĞÜŞÖİ)"],
  cakralar: ["Üçüncü Göz", "Boğaz Çakrası"],
};
const NAME_ONLY: MineralRow = {
  ...OWNER_EQUIV, id: "00000000-0000-4000-8000-0000000000dd", name: "Yalnız Ad Dolu", aciklama: null,
  source_id: null, created_at: null,
};

const CASES: [string, MineralRow][] = [
  ["00-owner-esdeger", OWNER_EQUIV],
  ["01-canli-test-esdeger", LIVE_EQUIV],
  ["02-kisa", SHORT],
  ["03-tum-alanlar", full()],
  ["04-uzun", full({ long: true, stones: 24 })],
  ["05-uzun-ad", full({ long: true, name: "Magnezyum — Uzun Adlı Örnek Kayıt Çok Uzun Bir Başlık İçin Satır Kırılımı Denemesi ÖĞÜŞİÇ" })],
  ["06-turkce", TR_ROW],
  ["07-bos-alanlar", NAME_ONLY],
  ["08-altmis-tas", full({ stones: 60 })],
];

function expectedTexts(m: MineralRow): string[] {
  const out = [m.name || "İsimsiz Mineral"];
  if (m.aciklama?.trim()) out.push(m.aciklama.trim().slice(0, 60));
  if (m.kategori) out.push(m.kategori);
  if (m.source_id) out.push(m.source_id);
  for (const k of ["fiziksel", "zihinsel", "fizyoloji", "eksiklik_belirtileri", "fazlalik_belirtileri", "doz_asimi", "iceren_taslar", "organ_etkileri", "cakralar"] as const) {
    for (const v of m[k] ?? []) out.push(String(v).slice(0, 40));
  }
  return out;
}

(async () => {
  for (const [name, m] of CASES) {
    const buf = await Packer.toBuffer(buildMineralDetailDocument(m, "ZZ Uzman Şİ"));
    fs.writeFileSync(path.join(OUT, `${name}.docx`), buf);
    fs.writeFileSync(path.join(OUT, `${name}.expect.json`), JSON.stringify({ texts: expectedTexts(m) }));
    console.log(`${name}: ${buf.length} bayt`);
  }
})();

/**
 * DONDURULMUŞ ESKİ DÜZEN (main 43501e86, app/api/dogaltas/minerals/[id]/word-report/route.ts L118–190).
 * YALNIZ regresyon karşılaştırması için: yeni oluşturucu, eskinin yazdığı HER alan etiketini/değerini
 * yazmaya devam etmeli (veri kaybı yok). Üretimde KULLANILMAZ.
 */
import { Document } from "docx";
import {
  arraySection,
  bodyText,
  buildFooter,
  buildWellnessNoteSection,
  buildPremiumCover,
  buildStatsPage,
  buildTOCPage,
  h1Colored,
  h2,
  muted,
  profileLabel,
  ReportChild,
  twoColTable,
} from "../../../lib/docx/reportHelpers";
import { formatInstantDate, reportGeneratedLabel } from "../../../lib/time/reportTime";
import { countFilledArrays, type MineralRow } from "../../../app/api/dogaltas/minerals/[id]/word-report/mineralDetailDoc";

const C_MINERAL = "064e3b";

export function buildLegacyMineralDetailDocument(mineral: MineralRow, expertName: string | null): Document {
  const mineralName = mineral.name || "İsimsiz Mineral";
  const today = reportGeneratedLabel();
  const filledArrays = countFilledArrays(mineral);

  const all: ReportChild[] = [];
  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   mineralName.toLocaleUpperCase("tr-TR"),
    subtitle: "Mineral Detay Raporu",
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Mineral Adı",    value: mineralName },
      { label: "Kategori",       value: mineral.kategori || "Belirtilmemiş" },
      { label: "Kaynak",         value: mineral.source_id || "Belirtilmemiş" },
      { label: "Dolu Bölüm",    value: `${filledArrays} / 9` },
      { label: "İçeren Taş",    value: String(mineral.iceren_taslar?.length ?? 0) },
    ],
  }));
  all.push(...buildStatsPage([
    ["Mineral Adı",    mineralName],
    ["Kategori",       mineral.kategori || "Belirtilmemiş"],
    ["Kaynak",         mineral.source_id || "Belirtilmemiş"],
    ["Dolu Bölüm",    `${filledArrays} / 9`],
    ["İçeren Taş",    String(mineral.iceren_taslar?.length ?? 0)],
    ["Kayıt Tarihi",  formatInstantDate(mineral.created_at, { fallback: "-" })],
  ]));
  all.push(...buildTOCPage());
  all.push(profileLabel("BÖLÜM 1", C_MINERAL));
  all.push(h1Colored("1. Genel Bilgiler", C_MINERAL, true));
  all.push(twoColTable([
    ["Mineral Adı", mineralName],
    ["Kategori",    mineral.kategori || "Belirtilmemiş"],
    ["Kaynak",      mineral.source_id || "Belirtilmemiş"],
    ["Kayıt Tarihi", formatInstantDate(mineral.created_at, { fallback: "-" })],
  ]));
  if (mineral.aciklama?.trim()) {
    all.push(h2("Açıklama"));
    all.push(bodyText(mineral.aciklama.trim()));
  }
  all.push(h1Colored("2. Mineral Özellikleri", C_MINERAL));
  all.push(...arraySection("Fiziksel Özellikler",   mineral.fiziksel));
  all.push(...arraySection("Zihinsel Etkiler",       mineral.zihinsel));
  all.push(...arraySection("Fizyoloji",              mineral.fizyoloji));
  all.push(...arraySection("Eksiklik Belirtileri",   mineral.eksiklik_belirtileri));
  all.push(...arraySection("Fazlalık Belirtileri",   mineral.fazlalik_belirtileri));
  all.push(...arraySection("Doz Aşımı",              mineral.doz_asimi));
  all.push(...arraySection("İçeren Taşlar",          mineral.iceren_taslar));
  all.push(...arraySection("Organ Etkileri",         mineral.organ_etkileri));
  all.push(...arraySection("Çakralar",               mineral.cakralar));
  if (filledArrays === 0 && !mineral.aciklama?.trim()) {
    all.push(muted("Bu mineral kaydında henüz içerik girilmemiş."));
  }
  all.push(...buildWellnessNoteSection("dogaltas", expertName));

  return new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter(`Mineral Raporu · ${mineralName}`, { note: "dogaltas" }) },
      children: all,
    }],
  });
}

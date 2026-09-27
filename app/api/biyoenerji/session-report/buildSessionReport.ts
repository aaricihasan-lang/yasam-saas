/**
 * Biyoenerji Seans Word raporu — SAF belge kurucusu (DB/ağ YOK → harness gerçek DOCX test eder).
 * FA-02: created_at timestamptz → Europe/Istanbul (lib/time/reportTime); dosya adı yerel gün.
 * FA-16: sade "Bilgilendirme" notu (footer + rapor sonu) + "Hazırlayan".
 */
import { Document } from "docx";
import {
  bodyText,
  buildFooter,
  buildPremiumCover,
  buildStatsPage,
  buildTOCPage,
  buildWellnessNoteSection,
  divider,
  h1Colored,
  h2,
  h3,
  muted,
  profileLabel,
  ReportChild,
  spacer,
  twoColTable,
} from "@/lib/docx/reportHelpers";
import { formatInstantDateTime, reportFileDate, reportGeneratedLabel } from "@/lib/time/reportTime";

const C_SEANS = "ea580c"; // biyoenerji turuncu

export type BioSessionExportMode = "all" | "selected" | "single";

export type BioSessionRow = {
  id: string;
  tenant_id: string;
  title: string | null;
  content: string | null;
  category: string | null;
  source: string | null;
  note: string | null;
  created_at: string;
};

function slugify(t: string): string {
  return t.toLowerCase()
    .replace(/ı/g,"i").replace(/İ/g,"i").replace(/ğ/g,"g").replace(/Ğ/g,"g")
    .replace(/ü/g,"u").replace(/Ü/g,"u").replace(/ş/g,"s").replace(/Ş/g,"s")
    .replace(/ö/g,"o").replace(/Ö/g,"o").replace(/ç/g,"c").replace(/Ç/g,"c")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
}

export function buildBioSessionReportDoc(input: {
  sessions: BioSessionRow[];
  exportMode: BioSessionExportMode;
  truncatedNote?: string | null;
  expertName?: string | null;
  now?: Date;
}): { doc: Document; filename: string } {
  const { sessions, exportMode } = input;
  const now = input.now ?? new Date();
  const today = reportGeneratedLabel(undefined, now);
  const dateSlug = reportFileDate(undefined, now);
  const isSingle = exportMode === "single" || (exportMode === "selected" && sessions.length === 1);

  const exportLabel =
    isSingle ? `Tek Seans — ${sessions[0]?.title || ""}` :
    exportMode === "selected" ? `Seçili Seanslar (${sessions.length})` :
    `Tüm Seanslar (${sessions.length})`;

  const categories = new Set(sessions.map((s) => s.category?.trim()).filter(Boolean));

  const all: ReportChild[] = [];

  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "BİYOENERJİ SEANSLARI",
    subtitle: isSingle && sessions[0]
      ? `${sessions[0].title || "Seans"} · Seans Raporu`
      : "Biyoenerji Seans Kataloğu",
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Seans Sayısı",  value: String(sessions.length) },
      { label: "Kategori",      value: String(categories.size) },
      { label: "Kapsam",        value: exportLabel },
    ],
  }));

  all.push(...buildStatsPage([
    ["Seans Sayısı",  String(sessions.length)],
    ["Kategori",      String(categories.size)],
    ["Kapsam",        exportLabel],
  ]));

  all.push(...buildTOCPage());

  if (input.truncatedNote) all.push(muted(input.truncatedNote));

  all.push(h1Colored("1. Seans Listesi", C_SEANS, true));
  all.push(muted(`${sessions.length} seans kaydı`));
  all.push(spacer());

  sessions.forEach((session, i) => {
    const title = session.title?.trim() || "Başlıksız Seans";

    if (i > 0) all.push(divider());

    all.push(profileLabel(`SEANS #${String(i + 1).padStart(3, "0")}`, C_SEANS));
    all.push(h2(title));

    all.push(twoColTable([
      ["Tarih",     formatInstantDateTime(session.created_at, { fallback: session.created_at })],
      ["Kategori",  session.category?.trim() || "Belirtilmemiş"],
      ...(session.source?.trim() ? [["Kaynak", session.source.trim()] as [string, string]] : []),
    ]));

    if (session.content?.trim()) {
      all.push(h3("İçerik / Uygulama Notları"));
      all.push(bodyText(session.content.trim()));
    }

    if (session.note?.trim()) {
      all.push(h3("Not"));
      all.push(bodyText(session.note.trim()));
    }
  });

  // FA-16: sade bilgilendirme notu + Hazırlayan (rapor sonu).
  all.push(...buildWellnessNoteSection("biyoenerji", input.expertName));

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter("Biyoenerji Seans Raporu · Yaşam Sistemi", { note: "biyoenerji" }) },
      children: all,
    }],
  });

  const modeSlug =
    isSingle && sessions[0]?.title ? slugify(sessions[0].title) :
    exportMode === "selected" ? "secili" : "tumu";
  return { doc, filename: `biyoenerji-seans-${modeSlug}-${dateSlug}.docx` };
}

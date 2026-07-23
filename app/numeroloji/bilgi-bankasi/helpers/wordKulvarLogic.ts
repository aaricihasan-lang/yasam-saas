/**
 * NKB-V2-E — Admin Bilgi Bankası Word çıktısı için SAF mantık (docx/DB yok; harness ile test).
 * Ana/Yan Kulvar bölüm sırası KANONİK şablondur (kullanıcı order'ına körü körüne bırakılmaz).
 * internal_note hiçbir çıktı fonksiyonuna girmez.
 */
import { KULVAR_SECTION_TEMPLATE, validateKulvarSections } from "./knowledgeSections";
import { pageDisplay, sectionKeyLabel } from "./sourceUiLogic";
import type { NumerologySourceRow, RecordSourceRow } from "./sourcesApi";

export type WordSection = { label: string; body: string };

/**
 * Word için Kulvar bölümleri: KANONİK sıra (overview→constructive→negative→destructive),
 * yalnız boş olmayan body'ler. content_sections geçerli ve en az bir dolu bölüm varsa canonical
 * odur (legacy description EKLENMEZ). Aksi halde legacy description yalnız "Genel Açıklama".
 */
export function kulvarSectionsForWord(record: {
  content_sections?: unknown;
  description?: string | null;
}): WordSection[] {
  const v = validateKulvarSections(record.content_sections);
  if (v.ok) {
    const byKey = new Map(v.sections.map((s) => [s.key, s.body]));
    const out: WordSection[] = [];
    for (const t of KULVAR_SECTION_TEMPLATE) {
      const body = byKey.get(t.key);
      if (typeof body === "string" && body.trim() !== "") out.push({ label: t.label, body });
    }
    if (out.length > 0) return out;
    // content_sections geçerli ama tümü boş → legacy fallback'e düş.
  }
  const desc = record.description ?? "";
  if (desc.trim() !== "") return [{ label: "Genel Açıklama", body: desc }];
  return [];
}

export type RecordSourceView = {
  displayLabel: string;
  title: string | null;
  page: string; // "" ise gösterme
  locator: string | null;
  sectionLabel: string; // "" ise (Tüm kayıt) gösterme
  isPrimary: boolean;
};

/** Kayıt-altı kaynak görünümü. internal_note KESİNLİKLE yok. section_key=null → etiket "". */
export function recordSourceView(link: RecordSourceRow, source: NumerologySourceRow | null): RecordSourceView {
  return {
    displayLabel: source?.display_label ?? "(kaynak bulunamadı)",
    title: source?.title ?? null,
    page: pageDisplay(link),
    locator: link.locator,
    sectionLabel: link.section_key === null ? "" : sectionKeyLabel(link.section_key),
    isPrimary: link.is_primary,
  };
}

/** Kayıt-altı kaynak ana satırı (display_label + birincil + kapsam + sayfa + locator). */
export function recordSourceMainLine(view: RecordSourceView): string {
  const parts: string[] = [view.displayLabel];
  if (view.isPrimary) parts.push("(Birincil kaynak)");
  if (view.sectionLabel) parts.push(`— ${view.sectionLabel}`);
  if (view.page) parts.push(`— ${view.page}`);
  if (view.locator) parts.push(`— ${view.locator}`);
  return parts.join(" ");
}

/**
 * Belge-sonu kaynakça kaynakları: yalnız verilen bağlantılarda geçen source_id'ler,
 * her source_id BİR kez, deterministik sıra (display_label → title → id).
 * Yalnız yapılandırılmış numerology_sources kayıtları (legacy source dahil DEĞİL).
 */
export function buildBibliography(
  links: RecordSourceRow[],
  sources: NumerologySourceRow[],
): NumerologySourceRow[] {
  const usedIds = new Set(links.map((l) => l.source_id));
  const byId = new Map(sources.map((s) => [s.id, s]));
  const picked: NumerologySourceRow[] = [];
  const seen = new Set<string>();
  for (const id of usedIds) {
    if (seen.has(id)) continue;
    const s = byId.get(id);
    if (s) {
      seen.add(id);
      picked.push(s);
    }
  }
  return picked.sort((a, b) => {
    const dl = a.display_label.localeCompare(b.display_label, "tr-TR");
    if (dl !== 0) return dl;
    const t = (a.title ?? "").localeCompare(b.title ?? "", "tr-TR");
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });
}

/** Kaynakça maddesi ayrıntısı: yalnız MEVCUT alanlar (uydurma yok, "Bilinmiyor" yok). */
export function bibliographyDetail(s: NumerologySourceRow): string {
  const parts: string[] = [];
  if (s.authors && s.authors.trim()) parts.push(s.authors.trim());
  if (s.title && s.title.trim()) parts.push(s.title.trim());
  if (s.organization && s.organization.trim()) parts.push(s.organization.trim());
  if (s.source_type && s.source_type.trim()) parts.push(s.source_type.trim());
  if (s.level_or_edition && s.level_or_edition.trim()) parts.push(s.level_or_edition.trim());
  if (s.publication_year !== null && s.publication_year !== undefined) parts.push(String(s.publication_year));
  if (s.language && s.language.trim()) parts.push(s.language.trim());
  return parts.join(" · ");
}

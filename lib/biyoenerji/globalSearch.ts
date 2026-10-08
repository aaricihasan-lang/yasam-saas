/**
 * Biyoenerji — modül-içi GENEL arama (WT5). SAF çekirdek: sunucu route'u ve testler kullanır.
 *
 * Yeni modül/yeni veri DEĞİL: mevcut 6 Biyoenerji bölümünün KENDİ (tenant) kayıtlarında arar.
 * Tenant izolasyonu route'ta (session tenant_id ile `.eq("tenant_id", …)`); bu dosya DB'ye erişmez.
 *
 * Türkçe eşleşme iki adımlıdır:
 *   1) DB ön-süzgeci (ilike): Türkçe harf çiftleri (c/ç, g/ğ, i/ı/İ/I, o/ö, s/ş, u/ü) "_" joker
 *      karakterine çevrilir → prod collation (en_US) 'MİDE' ILIKE '%mide%' = false sorununa takılmayan
 *      GENİŞ bir aday kümesi.
 *   2) Kesin süzgeç (JS, normalizeTr): büyük/küçük harf + Türkçe karakter katlamalı "içerir" kontrolü
 *      → "mide" = "MİDE" = "Mide", "cakra" = "Çakra". Ön-süzgecin fazladan getirdikleri burada düşer.
 */
import { normalizeTr } from "@/lib/text/turkishSearch";

export const BIO_GLOBAL_SEARCH_MIN = 2;
export const BIO_GLOBAL_SEARCH_MAX = 100;
/** Bölüm başına DB'den çekilen aday üst sınırı (ön-süzgeç sonrası). */
export const BIO_GLOBAL_CANDIDATE_LIMIT = 400;
/** Bölüm başına gösterilen sonuç üst sınırı (toplam eşleşme ayrıca döner). */
export const BIO_GLOBAL_RESULT_LIMIT = 25;

export type BioGlobalSection = {
  key: "cakralar" | "enerji-bedenleri" | "bilincalti-sebepleri" | "seanslar" | "imajinasyonlar" | "sembol-dili";
  label: string;
  resource: string;
  table: string;
  /** Kayıt başlığı kolonu. */
  titleCol: string;
  /** Aranan anlamlı metin kolonları (başlık dahil; sistem/teknik kolon YOK). */
  fields: readonly string[];
  /** Alan → kullanıcıya görünen ad (eşleşen alan etiketi). */
  fieldLabels: Readonly<Record<string, string>>;
};

const BASE = "/dashboard/biyoenerji";

export const BIO_GLOBAL_SECTIONS: readonly BioGlobalSection[] = [
  {
    key: "cakralar", label: "Çakralar", resource: "chakras", table: "bioenergy_chakras", titleCol: "name",
    fields: ["name", "sanskrit_name", "organs", "glands", "color", "element", "location", "stones", "causes", "physical", "mental", "notes"],
    fieldLabels: { name: "Ad", sanskrit_name: "Sanskritçe ad", organs: "Organlar", glands: "Bezler", color: "Renk", element: "Element", location: "Konum", stones: "Taşlar", causes: "Nedenler", physical: "Fiziksel", mental: "Zihinsel", notes: "Notlar" },
  },
  {
    key: "enerji-bedenleri", label: "Enerji Bedenleri", resource: "energy-bodies", table: "bioenergy_energy_bodies", titleCol: "source_uid",
    fields: ["source_uid", "genel_tanim", "gorevi", "bozulma", "onerilen_taslar", "not_text"],
    fieldLabels: { source_uid: "Ad", genel_tanim: "Genel tanım", gorevi: "Görevi", bozulma: "Bozulma", onerilen_taslar: "Önerilen taşlar", not_text: "Not" },
  },
  {
    key: "bilincalti-sebepleri", label: "Bilinçaltı Sebepleri", resource: "subconscious-causes", table: "bioenergy_subconscious_causes", titleCol: "title",
    fields: ["title", "category", "content", "note_text"],
    fieldLabels: { title: "Başlık", category: "Kategori", content: "İçerik", note_text: "Not" },
  },
  {
    key: "seanslar", label: "Biyoenerji Seansları", resource: "sessions", table: "bioenergy_sessions", titleCol: "title",
    fields: ["title", "category", "content", "source", "note"],
    fieldLabels: { title: "Başlık", category: "Kategori", content: "İçerik", source: "Kaynak", note: "Not" },
  },
  {
    key: "imajinasyonlar", label: "İmajinasyonlar", resource: "imaginations", table: "bioenergy_imaginations", titleCol: "title",
    fields: ["title", "category", "text", "notes", "source"],
    fieldLabels: { title: "Başlık", category: "Kategori", text: "Metin", notes: "Notlar", source: "Kaynak" },
  },
  {
    key: "sembol-dili", label: "Sembol Dili", resource: "symbols", table: "bioenergy_symbols", titleCol: "symbol",
    fields: ["symbol", "title", "category", "meaning", "source"],
    fieldLabels: { symbol: "Sembol", title: "Başlık", category: "Kategori", meaning: "Anlam", source: "Kaynak" },
  },
];

/** Kullanıcı terimini temizler (PostgREST or() / ilike'ı bozacak karakterler çıkar). Geçersizse "". */
export function cleanBioGlobalQuery(raw: string | null | undefined): string {
  const q = (raw ?? "")
    .replace(/[,()*%\\_:"'.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, BIO_GLOBAL_SEARCH_MAX);
  return normalizeTr(q).trim().length >= BIO_GLOBAL_SEARCH_MIN ? q : "";
}

const TR_PAIR_LETTERS = /[cçgğiıİIoösşuüCÇGĞOÖSŞUÜ]/g;

/** DB ön-süzgeç ilike deseni (Türkçe harf çiftleri "_"). */
export function bioPrefilterPattern(cleanQuery: string): string {
  return `%${cleanQuery.replace(TR_PAIR_LETTERS, "_")}%`;
}

function text(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** Eşleşen yerin çevresinden kısa önizleme (normalizeTr uzunluk korur: tek harf → tek harf). */
export function snippetAround(value: string, foldedNeedle: string, radius = 70): string {
  const clean = value.replace(/\s+/g, " ").trim();
  const folded = normalizeTr(clean);
  const at = folded.indexOf(foldedNeedle);
  if (at < 0 || folded.length !== clean.length) return clean.slice(0, radius * 2) + (clean.length > radius * 2 ? "…" : "");
  const start = Math.max(0, at - radius);
  const end = Math.min(clean.length, at + foldedNeedle.length + radius);
  return (start > 0 ? "…" : "") + clean.slice(start, end) + (end < clean.length ? "…" : "");
}

export type BioGlobalHit = {
  section: BioGlobalSection["key"];
  sectionLabel: string;
  id: string;
  title: string;
  matchedField: string;
  matchedFieldLabel: string;
  snippet: string;
  href: string;
};

/** Sonuca dokununca gidilecek yer: detay rotası olan bölümlerde kayıt, diğerlerinde bölüm + arama. */
export function bioHitHref(section: BioGlobalSection["key"], id: string, title: string): string {
  const enc = encodeURIComponent(id);
  switch (section) {
    case "cakralar":
    case "bilincalti-sebepleri":
    case "imajinasyonlar":
    case "sembol-dili":
      return `${BASE}/${section}/${enc}`;
    case "enerji-bedenleri":
    case "seanslar":
      return `${BASE}/${section}?q=${encodeURIComponent(title)}`;
  }
}

/** Kesin Türkçe-katlamalı eşleşme; başlık önce, sonra diğer alanlar. Eşleşme yoksa null. */
export function matchBioRow(sec: BioGlobalSection, row: Record<string, unknown>, cleanQuery: string): BioGlobalHit | null {
  const needle = normalizeTr(cleanQuery).trim();
  if (!needle) return null;
  const id = text(row.id);
  if (!id) return null;
  const title = text(row[sec.titleCol]).trim() || text(row.title).trim() || "(adsız kayıt)";
  for (const f of sec.fields) {
    const v = text(row[f]);
    if (v && normalizeTr(v).includes(needle)) {
      return {
        section: sec.key,
        sectionLabel: sec.label,
        id,
        title,
        matchedField: f,
        matchedFieldLabel: sec.fieldLabels[f] ?? f,
        snippet: f === sec.titleCol ? "" : snippetAround(v, needle),
        href: bioHitHref(sec.key, id, title),
      };
    }
  }
  return null;
}

/** Başlık eşleşmeleri önce, sonra Türkçe alfabetik. */
export function sortBioHits(hits: BioGlobalHit[], sec: BioGlobalSection): BioGlobalHit[] {
  return [...hits].sort((a, b) => {
    const at = a.matchedField === sec.titleCol ? 0 : 1;
    const bt = b.matchedField === sec.titleCol ? 0 : 1;
    return at - bt || a.title.localeCompare(b.title, "tr");
  });
}

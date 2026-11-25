// Klasik Numeroloji · gösterim yardımcıları (saf).

export function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
export function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
export function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
export function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}
export function numList(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number" && Number.isFinite(x)) : [];
}

const TR_DATE = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Istanbul" });
const TR_DATETIME = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
// Kaynak dil dışı (EN) gösterim: en-GB (gün/ay/yıl). `locale` verilmez ya da "tr" ise TR yolu AYNEN kalır.
const EN_DATE = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Istanbul" });
const EN_DATETIME = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
const isEn = (locale?: string) => !!locale && locale !== "tr";

/** ISO zaman damgası → 29.10.2026 (EN: 29/10/2026) */
export function fmtDate(iso: string | null | undefined, locale?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : (isEn(locale) ? EN_DATE : TR_DATE).format(d);
}
export function fmtDateTime(iso: string | null | undefined, locale?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : (isEn(locale) ? EN_DATETIME : TR_DATETIME).format(d);
}
/** YYYY-MM-DD (takvim günü, saat dilimi yok) → GG.AA.YYYY (EN: GG/AA/YYYY) */
export function fmtIsoDay(iso: string | null | undefined, locale?: string): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  const sep = isEn(locale) ? "/" : ".";
  return m ? `${m[3]}${sep}${m[2]}${sep}${m[1]}` : "—";
}
export function fmtBirth(b: unknown, locale?: string): string {
  const r = rec(b);
  const y = num(r?.year);
  const m = num(r?.month);
  const d = num(r?.day);
  if (y === null || m === null || d === null) return "—";
  const sep = isEn(locale) ? "/" : ".";
  return `${String(d).padStart(2, "0")}${sep}${String(m).padStart(2, "0")}${sep}${y}`;
}

export const KIND_LABELS: Readonly<Record<string, string>> = Object.freeze({
  person: "Kişi analizi",
  relationship: "İlişki analizi",
  business: "İşletme adı",
  names: "İsim seçenekleri",
});

export const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/** Kayıttaki başarısız teknik etiketleri → Türkçe ad. */
export const TECHNIQUE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  core: "Pisagor çekirdek harita",
  chart: "Pisagor çekirdek harita",
  bridge: "Köprü sayıları",
  personal_day: "Kişisel gün",
  daily: "Günün sayısı (sembolik)",
  chaldean: "Kalde (Cheiro)",
  dual: "İki sistem karşılaştırması",
  compatibility: "Numerolojik uyum",
  business_name: "İşletme adı (Kalde)",
});

export function techniqueLabel(label: string): string {
  const m = /^dual#(\d+)$/.exec(label);
  if (m) return `${m[1]}. aday ad`;
  return TECHNIQUE_LABELS[label] ?? "Bir teknik";
}

/** Çeviri işlevi (next-intl `t`, "numerology.classic.fmt" kapsamında) — saf yardımcıya parametre olarak geçer. */
export type FmtTranslator = (key: string, values?: Record<string, string | number>) => string;
const KIND_KEYS = new Set(["person", "relationship", "business", "names"]);
/** Analiz türü kodu (kanonik, DEĞİŞMEZ) → katalog gösterimi (TR değerleri KIND_LABELS ile birebir). */
export function kindLabelI18n(kind: string, t: FmtTranslator): string {
  return KIND_KEYS.has(kind) ? t(`kinds.${kind}`) : t("kindFallback");
}
/** techniqueLabel ile aynı kural, metin katalogdan (TR değerleri TECHNIQUE_LABELS ile birebir; etiket kodu kanonik). */
export function techniqueLabelI18n(label: string, t: FmtTranslator): string {
  const m = /^dual#(\d+)$/.exec(label);
  if (m) return t("candidate", { n: m[1] });
  return Object.prototype.hasOwnProperty.call(TECHNIQUE_LABELS, label) ? t(`techniques.${label}`) : t("techniqueFallback");
}
/** Ay adı (1–12): TR yolu MONTHS_TR; diğer dillerde Intl en-GB. */
export function monthName(month: number, locale?: string): string {
  if (!isEn(locale)) return MONTHS_TR[month - 1] ?? "";
  if (!Number.isInteger(month) || month < 1 || month > 12) return "";
  return new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, month - 1, 1)));
}

/** Sağlayıcı izindeki İngilizce adım adlarını Türkçeye yaklaştırır (yalnız gösterim; değer değişmez). */
export function trTrace(s: string): string {
  return s
    .replace(/\bMonth\b/g, "Ay")
    .replace(/\bDay\b/g, "Gün")
    .replace(/\bYear\b/g, "Yıl")
    .replace(/\bVowels\b/g, "Sesliler")
    .replace(/\bConsonants\b/g, "Sessizler")
    .replace(/\bLife Path\b/g, "Yaşam Yolu")
    .replace(/\bExpression\b/g, "İfade")
    .replace(/\bSoul Urge\b/g, "Ruh Güdüsü")
    .replace(/\bPersonality\b/g, "Kişilik");
}

/** Bugün (Europe/Istanbul) YYYY-MM-DD */
export function istanbulToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** GG.AA.YYYY ya da YYYY-MM-DD → {year, month, day} | null (takvim kontrolü çağıranda). */
export function parseTrDate(s: string): { year: number; month: number; day: number } | null {
  const t = s.trim();
  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(t);
  if (m) return { year: Number(m[3]), month: Number(m[2]), day: Number(m[1]) };
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  return null;
}
export function toIso(d: { year: number; month: number; day: number }): string {
  return `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

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

/** ISO zaman damgası → 29.10.2026 */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : TR_DATE.format(d);
}
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : TR_DATETIME.format(d);
}
/** YYYY-MM-DD (takvim günü, saat dilimi yok) → GG.AA.YYYY */
export function fmtIsoDay(iso: string | null | undefined): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "—";
}
export function fmtBirth(b: unknown): string {
  const r = rec(b);
  const y = num(r?.year);
  const m = num(r?.month);
  const d = num(r?.day);
  if (y === null || m === null || d === null) return "—";
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
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

/**
 * NUMEROLOJİ — GİZLİLİK ÇEKİRDEĞİ: kronolojik görünürlük için DOĞUM TARİHİ ÇÖZÜCÜ (I18N-0003 / I18N-0007).
 *
 * "Gelecek yılları gizleme" kararının dayandığı doğum yılı/tarihi TEK yerden, DİLDEN BAĞIMSIZ ve
 * FAIL-CLOSED biçimde çözülür. Sunucu gizlemesi (futureYearsRedaction), ekran/düz metin
 * (chronoCutoff, numerolojiPlainMetin, görsel rapor), Numeroloji Word'ü ve danışan Word bölümü bu
 * fonksiyonu kullanır.
 *
 * Kaynak önceliği (karar METİNDEN DEĞİL YAPIDAN):
 *   1) Kayıt alanı `numerology_records.birth_date` (yapısal; NUM-F01 ile kayıtta motorla doğrulanır).
 *   2) Yalnız ESKİ kayıt / kayıt alanı verilmeyen çağrı geri dönüşü: motor snapshot metnindeki
 *      "Doğum Tarihi:" satırı (etiket eşlemesi TR + EN; dil değişse de karar değişmez).
 *   3) Çapraz doğrulama (yapısal): Harflerin Yankılanışı segmentlerinde `yearStart − ageStart`
 *      (motor: yearStart = doğum yılı + ageStart). Gizli yer tutucular (REDACTED_*) hesaba katılmaz.
 *
 * FAIL-CLOSED: kaynak yok → "missing"; bozuk/takvim dışı → "invalid"; kaynaklar birbiriyle çelişir →
 * "conflict". Bu durumlarda çağıranlar kronolojik dönemleri GİZLER (hiçbir zaman "tümünü göster" yok).
 * Tek gevşetme: kayıt alanı okunamıyor (eski serbest biçim) ama snapshot metni İLE harf segmentleri
 * aynı yılı veriyorsa (iki bağımsız snapshot kaynağı birbirini doğruluyorsa) snapshot tarihi kullanılır.
 *
 * Hesap DEĞİŞMEZ: motor çağrılmaz, formül yok; yalnız mevcut değerler okunur. DB/snapshot mutate edilmez.
 */
import { parseBirthDate } from "@/lib/numeroloji";
import { parseBirthDateFlexible } from "./numerolojiInput";

/** Yaşam süresi dışı yaş: "bu dönem gizli" yer tutucusu (birthYear + 999 > her sınır yılı). */
export const REDACTED_FUTURE_AGE = 999;
/** Gizli ana mücadele konusu yer tutucusu (geçerli konular 0–8). */
export const REDACTED_TOPIC = -1;
/** Gizli takvim yılı yer tutucusu (her sınır yılından büyük). */
export const REDACTED_FUTURE_YEAR = 9999;

/** Gelecek Yıllar yetkisi AÇIK iken kullanılan sınır yılı (chronoCutoff.CHRONO_NO_LIMIT_YEAR ile aynı). */
export const CHRONO_UNLIMITED_YEAR = 9999;

/** Yer tutucu yaş mı? (gerçek bir sonuç değildir; hiçbir yüzeyde gösterilmez) */
export function isRedactedAge(v: unknown): boolean {
  return typeof v === "number" && v >= REDACTED_FUTURE_AGE;
}
/** Yer tutucu takvim yılı mı? */
export function isRedactedYear(v: unknown): boolean {
  return typeof v === "number" && v >= REDACTED_FUTURE_YEAR;
}
/** Yer tutucu konu mu? */
export function isRedactedTopic(v: unknown): boolean {
  return v === REDACTED_TOPIC;
}

/**
 * Motor metnindeki doğum tarihi satırının ETİKETLERİ (dilden bağımsız tanıma; karar bu metne bağlı DEĞİL).
 * TR: motorun bugün ürettiği başlık. EN: olası çeviri/yeni kayıt başlıkları.
 */
// i18n-ignore: motor snapshot'ındaki kanonik başlık (DB'de saklı metin) — çevrilmez, yalnız tanınır.
export const BIRTH_DATE_TEXT_LABELS = ["Doğum Tarihi", "Date of Birth", "Birth Date", "Birthdate"] as const;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LABEL_ALT = BIRTH_DATE_TEXT_LABELS.map(escapeRe).join("|");
/** Etiket + iki nokta + değer (satır sonuna kadar). Büyük/küçük harf duyarsız. */
const BIRTH_LINE_RE = new RegExp(`(?:${LABEL_ALT})\\s*:\\s*([^\\n\\r]+)`, "i");
const BIRTH_LINE_FULL_RE = new RegExp(`(?:${LABEL_ALT})\\s*:\\s*[^\\n\\r]+`, "i");

/** Snapshot metninden doğum satırının KENDİSİNİ (etiket dahil) döndürür; yoksa "". Sunucu gizlemesi kullanır. */
export function birthLineOf(text: unknown): string {
  const m = String(text ?? "").match(BIRTH_LINE_FULL_RE);
  return m ? m[0].trim() : "";
}

/** Snapshot metninden ham doğum tarihi değerini (ör. "14.02.1987") döndürür; yoksa null. */
export function birthValueOf(text: unknown): string | null {
  if (typeof text !== "string" || !text) return null;
  const v = text.match(BIRTH_LINE_RE)?.[1]?.trim();
  return v ? v : null;
}

export type BirthParts = { day: number; month: number; year: number };

/** Ham değer → takvim doğrulamalı parçalar (ISO veya TR ailesi). Geçersiz → null. */
export function parseBirthValue(raw: unknown): BirthParts | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const flex = parseBirthDateFlexible(s);
  if (flex) return flex;
  const legacy = parseBirthDate(s);
  return legacy ? { day: legacy.day, month: legacy.month, year: legacy.year } : null;
}

/** Motor snapshot'ının metin alanları (yalnız okunur). */
export const CHRONO_BIRTH_TEXT_KEYS = [
  "degisimDonusumMetni",
  "zirveYillariMetni",
  "mucadeleYillariMetni",
  "elementlerMetni",
  "harflerinYankilanisiMetni",
] as const;

type SourceRead =
  | { status: "none" }
  | { status: "ok"; parts: BirthParts }
  | { status: "invalid" }
  | { status: "conflict" };

const samePart = (a: BirthParts, b: BirthParts) => a.day === b.day && a.month === b.month && a.year === b.year;

/** ESKİ KAYIT GERİ DÖNÜŞÜ: tüm snapshot metinlerindeki doğum satırları; hepsi aynı tarihi vermeli. */
export function birthFromLegacyText(motor: unknown): SourceRead {
  if (!motor || typeof motor !== "object") return { status: "none" };
  const m = motor as Record<string, unknown>;
  let found: BirthParts | null = null;
  let any = false;
  for (const k of CHRONO_BIRTH_TEXT_KEYS) {
    const v = birthValueOf(m[k]);
    if (v === null) continue;
    any = true;
    const p = parseBirthValue(v);
    if (!p) return { status: "invalid" };
    if (found && !samePart(found, p)) return { status: "conflict" };
    found = p;
  }
  if (found) return { status: "ok", parts: found };
  return any ? { status: "invalid" } : { status: "none" };
}

/** YAPISAL çapraz doğrulama: harf segmentlerinden doğum yılı (yearStart − ageStart). Tutarsız → conflict. */
export function birthYearFromHarf(motor: unknown): { status: "none" } | { status: "ok"; year: number } | { status: "conflict" } {
  if (!motor || typeof motor !== "object") return { status: "none" };
  const segs = (motor as Record<string, unknown>).harflerinYankilanisi;
  if (!Array.isArray(segs)) return { status: "none" };
  let year: number | null = null;
  for (const s of segs) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const ys = o.yearStart;
    const as = o.ageStart;
    if (typeof ys !== "number" || typeof as !== "number" || !Number.isFinite(ys) || !Number.isFinite(as)) continue;
    if (isRedactedYear(ys) || isRedactedAge(as)) continue;
    const y = ys - as;
    if (year !== null && year !== y) return { status: "conflict" };
    year = y;
  }
  return year === null ? { status: "none" } : { status: "ok", year };
}

export type ChronoBirthSource = "record" | "legacy-text";
export type ChronoBirthFailure = "missing" | "invalid" | "conflict";
export type ChronoBirth =
  | { ok: true; day: number; month: number; year: number; source: ChronoBirthSource; /** "GG.AA.YYYY" (motor girişi biçimi) */ engineText: string }
  | { ok: false; reason: ChronoBirthFailure };

const pad2 = (n: number) => String(n).padStart(2, "0");
const okBirth = (p: BirthParts, source: ChronoBirthSource): ChronoBirth => ({
  ok: true,
  day: p.day,
  month: p.month,
  year: p.year,
  source,
  engineText: `${pad2(p.day)}.${pad2(p.month)}.${p.year}`,
});

/**
 * Kronolojik görünürlük kararı için doğum tarihi. `recordBirthDate`: kaydın yapısal `birth_date` alanı
 * (yoksa / bilinmiyorsa null-undefined → yalnız eski kayıt metin geri dönüşü denenir).
 */
export function resolveChronoBirth(motor: unknown, recordBirthDate?: unknown): ChronoBirth {
  const hasRecord = typeof recordBirthDate === "string" && recordBirthDate.trim() !== "";
  const rec = hasRecord ? parseBirthValue(recordBirthDate) : null;
  const txt = birthFromLegacyText(motor);
  const harf = birthYearFromHarf(motor);

  if (txt.status === "conflict" || harf.status === "conflict") return { ok: false, reason: "conflict" };

  if (rec) {
    // Yapısal kayıt alanı birincil; snapshot kaynakları VARSA onunla aynı olmalı (değilse belirsiz → kapalı).
    if (txt.status === "invalid") return { ok: false, reason: "conflict" };
    if (txt.status === "ok" && !samePart(txt.parts, rec)) return { ok: false, reason: "conflict" };
    if (harf.status === "ok" && harf.year !== rec.year) return { ok: false, reason: "conflict" };
    return okBirth(rec, "record");
  }

  if (hasRecord) {
    // Kayıt alanı DOLU ama okunamıyor (eski serbest biçim): yalnız iki bağımsız snapshot kaynağı
    // (metin + harf segmentleri) aynı yılı veriyorsa snapshot tarihi kullanılır; aksi halde kapalı.
    if (txt.status === "ok" && harf.status === "ok" && harf.year === txt.parts.year) return okBirth(txt.parts, "legacy-text");
    return { ok: false, reason: "invalid" };
  }

  // Kayıt alanı verilmemiş (eski çağrı / kaydedilmemiş hesap): yalnız eski kayıt metin geri dönüşü.
  if (txt.status === "invalid") return { ok: false, reason: "invalid" };
  if (txt.status === "ok") {
    if (harf.status === "ok" && harf.year !== txt.parts.year) return { ok: false, reason: "conflict" };
    return okBirth(txt.parts, "legacy-text");
  }
  return { ok: false, reason: "missing" };
}

/** Doğum yılı (çözülemezse null → çağıran FAIL-CLOSED davranır). */
export function chronoBirthYear(motor: unknown, recordBirthDate?: unknown): number | null {
  const b = resolveChronoBirth(motor, recordBirthDate);
  return b.ok ? b.year : null;
}

/** Sınır yılı "sınırsız" mı (Gelecek Yıllar yetkisi açık)? */
export function isUnlimitedYear(limitYear: number): boolean {
  return limitYear >= CHRONO_UNLIMITED_YEAR;
}

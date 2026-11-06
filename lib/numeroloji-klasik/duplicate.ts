/**
 * Klasik Numeroloji — mükerrer KİŞİ analizi tespiti (SAF; ağ / DB yok; sunucu + istemci ortak).
 *
 * Aynı ad soyad + tam doğum tarihiyle kaydedilmiş kişi analizlerini bulur. Yalnız UYARI içindir:
 * kayıt engellenmez, birleştirilmez, üzerine yazılmaz (Bütüncül D2 / #721 deneyimiyle aynı ilke).
 *
 * Normalizasyon (bilinçli olarak dar; canonicalName ile aynı ön işlem):
 *   • Unicode NFC; ’ ʼ → ' ; ardışık boşluk tek boşluk; baş/son boşluk atılır.
 *   • Büyük/küçük harf Türkçe kurala göre katlanır (tr-TR): "IŞIK" = "Işık", "İLKER" = "ilker".
 *   • Ç/C, Ş/S, Ğ/G, Ö/O, Ü/U, İ/I ve I/ı AYRI harflerdir — eşitlenmez. Tire, nokta, kesme korunur.
 *   • Doğum tarihi yıl/ay/gün sayısal ve birebir karşılaştırılır.
 */
import { canonicalName, isUuid, validateBirth, type BirthDate, type Validation } from "./input";

/** Uyarıda gösterilen en çok eşleşme (toplam ayrıca bildirilir). */
export const CLASSIC_DUPLICATE_MAX = 20;

export type ClassicDuplicateCheck = { fullName: string; birth: BirthDate; excludeId: string | null };

export type ClassicDuplicateMatch = { id: string; title: string; fullName: string; birth: BirthDate; createdAt: string };

export type ClassicDuplicateRow = { id: string; title: string | null; input: unknown; created_at: string };

/** Ad soyad karşılaştırma anahtarı. Metin değilse "". */
export function normalizeClassicFullName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.normalize("NFC").replace(/[’ʼ]/g, "'").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");
}

function isIntPart(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

/** Kayıtlı kişi girdisinden doğum tarihi (eksik / bozuk → null; eşleşme üretmez). */
export function birthOfInput(input: unknown): BirthDate | null {
  const b = (input as { birth?: unknown } | null)?.birth as Partial<BirthDate> | null | undefined;
  if (!b || !isIntPart(b.year) || !isIntPart(b.month) || !isIntPart(b.day)) return null;
  return { year: b.year, month: b.month, day: b.day };
}

/** Kayıtlı kişi girdisinden ad soyad (yoksa null). */
export function fullNameOfInput(input: unknown): string | null {
  const n = (input as { fullName?: unknown } | null)?.fullName;
  return typeof n === "string" && n.trim() ? n : null;
}

export function sameBirth(a: BirthDate, b: BirthDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/**
 * Aynı ad soyad + doğum tarihine sahip kişi analizleri (en yeni önce). `excludeId` (düzenlenen kaynak kayıt)
 * sonuçtan çıkarılır. Girdi boşsa boş liste (yanlış pozitif yok).
 */
export function findClassicDuplicates(rows: readonly ClassicDuplicateRow[] | null | undefined, check: ClassicDuplicateCheck): ClassicDuplicateMatch[] {
  const name = normalizeClassicFullName(check.fullName);
  if (!name || !Array.isArray(rows)) return [];
  const out: ClassicDuplicateMatch[] = [];
  for (const r of rows) {
    if (!r || typeof r.id !== "string" || (check.excludeId && r.id.toLowerCase() === check.excludeId.toLowerCase())) continue;
    const fullName = fullNameOfInput(r.input);
    const birth = birthOfInput(r.input);
    if (!fullName || !birth || normalizeClassicFullName(fullName) !== name || !sameBirth(birth, check.birth)) continue;
    out.push({ id: r.id, title: typeof r.title === "string" ? r.title : "", fullName, birth, createdAt: String(r.created_at ?? "") });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

/** POST /analyses/mukerrer gövdesi: { fullName, birth, excludeId? } — başka alan kabul edilmez. */
export function validateDuplicateCheck(body: unknown): Validation<ClassicDuplicateCheck> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, code: "INVALID_BODY", error: "Geçersiz istek gövdesi." };
  const o = body as Record<string, unknown>;
  const extra = Object.keys(o).find((k) => k !== "fullName" && k !== "birth" && k !== "excludeId");
  if (extra) return { ok: false, code: "UNKNOWN_FIELD", error: "Beklenmeyen alan.", field: extra };
  const n = canonicalName(o.fullName, "fullName");
  if (!n.ok) return n;
  const b = validateBirth(o.birth, "birth");
  if (!b.ok) return b;
  const ex = o.excludeId;
  if (ex !== undefined && ex !== null && !isUuid(ex)) return { ok: false, code: "INVALID_ID", error: "Geçersiz kayıt kimliği.", field: "excludeId" };
  return { ok: true, value: { fullName: n.value, birth: b.value, excludeId: typeof ex === "string" ? ex.toLowerCase() : null } };
}

/** "GG.AA.YYYY" gösterimi. */
export function formatBirthTr(b: BirthDate): string {
  return `${String(b.day).padStart(2, "0")}.${String(b.month).padStart(2, "0")}.${b.year}`;
}

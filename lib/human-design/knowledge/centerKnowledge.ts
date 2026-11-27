// HD-UZMAN-01 — Merkez Bilgi Bankası kayıtları: kesin kayıt önceliği + eski genel kayıt uyumluluğu (SAF).
//
//   • Kesin kodlar: merkez_tanimli_{c} · merkez_tanimsiz_{c} · merkez_tam_acik_{c}
//   • Eski genel kod: merkez_acik_{c} — eski sistemde Tanımsız + Açık birlikte. Kodu/içeriği DEĞİŞMEZ.
//   • Aynı eşleşme sonucunda bir merkez için kesin Tanımsız/Açık kaydı VARSA o merkezin eski genel
//     kaydı elenir → çelişkili / mükerrer yorum oluşmaz. Kesin kayıt yoksa eski genel kayıt döner ve
//     ekranda "eski genel kayıt" notuyla gösterilir (kesin durum gibi GÖSTERİLMEZ).

const PRECISE_UNDEFINED_OPEN = /^merkez_(?:tanimsiz|tam_acik)_([a-z_]+)$/;
const LEGACY = /^merkez_acik_([a-z_]+)$/;
const GENERAL = /^merkez_genel_[a-z_]+$/;

/** Genel merkez kaydı mı (merkez_genel_*)? Durumdan bağımsız genel bilgi — haritayla eşleşmez. */
export function isGeneralCenterKnowledgeCode(code: unknown): boolean {
  return typeof code === "string" && GENERAL.test(code);
}

/** Genel merkez başlığı seçildiğinde / düzenlendiğinde gösterilen bilgilendirme (Owner metni, birebir). */
export const HD_GENERAL_CENTER_NOTE =
  "Bu kayıt genel bilgi ve eğitim notları içindir. Danışan haritasıyla otomatik eşleşmez ve otomatik raporlara dahil edilmez.";

/** Genel merkez kaydında "Bilgi ve Açıklamalar" yardımı — Word'e ekleme cümlesi olmadan (rapora girmez). */
export const HD_GENERAL_CENTER_CONTENT_HELP =
  "Bu merkez hakkında eğitimlerinizden, kitaplarınızdan ve kendi çalışmalarınızdan edindiğiniz bilgileri yazabilirsiniz.";

/**
 * Genel merkez kayıtlarını (merkez_genel_*) eler; sıra korunur. Aktif olsalar bile otomatik harita
 * eşleşmesine, otomatik yoruma ve danışan raporuna (Word/PDF) GİRMEZLER — istek hangi kodları
 * isterse istesin sunucu okuma katmanı bu kayıtları döndürmez.
 */
export function excludeGeneralCenterKnowledge<T extends { code?: unknown }>(rows: readonly T[]): T[] {
  return rows.filter((r) => !isGeneralCenterKnowledgeCode(r.code));
}

/** Eski genel merkez kaydı mı (merkez_acik_*)? */
export function isLegacyCenterKnowledgeCode(code: unknown): boolean {
  return typeof code === "string" && LEGACY.test(code);
}

export const HD_LEGACY_CENTER_NOTE =
  "Eski genel kayıt — Tanımsız ve Açık merkez ayrımı yapılmadan yazılmıştır.";

/** Kesin kayıt bulunan merkezlerin eski genel kayıtlarını eler; sıra korunur. */
export function dedupeCenterKnowledge<T extends { code?: unknown }>(rows: readonly T[]): T[] {
  const precise = new Set<string>();
  for (const r of rows) {
    const m = typeof r.code === "string" ? PRECISE_UNDEFINED_OPEN.exec(r.code) : null;
    if (m) precise.add(m[1]);
  }
  if (precise.size === 0) return [...rows];
  return rows.filter((r) => {
    const m = typeof r.code === "string" ? LEGACY.exec(r.code) : null;
    return !(m && precise.has(m[1]));
  });
}

/**
 * Görünen başlık. Eski genel kaydın başlığı eski seçenekten otomatik yazılmış "Açık — {merkez}" ise
 * kesin Açık durumu gibi görünmesin diye "Tanımlı Değil (Tanımsız/Açık genel) — {merkez}" gösterilir.
 * DB'deki başlık DEĞİŞMEZ; uzmanın kendi yazdığı başlık olduğu gibi kalır.
 */
export function hdKnowledgeDisplayTitle(code: unknown, title: string): string {
  if (!isLegacyCenterKnowledgeCode(code)) return title;
  const m = /^Açık\s+—\s+(.+)$/.exec(title.trim());
  return m ? `Tanımlı Değil (Tanımsız/Açık genel) — ${m[1]}` : title;
}

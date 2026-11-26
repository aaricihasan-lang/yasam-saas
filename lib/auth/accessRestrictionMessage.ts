/**
 * ÜYE PASİFLEŞTİRME F7 — kişiye özel üyelik uyarısı SAF çekirdeği (istemci + sunucu ortak; IO YOK).
 *
 * Owner kararları (26.11.2026): mesaj YALNIZ uzmanın ana sayfa kırmızı üyelik uyarısında gösterilir; üst sınır 500 karakter;
 * düz metin (HTML işlenmez); mesajlaşma sistemine gönderilmez. DB eşi: supabase/migrations/20280127000000_member_access_message.sql
 * (member_access_message_normalize ile BİREBİR aynı kural — sunucu önce burada doğrular, DB yeniden doğrular).
 */

export const ACCESS_MESSAGE_MAX = 500 as const;

/** Owner'ın matbu (hazır) mesajları — yalnız istemcide seçim içindir; DB'ye son metin yazılır. */
export const ACCESS_MESSAGE_PRESETS = [
  {
    id: "trial_ended",
    label: "Deneme süresi bitti",
    text: "Deneme süreniz sona ermiştir. Ücretli üyelik hakkında bilgi almak için lütfen sistem yöneticimizle iletişime geçiniz.",
  },
  {
    id: "payment_ended",
    label: "Ödeme süresi bitti",
    text: "Üyelik ödeme süreniz sona ermiştir. Sistemi kullanmaya devam edebilmek için lütfen sistem yöneticimizle iletişime geçiniz.",
  },
  {
    id: "payment_overdue",
    label: "Gecikmiş ödeme",
    text: "Gecikmiş üyelik ödemeleriniz bulunmaktadır. Lütfen sistem yöneticimizle iletişime geçiniz.",
  },
] as const;

export type AccessMessageResult = { ok: true; value: string | null } | { ok: false; error: string };

// Satır sonu (\n) dışındaki C0 kontrol karakterleri + DEL. (\t ve \r önce dönüştürülür.)
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0001-\u0008\u000B-\u001F\u007F]/;

/**
 * DB member_access_message_normalize ile aynı: \r\n / \r → \n, sekme → boşluk, baş/son boşluk ve satır sonu kırpılır;
 * boş → null; kontrol karakteri veya 500'den uzun → hata. Karakter sayımı kod noktasıdır (PostgreSQL char_length ile aynı).
 */
export function normalizeAccessMessage(input: unknown): AccessMessageResult {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false, error: "Uyarı metni geçersiz." };
  const v = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\t/g, " ").replace(/^[ \n]+|[ \n]+$/g, "");
  if (v === "") return { ok: true, value: null };
  if (CONTROL_RE.test(v) || v.includes("\u0000")) return { ok: false, error: "Uyarı metninde izin verilmeyen karakter var." };
  if (accessMessageLength(v) > ACCESS_MESSAGE_MAX) return { ok: false, error: `Uyarı metni en fazla ${ACCESS_MESSAGE_MAX} karakter olabilir.` };
  return { ok: true, value: v };
}

/** Karakter sayısı (kod noktası) — sayaç ve sınır aynı ölçüyü kullanır. */
export function accessMessageLength(s: string): number {
  return Array.from(s).length;
}

/** Metin bir hazır mesajla birebir aynıysa onun kimliği; değilse null (düzenlenmiş / özel). */
export function presetIdOf(text: string | null | undefined): string | null {
  if (!text) return null;
  return ACCESS_MESSAGE_PRESETS.find((p) => p.text === text)?.id ?? null;
}

/** İstemci kaydından (profil) gösterilecek kişiye özel uyarı: yalnız kısıtlıyken ve geçerli metinse. */
export function accessRestrictionMessageOf(row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return null;
  const restricted = row.access_restricted_at !== null && row.access_restricted_at !== undefined && String(row.access_restricted_at).trim() !== "";
  if (!restricted) return null;
  const m = row.access_restriction_message;
  if (typeof m !== "string") return null;
  const n = normalizeAccessMessage(m);
  return n.ok ? n.value : null;
}

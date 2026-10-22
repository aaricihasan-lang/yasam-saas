/**
 * Danışan genel bilgi sürümü — iyimser eşzamanlılık (CAS) için içerik özeti (yalnız sunucu).
 *
 * AŞAMA 2 / D1 (DY-03): PATCH /api/clients/[id] koşulsuzdu → iki sekme/cihazda açık genel bilgi
 * formu birbirinin değişikliğini sessizce eziyordu. client_notes'taki `notlar_version` deseninin
 * aynısı (lib/danisan/notesPatch.ts): sürüm, Genel Bilgi formunun YAZDIĞI alanların sha256 özetidir.
 * Şema/trigger/migration GEREKTİRMEZ (prod'da updated_at bakımının varlığına bağlı değildir).
 *  - `gorusme` sürüme girmez: Genel Bilgi formu onu yazmaz (randevu akışı yazar) → yanlış çakışma yok.
 *  - `base_version` GÖNDERMEYEN eski istemci CAS'sız kabul edilir (geriye uyumlu).
 * Kalan risk: okuma–yazma arası milisaniyelik pencere atomik değildir (atomiklik için koşullu
 * RPC/updated_at migration'ı gerekir — ayrı onay).
 */
import { createHash } from "node:crypto";

export const CLIENT_VERSION_FIELDS = ["ad", "soyad", "telefon", "dogum", "kan", "mizac"] as const;

export const CLIENT_CONFLICT_MESSAGE =
  "Danışan bilgileri başka bir sekmede veya cihazda değişti. Güncel bilgiler yüklendi; kontrol edip yeniden kaydedin.";

function norm(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s === "" ? null : s;
}

/** Satırın Genel Bilgi sürümü (null ve "" aynı kabul edilir). */
export function clientVersion(row: Record<string, unknown> | null | undefined): string {
  const src = row ?? {};
  const canonical = CLIENT_VERSION_FIELDS.map((k) => [k, norm(src[k])]);
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

/** Gövdedeki `base_version` (yoksa/biçimsizse null → CAS'sız eski davranış). */
export function readBaseVersion(body: Record<string, unknown> | null | undefined): string | null {
  const v = body?.base_version;
  return typeof v === "string" && /^[0-9a-f]{64}$/.test(v) ? v : null;
}

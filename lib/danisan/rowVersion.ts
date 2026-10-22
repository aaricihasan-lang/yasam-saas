/**
 * DY-03 (AŞAMA 2) — Danışan alt kayıtları (seans / taş / ödev / analiz) için ATOMİK satır sürümü CAS.
 *
 * Şema: migration 20271120000000_dy_subrecord_row_version.sql her tabloya `row_version bigint` ekler ve
 * BEFORE UPDATE tetikleyicisi HER güncellemede sürümü +1 artırır (uygulama dışı yazıcılar dahil).
 * Güncelleme TEK ifadedir: `UPDATE … WHERE id AND tenant_id AND client_id AND row_version = beklenen`.
 * Eşzamanlı ikinci yazar satır kilidini bekler; kilit bırakılınca koşul yeni satırda yeniden
 * değerlendirilir → 0 satır → 409. Sürüm göndermeyen istek 428 ile REDDEDİLİR (koruma atlatılamaz).
 * Kolon yoksa (migration uygulanmamış) yazım KORUMASIZ yapılmaz → 503 (fail-closed).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const ROW_VERSION_REQUIRED_MESSAGE =
  "Kayıt sürümü gönderilmedi. Sayfayı yenileyip tekrar deneyin.";
export const ROW_VERSION_CONFLICT_MESSAGE =
  "Bu kayıt başka bir sekmede veya cihazda değiştirildi. Değişikliğiniz kaydedilmedi; güncel kayıt yüklendi, kontrol edip yeniden kaydedin.";
export const ROW_VERSION_UNAVAILABLE_MESSAGE =
  "Kayıt sürüm koruması şu anda kullanılamıyor (sistem güncellemesi bekleniyor). Değişiklik kaydedilmedi; lütfen daha sonra tekrar deneyin.";

/** Gövdedeki `row_version` (pozitif tam sayı; sayısal metin de kabul) → yoksa/biçimsizse null. */
export function readRowVersion(body: Record<string, unknown> | null | undefined): number | null {
  const v = body?.row_version;
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/** Kolon/tablo henüz yok (migration uygulanmamış) hatası mı? */
function isMissingVersionColumn(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  const code = String(e?.code ?? "");
  return code === "42703" || code === "PGRST204" || (/row_version/.test(String(e?.message ?? "")) && /column|does not exist/i.test(String(e?.message ?? "")));
}

export type CasResult<T> =
  | { kind: "ok"; row: T }
  | { kind: "conflict"; current: T }
  | { kind: "not_found" }
  | { kind: "unavailable" }
  | { kind: "error"; error: unknown };

/**
 * Koşullu (atomik) güncelleme. `select` güncellenen satırdan döndürülecek kolonlar (row_version dahil
 * edilmeli). Çakışmada güncel satır döner (istemci formunu yeniler).
 */
export async function casUpdate<T = Record<string, unknown>>(
  db: SupabaseClient,
  table: "client_sessions" | "client_stones" | "client_homeworks" | "client_analyses",
  args: { id: string; tenantId: string; clientId: string; expected: number; patch: Record<string, unknown>; select?: string },
): Promise<CasResult<T>> {
  const select = args.select ?? "*";
  const { data, error } = await db
    .from(table)
    .update(args.patch)
    .eq("id", args.id)
    .eq("tenant_id", args.tenantId)
    .eq("client_id", args.clientId)
    .eq("row_version", args.expected)
    .select(select);
  if (error) return isMissingVersionColumn(error) ? { kind: "unavailable" } : { kind: "error", error };
  const rows = (data ?? []) as unknown as T[];
  if (rows.length === 1) return { kind: "ok", row: rows[0]! };

  // 0 satır: kayıt yok (yabancı/silinmiş) mu, sürüm mü değişti?
  const cur = await db
    .from(table)
    .select(select)
    .eq("id", args.id)
    .eq("tenant_id", args.tenantId)
    .eq("client_id", args.clientId)
    .maybeSingle();
  if (cur.error) return isMissingVersionColumn(cur.error) ? { kind: "unavailable" } : { kind: "error", error: cur.error };
  if (!cur.data) return { kind: "not_found" };
  return { kind: "conflict", current: cur.data as unknown as T };
}

/** Standart çakışma / sürüm-yok / kullanılamaz yanıt gövdeleri. */
export const casResponses = {
  required: () => ({ body: { ok: false, code: "VERSION_REQUIRED", error: ROW_VERSION_REQUIRED_MESSAGE }, status: 428 }),
  conflict: (current: unknown) => ({ body: { ok: false, code: "RECORD_CONFLICT", error: ROW_VERSION_CONFLICT_MESSAGE, current }, status: 409 }),
  unavailable: () => ({ body: { ok: false, code: "VERSION_UNAVAILABLE", error: ROW_VERSION_UNAVAILABLE_MESSAGE }, status: 503 }),
} as const;

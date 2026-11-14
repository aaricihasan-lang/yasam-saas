import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * AŞAMA 4a (Owner kararı 12.11) — arşivdeki hesapta üyelik / deneme / modül / kredi / ödeme-ticari / lisans-erişim
 * değişikliği yapılamaz; kayıtlar okunur. Bu yardımcı yalnız ERKEN ve ANLAŞILIR yanıt içindir: asıl (atomik)
 * güvence 20280101000600'daki tetikleyicilerdir (UY005) — bu kontrol ile yazma arasında hesap arşivlense bile
 * veritabanı değişikliği reddeder.
 *
 * Kolon yoksa (migration öncesi) kontrol uygulanmaz → mevcut davranış (deploy sırası güvenliği).
 */
export const ARCHIVED_CHANGE_MESSAGE =
  "Hesap arşivde: üyelik, deneme, modül, kredi, ödeme ve erişim bilgileri değiştirilemez. Kayıtlar görüntülenebilir; değişiklik için önce ana yönetici arşivden çıkarmalıdır (hesap pasif kalır).";

export async function archivedTargetResponse(db: SupabaseClient, userId: string): Promise<NextResponse | null> {
  const { data, error } = await db.from("users").select("archived_at").eq("id", userId).maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "42703") return null;
    return NextResponse.json({ error: "Kullanıcı okunamadı." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  const archivedAt = (data as { archived_at?: unknown } | null)?.archived_at;
  if (archivedAt != null && String(archivedAt).trim() !== "") {
    return NextResponse.json({ error: ARCHIVED_CHANGE_MESSAGE, code: "ARCHIVED" }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  return null;
}

/** Veritabanı tetikleyicisinin arşiv reddi (UY005) — yarış durumunda route'un genel hatası yerine aynı mesaj. */
export function isArchivedDbError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "UY005";
}

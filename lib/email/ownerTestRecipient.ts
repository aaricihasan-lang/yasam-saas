/**
 * GİRİŞ GÜVENLİĞİ F3 — Owner test iletisinin İKİNCİ alıcısı: "kayıtlı test hesabı" (yalnız server-side).
 *
 * Neden: Owner'ın giriş adresi kurumsal alan adında bir posta kutusu olmayabilir (gerçek SMTP kabulünde ilk test iletisi
 * alıcı aşamasında kalıcı olarak reddedildi). Owner'ın adresini DEĞİŞTİRMEDEN, kod içermeyen test iletisini Owner'ın
 * eriştiği kayıtlı bir test hesabına gönderebilmek gerekir — uzmanlara e-posta özelliklerini açmadan.
 *
 * Kurallar:
 *   - Alıcı İSTEKTEN gelmez: yalnız sunucu ayarı EMAIL_OWNER_TEST_RECIPIENT (tek e-posta adresi). Tanımsız → özellik kapalı.
 *   - Adres Yaşam Sistemi'nde TAM OLARAK BİR hesaba ait olmalı (büyük/küçük harf duyarsız); hesap etkin, demo değil,
 *     arşivde değil, "Pasif" (access_restricted_at) değil. Aksi hâlde gönderim reddedilir (fail-closed).
 *   - Yetki, oran sınırı ve denetim kaydı mevcut Owner testiyle AYNI yoldan: auth_email_owner_test_reserve (yalnız Owner,
 *     saatte en çok 5, purpose='owner_test', alıcı yalnız özetle) + SMTP 50/saat kapısı + teslim sonucu kaydı.
 *   - Dönüşte tam adres YOK; yalnız maske (Owner gönderimden önce ekranda doğrular).
 * Geri alma: değişkeni silmek + yeniden yayın → ikinci alıcı seçeneği kaybolur.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSafeEmailAddress } from "@/lib/email/mime";
import { maskEmail } from "@/lib/auth/emailOtp";

type Env = Record<string, string | undefined>;

export const OWNER_TEST_RECIPIENT_ENV = "EMAIL_OWNER_TEST_RECIPIENT";

export type OwnerTestRecipientIssue = "not_configured" | "invalid_address" | "not_registered" | "ambiguous" | "not_eligible" | "lookup_failed";
export type OwnerTestRecipient =
  | { ok: true; userId: string; email: string; masked: string }
  | { ok: false; issue: OwnerTestRecipientIssue };

/** LIKE desenindeki joker karakterleri kaçırır (ilike yalnız büyük/küçük harf duyarsız EŞİTLİK için kullanılır). */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function resolveOwnerTestRecipient(db: SupabaseClient, env: Env = process.env): Promise<OwnerTestRecipient> {
  const raw = String(env[OWNER_TEST_RECIPIENT_ENV] ?? "").trim().toLowerCase();
  if (!raw) return { ok: false, issue: "not_configured" };
  if (!isSafeEmailAddress(raw)) return { ok: false, issue: "invalid_address" };
  try {
    // select("*"): arşiv / pasif kolonları olmayan eski şemada da çalışır (yoksa kısıt yok sayılır, diğer kurallar geçerli).
    const { data, error } = await db.from("users").select("*").ilike("email", escapeLike(raw)).limit(3);
    if (error || !Array.isArray(data)) return { ok: false, issue: "lookup_failed" };
    const rows = (data as Record<string, unknown>[]).filter((u) => String(u.email ?? "").trim().toLowerCase() === raw);
    if (rows.length === 0) return { ok: false, issue: "not_registered" };
    if (rows.length > 1) return { ok: false, issue: "ambiguous" };
    const u = rows[0];
    const role = String(u.role ?? "").trim().toLowerCase();
    const eligible = u.active === true && u.is_demo_account !== true && (role === "expert" || role === "admin")
      && (u.archived_at ?? null) === null && (u.access_restricted_at ?? null) === null;
    if (!eligible || typeof u.id !== "string") return { ok: false, issue: "not_eligible" };
    return { ok: true, userId: u.id, email: raw, masked: maskEmail(raw) };
  } catch {
    return { ok: false, issue: "lookup_failed" };
  }
}

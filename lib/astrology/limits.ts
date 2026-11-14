// Astroloji Aşama 9A-P2-03 — uzman başına KAPASİTE KORUMASI (yalnız sunucu; yazma route'larında kullanılır).
//
// Yeni kota modülü DEĞİL: mevcut global DB oran limiti (hitDbRateLimit / auth_rate_limit_hit — atomik, instance'lar
// arası paylaşılan) + kayıt sayısı tavanı. Tek kaydın boyutu zaten DB CHECK'leriyle sınırlı (KB/not gövdesi 20 000
// karakter, analiz teknik ≤1 MB · KB snapshot ≤2 MB · yorum ≤1 MB, etiket 120/200 karakter).
//
// Gerekçe — GERÇEK PostgreSQL ölçümü (9B P2 kapatma, 2026-10-10; tablo + TOAST + indeks, sıkıştırma dahil):
//   9B'den itibaren genel Bilgi Bankası analize KOPYALANMAZ (açılışta güncel kayıtlardan eşleşir) → kayıtlı analiz
//   ≈ 14 KB (gerçek natal teknik + Roxy yorumu + sürüm); 1000 analiz ≈ 13,9 MB, 3000 analiz ≈ 41,6 MB.
//   Eski yapıda KB kopyası satırı 17 KB (tipik) – 60 KB (yoğun) – 465 KB'a (en fazla) çıkarıyordu.
//   Prod DB 128,5 MB / Supabase Free 500 MB; "dolu" bir uzman diğer modüllerde ≈122 MB.
// Tavanlar normal profesyonel kullanımın çok üstünde, kötüye kullanımın büyüme hızını ve üst sınırını keser:
//   • yazma hızı: uzman başına 10 dakikada 120 yazma (dakikada ~12; elle kullanım dakikada birkaç yazma üretir),
//   • kayıtlı analiz: günde 200 (yoğun gün: ~10 danışan × ~5 analiz = 50) → ≈ 2,8 MB / gün; toplam 3000 (≈ 42 MB),
//   • doğum profili 2000 (7B: 231 profil sayfalı listede sorunsuz), Bilgi Bankası 1000 kayıt (≤ ~30 MB), not 10000.
// Okuma, güncelleme ve SİLME tavanlardan etkilenmez → uzman kendi kayıtlarına her zaman erişir ve yer açabilir.
// Eşzamanlılık: oran limiti DB'de atomiktir. Sayı tavanının buradaki kontrolü hızlı ve anlaşılır ilk kapıdır; KESİN
// sınırı migration 000600 trigger'ı uygular (sayım + ekleme aynı işlemde, uzman başına advisory kilit → aşım 0;
// cap-concurrency.mjs: 40 eşzamanlı bağlantıda 1 başarı). İki taraftaki değerler statik testle eşit tutulur.

import "server-only";
import { NextResponse } from "next/server";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { quotaCheck } from "@/lib/security/testQuotaExemption";
import { ASTRO_NO_STORE } from "./access/ownerGate";
import type { EngineCtx } from "./engine/service";

assertServerOnly("lib/astrology/limits");

export const ASTRO_WRITE_LIMITS = Object.freeze({
  /** Tüm Astroloji yazmaları (profil/revizyon, KB, not, analiz kaydı) için ortak kova. */
  write: { limit: 120, windowSeconds: 10 * 60 },
  /** Kayıtlı analiz (en büyük satırlar) için ayrıca günlük kova. */
  analysisPerDay: { limit: 200, windowSeconds: 24 * 60 * 60 },
});

/** Uzman başına kayıt sayısı tavanları (yalnız YENİ kayıt oluşturmayı sınırlar). */
export const ASTRO_RECORD_CAPS = Object.freeze({
  profiles: 2000,
  analyses: 3000,
  kbEntries: 1000,
  notes: 10000,
});

export type AstroWriteKind = "profile_create" | "profile_revision" | "kb_create" | "kb_update" | "note_save" | "analysis_save";

const CAP_TABLE: Partial<Record<AstroWriteKind, { table: string; cap: number; label: string }>> = {
  profile_create: { table: "astro_birth_profiles", cap: ASTRO_RECORD_CAPS.profiles, label: "doğum profili" },
  kb_create: { table: "astro_kb_entries", cap: ASTRO_RECORD_CAPS.kbEntries, label: "Bilgi Bankası kaydı" },
  analysis_save: { table: "astro_analyses", cap: ASTRO_RECORD_CAPS.analyses, label: "kayıtlı analiz" },
  note_save: { table: "astro_expert_notes", cap: ASTRO_RECORD_CAPS.notes, label: "danışan notu" },
};

const tooMany = (code: string, error: string, retryAfterSec?: number) =>
  NextResponse.json(
    { ok: false, code, error, ...(retryAfterSec ? { retryAfterSec } : {}) },
    { status: 429, headers: { ...ASTRO_NO_STORE, ...(retryAfterSec ? { "Retry-After": String(retryAfterSec) } : {}) } },
  );

/**
 * Yazma öncesi koruma. null → devam; NextResponse → istek reddedildi (hiçbir şey yazılmadı).
 * `creating`: kayıt yeni mi oluşturuluyor (not upsert'inde güncelleme sayı tavanına takılmaz).
 */
export async function enforceAstroWrite(ctx: EngineCtx, kind: AstroWriteKind, opts: { creating?: boolean } = {}): Promise<NextResponse | null> {
  const who = `${ctx.tenantId}:${ctx.userId}`;
  // Geçici test kotası muafiyeti (yetkili test hesabı + ≤8 saat): HACİM kontrolleri atlanır; kalıcı kayıt TAVANLARI aşağıda AYNEN.
  const w = await quotaCheck("astro-write", ctx.userId, () => hitDbRateLimit(ctx.db, rateLimitBucket("astro-write", who), ASTRO_WRITE_LIMITS.write.limit, ASTRO_WRITE_LIMITS.write.windowSeconds), { tenantId: ctx.tenantId });
  if (!w.allowed) return tooMany("WRITE_RATE_LIMITED", "Kısa sürede çok fazla kayıt işlemi yapıldı. Lütfen biraz sonra tekrar deneyin.", w.retryAfterSec);
  if (kind === "analysis_save") {
    const d = await quotaCheck("astro-analysis-day", ctx.userId, () => hitDbRateLimit(ctx.db, rateLimitBucket("astro-analysis-day", who), ASTRO_WRITE_LIMITS.analysisPerDay.limit, ASTRO_WRITE_LIMITS.analysisPerDay.windowSeconds), { tenantId: ctx.tenantId });
    if (!d.allowed) return tooMany("ANALYSIS_DAILY_LIMIT", "Günlük kayıtlı analiz sınırına ulaşıldı. Yarın tekrar deneyin.", d.retryAfterSec);
  }
  const cap = CAP_TABLE[kind];
  if (cap && opts.creating !== false) {
    // Sayım: en çok cap+1 kimlik okunur (küçük, indeksli: tenant_id + owner_user_id).
    const { data, error } = await ctx.db.from(cap.table).select("id").eq("tenant_id", ctx.tenantId).eq("owner_user_id", ctx.userId).limit(cap.cap + 1);
    if (!error && (data as unknown[] | null)?.length !== undefined && (data as unknown[]).length >= cap.cap) {
      return NextResponse.json(
        { ok: false, code: "RECORD_CAP_REACHED", error: `${cap.cap} ${cap.label} sınırına ulaşıldı. Yeni kayıt için kullanılmayanları silin veya yöneticinizle görüşün.`, cap: cap.cap },
        { status: 409, headers: ASTRO_NO_STORE },
      );
    }
  }
  return null;
}

/**
 * YENİ-P3-03 — Word/PDF rapor oran sınırı (tekli + toplu rapor rotaları). Önceden bellek içi sayaçtı
 * (`lib/rateLimit.checkRateLimit`): çok örnekli sunucusuz ortamda sınır ÖRNEK BAŞINA işliyordu. Artık motor ve
 * yazma kotalarıyla aynı global DB sayacı (hitDbRateLimit / auth_rate_limit_hit — atomik, instance'lar arası
 * paylaşılan). Eşik ve pencere AYNI: uzman başına dakikada 20 rapor. RPC yoksa/hata verirse hitDbRateLimit kendi
 * bellek yedeğine düşer (eski davranış). Yanıt gövdesi ve kodu değişmez (429 RATE_LIMITED + Retry-After).
 */
export const ASTRO_REPORT_LIMIT = Object.freeze({ limit: 20, windowSeconds: 60 });

export async function enforceAstroReport(ctx: Pick<EngineCtx, "db" | "tenantId" | "userId">): Promise<NextResponse | null> {
  const r = await hitDbRateLimit(ctx.db, rateLimitBucket("astro-report", `${ctx.tenantId}:${ctx.userId}`), ASTRO_REPORT_LIMIT.limit, ASTRO_REPORT_LIMIT.windowSeconds);
  if (r.allowed) return null;
  return NextResponse.json(
    { ok: false, code: "RATE_LIMITED", error: "Çok fazla rapor isteği. Lütfen biraz sonra tekrar deneyin." },
    { status: 429, headers: { ...ASTRO_NO_STORE, "Retry-After": String(Math.max(1, r.retryAfterSec)) } },
  );
}

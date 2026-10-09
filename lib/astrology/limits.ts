// Astroloji Aşama 9A-P2-03 — uzman başına KAPASİTE KORUMASI (yalnız sunucu; yazma route'larında kullanılır).
//
// Yeni kota modülü DEĞİL: mevcut global DB oran limiti (hitDbRateLimit / auth_rate_limit_hit — atomik, instance'lar
// arası paylaşılan) + kayıt sayısı tavanı. Tek kaydın boyutu zaten DB CHECK'leriyle sınırlı (KB/not gövdesi 20 000
// karakter, analiz teknik ≤1 MB · KB snapshot ≤2 MB · yorum ≤1 MB, etiket 120/200 karakter).
//
// Gerekçe (ölçüm 2026-10-09): kayıtlı analizin teknik katmanı ort. ~11 KB (en büyük forecast ~27 KB), yorum katmanı
// ≤ ~100 KB (sinastri); prod DB 128,5 MB / Supabase Free 500 MB; "dolu" bir uzman diğer modüllerde ≈122 MB.
// Tavanlar normal profesyonel kullanımın çok üstünde, kötüye kullanımın büyüme hızını ve üst sınırını keser:
//   • yazma hızı: uzman başına 10 dakikada 120 yazma (dakikada ~12; elle kullanım dakikada birkaç yazma üretir),
//   • kayıtlı analiz: günde 200 (yoğun gün: ~10 danışan × ~5 analiz = 50), toplam 3000,
//   • doğum profili 2000 (7B: 231 profil sayfalı listede sorunsuz), Bilgi Bankası 1000 kayıt, danışan notu 10000.
// En kötü durum (kötüye kullanım, tavanlar dolu): analiz 3000 × ~60 KB ≈ 180 MB'a ancak ≥15 günde ulaşılabilir
// (günlük 200 tavanı) → owner'ın fark etme ve müdahale süresi var; KB 1000 × 20 000 karakter ≈ 20–40 MB.
// Okuma, güncelleme ve SİLME tavanlardan etkilenmez → uzman kendi kayıtlarına her zaman erişir ve yer açabilir.
// Eşzamanlılık: oran limiti DB'de atomiktir; sayı tavanı "say → ekle" olduğundan eşzamanlı isteklerle en çok
// oran limiti penceresindeki eşzamanlı istek kadar aşılabilir (≤ birkaç kayıt) — kalıcı büyümeyi değiştirmez.

import "server-only";
import { NextResponse } from "next/server";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
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

/** Tek bir analize kopyalanan Bilgi Bankası snapshot'ının üst sınırı (DB CHECK 2 MB'ın altında, anlaşılır hata için). */
export const ASTRO_MAX_KB_SNAPSHOT_BYTES = 1_500_000;

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
  const w = await hitDbRateLimit(ctx.db, rateLimitBucket("astro-write", who), ASTRO_WRITE_LIMITS.write.limit, ASTRO_WRITE_LIMITS.write.windowSeconds);
  if (!w.allowed) return tooMany("WRITE_RATE_LIMITED", "Kısa sürede çok fazla kayıt işlemi yapıldı. Lütfen biraz sonra tekrar deneyin.", w.retryAfterSec);
  if (kind === "analysis_save") {
    const d = await hitDbRateLimit(ctx.db, rateLimitBucket("astro-analysis-day", who), ASTRO_WRITE_LIMITS.analysisPerDay.limit, ASTRO_WRITE_LIMITS.analysisPerDay.windowSeconds);
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

import { createHash, randomInt } from "node:crypto";

/**
 * Beslenme — geri alınamaz toplu işlemler için 4 haneli doğrulama kodu ÇEKİRDEĞİ (saf; IO yok).
 *
 * Kod ekranda kullanıcıya gösterilir ve elle girilmesi istenir (yanlışlıkla tek tıkla toplu
 * işlem YAPILAMAZ). Sunucu kodun kendisini değil sha256(challengeId:code) özetini saklar.
 * Kapsam özeti: işlem türü + etkilenecek kayıt kimliklerinin SIRALI listesi → onay anında
 * kapsam yeniden hesaplanır; tek kayıt bile değişmişse özet tutmaz → işlem reddedilir.
 */

// "plan_delete": tüm plan (revizyon) silme — DB CHECK'i 20271003100100 migration'ı genişletir.
export const CHALLENGE_ACTIONS = ["food_reset_one", "food_reset_all", "plan_day_clear", "plan_delete"] as const;
export type ChallengeAction = (typeof CHALLENGE_ACTIONS)[number];

/** Challenge ömrü (talimat: 5 dakika). */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** Kullanıcı başına 10 dakikada en fazla bu kadar challenge (kötüye kullanım sınırı). */
export const CHALLENGE_RATE_LIMIT = 20;

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** Kriptografik 4 haneli kod: "0000"–"9999" (baştaki sıfırlar korunur). */
export function generateChallengeCode(): string {
  return String(randomInt(0, 10000)).padStart(4, "0");
}

/** Kod yalnız tam 4 rakam olabilir (boşluk/harf/eksik hane → geçersiz). */
export function isWellFormedCode(code: unknown): code is string {
  return typeof code === "string" && /^[0-9]{4}$/.test(code);
}

export function challengeScopeHash(action: ChallengeAction, keys: readonly string[]): string {
  const sorted = [...new Set(keys)].sort();
  return sha256(`${action}|${sorted.length}|${sorted.join(",")}`);
}

export function challengeCodeHash(challengeId: string, code: string): string {
  return sha256(`${challengeId}:${code}`);
}

export type ConsumeOutcome = "ok" | "not_found" | "used" | "expired" | "locked" | "scope_changed" | "invalid_code";

/** Tüketim sonucu → kullanıcıya gösterilecek güvenli API kodu + HTTP durumu. */
export function mapConsumeOutcome(o: string): { code: string; status: number } | null {
  switch (o) {
    case "ok": return null;
    case "invalid_code": return { code: "CHALLENGE_INVALID_CODE", status: 400 };
    case "expired": return { code: "CHALLENGE_EXPIRED", status: 410 };
    case "used": return { code: "CHALLENGE_USED", status: 409 };
    case "locked": return { code: "CHALLENGE_LOCKED", status: 429 };
    case "scope_changed": return { code: "CHALLENGE_SCOPE_CHANGED", status: 409 };
    default: return { code: "CHALLENGE_NOT_FOUND", status: 404 };
  }
}

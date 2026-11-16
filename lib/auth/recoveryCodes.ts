/**
 * GİRİŞ GÜVENLİĞİ F2-E — kurtarma kodları (yalnız server-side / API route).
 *
 * Kod: 28 karakter RFC 4648 base32 (A–Z, 2–7) = 140 bit, crypto.randomInt (eşit dağılım). Ekranda 4'lü
 * gruplar ("ABCD-EFGH-…"). Saklama: sha256("yasam-recovery-v1:" ‖ kullanıcı id ‖ ":" ‖ kod) — DB'deki
 * public.auth_recovery_hash ile BİREBİR aynı (SQL konsolundan üretilen Owner kiti de aynı biçimde
 * doğrulanır). Kod ≥128 bit olduğundan özetten geri kazanım / kaba kuvvet pratikte imkânsızdır; kullanıcı
 * kimliği kapsamı kodu hesaba bağlar (başka kullanıcının kodu eşleşmez). Düz kod YALNIZ oluşturulduğu
 * yanıtta kullanıcıya döner; DB'ye, loga, e-postaya veya yedeğe yazılmaz.
 */
import { createHash, randomInt } from "node:crypto";

export const RECOVERY_CODE_COUNT = 10;
export const RECOVERY_CODE_LENGTH = 28;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateRecoveryCode(): string {
  let out = "";
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) out += ALPHABET[randomInt(0, 32)];
  return out;
}

/** 10 farklı kod (çakışma olasılığı ~2^-133; yine de tekrar denenir). */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const set = new Set<string>();
  while (set.size < count) set.add(generateRecoveryCode());
  return [...set];
}

/** "ABCDEFGH…" → "ABCD-EFGH-…" (yalnız gösterim). */
export function formatRecoveryCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

/**
 * Kullanıcı girişini normalleştirir: boşluk/tire atılır, büyük harf; base32'de olmayan ve sık karışan
 * rakamlar harfe çevrilir (0→O, 1→I, 8→B). Biçim dışı → null (DB'ye hiç gitmez).
 */
export function normalizeRecoveryCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.toUpperCase().replace(/[\s\-_.]/g, "").replace(/0/g, "O").replace(/1/g, "I").replace(/8/g, "B");
  return /^[A-Z2-7]{28}$/.test(s) ? s : null;
}

export function hashRecoveryCode(userId: string, normalizedCode: string): string {
  return createHash("sha256").update(`yasam-recovery-v1:${userId}:${normalizedCode}`, "utf8").digest("hex");
}

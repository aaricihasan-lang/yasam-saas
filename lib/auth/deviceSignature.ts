/**
 * GİRİŞ GÜVENLİĞİ F2-C — güvenilir cihaz imzası (yalnız server-side). Protokol:
 * docs/giris-guvenligi/f2c-qr-protokol.md (v1).
 *
 * Cihaz anahtarı: EC P-256 (Android Keystore). İmza: SHA256withECDSA, DER, base64.
 * Açık anahtar: X.509 SubjectPublicKeyInfo (SPKI) DER, base64. Saf yardımcılar; IO yok.
 */
import { createHash, createPublicKey, verify as cryptoVerify, type KeyObject } from "node:crypto";

/** İmzalı mesajlarda kabul edilen saat sapması (sn). */
export const DEVICE_SIGNATURE_SKEW_SECONDS = 120;

const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export type DeviceKey = { spkiB64: string; key: KeyObject; fingerprintHex: string; displayCode: string };

/** RFC 4648 base32 (dolgusuz, büyük harf). */
export function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** Owner karşılaştırma kodu: base32(sha256(spki))[0..8] → "XXXX-XXXX". */
export function displayCodeForSpki(spkiDer: Buffer): string {
  const c = base32(createHash("sha256").update(spkiDer).digest()).slice(0, 8);
  return `${c.slice(0, 4)}-${c.slice(4, 8)}`;
}

/**
 * base64 SPKI'yi yükler; YALNIZ EC P-256 kabul edilir (başka eğri/RSA → null).
 */
export function parseDevicePublicKey(spkiB64: unknown): DeviceKey | null {
  if (typeof spkiB64 !== "string") return null;
  const s = spkiB64.trim();
  if (s.length < 80 || s.length > 400 || !B64_RE.test(s)) return null;
  try {
    const der = Buffer.from(s, "base64");
    const key = createPublicKey({ key: der, format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") return null;
    // Kanonik yeniden kodlama: aynı anahtarın farklı gösterimleri aynı parmak izini üretir.
    const canonical = key.export({ format: "der", type: "spki" }) as Buffer;
    return {
      spkiB64: canonical.toString("base64"),
      key,
      fingerprintHex: createHash("sha256").update(canonical).digest("hex"),
      displayCode: displayCodeForSpki(canonical),
    };
  } catch {
    return null;
  }
}

/** DER ECDSA imzası doğrulaması (SHA-256). Biçim/uzunluk hatası → false. */
export function verifyDeviceSignature(key: KeyObject, message: string, signatureB64: unknown): boolean {
  if (typeof signatureB64 !== "string") return false;
  const s = signatureB64.trim();
  if (s.length < 60 || s.length > 120 || !B64_RE.test(s)) return false;
  try {
    return cryptoVerify("sha256", Buffer.from(message, "utf8"), { key, dsaEncoding: "der" }, Buffer.from(s, "base64"));
  } catch {
    return false;
  }
}

/** ts (Unix sn) sunucu saatine ±DEVICE_SIGNATURE_SKEW_SECONDS içinde mi? */
export function isFreshTimestamp(ts: unknown, nowMs: number = Date.now()): ts is number {
  if (typeof ts !== "number" || !Number.isInteger(ts)) return false;
  return Math.abs(Math.floor(nowMs / 1000) - ts) <= DEVICE_SIGNATURE_SKEW_SECONDS;
}

// ─── Kanonik mesajlar (protokol §2; satır ayırıcı \n, sonda \n YOK) ────────────
export const enrollMessage = (emailLower: string, displayCode: string, ts: number) =>
  ["YS-ENROLL-V1", emailLower, displayCode, String(ts)].join("\n");
export const activateMessage = (deviceId: string, nonce: string, ts: number) =>
  ["YS-ACTIVATE-V1", deviceId, nonce, String(ts)].join("\n");
export const qrFetchMessage = (challengeId: string, qrNonce: string, deviceId: string, ts: number) =>
  ["YS-QR-FETCH-V1", challengeId, qrNonce, deviceId, String(ts)].join("\n");
export const qrDecideMessage = (
  challengeId: string,
  qrNonce: string,
  deviceId: string,
  decision: "approve" | "deny",
  matchCode: string,
  ts: number,
) => ["YS-QR-DECIDE-V1", challengeId, qrNonce, deviceId, decision, matchCode, String(ts)].join("\n");

/** Owner ilk cihaz kodu: kullanıcı girişi normalize (büyük harf, boşluk/tire yok) → sha256 hex. */
export function hashBootstrapCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.toUpperCase().replace(/[\s-]/g, "");
  if (!/^[A-Z0-9]{20}$/.test(code)) return null;
  return createHash("sha256").update(`yasam-bootstrap:${code}`).digest("hex");
}

const NONCE_RE = /^[A-Za-z0-9_-]{32}$/; // 24 bayt base64url (dolgusuz)
export function isDeviceNonce(v: unknown): v is string {
  return typeof v === "string" && NONCE_RE.test(v);
}

/** QR URL'si (App Link). Fragment sunucuya gitmez. */
export function qrApprovalUrl(challengeId: string, qrNonce: string, origin = "https://www.yasamsistemi.com"): string {
  return `${origin}/m/onay#c=${encodeURIComponent(challengeId)}&n=${encodeURIComponent(qrNonce)}`;
}

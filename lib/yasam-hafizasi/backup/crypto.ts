/**
 * BF-12B — AES-256-GCM şifreli zarf (Node built-in crypto; harici bağımlılık yok).
 *
 * - Key derivation: scrypt (backup-level random salt).
 * - Her artifact: unique random 12-byte IV + auth tag.
 * - AAD: artifact mantıksal kimliği + sürüm (yanlış-artifact/rollback koruması).
 * - Plaintext + ciphertext SHA-256 zarfta tutulur.
 * - Key buffer best-effort zeroize edilir.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import type { EncryptedEnvelope } from "./types";
import { BACKUP_FORMAT_VERSION } from "./constants";

const KDF_PARAMS = { N: 1 << 15, r: 8, p: 1, keyLen: 32 } as const;

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Passphrase + salt → 32-byte anahtar (scrypt). Çağıran zeroize sorumlusudur. */
export function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KDF_PARAMS.keyLen, {
    N: KDF_PARAMS.N,
    r: KDF_PARAMS.r,
    p: KDF_PARAMS.p,
    maxmem: 256 * 1024 * 1024,
  });
}

function zeroize(buf: Buffer): void {
  buf.fill(0);
}

/**
 * Plaintext buffer'ı şifreler. `salt` backup-level (tüm artifact'lar için ortak)
 * verilebilir; verilmezse artifact-local üretilir.
 */
export function encryptArtifact(
  plaintext: Buffer,
  opts: { passphrase: string; aadId: string; salt?: Buffer },
): EncryptedEnvelope {
  const salt = opts.salt ?? randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(opts.passphrase, salt);
  try {
    const aad = `${opts.aadId}|${BACKUP_FORMAT_VERSION}`;
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      v: BACKUP_FORMAT_VERSION,
      alg: "aes-256-gcm",
      kdf: "scrypt",
      kdfParams: { ...KDF_PARAMS },
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      aad,
      ciphertext: ciphertext.toString("base64"),
      plaintextSha256: sha256(plaintext),
      ciphertextSha256: sha256(ciphertext),
    };
  } finally {
    zeroize(key);
  }
}

/**
 * Zarfı çözer. Yanlış passphrase / bozuk payload / yanlış AAD → auth hatası (throw).
 * Ciphertext SHA-256 önce doğrulanır (bütünlük), sonra GCM tag ile authenticated decrypt.
 */
export function decryptArtifact(
  env: EncryptedEnvelope,
  opts: { passphrase: string },
): Buffer {
  const ciphertext = Buffer.from(env.ciphertext, "base64");
  if (sha256(ciphertext) !== env.ciphertextSha256) {
    throw new Error("decryptArtifact: ciphertext SHA-256 uyuşmuyor (bozulma)");
  }
  const salt = Buffer.from(env.salt, "base64");
  const iv = Buffer.from(env.iv, "base64");
  const tag = Buffer.from(env.tag, "base64");
  const key = deriveKey(opts.passphrase, salt);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(env.aad, "utf8"));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (sha256(plaintext) !== env.plaintextSha256) {
      throw new Error("decryptArtifact: plaintext SHA-256 uyuşmuyor");
    }
    return plaintext;
  } finally {
    zeroize(key);
  }
}

/** Passphrase minimum güvenlik şartı (runbook: dosyadan/prompt'tan). */
export function assertPassphraseStrength(passphrase: string): void {
  if (passphrase.length < 16) {
    throw new Error("Passphrase en az 16 karakter olmalıdır.");
  }
}

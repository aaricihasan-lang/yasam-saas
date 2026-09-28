/**
 * Anamnez PDF ekleri — PRIVATE Storage sözleşmesi (SAF; route + harness).
 *
 * Model (Kişisel Arşiv imzalı-yükleme kalıbı + danışan route şekli):
 *   - Bucket PRIVATE (`client-anamnesis-files`), storage.objects üzerinde policy YOK →
 *     yalnız service_role (sunucu) erişir; bucket MIME=application/pdf + 10 MB kilitli.
 *   - Yol SUNUCUDA üretilir: `{tenantId}/{clientId}/{anamnesisId}/{uuid}.pdf`. Kullanıcının
 *     dosya adı yola GİRMEZ (yalnız sanitize edilip metadata'da saklanır).
 *   - Okuma yalnız DB satırından çözülen yol için 60 sn'lik signed URL ile.
 *   - Gerçek içerik doğrulaması finalize'da: `%PDF-` imzası + gerçek boyut (uzantıya güvenilmez).
 */

export const ANAMNEZ_BUCKET = "client-anamnesis-files";
export const ANAMNEZ_PDF_MAX_BYTES = 10 * 1024 * 1024;
export const ANAMNEZ_MAX_ATTACHMENTS = 5;
export const ANAMNEZ_SIGNED_URL_TTL_SECONDS = 60;
export const ANAMNEZ_PDF_MIME = "application/pdf";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const OBJECT_NAME_RE = new RegExp(`^${UUID}\\.pdf$`);

export function anamnesisPrefix(tenantId: string, clientId: string, anamnesisId: string): string {
  return `${tenantId}/${clientId}/${anamnesisId}/`;
}

export function clientAnamnesisPrefix(tenantId: string, clientId: string): string {
  return `${tenantId}/${clientId}/`;
}

export function buildAttachmentPath(tenantId: string, clientId: string, anamnesisId: string, uuid: string): string {
  return `${anamnesisPrefix(tenantId, clientId, anamnesisId)}${uuid}.pdf`;
}

/**
 * Yol TAM OLARAK bu tenant + danışan + anamnez altında, sunucu biçiminde mi?
 * Traversal (`..`, `%2e`), ters bölü, mutlak URL, fazladan segment → red.
 */
export function isOwnedAttachmentPath(
  path: unknown,
  tenantId: string,
  clientId: string,
  anamnesisId: string,
): path is string {
  if (typeof path !== "string" || !path) return false;
  if (path.includes("..") || path.includes("\\") || path.includes("://") || /%2e|%2f|%5c/i.test(path)) return false;
  const prefix = anamnesisPrefix(tenantId, clientId, anamnesisId);
  if (!path.startsWith(prefix)) return false;
  return OBJECT_NAME_RE.test(path.slice(prefix.length));
}

/** Yol bu tenant + danışan önekinin altında mı (silme/temizlik savunma katmanı). */
export function isUnderClientPrefix(path: unknown, tenantId: string, clientId: string): path is string {
  if (typeof path !== "string" || !path) return false;
  if (path.includes("..") || path.includes("\\") || path.includes("://")) return false;
  return path.startsWith(clientAnamnesisPrefix(tenantId, clientId));
}

/** Gösterim adı: kontrol/yol karakterleri temizlenir, `.pdf` korunur, ≤180 karakter. */
export function sanitizeAttachmentName(name: unknown): string {
  const raw = typeof name === "string" ? name.normalize("NFC") : "";
  let safe = raw.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, "_").replace(/\s+/g, " ").trim();
  if (!safe) safe = "anamnez-belgesi.pdf";
  if (!/\.pdf$/i.test(safe)) safe = `${safe}.pdf`;
  if (safe.length > 180) safe = `${safe.slice(0, 176)}.pdf`;
  return safe;
}

/** Dosya adı `.pdf` ile mi bitiyor (istemci ön kontrolü; tek başına güvenilmez). */
export function hasPdfExtension(name: unknown): boolean {
  return typeof name === "string" && /\.pdf$/i.test(name.trim());
}

/** Gerçek PDF imzası: dosya `%PDF-` ile başlamalı (ISO 32000 başlığı). */
export function hasPdfMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d    // -
  );
}

export type PrepareCheck =
  | { ok: true }
  | { ok: false; code: "INVALID_TYPE" | "TOO_LARGE" | "EMPTY" | "LIMIT_REACHED" };

/** prepare aşaması (istemci beyanı) kontrolleri — asıl doğrulama finalize'dadır. */
export function checkPrepare(input: { fileName: unknown; size: unknown; contentType: unknown }, existingCount: number): PrepareCheck {
  if (existingCount >= ANAMNEZ_MAX_ATTACHMENTS) return { ok: false, code: "LIMIT_REACHED" };
  if (input.contentType !== ANAMNEZ_PDF_MIME || !hasPdfExtension(input.fileName)) return { ok: false, code: "INVALID_TYPE" };
  const size = typeof input.size === "number" ? input.size : NaN;
  if (!Number.isFinite(size) || size <= 0) return { ok: false, code: "EMPTY" };
  if (size > ANAMNEZ_PDF_MAX_BYTES) return { ok: false, code: "TOO_LARGE" };
  return { ok: true };
}

/** finalize aşaması: sunucuda indirilen GERÇEK baytlar. */
export function checkUploadedBytes(bytes: Uint8Array): { ok: true } | { ok: false; code: "INVALID_TYPE" | "TOO_LARGE" | "EMPTY" } {
  if (bytes.length === 0) return { ok: false, code: "EMPTY" };
  if (bytes.length > ANAMNEZ_PDF_MAX_BYTES) return { ok: false, code: "TOO_LARGE" };
  if (!hasPdfMagic(bytes)) return { ok: false, code: "INVALID_TYPE" };
  return { ok: true };
}

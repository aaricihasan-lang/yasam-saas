import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

/**
 * Aromaterapi Sözlük (glossary) YAZMA istemci sarmalayıcısı (client-safe).
 *
 * Hafif yazma deseni (oils/catalogWrite ile aynı auth): tenant/actor/id gövdeye ASLA
 * konmaz — server guard çözer. Ham DB/response gövdesi kullanıcıya sızmaz; yalnız stabil
 * kod → Türkçe mesaj (glossaryMessageForCode).
 */

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

export type GlossaryTermBody = {
  canonical_term_tr: string;
  canonical_term_en?: string | null;
  short_definition_tr: string;
  professional_definition_tr?: string | null;
  status?: string;
};

export type GlossaryWriteResult = {
  ok: boolean;
  id: string | null;
  errorCode: string | null;
};

const EMPTY: GlossaryWriteResult = { ok: false, id: null, errorCode: null };

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

async function writeRequest(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
  signal?: AbortSignal,
): Promise<GlossaryWriteResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: authHeaders(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && j.ok === true) {
      return { ok: true, id: (j.id as string) ?? null, errorCode: null };
    }
    return {
      ...EMPTY,
      errorCode: typeof j.code === "string" ? j.code : `HTTP_${res.status}`,
    };
  } catch (e) {
    if (isAbort(e)) return EMPTY;
    return { ...EMPTY, errorCode: "AROMA_WRITE_FAILED" };
  }
}

export function createGlossaryTerm(body: GlossaryTermBody, signal?: AbortSignal) {
  return writeRequest("/api/aromaterapi/glossary", "POST", body, signal);
}

export function updateGlossaryTerm(id: string, body: Partial<GlossaryTermBody>, signal?: AbortSignal) {
  return writeRequest(`/api/aromaterapi/glossary/${id}`, "PATCH", body, signal);
}

export function deleteGlossaryTerm(id: string, signal?: AbortSignal) {
  return writeRequest(`/api/aromaterapi/glossary/${id}`, "DELETE", undefined, signal);
}

const GLOSSARY_MESSAGES: Record<string, string> = {
  AROMA_UNIQUE_VIOLATION: "Aynı terim zaten sözlüğünüzde mevcut.",
  AROMA_WRITE_INVALID_BODY: "Girdiğiniz bilgiler geçersiz. Zorunlu alanları kontrol edin.",
  AROMA_WRITE_PAYLOAD_TOO_LARGE: "İçerik çok büyük; lütfen kısaltın.",
  AROMA_NOT_FOUND: "Kayıt bulunamadı veya erişim izniniz yok.",
  AROMA_INVALID_UUID: "Geçersiz kayıt bağlantısı.",
  AROMA_WRITE_FAILED: "İşlem tamamlanamadı. Lütfen tekrar deneyin.",
};

export function glossaryMessageForCode(code: string | null): string {
  if (!code) return "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
  return GLOSSARY_MESSAGES[code] ?? "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
}

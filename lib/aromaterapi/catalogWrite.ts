import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

/**
 * Aromaterapi V2 — C3D-B2B Katalog (bitki/preparat) + method YAZMA istemci sarmalayıcısı
 * (client-safe; server-only import ETMEZ).
 *
 * C3D-B2A'da production'da CANLI olan writer route'larını tüketir; backend/RPC/route
 * DEĞİŞTİRMEZ. tenant/actor/id/note_hash/canonical_name/revision gövdeye ASLA konmaz —
 * yalnız server guard/RPC çözer. Ham DB/response gövdesi kullanıcıya sızmaz; yalnız stabil
 * kod → Türkçe mesaj (writeMessageForCode). Bu dosya hem katalog hem method yazımının
 * ortak sonuç/mesaj sözleşmesidir (methodWrite.ts bunu yeniden kullanır).
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

// ---- Katalog request tipleri (route allowlist'leriyle birebir; snake_case wire) ----

export type CreatePlantTaxonBody = {
  genus: string;
  species: string;
  taxon_rank: string;
  infraspecific_epithet?: string | null;
  is_hybrid?: boolean;
  author_citation?: string | null;
  family: string;
  primary_common_name_tr?: string | null;
  reason?: string | null;
};

export type UpdatePlantTaxonBody = CreatePlantTaxonBody & {
  status: string;
  expected_updated_at: string;
  reason: string;
};

export type CreatePreparationBody = {
  taxon_id: string;
  preparation_type: string;
  plant_part: string;
  chemotype?: string | null;
  reason?: string | null;
};

export type UpdatePreparationBody = {
  taxon_id: string;
  preparation_type: string;
  plant_part: string;
  chemotype?: string | null;
  status: string;
  expected_updated_at: string;
  reason: string;
};

// ---- Ortak yazma sonucu ----

export type CatalogWriteResult = {
  ok: boolean;
  entityId: string | null;
  noop: boolean;
  updatedAt: string | null;
  /** method create/append yanıtlarında (varsa). */
  seriesId: string | null;
  revisionId: string | null;
  errorCode: string | null;
  /** 409 optimistic concurrency (AROMA_STALE / AROMA_REVISION_STALE). */
  stale: boolean;
  /** 409 preparat kimlik kilidi (yönteme bağlı). */
  identityLocked: boolean;
  /** 403 demo. */
  demoForbidden: boolean;
};

const EMPTY_ABORT: CatalogWriteResult = {
  ok: false,
  entityId: null,
  noop: false,
  updatedAt: null,
  seriesId: null,
  revisionId: null,
  errorCode: null,
  stale: false,
  identityLocked: false,
  demoForbidden: false,
};

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export function toCatalogResult(res: Response, j: Record<string, unknown>): CatalogWriteResult {
  if (res.ok && j.ok === true) {
    return {
      ok: true,
      entityId: (j.entity_id as string) ?? null,
      noop: j.noop === true,
      updatedAt: (j.updated_at as string) ?? null,
      seriesId: (j.series_id as string) ?? null,
      revisionId: (j.revision_id as string) ?? null,
      errorCode: null,
      stale: false,
      identityLocked: false,
      demoForbidden: false,
    };
  }
  const code = typeof j.code === "string" ? j.code : `HTTP_${res.status}`;
  return {
    ...EMPTY_ABORT,
    errorCode: code,
    stale: code === "AROMA_STALE" || code === "AROMA_REVISION_STALE",
    identityLocked: code === "AROMA_PREPARATION_IDENTITY_LOCKED",
    demoForbidden: code === "AROMA_WRITE_DEMO_FORBIDDEN",
  };
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

/** Ortak yazma fetch'i (POST/PATCH). AbortError → sessiz non-ok. */
export async function catalogWriteRequest(
  url: string,
  method: "POST" | "PATCH",
  body: unknown,
  signal?: AbortSignal,
): Promise<CatalogWriteResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal,
    });
    return toCatalogResult(res, await readJson(res));
  } catch (e) {
    if (isAbort(e)) return EMPTY_ABORT;
    return { ...EMPTY_ABORT, errorCode: "AROMA_WRITE_FAILED" };
  }
}

// ---- Katalog yazma fonksiyonları ----

export function createPlantTaxon(body: CreatePlantTaxonBody, signal?: AbortSignal) {
  return catalogWriteRequest("/api/aromaterapi/plant-taxa", "POST", body, signal);
}

export function updatePlantTaxon(id: string, body: UpdatePlantTaxonBody, signal?: AbortSignal) {
  return catalogWriteRequest(`/api/aromaterapi/plant-taxa/${id}`, "PATCH", body, signal);
}

export function createPreparation(body: CreatePreparationBody, signal?: AbortSignal) {
  return catalogWriteRequest("/api/aromaterapi/preparations", "POST", body, signal);
}

export function updatePreparation(id: string, body: UpdatePreparationBody, signal?: AbortSignal) {
  return catalogWriteRequest(`/api/aromaterapi/preparations/${id}`, "PATCH", body, signal);
}

// ---- Stabil kod → Türkçe mesaj (katalog + method ortak) ----

const WRITE_MESSAGES: Record<string, string> = {
  AROMA_WRITE_DEMO_FORBIDDEN: "Demo hesabında kayıt oluşturma/düzenleme yapılamaz.",
  AROMA_STALE: "Bu kayıt siz düzenlerken başkası tarafından güncellendi. Lütfen yeniden yükleyip tekrar deneyin.",
  AROMA_REVISION_STALE: "Bu yöntem siz düzenlerken yeni bir revizyon eklendi. Lütfen yeniden yükleyip tekrar deneyin.",
  AROMA_PREPARATION_IDENTITY_LOCKED: "Bu preparata üretim yöntemi eklendiği için temel kimlik alanları (bitki, tür, kısım, kemotip) artık değiştirilemez.",
  AROMA_UNIQUE_VIOLATION: "Aynı kimlikte bir kayıt zaten mevcut.",
  AROMA_TAXON_NOT_FOUND: "Bitki (takson) bulunamadı.",
  AROMA_PREPARATION_NOT_FOUND: "Preparat bulunamadı.",
  AROMA_SERIES_NOT_FOUND: "Üretim yöntemi bulunamadı.",
  AROMA_REVISION_NOT_FOUND: "Revizyon bulunamadı.",
  AROMA_PARENT_NOT_FOUND: "Bağlı kayıt (bitki/preparat/kaynak/pasaj) bulunamadı.",
  AROMA_NOTE_HASH_INVALID: "İçerik imzası doğrulanamadı. Lütfen tekrar deneyin.",
  AROMA_FAITHFUL_SOURCE_REQUIRED: "Kaynağa Sadık Yöntem için bir kaynak seçmelisiniz.",
  AROMA_PASSAGE_SOURCE_MISMATCH: "Seçilen pasaj, seçilen kaynağa ait değil.",
  AROMA_FORBIDDEN_STATUS_TRANSITION: "Bu durum geçişine izin verilmiyor.",
  AROMA_CHECK_VIOLATION: "Değerler kurallara uymuyor; girişlerinizi gözden geçirin.",
  AROMA_FK_VIOLATION: "İlişkili bir kayıt bulunamadı.",
  AROMA_REASON_INVALID: "Gerekçe zorunludur ve 1–2000 karakter olmalıdır.",
  AROMA_WRITE_REASON_INVALID: "Gerekçe zorunludur ve 1–2000 karakter olmalıdır.",
  AROMA_WRITE_INVALID_BODY: "Girdiğiniz bilgiler geçersiz. Zorunlu alanları kontrol edin.",
  AROMA_WRITE_INVALID_UUID: "Geçersiz kayıt bağlantısı.",
  AROMA_WRITE_INVALID_TIMESTAMP: "Eşzamanlılık damgası geçersiz.",
  AROMA_WRITE_FORBIDDEN_FIELD: "İzin verilmeyen bir alan gönderildi.",
  AROMA_WRITE_PAYLOAD_TOO_LARGE: "İçerik çok büyük; lütfen kısaltın.",
  AROMA_WRITE_FAILED: "Kayıt işlemi tamamlanamadı. Lütfen tekrar deneyin.",
};

export function writeMessageForCode(code: string | null): string {
  if (!code) return "Kayıt işlemi tamamlanamadı. Lütfen tekrar deneyin.";
  return WRITE_MESSAGES[code] ?? "Kayıt işlemi tamamlanamadı. Lütfen tekrar deneyin.";
}

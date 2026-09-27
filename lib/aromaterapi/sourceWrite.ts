import {
  catalogWriteRequest,
  writeMessageForCode,
  type CatalogWriteResult,
} from "@/lib/aromaterapi/catalogWrite";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";

/**
 * Aromaterapi Kaynaklar (sources) YAZMA istemci sarmalayıcısı (client-safe).
 *
 * RPC + audit yolu; catalogWrite ortak istek/sonuç sözleşmesini yeniden kullanır
 * (aynı {ok, entity_id, updated_at, code} zarfı). tenant/actor/id gövdeye ASLA konmaz.
 * Kullanılan kaynak → arşivleme (status='archived' PATCH). Kullanılmayan kaynak →
 * deleteSource (DELETE; sunucu referans sayar, kullanılıyorsa 409 + sayılar döner).
 */

export type CreateSourceBody = {
  source_type: string;
  title: string;
  authors?: string | null;
  organization?: string | null;
  publication_year?: number | null;
  doi?: string | null;
  pmid?: string | null;
  isbn?: string | null;
  url?: string | null;
  document_no?: string | null;
  notes?: string | null;
  reason?: string | null;
};

export type UpdateSourceBody = CreateSourceBody & {
  status: string;
  expected_updated_at: string;
  reason: string;
};

export function createSource(body: CreateSourceBody, signal?: AbortSignal): Promise<CatalogWriteResult> {
  return catalogWriteRequest("/api/aromaterapi/sources", "POST", body, signal);
}

export function updateSource(id: string, body: UpdateSourceBody, signal?: AbortSignal): Promise<CatalogWriteResult> {
  return catalogWriteRequest(`/api/aromaterapi/sources/${id}`, "PATCH", body, signal);
}

export type SourceReferenceCounts = { passages: number; claimSources: number; methodSeries: number };

export type DeleteSourceClientResult = {
  ok: boolean;
  errorCode: string | null;
  /** 409 AROMA_SOURCE_REFERENCED → kaynağa bağlı kayıt sayıları (varsa). */
  references: SourceReferenceCounts | null;
};

function toCount(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Kullanılmayan kaynağı kalıcı siler (gerekçe + iyimser eşzamanlılık zorunlu). */
export async function deleteSource(
  id: string,
  body: { expected_updated_at: string; reason: string },
  signal?: AbortSignal,
): Promise<DeleteSourceClientResult> {
  const u = readYasamUser();
  const t = readSessionToken();
  try {
    const res = await fetch(`/api/aromaterapi/sources/${id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": u?.id ?? "",
        ...(t ? { "x-session-token": t } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && j.ok === true) return { ok: true, errorCode: null, references: null };
    const refs = j.references && typeof j.references === "object" ? (j.references as Record<string, unknown>) : null;
    return {
      ok: false,
      errorCode: typeof j.code === "string" ? j.code : `HTTP_${res.status}`,
      references: refs
        ? { passages: toCount(refs.passages), claimSources: toCount(refs.claim_sources), methodSeries: toCount(refs.method_series) }
        : null,
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { ok: false, errorCode: null, references: null };
    return { ok: false, errorCode: "AROMA_WRITE_FAILED", references: null };
  }
}

/** 409 referans sayıları → sade Türkçe özet ("2 pasaj, 1 bilgi kaydı atfı"). */
export function describeSourceReferences(r: SourceReferenceCounts | null): string {
  if (!r) return "";
  const parts: string[] = [];
  if (r.passages > 0) parts.push(`${r.passages} pasaj`);
  if (r.claimSources > 0) parts.push(`${r.claimSources} bilgi kaydı atfı`);
  if (r.methodSeries > 0) parts.push(`${r.methodSeries} üretim yöntemi`);
  return parts.join(", ");
}

const SOURCE_MESSAGES: Record<string, string> = {
  AROMA_SOURCE_NOT_FOUND: "Kaynak bulunamadı veya erişim izniniz yok.",
  AROMA_SOURCE_REFERENCED: "Bu kaynak kullanılıyor; silinemez. Bunun yerine arşivleyebilirsiniz.",
  AROMA_WRITE_INVALID_TIMESTAMP: "Eşzamanlılık damgası geçersiz. Lütfen yeniden yükleyin.",
};

/** Kaynak yazma kodu → Türkçe mesaj (kaynak-özel kodlar + ortak katalog mesajları). */
export function sourceMessageForCode(code: string | null): string {
  if (code && SOURCE_MESSAGES[code]) return SOURCE_MESSAGES[code];
  return writeMessageForCode(code);
}

/**
 * Detay ekranında "Sil" davranışı (SAF): bilinen referans (pasaj / bilgi kaydı atfı) varsa
 * silme yerine arşivleme önerilir. Sunucu yine son sözü söyler (üretim yöntemi atfı gibi
 * detayda görünmeyen referanslar → 409 AROMA_SOURCE_REFERENCED).
 */
export function sourceRemovalMode(detail: {
  passage_count?: number | null;
  knowledge_record_count?: number | null;
}): "delete" | "archive-suggested" {
  const used = (detail.passage_count ?? 0) > 0 || (detail.knowledge_record_count ?? 0) > 0;
  return used ? "archive-suggested" : "delete";
}

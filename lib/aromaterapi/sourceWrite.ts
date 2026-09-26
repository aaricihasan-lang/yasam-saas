import {
  catalogWriteRequest,
  writeMessageForCode,
  type CatalogWriteResult,
} from "@/lib/aromaterapi/catalogWrite";

/**
 * Aromaterapi Kaynaklar (sources) YAZMA istemci sarmalayıcısı (client-safe).
 *
 * RPC + audit yolu; catalogWrite ortak istek/sonuç sözleşmesini yeniden kullanır
 * (aynı {ok, entity_id, updated_at, code} zarfı). tenant/actor/id gövdeye ASLA konmaz.
 * Kaynak "silme" = archiveSource (status='archived' PATCH). Hard delete YOK.
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

const SOURCE_MESSAGES: Record<string, string> = {
  AROMA_SOURCE_NOT_FOUND: "Kaynak bulunamadı veya erişim izniniz yok.",
  AROMA_WRITE_INVALID_TIMESTAMP: "Eşzamanlılık damgası geçersiz. Lütfen yeniden yükleyin.",
};

/** Kaynak yazma kodu → Türkçe mesaj (kaynak-özel kodlar + ortak katalog mesajları). */
export function sourceMessageForCode(code: string | null): string {
  if (code && SOURCE_MESSAGES[code]) return SOURCE_MESSAGES[code];
  return writeMessageForCode(code);
}

import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";

/**
 * Aromaterapi Bitki / Preparat / Bilgi Kaydı SİLME istemci sarmalayıcısı (client-safe; AROMA-4).
 *
 * sourceWrite.deleteSource ile aynı sözleşme: gövde yalnız { expected_updated_at, reason };
 * tenant/actor/id gövdeye ASLA konmaz. 409 *_REFERENCED → yalnız referans sayıları döner.
 * Ağ hatası (fetch throw) DIŞARI SIZMAZ → errorCode "AROMA_NETWORK_ERROR"; AbortError → sessiz.
 */

export type ContentDeleteKind = "plant_taxon" | "preparation" | "claim";

const ENDPOINT: Readonly<Record<ContentDeleteKind, string>> = {
  plant_taxon: "/api/aromaterapi/plant-taxa",
  preparation: "/api/aromaterapi/preparations",
  claim: "/api/aromaterapi/claims",
};

export const REFERENCED_CODE: Readonly<Record<ContentDeleteKind, string>> = {
  plant_taxon: "AROMA_TAXON_REFERENCED",
  preparation: "AROMA_PREPARATION_REFERENCED",
  claim: "AROMA_CLAIM_REFERENCED",
};

export type ContentDeleteClientResult = {
  ok: boolean;
  /** null = iptal edildi (AbortError) — kullanıcıya mesaj gösterilmez. */
  errorCode: string | null;
  /** 409 *_REFERENCED → kayda bağlı kayıt sayıları (snake_case; varsa). */
  references: Record<string, number> | null;
};

function toCount(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export async function deleteContentRecord(
  kind: ContentDeleteKind,
  id: string,
  body: { expected_updated_at: string; reason: string },
  signal?: AbortSignal,
): Promise<ContentDeleteClientResult> {
  const u = readYasamUser();
  const t = readSessionToken();
  try {
    const res = await fetch(`${ENDPOINT[kind]}/${encodeURIComponent(id)}`, {
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
    const refsRaw = j.references && typeof j.references === "object" ? (j.references as Record<string, unknown>) : null;
    const references: Record<string, number> | null = refsRaw
      ? Object.fromEntries(Object.entries(refsRaw).map(([k, v]) => [k, toCount(v)]))
      : null;
    return { ok: false, errorCode: typeof j.code === "string" ? j.code : `HTTP_${res.status}`, references };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { ok: false, errorCode: null, references: null };
    return { ok: false, errorCode: "AROMA_NETWORK_ERROR", references: null };
  }
}

const REFERENCE_LABELS: Readonly<Record<string, string>> = {
  preparations: "preparat",
  claims: "bilgi kaydı",
  method_series: "üretim yöntemi",
  relations: "bilgi kaydı ilişkisi",
};

/**
 * 409 referans sayıları → sade Türkçe cümle ("Bu kayıt 2 preparat tarafından kullanılıyor;
 * önce onları silin."). Sayı bilinmiyorsa (-1 yarış / sayı yok) genel cümle döner.
 */
export function describeContentReferences(
  kind: ContentDeleteKind,
  refs: Record<string, number> | null,
): string {
  const parts: string[] = [];
  let unknown = false;
  for (const [k, v] of Object.entries(refs ?? {})) {
    if (v < 0) unknown = true;
    else if (v > 0) parts.push(`${v} ${REFERENCE_LABELS[k] ?? k}`);
  }
  if (kind === "claim") {
    return parts.length > 0
      ? `Bu bilgi kaydının başka bilgi kayıtlarıyla ${parts.join(", ")} var; silinirse o kayıtlar da değişir. Önce ilişkileri düzenleme ekranından kaldırın.`
      : "Bu bilgi kaydı başka bilgi kayıtlarıyla ilişkili; önce ilişkileri düzenleme ekranından kaldırın.";
  }
  if (parts.length > 0 && !unknown) {
    return `Bu kayıt ${parts.join(" / ")} tarafından kullanılıyor; önce onları silin.`;
  }
  return "Bu kayıt başka kayıtlar tarafından kullanılıyor; önce bağlı kayıtları silin.";
}

const DELETE_MESSAGES: Readonly<Record<string, string>> = {
  AROMA_STALE: "Kayıt siz bakarken başka bir yerde güncellendi. Sayfayı yenileyip son hâlini görerek tekrar deneyin.",
  AROMA_TAXON_NOT_FOUND: "Bitki bulunamadı veya bu hesaba ait değil.",
  AROMA_PREPARATION_NOT_FOUND: "Preparat bulunamadı veya bu hesaba ait değil.",
  AROMA_CLAIM_NOT_FOUND: "Bilgi kaydı bulunamadı veya bu hesaba ait değil.",
  AROMA_DELETE_UNAVAILABLE: "Silme özelliği şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.",
  AROMA_WRITE_DEMO_FORBIDDEN: "Demo hesabında kayıt silinemez.",
  AROMA_WRITE_REASON_INVALID: "Gerekçe zorunludur ve 1–2000 karakter olmalıdır.",
  AROMA_REASON_INVALID: "Gerekçe zorunludur ve 1–2000 karakter olmalıdır.",
  AROMA_WRITE_INVALID_TIMESTAMP: "Kayıt sürümü geçersiz. Lütfen sayfayı yenileyin.",
  AROMA_NETWORK_ERROR: "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.",
};

export function contentDeleteMessageForCode(code: string | null): string {
  if (code && DELETE_MESSAGES[code]) return DELETE_MESSAGES[code];
  return "Silme işlemi tamamlanamadı. Lütfen tekrar deneyin.";
}

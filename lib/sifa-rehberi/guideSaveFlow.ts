/**
 * Şifa Rehberi — sürüm-kontrollü kaydetme orkestrasyonu (SIFA-1).
 *
 * SAF + test edilebilir: fetch ve auth header'ları DIŞARIDAN enjekte edilir (tarayıcı
 * depolaması / Next importu YOK). Sıra SABİTTİR:
 *
 *   1) PATCH /api/sifa-rehberi/guides/[id]  { ...fields, expected_updated_at }  ← KAPI
 *        409 → DUR (bölüm PUT'u ASLA çağrılmaz; çağıranın draft'ı korunur)
 *   2) PUT   /api/sifa-rehberi/guides/[id]/sections { sections, expected_updated_at: <1'in yeni sürümü> }
 *
 * Her başarılı yazım sekmenin bildiği sürümü İLERLETİR (`updatedAt`) → aynı sekmenin bir
 * sonraki yazımı kendi kendisiyle çakışmaz. PATCH başarılı + PUT başarısız (kısmi) durumda
 * `updatedAt` PATCH'in döndürdüğü sürümdür (çağıran bunu yeni taban olarak saklamalıdır).
 */
import { SIFA_STALE_MESSAGE } from "@/lib/sifa-rehberi/guideVersion";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type GuideWriteDeps = {
  fetchImpl: FetchLike;
  headers: () => Record<string, string>;
};

export type VersionedWriteResult =
  | { ok: true; updatedAt: string | null }
  | { ok: false; stale: boolean; notFound: boolean; error: string };

export type GuideSaveResult =
  | { ok: true; updatedAt: string | null }
  | {
      ok: false;
      /** Hangi adımda durdu: "guide" (PATCH kapısı) veya "sections" (PUT). */
      stage: "guide" | "sections";
      stale: boolean;
      notFound: boolean;
      error: string;
      /** Bu sekmenin bildiği EN GÜNCEL sürüm (kısmi başarıda PATCH'in yeni sürümü). */
      updatedAt: string | null;
    };

type WriteJson = {
  ok?: boolean;
  stale?: boolean;
  notFound?: boolean;
  error?: string;
  updated_at?: string | null;
};

async function versionedWrite(
  deps: GuideWriteDeps,
  url: string,
  method: "PATCH" | "PUT",
  body: Record<string, unknown>,
  expectedUpdatedAt: string | null,
  fallbackError: (status: number) => string,
): Promise<VersionedWriteResult> {
  let res: Response;
  try {
    res = await deps.fetchImpl(url, {
      method,
      headers: deps.headers(),
      body: JSON.stringify({ ...body, expected_updated_at: expectedUpdatedAt }),
    });
  } catch {
    return { ok: false, stale: false, notFound: false, error: "Sunucuya ulaşılamadı." };
  }
  const json = (await res.json().catch(() => ({}))) as WriteJson;
  if (res.status === 409 && json.stale === true) {
    return { ok: false, stale: true, notFound: false, error: SIFA_STALE_MESSAGE };
  }
  if (res.status === 404 || json.notFound === true) {
    return { ok: false, stale: false, notFound: true, error: "Kayıt bulunamadı veya erişim izniniz yok." };
  }
  if (!res.ok || json.ok !== true) {
    return { ok: false, stale: false, notFound: false, error: json.error ?? fallbackError(res.status) };
  }
  // Demo yanıtı (yazma yok) updated_at taşımaz → bilinen sürüm DEĞİŞMEZ.
  const updatedAt =
    typeof json.updated_at === "string" || json.updated_at === null ? json.updated_at : expectedUpdatedAt;
  return { ok: true, updatedAt };
}

/** PATCH guides/[id] — sürüm kontrollü (ör. Kaydet kapısı veya görsel persist). */
export function patchGuideVersioned(
  deps: GuideWriteDeps,
  guideId: string,
  fields: Record<string, unknown>,
  expectedUpdatedAt: string | null,
): Promise<VersionedWriteResult> {
  return versionedWrite(
    deps,
    `/api/sifa-rehberi/guides/${encodeURIComponent(guideId)}`,
    "PATCH",
    fields,
    expectedUpdatedAt,
    (s) => `Kayıt güncellenemedi (HTTP ${s}).`,
  );
}

/** PUT guides/[id]/sections — sürüm kontrollü (beklenen = PATCH kapısının yeni sürümü). */
export function putGuideSectionsVersioned(
  deps: GuideWriteDeps,
  guideId: string,
  sections: unknown[],
  expectedUpdatedAt: string | null,
): Promise<VersionedWriteResult> {
  return versionedWrite(
    deps,
    `/api/sifa-rehberi/guides/${encodeURIComponent(guideId)}/sections`,
    "PUT",
    { sections },
    expectedUpdatedAt,
    (s) => `Bölümler kaydedilemedi (HTTP ${s}).`,
  );
}

/**
 * Kaydet orkestrasyonu: PATCH (kapı) → [sections verildiyse] PUT.
 * `sections === null` → yalnız PATCH (düz/legacy kayıt).
 */
export async function saveGuideVersioned(
  deps: GuideWriteDeps,
  input: {
    guideId: string;
    fields: Record<string, unknown>;
    sections: unknown[] | null;
    expectedUpdatedAt: string | null;
  },
): Promise<GuideSaveResult> {
  const gate = await patchGuideVersioned(deps, input.guideId, input.fields, input.expectedUpdatedAt);
  if (!gate.ok) {
    // KAPI: 409/404/hata → PUT ASLA çağrılmaz; sekmenin sürümü değişmez.
    return { ok: false, stage: "guide", stale: gate.stale, notFound: gate.notFound, error: gate.error, updatedAt: input.expectedUpdatedAt };
  }
  if (input.sections === null) return { ok: true, updatedAt: gate.updatedAt };

  const put = await putGuideSectionsVersioned(deps, input.guideId, input.sections, gate.updatedAt);
  if (!put.ok) {
    return { ok: false, stage: "sections", stale: put.stale, notFound: put.notFound, error: put.error, updatedAt: gate.updatedAt };
  }
  return { ok: true, updatedAt: put.updatedAt };
}

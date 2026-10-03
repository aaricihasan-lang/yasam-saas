import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { CatalogActor } from "@/lib/aromaterapi/service/catalogMethodMutations";

/**
 * Aromaterapi Bitki (takson) / Preparat / Bilgi Kaydı (claim) SAHİP SİLME server adapter'ı
 * (server-only; Doğal Destek P2 — AROMA-4).
 *
 * Silme YALNIZ SECURITY DEFINER RPC ile (migration 20271003100000; write-gate: service_role bu
 * tablolarda yalnız SELECT). Actor/tenant kullanıcı input'undan YAPISAL olarak ayrıdır; yalnız
 * route guard'ından gelir. sourceMutations.deleteSource/emitSourceDelete deseniyle birebir:
 *   - Referanslı kayıt → *_REFERENCED (409 + yalnız sayılar; ham DETAIL istemciye TAŞINMAZ).
 *   - Eski sürüm → AROMA_STALE (409). Başka tenant / eksik → *_NOT_FOUND (404).
 *   - RPC henüz DB'de yoksa (PGRST202 / 42883) → AROMA_DELETE_UNAVAILABLE (503); veri etkilenmez.
 * Ham DB hata metni route'a/istemciye TAŞINMAZ.
 */

export type ContentDeleteKind = "plant_taxon" | "preparation" | "claim";

export type ContentDeleteErrorCode =
  | "AROMA_ACTOR_ID_REQUIRED"
  | "AROMA_ACTOR_LABEL_INVALID"
  | "AROMA_REASON_INVALID"
  | "AROMA_TAXON_NOT_FOUND"
  | "AROMA_PREPARATION_NOT_FOUND"
  | "AROMA_CLAIM_NOT_FOUND"
  | "AROMA_TAXON_REFERENCED"
  | "AROMA_PREPARATION_REFERENCED"
  | "AROMA_CLAIM_REFERENCED"
  | "AROMA_STALE"
  | "AROMA_DELETE_UNAVAILABLE"
  | "AROMA_WRITE_FAILED";

export const CONTENT_DELETE_ERROR_HTTP: Readonly<Record<ContentDeleteErrorCode, number>> = {
  AROMA_ACTOR_ID_REQUIRED: 500,
  AROMA_ACTOR_LABEL_INVALID: 500,
  AROMA_REASON_INVALID: 400,
  AROMA_TAXON_NOT_FOUND: 404,
  AROMA_PREPARATION_NOT_FOUND: 404,
  AROMA_CLAIM_NOT_FOUND: 404,
  AROMA_TAXON_REFERENCED: 409,
  AROMA_PREPARATION_REFERENCED: 409,
  AROMA_CLAIM_REFERENCED: 409,
  AROMA_STALE: 409,
  AROMA_DELETE_UNAVAILABLE: 503,
  AROMA_WRITE_FAILED: 500,
};

/** RPC'nin RAISE EXCEPTION ... ERRCODE='P0001' mesajları — EXACT allowlist (Set.has). */
const RPC_P0001_CODES: ReadonlySet<ContentDeleteErrorCode> = new Set<ContentDeleteErrorCode>([
  "AROMA_ACTOR_ID_REQUIRED",
  "AROMA_ACTOR_LABEL_INVALID",
  "AROMA_REASON_INVALID",
  "AROMA_TAXON_NOT_FOUND",
  "AROMA_PREPARATION_NOT_FOUND",
  "AROMA_CLAIM_NOT_FOUND",
  "AROMA_TAXON_REFERENCED",
  "AROMA_PREPARATION_REFERENCED",
  "AROMA_CLAIM_REFERENCED",
  "AROMA_STALE",
]);

type KindSpec = {
  rpc: string;
  idParam: string;
  referencedCode: ContentDeleteErrorCode;
  /** DETAIL JSON anahtarları (snake_case) — yanıtta aynen (yalnız sayı) döner. */
  referenceKeys: readonly string[];
};

const KIND_SPECS: Readonly<Record<ContentDeleteKind, KindSpec>> = {
  plant_taxon: {
    rpc: "aromatherapy_delete_plant_taxon_with_audit",
    idParam: "p_taxon_id",
    referencedCode: "AROMA_TAXON_REFERENCED",
    referenceKeys: ["preparations"],
  },
  preparation: {
    rpc: "aromatherapy_delete_preparation_with_audit",
    idParam: "p_preparation_id",
    referencedCode: "AROMA_PREPARATION_REFERENCED",
    referenceKeys: ["claims", "method_series"],
  },
  claim: {
    rpc: "aromatherapy_delete_claim_with_audit",
    idParam: "p_claim_id",
    referencedCode: "AROMA_CLAIM_REFERENCED",
    referenceKeys: ["relations"],
  },
};

/** Referans sayıları (snake_case anahtar → sayı). -1 = yarışta FK ile yakalandı (sayı bilinmiyor). */
export type ContentReferenceCounts = Record<string, number>;

export type ContentDeleteResult =
  | { ok: true; entityId: string }
  | { ok: false; code: ContentDeleteErrorCode; references?: ContentReferenceCounts };

function errField(error: unknown, key: "code" | "message" | "details"): unknown {
  return error && typeof error === "object" && key in error
    ? (error as Record<string, unknown>)[key]
    : undefined;
}

/** RPC hatası → stabil kod (EXACT eşitlik; ham metin döndürülmez). */
export function classifyContentDeleteError(kind: ContentDeleteKind, error: unknown): ContentDeleteErrorCode {
  const sqlstate = errField(error, "code");
  // RPC henüz uygulanmamış (PostgREST şema önbelleğinde yok / PG fonksiyon yok).
  if (sqlstate === "PGRST202" || sqlstate === "42883") return "AROMA_DELETE_UNAVAILABLE";
  // FK RESTRICT (23503) → aynı stabil "kullanılıyor" koduna (defense-in-depth).
  if (sqlstate === "23503") return KIND_SPECS[kind].referencedCode;
  const message = errField(error, "message");
  if (typeof message === "string" && RPC_P0001_CODES.has(message as ContentDeleteErrorCode)) {
    return message as ContentDeleteErrorCode;
  }
  return "AROMA_WRITE_FAILED";
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * RPC hata `details` (PG DETAIL → PostgREST `details`) → yalnız beklenen anahtarların sayıları.
 * Ayrıştırılamazsa null (sayısız 409 yine döner).
 */
export function parseContentReferenceDetails(
  kind: ContentDeleteKind,
  details: unknown,
): ContentReferenceCounts | null {
  if (typeof details !== "string" || details.trim() === "") return null;
  try {
    const obj = JSON.parse(details) as Record<string, unknown>;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const out: ContentReferenceCounts = {};
    for (const k of KIND_SPECS[kind].referenceKeys) out[k] = num(obj[k]);
    return out;
  } catch {
    return null;
  }
}

export type ContentDeleteInput = {
  expectedUpdatedAt: string;
  reason: string;
};

export async function deleteContentRecord(
  db: SupabaseClient,
  kind: ContentDeleteKind,
  actor: CatalogActor,
  entityId: string,
  input: ContentDeleteInput,
): Promise<ContentDeleteResult> {
  const spec = KIND_SPECS[kind];
  const { data, error } = await db.rpc(spec.rpc, {
    p_tenant_id: actor.tenantId,
    p_actor_user_id: actor.userId,
    p_actor_label_snapshot: actor.label,
    [spec.idParam]: entityId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_reason: input.reason,
  });
  if (error) {
    const code = classifyContentDeleteError(kind, error);
    if (code === spec.referencedCode) {
      const refs = parseContentReferenceDetails(kind, errField(error, "details"));
      return refs ? { ok: false, code, references: refs } : { ok: false, code };
    }
    if (code !== "AROMA_STALE" && CONTENT_DELETE_ERROR_HTTP[code] >= 500) {
      console.error(`[aromaterapi:delete:${kind}] RPC failed:`, errField(error, "code"), errField(error, "message"));
    }
    return { ok: false, code };
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  const deletedId = row && typeof row.entity_id === "string" ? row.entity_id : null;
  if (!deletedId || row?.deleted !== true) return { ok: false, code: "AROMA_WRITE_FAILED" };
  return { ok: true, entityId: deletedId };
}

/** ContentDeleteResult → NextResponse. Referanslı → 409 + `references` (yalnız sayılar). */
export function emitContentDelete(result: ContentDeleteResult): NextResponse {
  if (!result.ok) {
    const body: Record<string, unknown> = { ok: false, code: result.code };
    if (result.references) body.references = { ...result.references };
    if (result.code === "AROMA_STALE") body.stale = true;
    return NextResponse.json(body, {
      status: CONTENT_DELETE_ERROR_HTTP[result.code],
      headers: { "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json(
    { ok: true, deleted: true, entity_id: result.entityId },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

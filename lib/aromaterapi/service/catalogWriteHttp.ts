import "server-only";

import { NextResponse } from "next/server";
import {
  CATALOG_METHOD_ERROR_HTTP,
  type CatalogWriteResult,
} from "@/lib/aromaterapi/service/catalogMethodMutations";
import type { MethodRevisionContent, MethodStep } from "@/lib/aromaterapi/service/methodCanonical";

/**
 * Aromaterapi V2 — C3D-B2A katalog/method write route yardımcıları (server-only).
 *
 * Exact gövde byte limitleri + stabil HTTP eşlemesi. Ham DB metni SIZMAZ; yalnız
 * `{ ok:false, code }` / `{ ok:true, ... }`. Route'lar EXACT allowlist kullandığından
 * allowlist dışı anahtar (note_hash/canonical_name/revision/tenant/actor/id vb.) → 400.
 */

export const CATALOG_BODY_LIMITS = {
  taxon: 16 * 1024,
  preparation: 16 * 1024,
  method: 64 * 1024,
  status: 8 * 1024,
} as const;

export function catalogBad(code: string): NextResponse {
  return NextResponse.json({ ok: false, code }, { status: 400 });
}

export function catalogPayloadTooLarge(): NextResponse {
  return NextResponse.json(
    { ok: false, code: "AROMA_WRITE_PAYLOAD_TOO_LARGE" },
    { status: 413 },
  );
}

export function catalogDemoForbidden(): NextResponse {
  return NextResponse.json(
    { ok: false, code: "AROMA_WRITE_DEMO_FORBIDDEN" },
    { status: 403 },
  );
}

/** CatalogWriteResult → NextResponse. Başarı: no-op → 200, aksi → createdStatus. */
export function emitCatalogWrite(result: CatalogWriteResult, createdStatus: number): NextResponse {
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, code: result.code },
      { status: CATALOG_METHOD_ERROR_HTTP[result.code] },
    );
  }
  const body: Record<string, unknown> = {
    ok: true,
    noop: result.noop,
    entity_id: result.entityId,
    updated_at: result.updatedAt,
  };
  if (result.seriesId !== undefined) body.series_id = result.seriesId;
  if (result.revisionId !== undefined) body.revision_id = result.revisionId;
  if (result.revision !== undefined) body.revision = result.revision;
  if (result.latestRevisionId !== undefined) body.latest_revision_id = result.latestRevisionId;
  if (result.latestRevision !== undefined) body.latest_revision = result.latestRevision;
  if (result.status !== undefined) body.status = result.status;
  if (result.archivedRevisionId !== undefined) body.archived_revision_id = result.archivedRevisionId;
  return NextResponse.json(body, { status: result.noop ? 200 : createdStatus });
}

// ─── Alan doğrulayıcılar (coerce/trim YAPMAZ; yalnız şekil/tip) ───

export type FieldResult<T> = { ok: true; value: T } | { ok: false };

/** Zorunlu, boş olmayan string. */
export function reqNonEmptyString(v: unknown): FieldResult<string> {
  if (typeof v === "string" && v.length > 0) return { ok: true, value: v };
  return { ok: false };
}

/** Opsiyonel nullable string: omitted→null, null→null, string→string, aksi→fail. */
export function optNullableString(obj: Record<string, unknown>, key: string): FieldResult<string | null> {
  if (!(key in obj)) return { ok: true, value: null };
  const v = obj[key];
  if (v === null) return { ok: true, value: null };
  if (typeof v === "string") return { ok: true, value: v };
  return { ok: false };
}

/** Opsiyonel boolean (varsayılan verilir). */
export function optBoolean(obj: Record<string, unknown>, key: string, def: boolean): FieldResult<boolean> {
  if (!(key in obj) || obj[key] === null) return { ok: true, value: def };
  const v = obj[key];
  if (typeof v === "boolean") return { ok: true, value: v };
  return { ok: false };
}

/** Body plain-object mı? (array/null değil) */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Tüm anahtarlar allowlist içinde mi? */
export function keysAllowed(obj: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  for (const k of Object.keys(obj)) if (!allowed.has(k)) return false;
  return true;
}

/** Method revision içerik alanları. method_text zorunlu; steps present ise array (derin
 * doğrulama DB CHECK'te → 422). Değerler coerce/trim EDİLMEZ; steps verbatim geçer. */
export function extractMethodContent(obj: Record<string, unknown>): FieldResult<MethodRevisionContent> {
  const methodText = reqNonEmptyString(obj.method_text);
  if (!methodText.ok) return { ok: false };

  const ppu = optNullableString(obj, "plant_part_used");
  const ms = optNullableString(obj, "material_state");
  const eq = optNullableString(obj, "equipment");
  const ar = optNullableString(obj, "amount_ratio");
  const sc = optNullableString(obj, "solvent_carrier");
  const dt = optNullableString(obj, "duration_text");
  const tt = optNullableString(obj, "temperature_text");
  const fl = optNullableString(obj, "filtration");
  const rs = optNullableString(obj, "resting");
  const st = optNullableString(obj, "storage");
  const qn = optNullableString(obj, "quality_notes");
  const sn = optNullableString(obj, "safety_notes");
  if (!ppu.ok || !ms.ok || !eq.ok || !ar.ok || !sc.ok || !dt.ok || !tt.ok || !fl.ok || !rs.ok || !st.ok || !qn.ok || !sn.ok) {
    return { ok: false };
  }

  let steps: readonly MethodStep[] | null = null;
  if ("steps" in obj && obj.steps !== null) {
    if (!Array.isArray(obj.steps)) return { ok: false };
    steps = obj.steps as MethodStep[]; // derin şekil doğrulaması DB CHECK'te (422)
  }

  return {
    ok: true,
    value: {
      plant_part_used: ppu.value,
      material_state: ms.value,
      method_text: methodText.value,
      equipment: eq.value,
      amount_ratio: ar.value,
      solvent_carrier: sc.value,
      duration_text: dt.value,
      temperature_text: tt.value,
      steps,
      filtration: fl.value,
      resting: rs.value,
      storage: st.value,
      quality_notes: qn.value,
      safety_notes: sn.value,
    },
  };
}

// Astroloji — EŞLENMEMİŞ ALAN DENETİMİ (owner-only; YALNIZ SUNUCU).
//
// Sağlayıcı yanıtında adaptör beyaz listesinde olmayan alanların YALNIZ yolları listelenir (değer
// hiçbir zaman kaydedilmez/gösterilmez). Sınıflandırma bir KAYITTIR: adaptör fail-closed davranışını
// değiştirmez — bir alanın teknik/yorum katmanına girmesi yalnız kod (adaptör sürümü) değişikliğiyle olur.

import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { classifyUnmappedField, isSchemaMissing, listUnmappedFields, logAstroDbError, UNMAPPED_CLASSES, type UnmappedClass } from "../persistence/repo";
import { ASTRO_NOT_READY, type EngineCtx, type ServiceResponse } from "../engine/service";

assertServerOnly("lib/astrology/audit/unmapped");

export const UNMAPPED_CLASS_LABELS: Record<UnmappedClass, string> = {
  unclassified: "Sınıflandırılmadı",
  technical: "Teknik",
  interpretation: "Roxy yorumu",
  ignored: "Gereksiz",
  unverified: "Doğrulanamadı",
};

export async function listUnmappedAudit(ctx: EngineCtx): Promise<ServiceResponse> {
  const r = await listUnmappedFields(ctx.db);
  if (r.error) {
    if (isSchemaMissing(r.error)) return ASTRO_NOT_READY;
    logAstroDbError("unmapped.list", r.error);
    return { status: 500, body: { ok: false, code: "DB_ERROR", error: "İşlem tamamlanamadı." } };
  }
  return {
    status: 200,
    body: {
      ok: true,
      fields: r.rows.map((x) => ({
        id: x.id,
        provider: x.provider,
        endpoint: x.endpoint,
        fieldPath: x.field_path,
        firstSeenAt: x.first_seen_at,
        lastSeenAt: x.last_seen_at,
        seenCount: x.seen_count,
        classification: x.classification,
        classificationLabel: UNMAPPED_CLASS_LABELS[x.classification] ?? x.classification,
        classifiedAt: x.classified_at,
      })),
    },
  };
}

export async function classifyUnmappedAudit(ctx: EngineCtx, raw: unknown): Promise<ServiceResponse> {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (!(UNMAPPED_CLASSES as readonly unknown[]).includes(o.classification)) {
    return { status: 400, body: { ok: false, code: "INVALID_CLASS", error: "Geçersiz sınıflandırma." } };
  }
  const r = await classifyUnmappedField(ctx.db, String(o.id ?? ""), o.classification as UnmappedClass);
  if (r.error) {
    if (isSchemaMissing(r.error)) return ASTRO_NOT_READY;
    logAstroDbError("unmapped.classify", r.error);
    return { status: 500, body: { ok: false, code: "DB_ERROR", error: "İşlem tamamlanamadı." } };
  }
  if (!r.found) return { status: 404, body: { ok: false, code: "FIELD_NOT_FOUND", error: "Alan kaydı bulunamadı." } };
  return { status: 200, body: { ok: true } };
}

import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { isClassicEnabled } from "@/lib/numeroloji-klasik/flags";
import { isUuid } from "@/lib/numeroloji-klasik/input";
import { classicError, classicJson, classicNotFound, validationResponse } from "@/lib/numeroloji-klasik/server/http";
import { getNote, softDeleteNote, updateNote } from "@/lib/numeroloji-klasik/server/repository";
import { canonicalSha256 } from "@/lib/numeroloji-klasik/compare/hash";
import { COMPARE_MAX_BODY_BYTES, loadLegacy, readLimitedJsonBody, toNoteView, validateNotePatch } from "@/lib/numeroloji-klasik/server/compareService";

export const runtime = "nodejs";

/**
 * /api/numeroloji-klasik/karsilastirma/notlar/[id]
 *   GET    — not + legacyChanged (kayıtlı Mevcut kaydın özeti not anındakinden farklı mı; null = karşılaştırılamaz).
 *   PATCH  — { body, rowVersion } (row_version CAS → 409). Anlık görüntü DEĞİŞMEZ (not yazıldığı anın kaydıdır).
 *   DELETE — yumuşak silme (?rowVersion= verilirse CAS; verilmezse güncel sürüm).
 * Başka tenant / silinmiş / yok → 404. Demo → yazma yok.
 */
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!isUuid(id)) return classicNotFound();

  const r = await getNote(guard.db, guard.tenantId, id.toLowerCase());
  if (!r.ok) return r.reason === "not_found" ? classicNotFound() : classicError("DB_ERROR");
  let legacyChanged: boolean | null = null;
  const savedHash = (r.value.snapshot as { sourceHashes?: { legacy?: unknown } } | null)?.sourceHashes?.legacy;
  if (r.value.legacy_record_id && typeof savedHash === "string") {
    const l = await loadLegacy(guard.db, guard.tenantId, r.value.legacy_record_id);
    if (l.ok && l.value.analysisData !== null && l.value.analysisData !== undefined) legacyChanged = canonicalSha256(l.value.analysisData) !== savedHash;
  }
  return classicJson(200, { ok: true, note: toNoteView(r.value), legacyChanged });
}

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!isUuid(id)) return classicNotFound();
  if (guard.is_demo_account) return classicError("DEMO_READONLY");

  const body = await readLimitedJsonBody(req, COMPARE_MAX_BODY_BYTES);
  if (!body.ok) return validationResponse(body);
  const v = validateNotePatch(body.value);
  if (!v.ok) return validationResponse(v);

  const r = await updateNote(guard.db, guard.tenantId, id.toLowerCase(), v.value.rowVersion, { body: v.value.body });
  if (!r.ok) {
    if (r.reason === "not_found") return classicNotFound();
    if (r.reason === "conflict") return classicError("CONFLICT");
    await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "record_updated", subEntity: "analysis", errorClass: "server" });
    return classicError("DB_ERROR");
  }
  await trackUsage(guard, req, { module: "numerology", action: "record_updated", subEntity: "analysis", resourceId: r.value.id });
  return classicJson(200, { ok: true, note: toNoteView(r.value) });
}

export async function DELETE(req: NextRequest, ctx: Ctx): Promise<Response> {
  if (!isClassicEnabled()) return classicNotFound();
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!isUuid(id)) return classicNotFound();
  if (guard.is_demo_account) return classicError("DEMO_READONLY");

  const rv = req.nextUrl.searchParams.get("rowVersion");
  if (rv !== null && !/^[1-9]\d{0,9}$/.test(rv)) return classicJson(400, { ok: false, code: "INVALID_ROW_VERSION", error: "Sürüm bilgisi geçersiz." });
  const noteId = id.toLowerCase();
  let expected: number;
  if (rv === null) {
    const cur = await getNote(guard.db, guard.tenantId, noteId);
    if (!cur.ok) return cur.reason === "not_found" ? classicNotFound() : classicError("DB_ERROR");
    expected = cur.value.row_version;
  } else expected = Number(rv);

  const r = await softDeleteNote(guard.db, guard.tenantId, noteId, expected);
  if (!r.ok) {
    if (r.reason === "not_found") return classicNotFound();
    if (r.reason === "conflict") return classicError("CONFLICT");
    await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "record_deleted", subEntity: "analysis", errorClass: "server" });
    return classicError("DB_ERROR");
  }
  await trackUsage(guard, req, { module: "numerology", action: "record_deleted", subEntity: "analysis", resourceId: noteId });
  return classicJson(200, { ok: true, id: noteId });
}

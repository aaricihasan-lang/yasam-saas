import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  updateConceptLabel,
  deleteConceptLabel,
  type UpdateConceptLabelPatch,
  type UpdateConceptLabelErrorCode,
  type DeleteConceptLabelErrorCode,
} from "@/lib/yebs/service/conceptLabelMutations";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; labelId: string }> };

/**
 * PATCH  /api/admin/yebs/concepts/[id]/labels/[labelId]   — audit'li UPDATE
 * DELETE /api/admin/yebs/concepts/[id]/labels/[labelId]   — audit'li DELETE (action=remove)
 *
 * YEBS D4 (yebs_concept_labels) audit'li admin mutation ucu (API-A2).
 *
 * Güvenlik:
 *   - Actor YALNIZ guard.adminId; concept id + label id URL'den; request/operation
 *     ID server-side. Ayrı label detail GET endpoint'i YOK (current updated_at
 *     labels list'inden alınır).
 *   - reason ZORUNLU (update + delete); expected_updated_at ZORUNLU.
 *   - Değerler coerce/trim/normalize EDİLMEZ; canonical mutation yalnız RPC üzerinden.
 *   - Parent concept draft değilse RPC 409 CONCEPT_STATUS_LOCKED döndürür.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REASON_MAX_LEN = 2000;

const EXPECTED_UPDATED_AT_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

// STRICT takvim doğrulaması (A1U/concept update ile birebir). Geçerli değer
// DEĞİŞTİRİLMEDEN aktarılır.
function isValidExpectedUpdatedAt(value: string): boolean {
  const m = EXPECTED_UPDATED_AT_RE.exec(value);
  if (!m) return false;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  const tz = m[8];

  if (year === 0) return false;
  if (month < 1 || month > 12) return false;
  if (hour > 23) return false;
  if (minute > 59) return false;
  if (second > 59) return false;

  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > daysInMonth[month - 1]) return false;

  if (tz !== "Z") {
    const offsetHour = Number(tz.slice(1, 3));
    const offsetMinute = Number(tz.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }

  return Number.isFinite(Date.parse(value));
}

/** URL parametrelerini (concept id + label id) strict UUID doğrular. */
function validateIds(
  id: string,
  labelId: string,
): Response | null {
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz kavram kimliği.", code: "YEBS_INVALID_CONCEPT_ID" },
      { status: 400 },
    );
  }
  if (!UUID_RE.test(labelId)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz etiket kimliği.", code: "YEBS_INVALID_LABEL_ID" },
      { status: 400 },
    );
  }
  return null;
}

/* ============================================================
 * PATCH — update
 * ============================================================ */

const PATCH_ALLOWED_KEYS = [
  "expected_updated_at",
  "reason",
  "language_tag",
  "script_code",
  "label",
  "label_kind",
  "transliteration_scheme",
  "is_primary",
] as const;

function invalidUpdateBody(): Response {
  return NextResponse.json(
    { ok: false, error: "Geçersiz istek gövdesi.", code: "YEBS_INVALID_REQUEST_BODY" },
    { status: 400 },
  );
}

function mapUpdateError(code: UpdateConceptLabelErrorCode): Response {
  switch (code) {
    case "YEBS_INVALID_PATCH":
    case "YEBS_INVALID_LABEL_INPUT":
    case "YEBS_REASON_INVALID":
      return NextResponse.json(
        { ok: false, error: "Geçersiz etiket verisi.", code },
        { status: 400 },
      );
    case "YEBS_CONCEPT_NOT_FOUND":
      return NextResponse.json(
        { ok: false, error: "Etiketin bağlı olduğu kavram bulunamadı.", code },
        { status: 404 },
      );
    case "YEBS_LABEL_NOT_FOUND":
      return NextResponse.json(
        { ok: false, error: "Etiket kaydı bulunamadı.", code },
        { status: 404 },
      );
    case "YEBS_LABEL_DUPLICATE":
      return NextResponse.json(
        { ok: false, error: "Bu kavramda aynı dil/yazı/tür/etiket kombinasyonu zaten var.", code },
        { status: 409 },
      );
    case "YEBS_LABEL_PRIMARY_CONFLICT":
      return NextResponse.json(
        { ok: false, error: "Bu kavramda bu dil için zaten bir birincil etiket var.", code },
        { status: 409 },
      );
    case "YEBS_LABEL_STALE_UPDATE":
      return NextResponse.json(
        { ok: false, error: "Etiket başka bir işlem tarafından güncellendi. Güncel kaydı yeniden yükleyin.", code },
        { status: 409 },
      );
    case "YEBS_CONCEPT_STATUS_LOCKED":
      return NextResponse.json(
        { ok: false, error: "Yalnız taslak durumundaki kavramların etiketleri düzenlenebilir.", code },
        { status: 409 },
      );
    case "YEBS_LABEL_NO_CHANGES":
      return NextResponse.json(
        { ok: false, error: "Etikette kaydedilecek bir değişiklik bulunamadı.", code },
        { status: 409 },
      );
    case "YEBS_ADMIN_NOT_FOUND":
    case "YEBS_ADMIN_NOT_ACTIVE":
      return NextResponse.json(
        { ok: false, error: "Admin yetkisi doğrulanamadı.", code: "YEBS_ADMIN_FORBIDDEN" },
        { status: 403 },
      );
    case "YEBS_REQUEST_ID_REQUIRED":
    case "YEBS_OPERATION_ID_REQUIRED":
    case "YEBS_CONCEPT_ID_REQUIRED":
    case "YEBS_LABEL_ID_REQUIRED":
    case "YEBS_EXPECTED_UPDATED_AT_REQUIRED":
    case "YEBS_LABEL_UPDATE_FAILED":
    default:
      return NextResponse.json(
        { ok: false, error: "Etiket güncellenemedi.", code: "YEBS_LABEL_UPDATE_FAILED" },
        { status: 500 },
      );
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext,
): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id, labelId } = await ctx.params;
  const idErr = validateIds(id, labelId);
  if (idErr) return idErr;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidUpdateBody();
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return invalidUpdateBody();
  }
  const obj = body as Record<string, unknown>;

  const allowed = new Set<string>(PATCH_ALLOWED_KEYS);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) return invalidUpdateBody();
  }

  // --- reason ZORUNLU ---
  const reason = obj.reason;
  if (typeof reason !== "string" || reason.trim() === "" || reason.length > REASON_MAX_LEN) {
    return invalidUpdateBody();
  }

  // --- expected_updated_at ZORUNLU ---
  const expectedUpdatedAt = obj.expected_updated_at;
  if (typeof expectedUpdatedAt !== "string" || !isValidExpectedUpdatedAt(expectedUpdatedAt)) {
    return invalidUpdateBody();
  }

  // --- Canonical patch: yalnız PRESENT anahtarlar; coercion YOK; null korunur ---
  const patch: UpdateConceptLabelPatch = {};

  // NOT-NULL string alanlar present ise string olmalı.
  for (const key of ["language_tag", "script_code", "label", "label_kind"] as const) {
    if (key in obj) {
      const v = obj[key];
      if (typeof v !== "string") return invalidUpdateBody();
      patch[key] = v;
    }
  }
  // Nullable string alan present ise string veya null.
  if ("transliteration_scheme" in obj) {
    const v = obj.transliteration_scheme;
    if (v !== null && typeof v !== "string") return invalidUpdateBody();
    patch.transliteration_scheme = v;
  }
  // Boolean alan present ise boolean.
  if ("is_primary" in obj) {
    const v = obj.is_primary;
    if (typeof v !== "boolean") return invalidUpdateBody();
    patch.is_primary = v;
  }

  if (Object.keys(patch).length === 0) {
    return invalidUpdateBody();
  }

  const result = await updateConceptLabel(
    db,
    adminId,
    id,
    labelId,
    expectedUpdatedAt,
    patch,
    reason,
  );

  if (!result.ok) {
    return mapUpdateError(result.code);
  }

  return NextResponse.json({ ok: true, row: result.row }, { status: 200 });
}

/* ============================================================
 * DELETE
 * ============================================================ */

const DELETE_ALLOWED_KEYS = ["expected_updated_at", "reason"] as const;

function invalidDeleteBody(): Response {
  return NextResponse.json(
    { ok: false, error: "Geçersiz istek gövdesi.", code: "YEBS_INVALID_REQUEST_BODY" },
    { status: 400 },
  );
}

function mapDeleteError(code: DeleteConceptLabelErrorCode): Response {
  switch (code) {
    case "YEBS_REASON_INVALID":
      return NextResponse.json(
        { ok: false, error: "Geçersiz etiket verisi.", code },
        { status: 400 },
      );
    case "YEBS_CONCEPT_NOT_FOUND":
      return NextResponse.json(
        { ok: false, error: "Etiketin bağlı olduğu kavram bulunamadı.", code },
        { status: 404 },
      );
    case "YEBS_LABEL_NOT_FOUND":
      return NextResponse.json(
        { ok: false, error: "Etiket kaydı bulunamadı.", code },
        { status: 404 },
      );
    case "YEBS_LABEL_STALE_UPDATE":
      return NextResponse.json(
        { ok: false, error: "Etiket başka bir işlem tarafından güncellendi. Güncel kaydı yeniden yükleyin.", code },
        { status: 409 },
      );
    case "YEBS_CONCEPT_STATUS_LOCKED":
      return NextResponse.json(
        { ok: false, error: "Yalnız taslak durumundaki kavramların etiketleri silinebilir.", code },
        { status: 409 },
      );
    case "YEBS_ADMIN_NOT_FOUND":
    case "YEBS_ADMIN_NOT_ACTIVE":
      return NextResponse.json(
        { ok: false, error: "Admin yetkisi doğrulanamadı.", code: "YEBS_ADMIN_FORBIDDEN" },
        { status: 403 },
      );
    case "YEBS_REQUEST_ID_REQUIRED":
    case "YEBS_OPERATION_ID_REQUIRED":
    case "YEBS_CONCEPT_ID_REQUIRED":
    case "YEBS_LABEL_ID_REQUIRED":
    case "YEBS_EXPECTED_UPDATED_AT_REQUIRED":
    case "YEBS_LABEL_DELETE_FAILED":
    default:
      return NextResponse.json(
        { ok: false, error: "Etiket silinemedi.", code: "YEBS_LABEL_DELETE_FAILED" },
        { status: 500 },
      );
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext,
): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id, labelId } = await ctx.params;
  const idErr = validateIds(id, labelId);
  if (idErr) return idErr;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidDeleteBody();
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return invalidDeleteBody();
  }
  const obj = body as Record<string, unknown>;

  const allowed = new Set<string>(DELETE_ALLOWED_KEYS);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) return invalidDeleteBody();
  }

  // --- reason ZORUNLU ---
  const reason = obj.reason;
  if (typeof reason !== "string" || reason.trim() === "" || reason.length > REASON_MAX_LEN) {
    return invalidDeleteBody();
  }

  // --- expected_updated_at ZORUNLU ---
  const expectedUpdatedAt = obj.expected_updated_at;
  if (typeof expectedUpdatedAt !== "string" || !isValidExpectedUpdatedAt(expectedUpdatedAt)) {
    return invalidDeleteBody();
  }

  const result = await deleteConceptLabel(
    db,
    adminId,
    id,
    labelId,
    expectedUpdatedAt,
    reason,
  );

  if (!result.ok) {
    return mapDeleteError(result.code);
  }

  return NextResponse.json({ ok: true, row: result.row }, { status: 200 });
}

import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { getConceptById } from "@/lib/yebs/service/concepts";
import {
  updateConcept,
  type UpdateConceptPatch,
  type UpdateConceptErrorCode,
} from "@/lib/yebs/service/conceptMutations";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/yebs/concepts/[id]
 *
 * YEBS D3 (yebs_concepts) SALT-OKUNUR admin detay ucu (API-A2R).
 * Canonical 8-field row. Nested labels DAHİL DEĞİL; audit dahil değil.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  ctx: RouteContext,
): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz kavram kimliği.", code: "YEBS_INVALID_CONCEPT_ID" },
      { status: 400 },
    );
  }

  const result = await getConceptById(db, id);

  if (!result.ok) {
    if (result.code === "YEBS_CONCEPT_NOT_FOUND") {
      return NextResponse.json(
        { ok: false, error: "Kavram kaydı bulunamadı.", code: result.code },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "YEBS kavram kaydı alınamadı.", code: result.code },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, row: result.row });
}

/**
 * PATCH /api/admin/yebs/concepts/[id]
 *
 * YEBS D3 (yebs_concepts) audit'li admin UPDATE ucu (API-A2).
 *
 * Güvenlik:
 *   - Actor YALNIZ guard.adminId'den; id URL'den; request/operation ID server-side.
 *   - Body yalnız 4 exact anahtar (expected_updated_at, reason, slug, concept_type);
 *     tradition_id/school_id/status/actor/id/timestamp/request/operation/audit
 *     alanları KABUL EDİLMEZ.
 *   - reason ZORUNLU; expected_updated_at ZORUNLU (strict tz'li RFC3339 + takvim).
 *   - Değerler coerce/trim/normalize EDİLMEZ; canonical update yalnız RPC üzerinden.
 */

const REASON_MAX_LEN = 2000;

const EXPECTED_UPDATED_AT_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

// STRICT takvim doğrulaması (A1U ile birebir). Geçerli değer DEĞİŞTİRİLMEDEN aktarılır.
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

const PATCH_ALLOWED_KEYS = [
  "expected_updated_at",
  "reason",
  "slug",
  "concept_type",
] as const;

function invalidUpdateBody(): Response {
  return NextResponse.json(
    { ok: false, error: "Geçersiz istek gövdesi.", code: "YEBS_INVALID_REQUEST_BODY" },
    { status: 400 },
  );
}

function mapUpdateError(code: UpdateConceptErrorCode): Response {
  switch (code) {
    case "YEBS_INVALID_PATCH":
    case "YEBS_INVALID_CONCEPT_INPUT":
    case "YEBS_REASON_INVALID":
      return NextResponse.json(
        { ok: false, error: "Geçersiz kavram verisi.", code },
        { status: 400 },
      );
    case "YEBS_CONCEPT_NOT_FOUND":
      return NextResponse.json(
        { ok: false, error: "Kavram kaydı bulunamadı.", code },
        { status: 404 },
      );
    case "YEBS_CONCEPT_DUPLICATE":
      return NextResponse.json(
        { ok: false, error: "Bu gelenekte bu slug ile kavram zaten var.", code },
        { status: 409 },
      );
    case "YEBS_CONCEPT_STALE_UPDATE":
      return NextResponse.json(
        { ok: false, error: "Kavram başka bir işlem tarafından güncellendi. Güncel kaydı yeniden yükleyin.", code },
        { status: 409 },
      );
    case "YEBS_CONCEPT_STATUS_LOCKED":
      return NextResponse.json(
        { ok: false, error: "Yalnız taslak durumundaki kavramlar düzenlenebilir.", code },
        { status: 409 },
      );
    case "YEBS_CONCEPT_NO_CHANGES":
      return NextResponse.json(
        { ok: false, error: "Kavramda kaydedilecek bir değişiklik bulunamadı.", code },
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
    case "YEBS_EXPECTED_UPDATED_AT_REQUIRED":
    case "YEBS_CONCEPT_UPDATE_FAILED":
    default:
      return NextResponse.json(
        { ok: false, error: "Kavram güncellenemedi.", code: "YEBS_CONCEPT_UPDATE_FAILED" },
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

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz kavram kimliği.", code: "YEBS_INVALID_CONCEPT_ID" },
      { status: 400 },
    );
  }

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

  // --- Canonical patch: yalnız PRESENT anahtarlar; coercion YOK ---
  const patch: UpdateConceptPatch = {};

  if ("slug" in obj) {
    const v = obj.slug;
    if (typeof v !== "string") return invalidUpdateBody();
    patch.slug = v;
  }
  if ("concept_type" in obj) {
    const v = obj.concept_type;
    if (typeof v !== "string") return invalidUpdateBody();
    patch.concept_type = v;
  }

  if (Object.keys(patch).length === 0) {
    return invalidUpdateBody();
  }

  const result = await updateConcept(db, adminId, id, expectedUpdatedAt, patch, reason);

  if (!result.ok) {
    return mapUpdateError(result.code);
  }

  return NextResponse.json({ ok: true, row: result.row }, { status: 200 });
}

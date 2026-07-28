import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { getSourceById } from "@/lib/yebs/service/sources";
import {
  updateSource,
  type UpdateSourcePatch,
  type UpdateSourceErrorCode,
} from "@/lib/yebs/service/sourceMutations";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET   /api/admin/yebs/sources/[id] — SALT-OKUNUR detay (A3R). Canonical row; JOIN yok.
 * PATCH /api/admin/yebs/sources/[id] — audit'li update (A3U). Yalnız draft; status immutable.
 *   DELETE YOK (fiziksel silme yasak; arşivleme ileride API-TX transition'ı).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REASON_MAX_LEN = 2000;

const EXPECTED_UPDATED_AT_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

function isValidExpectedUpdatedAt(value: string): boolean {
  const m = EXPECTED_UPDATED_AT_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  const hour = Number(m[4]), minute = Number(m[5]), second = Number(m[6]);
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
    const oh = Number(tz.slice(1, 3)), om = Number(tz.slice(4, 6));
    if (oh > 23 || om > 59) return false;
  }
  return Number.isFinite(Date.parse(value));
}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function isValidYmd(value: string): boolean {
  const m = YMD_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  if (year === 0) return false;
  if (month < 1 || month > 12) return false;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

/* ----------------------------- GET ----------------------------- */

export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz kaynak kimliği.", code: "YEBS_INVALID_SOURCE_ID" },
      { status: 400 },
    );
  }

  const result = await getSourceById(db, id);
  if (!result.ok) {
    if (result.code === "YEBS_SOURCE_NOT_FOUND") {
      return NextResponse.json({ ok: false, error: "Kaynak kaydı bulunamadı.", code: result.code }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: "YEBS kaynak kaydı alınamadı.", code: result.code }, { status: 500 });
  }
  return NextResponse.json({ ok: true, row: result.row });
}

/* ----------------------------- PATCH ----------------------------- */

const PATCH_ALLOWED_KEYS = [
  "expected_updated_at", "reason",
  "source_type", "title", "language_tag", "script_code", "authors", "organization",
  "publisher", "publication_year", "dating_note", "edition", "doi", "pmid", "isbn",
  "url", "document_no", "tradition_context_id", "accessed_on", "notes",
] as const;

const REQUIRED_STRING_KEYS = ["source_type", "title", "language_tag"] as const;
const NULLABLE_STRING_KEYS = [
  "script_code", "authors", "organization", "publisher", "dating_note", "edition",
  "doi", "pmid", "isbn", "url", "document_no", "notes",
] as const;

function invalidUpdateBody(): Response {
  return NextResponse.json(
    { ok: false, error: "Geçersiz istek gövdesi.", code: "YEBS_INVALID_REQUEST_BODY" },
    { status: 400 },
  );
}

function mapUpdateError(code: UpdateSourceErrorCode): Response {
  switch (code) {
    case "YEBS_INVALID_PATCH":
    case "YEBS_INVALID_SOURCE_INPUT":
    case "YEBS_REASON_INVALID":
      return NextResponse.json({ ok: false, error: "Geçersiz kaynak verisi.", code }, { status: 400 });
    case "YEBS_SOURCE_NOT_FOUND":
      return NextResponse.json({ ok: false, error: "Kaynak kaydı bulunamadı.", code }, { status: 404 });
    case "YEBS_SOURCE_TRADITION_NOT_FOUND":
      return NextResponse.json({ ok: false, error: "Kaynağın bağlam geleneği bulunamadı.", code }, { status: 404 });
    case "YEBS_SOURCE_DOI_DUPLICATE":
      return NextResponse.json({ ok: false, error: "Bu DOI ile bir kaynak zaten var.", code }, { status: 409 });
    case "YEBS_SOURCE_PMID_DUPLICATE":
      return NextResponse.json({ ok: false, error: "Bu PMID ile bir kaynak zaten var.", code }, { status: 409 });
    case "YEBS_SOURCE_STALE_UPDATE":
      return NextResponse.json({ ok: false, error: "Kaynak başka bir işlem tarafından güncellendi. Güncel kaydı yeniden yükleyin.", code }, { status: 409 });
    case "YEBS_SOURCE_STATUS_LOCKED":
      return NextResponse.json({ ok: false, error: "Yalnız taslak durumundaki kaynaklar düzenlenebilir.", code }, { status: 409 });
    case "YEBS_SOURCE_NO_CHANGES":
      return NextResponse.json({ ok: false, error: "Kaynakta kaydedilecek bir değişiklik bulunamadı.", code }, { status: 409 });
    case "YEBS_ADMIN_NOT_FOUND":
    case "YEBS_ADMIN_NOT_ACTIVE":
      return NextResponse.json({ ok: false, error: "Admin yetkisi doğrulanamadı.", code: "YEBS_ADMIN_FORBIDDEN" }, { status: 403 });
    case "YEBS_REQUEST_ID_REQUIRED":
    case "YEBS_OPERATION_ID_REQUIRED":
    case "YEBS_SOURCE_ID_REQUIRED":
    case "YEBS_EXPECTED_UPDATED_AT_REQUIRED":
    case "YEBS_SOURCE_UPDATE_FAILED":
    default:
      return NextResponse.json({ ok: false, error: "Kaynak güncellenemedi.", code: "YEBS_SOURCE_UPDATE_FAILED" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz kaynak kimliği.", code: "YEBS_INVALID_SOURCE_ID" },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidUpdateBody();
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) return invalidUpdateBody();
  const obj = body as Record<string, unknown>;

  const allowed = new Set<string>(PATCH_ALLOWED_KEYS);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) return invalidUpdateBody();
  }

  // reason ZORUNLU
  const reason = obj.reason;
  if (typeof reason !== "string" || reason.trim() === "" || reason.length > REASON_MAX_LEN) {
    return invalidUpdateBody();
  }
  // expected_updated_at ZORUNLU
  const expectedUpdatedAt = obj.expected_updated_at;
  if (typeof expectedUpdatedAt !== "string" || !isValidExpectedUpdatedAt(expectedUpdatedAt)) {
    return invalidUpdateBody();
  }

  const patch: UpdateSourcePatch = {};

  // required-if-present strings (not null)
  for (const key of REQUIRED_STRING_KEYS) {
    if (key in obj) {
      const v = obj[key];
      if (typeof v !== "string") return invalidUpdateBody();
      (patch as Record<string, unknown>)[key] = v;
    }
  }
  // nullable strings
  for (const key of NULLABLE_STRING_KEYS) {
    if (key in obj) {
      const v = obj[key];
      if (v !== null && typeof v !== "string") return invalidUpdateBody();
      (patch as Record<string, unknown>)[key] = v;
    }
  }
  // publication_year: integer number | null
  if ("publication_year" in obj) {
    const v = obj.publication_year;
    if (v === null) patch.publication_year = null;
    else if (typeof v === "number" && Number.isInteger(v)) patch.publication_year = v;
    else return invalidUpdateBody();
  }
  // tradition_context_id: uuid | null
  if ("tradition_context_id" in obj) {
    const v = obj.tradition_context_id;
    if (v === null) patch.tradition_context_id = null;
    else if (typeof v === "string" && UUID_RE.test(v)) patch.tradition_context_id = v;
    else return invalidUpdateBody();
  }
  // accessed_on: YYYY-MM-DD (calendar) | null
  if ("accessed_on" in obj) {
    const v = obj.accessed_on;
    if (v === null) patch.accessed_on = null;
    else if (typeof v === "string" && isValidYmd(v)) patch.accessed_on = v;
    else return invalidUpdateBody();
  }

  if (Object.keys(patch).length === 0) return invalidUpdateBody();

  const result = await updateSource(db, adminId, id, expectedUpdatedAt, patch, reason);
  if (!result.ok) return mapUpdateError(result.code);
  return NextResponse.json({ ok: true, row: result.row }, { status: 200 });
}

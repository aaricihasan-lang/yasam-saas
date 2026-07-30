import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  getClaimSourceById,
  YEBS_CLAIM_SOURCE_ROLES,
  YEBS_CLAIM_SOURCE_RATIONALE_STATUSES,
} from "@/lib/yebs/service/claimSources";
import {
  updateClaimSource,
  removeClaimSource,
  type UpdateClaimSourcePatch,
  type UpdateClaimSourceErrorCode,
  type RemoveClaimSourceErrorCode,
} from "@/lib/yebs/service/claimSourceMutations";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ claimId: string; claimSourceId: string }> };

/**
 * GET    /api/admin/yebs/claims/[claimId]/sources/[claimSourceId] — SALT-OKUNUR (A4BR)
 * PATCH  ... — audit'li update (A4B). Yalnız draft parent; verification/source_id immutable.
 * DELETE ... — audit'li detach (A4B). Önce snapshot, sonra yalnız junction fiziksel silme.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BCP47_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const ISO15924_RE = /^[A-Z][a-z]{3}$/;
const HARMFUL_CONTROL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
function hasHarmfulControl(value: string): boolean {
  return HARMFUL_CONTROL_RE.test(value);
}

const REASON_MAX_LEN = 2000;
const LIMITS: Record<string, number> = {
  locator_text: 2000,
  url_fragment: 2000,
  transliteration_scheme: 200,
  source_original_excerpt: 50000,
  transliteration: 50000,
  faithful_translation: 50000,
  rationale: 20000,
};

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

function invalidIds(): Response {
  return NextResponse.json(
    { ok: false, error: "Geçersiz kimlik.", code: "YEBS_INVALID_CLAIM_SOURCE_ID" },
    { status: 400 },
  );
}

/* ----------------------------- GET ----------------------------- */

export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { claimId, claimSourceId } = await ctx.params;
  if (!UUID_RE.test(claimId) || !UUID_RE.test(claimSourceId)) return invalidIds();

  const result = await getClaimSourceById(db, claimId, claimSourceId);
  if (!result.ok) {
    if (result.code === "YEBS_CLAIM_SOURCE_NOT_FOUND") {
      return NextResponse.json({ ok: false, error: "Kaynak bağı bulunamadı.", code: result.code }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: "YEBS kaynak bağı alınamadı.", code: result.code }, { status: 500 });
  }
  return NextResponse.json({ ok: true, row: result.row });
}

/* ----------------------------- PATCH ----------------------------- */

const PATCH_ALLOWED_KEYS = [
  "expected_updated_at", "reason",
  "source_role", "locator_text", "url_fragment", "source_original_excerpt",
  "source_original_language_tag", "source_original_script_code", "transliteration",
  "transliteration_scheme", "faithful_translation", "translation_language_tag",
  "rationale", "rationale_status",
] as const;

const ENUM_KEYS: Record<string, readonly string[]> = {
  source_role: YEBS_CLAIM_SOURCE_ROLES,
  rationale_status: YEBS_CLAIM_SOURCE_RATIONALE_STATUSES,
};
const TEXT_KEYS = [
  "locator_text", "url_fragment", "source_original_excerpt", "transliteration",
  "transliteration_scheme", "faithful_translation", "rationale",
] as const;
const TAG_KEYS: Record<string, RegExp> = {
  source_original_language_tag: BCP47_RE,
  source_original_script_code: ISO15924_RE,
  translation_language_tag: BCP47_RE,
};

function invalidUpdateBody(): Response {
  return NextResponse.json(
    { ok: false, error: "Geçersiz istek gövdesi.", code: "YEBS_INVALID_REQUEST_BODY" },
    { status: 400 },
  );
}

function mapUpdateError(code: UpdateClaimSourceErrorCode): Response {
  switch (code) {
    case "YEBS_INVALID_PATCH":
    case "YEBS_CLAIM_SOURCE_INVALID_INPUT":
    case "YEBS_REASON_INVALID":
      return NextResponse.json({ ok: false, error: "Geçersiz kaynak bağı verisi.", code }, { status: 400 });
    case "YEBS_CLAIM_SOURCE_NOT_FOUND":
      return NextResponse.json({ ok: false, error: "Kaynak bağı bulunamadı.", code }, { status: 404 });
    case "YEBS_CLAIM_SOURCE_STALE_UPDATE":
      return NextResponse.json({ ok: false, error: "Kaynak bağı başka bir işlem tarafından güncellendi. Güncel kaydı yeniden yükleyin.", code }, { status: 409 });
    case "YEBS_CLAIM_SOURCE_CLAIM_LOCKED":
      return NextResponse.json({ ok: false, error: "Yalnız taslak durumundaki iddianın kaynak bağı düzenlenebilir.", code }, { status: 409 });
    case "YEBS_CLAIM_SOURCE_NO_CHANGES":
      return NextResponse.json({ ok: false, error: "Kaynak bağında kaydedilecek bir değişiklik bulunamadı.", code }, { status: 409 });
    case "YEBS_ADMIN_NOT_FOUND":
    case "YEBS_ADMIN_NOT_ACTIVE":
      return NextResponse.json({ ok: false, error: "Admin yetkisi doğrulanamadı.", code: "YEBS_ADMIN_FORBIDDEN" }, { status: 403 });
    case "YEBS_REQUEST_ID_REQUIRED":
    case "YEBS_OPERATION_ID_REQUIRED":
    case "YEBS_CLAIM_ID_REQUIRED":
    case "YEBS_CLAIM_SOURCE_ID_REQUIRED":
    case "YEBS_EXPECTED_UPDATED_AT_REQUIRED":
    case "YEBS_CLAIM_SOURCE_UPDATE_FAILED":
    default:
      return NextResponse.json({ ok: false, error: "Kaynak bağı güncellenemedi.", code: "YEBS_CLAIM_SOURCE_UPDATE_FAILED" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { claimId, claimSourceId } = await ctx.params;
  if (!UUID_RE.test(claimId) || !UUID_RE.test(claimSourceId)) return invalidIds();

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
  if (typeof reason !== "string" || reason.trim() === "" || reason.length > REASON_MAX_LEN || hasHarmfulControl(reason)) {
    return invalidUpdateBody();
  }
  // expected_updated_at ZORUNLU
  const expectedUpdatedAt = obj.expected_updated_at;
  if (typeof expectedUpdatedAt !== "string" || !isValidExpectedUpdatedAt(expectedUpdatedAt)) {
    return invalidUpdateBody();
  }

  const patch: UpdateClaimSourcePatch = {};

  // enum keys (required-if-present, not null)
  for (const key of Object.keys(ENUM_KEYS)) {
    if (key in obj) {
      const v = obj[key];
      if (typeof v !== "string" || !ENUM_KEYS[key].includes(v)) return invalidUpdateBody();
      (patch as Record<string, unknown>)[key] = v;
    }
  }
  // nullable text keys (string|null; trim→null; uzunluk + kontrol)
  for (const key of TEXT_KEYS) {
    if (key in obj) {
      const v = obj[key];
      if (v === null) { (patch as Record<string, unknown>)[key] = null; continue; }
      if (typeof v !== "string") return invalidUpdateBody();
      const t = v.trim();
      if (t === "") { (patch as Record<string, unknown>)[key] = null; continue; }
      if (t.length > LIMITS[key] || hasHarmfulControl(t)) return invalidUpdateBody();
      (patch as Record<string, unknown>)[key] = t;
    }
  }
  // tag keys (string|null; trim→null; format)
  for (const key of Object.keys(TAG_KEYS)) {
    if (key in obj) {
      const v = obj[key];
      if (v === null) { (patch as Record<string, unknown>)[key] = null; continue; }
      if (typeof v !== "string") return invalidUpdateBody();
      const t = v.trim();
      if (t === "") { (patch as Record<string, unknown>)[key] = null; continue; }
      if (!TAG_KEYS[key].test(t)) return invalidUpdateBody();
      (patch as Record<string, unknown>)[key] = t;
    }
  }

  if (Object.keys(patch).length === 0) return invalidUpdateBody();

  const result = await updateClaimSource(db, adminId, claimId, claimSourceId, expectedUpdatedAt, patch, reason);
  if (!result.ok) return mapUpdateError(result.code);
  return NextResponse.json({ ok: true, row: result.row }, { status: 200 });
}

/* ----------------------------- DELETE (detach) ----------------------------- */

const DELETE_ALLOWED_KEYS = ["expected_updated_at", "reason"] as const;

function mapRemoveError(code: RemoveClaimSourceErrorCode): Response {
  switch (code) {
    case "YEBS_REASON_INVALID":
      return NextResponse.json({ ok: false, error: "Geçersiz kaynak bağı verisi.", code }, { status: 400 });
    case "YEBS_CLAIM_SOURCE_NOT_FOUND":
      return NextResponse.json({ ok: false, error: "Kaynak bağı bulunamadı.", code }, { status: 404 });
    case "YEBS_CLAIM_SOURCE_STALE_UPDATE":
      return NextResponse.json({ ok: false, error: "Kaynak bağı başka bir işlem tarafından güncellendi. Güncel kaydı yeniden yükleyin.", code }, { status: 409 });
    case "YEBS_CLAIM_SOURCE_CLAIM_LOCKED":
      return NextResponse.json({ ok: false, error: "Yalnız taslak durumundaki iddianın kaynak bağı kaldırılabilir.", code }, { status: 409 });
    case "YEBS_ADMIN_NOT_FOUND":
    case "YEBS_ADMIN_NOT_ACTIVE":
      return NextResponse.json({ ok: false, error: "Admin yetkisi doğrulanamadı.", code: "YEBS_ADMIN_FORBIDDEN" }, { status: 403 });
    case "YEBS_REQUEST_ID_REQUIRED":
    case "YEBS_OPERATION_ID_REQUIRED":
    case "YEBS_CLAIM_ID_REQUIRED":
    case "YEBS_CLAIM_SOURCE_ID_REQUIRED":
    case "YEBS_EXPECTED_UPDATED_AT_REQUIRED":
    case "YEBS_CLAIM_SOURCE_REMOVE_FAILED":
    default:
      return NextResponse.json({ ok: false, error: "Kaynak bağı kaldırılamadı.", code: "YEBS_CLAIM_SOURCE_REMOVE_FAILED" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { claimId, claimSourceId } = await ctx.params;
  if (!UUID_RE.test(claimId) || !UUID_RE.test(claimSourceId)) return invalidIds();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidUpdateBody();
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) return invalidUpdateBody();
  const obj = body as Record<string, unknown>;

  const allowed = new Set<string>(DELETE_ALLOWED_KEYS);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) return invalidUpdateBody();
  }

  const reason = obj.reason;
  if (typeof reason !== "string" || reason.trim() === "" || reason.length > REASON_MAX_LEN || hasHarmfulControl(reason)) {
    return invalidUpdateBody();
  }
  const expectedUpdatedAt = obj.expected_updated_at;
  if (typeof expectedUpdatedAt !== "string" || !isValidExpectedUpdatedAt(expectedUpdatedAt)) {
    return invalidUpdateBody();
  }

  const result = await removeClaimSource(db, adminId, claimId, claimSourceId, expectedUpdatedAt, reason);
  if (!result.ok) return mapRemoveError(result.code);
  return NextResponse.json({ ok: true, row: result.row }, { status: 200 });
}

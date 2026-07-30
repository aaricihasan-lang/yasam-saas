import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  getClaimById,
  YEBS_CLAIM_TYPES,
  YEBS_CLAIM_PROVENANCE_KINDS,
  YEBS_CLAIM_EVIDENCE_LAYERS,
} from "@/lib/yebs/service/claims";
import {
  updateClaim,
  type UpdateClaimPatch,
  type UpdateClaimErrorCode,
} from "@/lib/yebs/service/claimMutations";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET   /api/admin/yebs/claims/[id] — SALT-OKUNUR detay (A4AR). Canonical 11 alan; JOIN yok.
 * PATCH /api/admin/yebs/claims/[id] — audit'li update (A4AU). Yalnız draft; status immutable.
 *   DELETE YOK (fiziksel silme A4A kapsam dışı). Claim Sources endpoint YOK (A4B).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLAIM_TEXT_MAX = 20000;
const REASON_MAX_LEN = 2000;

/** tab(\x09)/LF(\x0A)/CR(\x0D) dışındaki C0 kontrol karakterleri + DEL (NUL dahil). */
const HARMFUL_CONTROL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
function hasHarmfulControl(value: string): boolean {
  return HARMFUL_CONTROL_RE.test(value);
}

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

/* ----------------------------- GET ----------------------------- */

export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz iddia kimliği.", code: "YEBS_INVALID_CLAIM_ID" },
      { status: 400 },
    );
  }

  const result = await getClaimById(db, id);
  if (!result.ok) {
    if (result.code === "YEBS_CLAIM_NOT_FOUND") {
      return NextResponse.json({ ok: false, error: "İddia kaydı bulunamadı.", code: result.code }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: "YEBS iddia kaydı alınamadı.", code: result.code }, { status: 500 });
  }
  return NextResponse.json({ ok: true, row: result.row });
}

/* ----------------------------- PATCH ----------------------------- */

const PATCH_ALLOWED_KEYS = [
  "expected_updated_at", "reason",
  "claim_type", "claim_text", "provenance_kind", "evidence_layer",
  "outcome_type", "safety_topic",
] as const;

const ENUM_STRING_KEYS: Record<string, readonly string[]> = {
  claim_type: YEBS_CLAIM_TYPES,
  provenance_kind: YEBS_CLAIM_PROVENANCE_KINDS,
  evidence_layer: YEBS_CLAIM_EVIDENCE_LAYERS,
};
const NULLABLE_STRING_KEYS = ["outcome_type", "safety_topic"] as const;

function invalidUpdateBody(): Response {
  return NextResponse.json(
    { ok: false, error: "Geçersiz istek gövdesi.", code: "YEBS_INVALID_REQUEST_BODY" },
    { status: 400 },
  );
}

function mapUpdateError(code: UpdateClaimErrorCode): Response {
  switch (code) {
    case "YEBS_INVALID_PATCH":
    case "YEBS_INVALID_CLAIM_INPUT":
    case "YEBS_REASON_INVALID":
      return NextResponse.json({ ok: false, error: "Geçersiz iddia verisi.", code }, { status: 400 });
    case "YEBS_CLAIM_NOT_FOUND":
      return NextResponse.json({ ok: false, error: "İddia kaydı bulunamadı.", code }, { status: 404 });
    case "YEBS_CLAIM_STALE_UPDATE":
      return NextResponse.json({ ok: false, error: "İddia başka bir işlem tarafından güncellendi. Güncel kaydı yeniden yükleyin.", code }, { status: 409 });
    case "YEBS_CLAIM_STATUS_LOCKED":
      return NextResponse.json({ ok: false, error: "Yalnız taslak durumundaki iddialar düzenlenebilir.", code }, { status: 409 });
    case "YEBS_CLAIM_NO_CHANGES":
      return NextResponse.json({ ok: false, error: "İddiada kaydedilecek bir değişiklik bulunamadı.", code }, { status: 409 });
    case "YEBS_ADMIN_NOT_FOUND":
    case "YEBS_ADMIN_NOT_ACTIVE":
      return NextResponse.json({ ok: false, error: "Admin yetkisi doğrulanamadı.", code: "YEBS_ADMIN_FORBIDDEN" }, { status: 403 });
    case "YEBS_REQUEST_ID_REQUIRED":
    case "YEBS_OPERATION_ID_REQUIRED":
    case "YEBS_CLAIM_ID_REQUIRED":
    case "YEBS_EXPECTED_UPDATED_AT_REQUIRED":
    case "YEBS_CLAIM_UPDATE_FAILED":
    default:
      return NextResponse.json({ ok: false, error: "İddia güncellenemedi.", code: "YEBS_CLAIM_UPDATE_FAILED" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz iddia kimliği.", code: "YEBS_INVALID_CLAIM_ID" },
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
  if (typeof reason !== "string" || reason.trim() === "" || reason.length > REASON_MAX_LEN || hasHarmfulControl(reason)) {
    return invalidUpdateBody();
  }
  // expected_updated_at ZORUNLU
  const expectedUpdatedAt = obj.expected_updated_at;
  if (typeof expectedUpdatedAt !== "string" || !isValidExpectedUpdatedAt(expectedUpdatedAt)) {
    return invalidUpdateBody();
  }

  const patch: UpdateClaimPatch = {};

  // enum string keys (required-if-present, not null)
  for (const key of Object.keys(ENUM_STRING_KEYS)) {
    if (key in obj) {
      const v = obj[key];
      if (typeof v !== "string" || !ENUM_STRING_KEYS[key].includes(v)) return invalidUpdateBody();
      (patch as Record<string, unknown>)[key] = v;
    }
  }
  // claim_text (required-if-present): string, btrim nonblank, ≤20000, zararlı kontrol reddi
  if ("claim_text" in obj) {
    const v = obj.claim_text;
    if (typeof v !== "string") return invalidUpdateBody();
    const t = v.trim();
    if (t === "" || t.length > CLAIM_TEXT_MAX || hasHarmfulControl(t)) return invalidUpdateBody();
    patch.claim_text = t;
  }
  // nullable strings (outcome_type/safety_topic): string | null
  for (const key of NULLABLE_STRING_KEYS) {
    if (key in obj) {
      const v = obj[key];
      if (v !== null && typeof v !== "string") return invalidUpdateBody();
      (patch as Record<string, unknown>)[key] = v;
    }
  }

  if (Object.keys(patch).length === 0) return invalidUpdateBody();

  const result = await updateClaim(db, adminId, id, expectedUpdatedAt, patch, reason);
  if (!result.ok) return mapUpdateError(result.code);
  return NextResponse.json({ ok: true, row: result.row }, { status: 200 });
}

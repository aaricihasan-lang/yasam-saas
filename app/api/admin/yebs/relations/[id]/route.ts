import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  getConceptRelationById,
  YEBS_CONCEPT_RELATION_TYPES,
} from "@/lib/yebs/service/conceptRelations";
import {
  updateConceptRelation,
  type UpdateConceptRelationPatch,
  type UpdateConceptRelationErrorCode,
} from "@/lib/yebs/service/conceptRelationMutations";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET   /api/admin/yebs/relations/[id] — SALT-OKUNUR detay (A5AR). Canonical 7 alan; JOIN yok.
 * PATCH /api/admin/yebs/relations/[id] — audit'li update (A5AU). Yalnız relation_type;
 *   draft-only; source/target/status immutable; bağlı D9 evidence varsa 409.
 *   DELETE YOK (fiziksel silme A5 kapsam dışı).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REASON_MAX_LEN = 2000;
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
      { ok: false, error: "Geçersiz ilişki kimliği.", code: "YEBS_INVALID_CONCEPT_RELATION_ID" },
      { status: 400 },
    );
  }

  const result = await getConceptRelationById(db, id);
  if (!result.ok) {
    if (result.code === "YEBS_CONCEPT_RELATION_NOT_FOUND") {
      return NextResponse.json({ ok: false, error: "İlişki kaydı bulunamadı.", code: result.code }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: "YEBS ilişki kaydı alınamadı.", code: result.code }, { status: 500 });
  }
  return NextResponse.json({ ok: true, row: result.row });
}

/* ----------------------------- PATCH ----------------------------- */

const PATCH_ALLOWED_KEYS = ["expected_updated_at", "reason", "relation_type"] as const;

function invalidUpdateBody(): Response {
  return NextResponse.json(
    { ok: false, error: "Geçersiz istek gövdesi.", code: "YEBS_INVALID_REQUEST_BODY" },
    { status: 400 },
  );
}

function mapUpdateError(code: UpdateConceptRelationErrorCode): Response {
  switch (code) {
    case "YEBS_INVALID_PATCH":
    case "YEBS_CONCEPT_RELATION_INVALID_INPUT":
    case "YEBS_REASON_INVALID":
      return NextResponse.json({ ok: false, error: "Geçersiz ilişki verisi.", code }, { status: 400 });
    case "YEBS_CONCEPT_RELATION_NOT_FOUND":
      return NextResponse.json({ ok: false, error: "İlişki kaydı bulunamadı.", code }, { status: 404 });
    case "YEBS_CONCEPT_RELATION_SOURCE_NOT_FOUND":
      return NextResponse.json({ ok: false, error: "Kaynak kavram bulunamadı.", code }, { status: 404 });
    case "YEBS_CONCEPT_RELATION_TARGET_NOT_FOUND":
      return NextResponse.json({ ok: false, error: "Hedef kavram bulunamadı.", code }, { status: 404 });
    case "YEBS_CONCEPT_RELATION_STALE_UPDATE":
      return NextResponse.json({ ok: false, error: "İlişki başka bir işlem tarafından güncellendi. Güncel kaydı yeniden yükleyin.", code }, { status: 409 });
    case "YEBS_CONCEPT_RELATION_STATUS_LOCKED":
      return NextResponse.json({ ok: false, error: "Yalnız taslak durumundaki ilişkiler düzenlenebilir.", code }, { status: 409 });
    case "YEBS_CONCEPT_RELATION_HAS_SOURCES":
      return NextResponse.json({ ok: false, error: "Kaynak bağı olan ilişkinin türü değiştirilemez.", code }, { status: 409 });
    case "YEBS_CONCEPT_RELATION_CROSS_TRADITION":
      return NextResponse.json({ ok: false, error: "Bu ilişki türü yalnız aynı gelenek içinde kurulabilir.", code }, { status: 409 });
    case "YEBS_CONCEPT_RELATION_MIRROR_DUPLICATE":
      return NextResponse.json({ ok: false, error: "Bu simetrik ilişkinin ayna kaydı zaten var.", code }, { status: 409 });
    case "YEBS_CONCEPT_RELATION_HIERARCHY_DUPLICATE":
      return NextResponse.json({ ok: false, error: "Bu hiyerarşik ilişki başka bir tiple zaten eşdeğer olarak kayıtlı.", code }, { status: 409 });
    case "YEBS_CONCEPT_RELATION_HIERARCHY_CONFLICT":
      return NextResponse.json({ ok: false, error: "Bu ilişki mevcut hiyerarşik kayıtla doğrudan çelişiyor.", code }, { status: 409 });
    case "YEBS_CONCEPT_RELATION_DUPLICATE":
      return NextResponse.json({ ok: false, error: "Bu kaynak/hedef/tip ile ilişki zaten var.", code }, { status: 409 });
    case "YEBS_CONCEPT_RELATION_NO_CHANGES":
      return NextResponse.json({ ok: false, error: "İlişkide kaydedilecek bir değişiklik bulunamadı.", code }, { status: 409 });
    case "YEBS_ADMIN_NOT_FOUND":
    case "YEBS_ADMIN_NOT_ACTIVE":
      return NextResponse.json({ ok: false, error: "Admin yetkisi doğrulanamadı.", code: "YEBS_ADMIN_FORBIDDEN" }, { status: 403 });
    case "YEBS_REQUEST_ID_REQUIRED":
    case "YEBS_OPERATION_ID_REQUIRED":
    case "YEBS_CONCEPT_RELATION_ID_REQUIRED":
    case "YEBS_EXPECTED_UPDATED_AT_REQUIRED":
    case "YEBS_CONCEPT_RELATION_UPDATE_FAILED":
    default:
      return NextResponse.json({ ok: false, error: "İlişki güncellenemedi.", code: "YEBS_CONCEPT_RELATION_UPDATE_FAILED" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz ilişki kimliği.", code: "YEBS_INVALID_CONCEPT_RELATION_ID" },
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

  const patch: UpdateConceptRelationPatch = {};
  // relation_type (required-if-present, enum)
  if ("relation_type" in obj) {
    const v = obj.relation_type;
    if (typeof v !== "string" || !(YEBS_CONCEPT_RELATION_TYPES as readonly string[]).includes(v)) {
      return invalidUpdateBody();
    }
    patch.relation_type = v;
  }

  if (Object.keys(patch).length === 0) return invalidUpdateBody();

  const result = await updateConceptRelation(db, adminId, id, expectedUpdatedAt, patch, reason);
  if (!result.ok) return mapUpdateError(result.code);
  return NextResponse.json({ ok: true, row: result.row }, { status: 200 });
}

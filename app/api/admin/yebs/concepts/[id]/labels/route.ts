import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { listConceptLabels } from "@/lib/yebs/service/concepts";
import {
  createConceptLabel,
  type CreateConceptLabelInput,
  type CreateConceptLabelErrorCode,
} from "@/lib/yebs/service/conceptLabelMutations";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/yebs/concepts/[id]/labels
 *
 * YEBS D4 (yebs_concept_labels) SALT-OKUNUR admin liste ucu (API-A2R).
 * Parent concept yoksa 404 YEBS_CONCEPT_NOT_FOUND. Canonical 10-field label rows,
 * deterministik stabil sıra. Pagination YOK (concept başına etiket sayısı sınırlı).
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

  const result = await listConceptLabels(db, id);

  if (!result.ok) {
    if (result.code === "YEBS_CONCEPT_NOT_FOUND") {
      return NextResponse.json(
        { ok: false, error: "Kavram kaydı bulunamadı.", code: result.code },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "YEBS etiket kayıtları alınamadı.", code: result.code },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, rows: result.rows });
}

/**
 * POST /api/admin/yebs/concepts/[id]/labels
 *
 * YEBS D4 (yebs_concept_labels) audit'li admin CREATE ucu (API-A2).
 *
 * Güvenlik:
 *   - Actor YALNIZ guard.adminId; concept id URL'den; request/operation ID server-side.
 *   - Body yalnız 7 exact anahtar; fazla/yasak anahtar → 400.
 *   - Değerler coerce/trim/normalize EDİLMEZ; canonical create yalnız RPC üzerinden.
 *   - Parent concept draft değilse RPC 409 CONCEPT_STATUS_LOCKED döndürür.
 */

const ALLOWED_BODY_KEYS = [
  "language_tag",
  "script_code",
  "label",
  "label_kind",
  "transliteration_scheme",
  "is_primary",
  "reason",
] as const;

const REASON_MAX_LEN = 2000;

function invalidBody(): Response {
  return NextResponse.json(
    { ok: false, error: "Geçersiz istek gövdesi.", code: "YEBS_INVALID_REQUEST_BODY" },
    { status: 400 },
  );
}

/** Opsiyonel string|null alan okuma: missing/undefined/null → null; string → orijinal. */
function readOptionalString(
  obj: Record<string, unknown>,
  key: string,
): { ok: true; value: string | null } | { ok: false } {
  if (!(key in obj)) return { ok: true, value: null };
  const v = obj[key];
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v === "string") return { ok: true, value: v };
  return { ok: false };
}

function mapCreateError(code: CreateConceptLabelErrorCode): Response {
  switch (code) {
    case "YEBS_REASON_INVALID":
    case "YEBS_INVALID_LABEL_INPUT":
      return NextResponse.json(
        { ok: false, error: "Geçersiz etiket verisi.", code },
        { status: 400 },
      );
    case "YEBS_CONCEPT_NOT_FOUND":
      return NextResponse.json(
        { ok: false, error: "Etiketin bağlanacağı kavram bulunamadı.", code },
        { status: 404 },
      );
    case "YEBS_CONCEPT_STATUS_LOCKED":
      return NextResponse.json(
        { ok: false, error: "Yalnız taslak durumundaki kavramların etiketleri eklenebilir.", code },
        { status: 409 },
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
    case "YEBS_ADMIN_NOT_FOUND":
    case "YEBS_ADMIN_NOT_ACTIVE":
      return NextResponse.json(
        { ok: false, error: "Admin yetkisi doğrulanamadı.", code: "YEBS_ADMIN_FORBIDDEN" },
        { status: 403 },
      );
    case "YEBS_REQUEST_ID_REQUIRED":
    case "YEBS_OPERATION_ID_REQUIRED":
    case "YEBS_CONCEPT_ID_REQUIRED":
    case "YEBS_LABEL_CREATE_FAILED":
    default:
      return NextResponse.json(
        { ok: false, error: "Etiket oluşturulamadı.", code: "YEBS_LABEL_CREATE_FAILED" },
        { status: 500 },
      );
  }
}

export async function POST(
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
    return invalidBody();
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return invalidBody();
  }
  const obj = body as Record<string, unknown>;

  const allowed = new Set<string>(ALLOWED_BODY_KEYS);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) return invalidBody();
  }

  // --- Zorunlu string alanlar: tip + trim-boş kontrolü (coercion YOK) ---
  for (const key of ["language_tag", "script_code", "label", "label_kind"] as const) {
    const v = obj[key];
    if (typeof v !== "string" || v.trim() === "") return invalidBody();
  }

  // --- transliteration_scheme (opsiyonel string|null) ---
  const schemeRead = readOptionalString(obj, "transliteration_scheme");
  if (!schemeRead.ok) return invalidBody();

  // --- is_primary (opsiyonel boolean; default false) ---
  let isPrimary = false;
  if ("is_primary" in obj) {
    const v = obj.is_primary;
    if (typeof v !== "boolean") return invalidBody();
    isPrimary = v;
  }

  // --- reason (opsiyonel) ---
  const reasonRead = readOptionalString(obj, "reason");
  if (!reasonRead.ok) return invalidBody();
  if (
    reasonRead.value !== null &&
    (reasonRead.value.trim() === "" || reasonRead.value.length > REASON_MAX_LEN)
  ) {
    return invalidBody();
  }

  const input: CreateConceptLabelInput = {
    languageTag: obj.language_tag as string,
    scriptCode: obj.script_code as string,
    label: obj.label as string,
    labelKind: obj.label_kind as string,
    transliterationScheme: schemeRead.value,
    isPrimary,
    reason: reasonRead.value,
  };

  const result = await createConceptLabel(db, adminId, id, input);

  if (!result.ok) {
    return mapCreateError(result.code);
  }

  return NextResponse.json({ ok: true, row: result.row }, { status: 201 });
}

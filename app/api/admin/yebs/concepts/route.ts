import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  listConcepts,
  YEBS_CONCEPT_STATUSES,
  YEBS_CONCEPT_TYPES,
  type YebsConceptStatus,
  type YebsConceptType,
} from "@/lib/yebs/service/concepts";
import {
  createConcept,
  type CreateConceptInput,
  type CreateConceptErrorCode,
} from "@/lib/yebs/service/conceptMutations";

export const runtime = "nodejs";

/**
 * GET /api/admin/yebs/concepts
 *
 * YEBS D3 (yebs_concepts) SALT-OKUNUR admin liste ucu (API-A2R).
 *
 * Güvenlik:
 *   - verifyAdminRequest → başarısızsa guard.response. Yalnız guard.db (service_role).
 *   - tenantId KABUL EDİLMEZ (merkezî referans tablosu).
 *   - Ham DB hata metni istemciye DÖNMEZ. SALT-OKUNUR; tradition/school JOIN yok;
 *     nested labels yok; audit yok. Saf canonical yebs_concepts satırı (8 alan).
 *
 * Query parametreleri:
 *   tradition_id  strict UUID
 *   school_id     strict UUID
 *   scope         yalnız 'tradition' (→ school_id IS NULL). school_id ile çakışırsa 400.
 *   status        exact enum
 *   concept_type  exact enum
 *   q             trim + max 100; YALNIZ slug ilike; PostgREST özel karakter arındırma
 *   slug          tam eşleşme (trim)
 *   limit         default 50, [1..200]
 *   offset        default 0, >= 0
 */

const DEFAULT_LIMIT = 50;
const MIN_LIMIT = 1;
const MAX_LIMIT = 200;
const MAX_Q_LEN = 100;
const MAX_SLUG_LEN = 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const sp = req.nextUrl.searchParams;

  // --- tradition_id (opsiyonel, strict UUID) ---
  let traditionId: string | undefined;
  const rawTraditionId = sp.get("tradition_id");
  if (rawTraditionId !== null && rawTraditionId !== "") {
    if (!UUID_RE.test(rawTraditionId)) {
      return NextResponse.json(
        { ok: false, error: "Geçersiz tradition_id değeri.", code: "YEBS_INVALID_TRADITION_ID" },
        { status: 400 },
      );
    }
    traditionId = rawTraditionId;
  }

  // --- school_id (opsiyonel, strict UUID) ---
  let schoolId: string | undefined;
  const rawSchoolId = sp.get("school_id");
  if (rawSchoolId !== null && rawSchoolId !== "") {
    if (!UUID_RE.test(rawSchoolId)) {
      return NextResponse.json(
        { ok: false, error: "Geçersiz school_id değeri.", code: "YEBS_INVALID_SCHOOL_ID" },
        { status: 400 },
      );
    }
    schoolId = rawSchoolId;
  }

  // --- scope (opsiyonel, yalnız 'tradition') ---
  let scope: "tradition" | undefined;
  const rawScope = sp.get("scope");
  if (rawScope !== null && rawScope !== "") {
    if (rawScope !== "tradition") {
      return NextResponse.json(
        { ok: false, error: "Geçersiz scope değeri.", code: "YEBS_INVALID_SCOPE" },
        { status: 400 },
      );
    }
    scope = "tradition";
  }

  // --- scope=tradition ile school_id çakışması → 400 ---
  if (scope === "tradition" && schoolId !== undefined) {
    return NextResponse.json(
      { ok: false, error: "scope=tradition ile school_id birlikte kullanılamaz.", code: "YEBS_INVALID_SCOPE" },
      { status: 400 },
    );
  }

  // --- limit ---
  let limit = DEFAULT_LIMIT;
  const rawLimit = sp.get("limit");
  if (rawLimit !== null) {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n < MIN_LIMIT || n > MAX_LIMIT) {
      return NextResponse.json(
        { ok: false, error: "Geçersiz limit değeri (1-200 arası tam sayı olmalıdır).", code: "YEBS_INVALID_LIMIT" },
        { status: 400 },
      );
    }
    limit = n;
  }

  // --- offset ---
  let offset = 0;
  const rawOffset = sp.get("offset");
  if (rawOffset !== null) {
    const n = Number(rawOffset);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json(
        { ok: false, error: "Geçersiz offset değeri (0 veya pozitif tam sayı olmalıdır).", code: "YEBS_INVALID_OFFSET" },
        { status: 400 },
      );
    }
    offset = n;
  }

  // --- status ---
  let status: YebsConceptStatus | undefined;
  const rawStatus = sp.get("status");
  if (rawStatus !== null && rawStatus !== "") {
    if (!(YEBS_CONCEPT_STATUSES as readonly string[]).includes(rawStatus)) {
      return NextResponse.json(
        { ok: false, error: "Geçersiz status değeri.", code: "YEBS_INVALID_STATUS" },
        { status: 400 },
      );
    }
    status = rawStatus as YebsConceptStatus;
  }

  // --- concept_type ---
  let conceptType: YebsConceptType | undefined;
  const rawConceptType = sp.get("concept_type");
  if (rawConceptType !== null && rawConceptType !== "") {
    if (!(YEBS_CONCEPT_TYPES as readonly string[]).includes(rawConceptType)) {
      return NextResponse.json(
        { ok: false, error: "Geçersiz concept_type değeri.", code: "YEBS_INVALID_CONCEPT_TYPE" },
        { status: 400 },
      );
    }
    conceptType = rawConceptType as YebsConceptType;
  }

  // --- q (trim + 100 + PostgREST filtre-özel karakter arındırma; YALNIZ slug) ---
  let q: string | undefined;
  const rawQ = sp.get("q");
  if (rawQ !== null) {
    const cleaned = rawQ.trim().replace(/[,()*%]/g, "").slice(0, MAX_Q_LEN);
    if (cleaned) q = cleaned;
  }

  // --- slug (tam eşleşme; trim + arındırma) ---
  let slug: string | undefined;
  const rawSlug = sp.get("slug");
  if (rawSlug !== null) {
    const cleaned = rawSlug.trim().replace(/[,()*%]/g, "").slice(0, MAX_SLUG_LEN);
    if (cleaned) slug = cleaned;
  }

  const result = await listConcepts(db, {
    limit,
    offset,
    traditionId,
    schoolId,
    scope,
    status,
    conceptType,
    q,
    slug,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "YEBS kavram kayıtları alınamadı.", code: result.code },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    rows: result.rows,
    count: result.count,
    limit,
    offset,
  });
}

/**
 * POST /api/admin/yebs/concepts
 *
 * YEBS D3 (yebs_concepts) audit'li admin CREATE ucu (API-A2).
 *
 * Güvenlik:
 *   - Actor YALNIZ guard.adminId'den; body'den actor/id/status/timestamp/request/
 *     operation ID/audit alanları KABUL EDİLMEZ.
 *   - Body yalnız 5 exact anahtar; fazla/yasak anahtar → 400.
 *   - Değerler coerce/trim/truncate EDİLMEZ; canonical create yalnız SECURITY DEFINER
 *     RPC üzerinden (createConcept). Ham DB hata metni DÖNMEZ.
 */

const ALLOWED_BODY_KEYS = [
  "tradition_id",
  "school_id",
  "slug",
  "concept_type",
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

function mapCreateError(code: CreateConceptErrorCode): Response {
  switch (code) {
    case "YEBS_REASON_INVALID":
    case "YEBS_INVALID_CONCEPT_INPUT":
      return NextResponse.json(
        { ok: false, error: "Geçersiz kavram verisi.", code },
        { status: 400 },
      );
    case "YEBS_PARENT_TRADITION_NOT_FOUND":
      return NextResponse.json(
        { ok: false, error: "Kavramın bağlanacağı gelenek bulunamadı.", code },
        { status: 404 },
      );
    case "YEBS_PARENT_SCHOOL_NOT_FOUND":
      return NextResponse.json(
        { ok: false, error: "Kavramın bağlanacağı ekol bulunamadı (gelenekle eşleşmiyor).", code },
        { status: 404 },
      );
    case "YEBS_CONCEPT_DUPLICATE":
      return NextResponse.json(
        { ok: false, error: "Bu gelenekte bu slug ile kavram zaten var.", code },
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
    case "YEBS_TRADITION_ID_REQUIRED":
    case "YEBS_CONCEPT_CREATE_FAILED":
    default:
      return NextResponse.json(
        { ok: false, error: "Kavram oluşturulamadı.", code: "YEBS_CONCEPT_CREATE_FAILED" },
        { status: 500 },
      );
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

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

  // --- tradition_id: zorunlu, strict UUID ---
  const traditionId = obj.tradition_id;
  if (typeof traditionId !== "string") return invalidBody();
  if (!UUID_RE.test(traditionId)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz tradition_id değeri.", code: "YEBS_INVALID_TRADITION_ID" },
      { status: 400 },
    );
  }

  // --- school_id: opsiyonel (omitted/null → null; string ise strict UUID) ---
  let schoolId: string | null = null;
  if ("school_id" in obj) {
    const v = obj.school_id;
    if (v === null || v === undefined) {
      schoolId = null;
    } else if (typeof v === "string") {
      if (!UUID_RE.test(v)) {
        return NextResponse.json(
          { ok: false, error: "Geçersiz school_id değeri.", code: "YEBS_INVALID_SCHOOL_ID" },
          { status: 400 },
        );
      }
      schoolId = v;
    } else {
      return invalidBody();
    }
  }

  // --- Zorunlu string alanlar: tip + trim-boş kontrolü (coercion YOK) ---
  for (const key of ["slug", "concept_type"] as const) {
    const v = obj[key];
    if (typeof v !== "string" || v.trim() === "") return invalidBody();
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

  const input: CreateConceptInput = {
    traditionId,
    schoolId,
    slug: obj.slug as string,
    conceptType: obj.concept_type as string,
    reason: reasonRead.value,
  };

  const result = await createConcept(db, adminId, input);

  if (!result.ok) {
    return mapCreateError(result.code);
  }

  return NextResponse.json({ ok: true, row: result.row }, { status: 201 });
}

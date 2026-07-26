import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  listSchools,
  YEBS_SCHOOL_STATUSES,
  type YebsSchoolStatus,
} from "@/lib/yebs/service/schools";
import {
  createSchool,
  type CreateSchoolInput,
  type CreateSchoolErrorCode,
} from "@/lib/yebs/service/schoolMutations";

export const runtime = "nodejs";

/**
 * GET /api/admin/yebs/schools
 *
 * YEBS D2 (yebs_schools) SALT-OKUNUR admin liste ucu (API-A1R).
 *
 * Güvenlik:
 *   - verifyAdminRequest → x-admin-id + x-session-token + DB doğrulaması
 *     (role=admin AND active=true). Başarısızsa guard.response döner.
 *   - Yalnız guard.db (service_role) kullanılır; istemci Supabase nesnesi YOK,
 *     service_role anahtarı doğrudan okunmaz. tenantId KABUL EDİLMEZ (merkezî
 *     referans tablosu, tenant-scoped değil).
 *   - Ham DB hata metni istemciye DÖNMEZ; servis katmanı server-side loglar.
 *   - SALT-OKUNUR: yalnız GET; POST/PATCH/PUT/DELETE YOK. Mutation/RPC YOK.
 *     Tradition JOIN edilmez; saf canonical yebs_schools satırı döner.
 *
 * Query parametreleri:
 *   tradition_id  opsiyonel, strict UUID (ebeveyn gelenek filtresi)
 *   status        yalnız draft | verified | approved | published
 *   q             trim + en fazla 100 karakter (name_tr/slug ilike; özel kar. arındırılır)
 *   slug          tam eşleşme (trim)
 *   limit         varsayılan 50, [1..200]
 *   offset        varsayılan 0, >= 0
 * Geçersiz parametre → 400 (stabil YEBS kodu). Bilinmeyen parametreler yok sayılır.
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
        {
          ok: false,
          error: "Geçersiz tradition_id değeri.",
          code: "YEBS_INVALID_TRADITION_ID",
        },
        { status: 400 },
      );
    }
    traditionId = rawTraditionId;
  }

  // --- limit ---
  let limit = DEFAULT_LIMIT;
  const rawLimit = sp.get("limit");
  if (rawLimit !== null) {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n < MIN_LIMIT || n > MAX_LIMIT) {
      return NextResponse.json(
        {
          ok: false,
          error: "Geçersiz limit değeri (1-200 arası tam sayı olmalıdır).",
          code: "YEBS_INVALID_LIMIT",
        },
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
        {
          ok: false,
          error: "Geçersiz offset değeri (0 veya pozitif tam sayı olmalıdır).",
          code: "YEBS_INVALID_OFFSET",
        },
        { status: 400 },
      );
    }
    offset = n;
  }

  // --- status ---
  let status: YebsSchoolStatus | undefined;
  const rawStatus = sp.get("status");
  if (rawStatus !== null && rawStatus !== "") {
    if (!(YEBS_SCHOOL_STATUSES as readonly string[]).includes(rawStatus)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Geçersiz status değeri.",
          code: "YEBS_INVALID_STATUS",
        },
        { status: 400 },
      );
    }
    status = rawStatus as YebsSchoolStatus;
  }

  // --- q (trim + 100 karakter + PostgREST filtre-özel karakterlerini arındır) ---
  let q: string | undefined;
  const rawQ = sp.get("q");
  if (rawQ !== null) {
    const cleaned = rawQ.trim().replace(/[,()*%]/g, "").slice(0, MAX_Q_LEN);
    if (cleaned) q = cleaned;
  }

  // --- slug (tam eşleşme; trim + PostgREST filtre-özel karakterlerini arındır) ---
  let slug: string | undefined;
  const rawSlug = sp.get("slug");
  if (rawSlug !== null) {
    const cleaned = rawSlug.trim().replace(/[,()*%]/g, "").slice(0, MAX_SLUG_LEN);
    if (cleaned) slug = cleaned;
  }

  const result = await listSchools(db, {
    limit,
    offset,
    traditionId,
    status,
    q,
    slug,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "YEBS ekol kayıtları alınamadı.",
        code: result.code,
      },
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
 * POST /api/admin/yebs/schools
 *
 * YEBS D2 (yebs_schools) audit'li admin CREATE ucu (API-A1W).
 *
 * Güvenlik:
 *   - verifyAdminRequest → başarısızsa guard.response.
 *   - Actor YALNIZ guard.adminId'den; body'den actor/id/status/timestamp/
 *     request/operation ID/audit alanları KABUL EDİLMEZ.
 *   - Body yalnız 7 exact anahtarı kabul eder; fazla/yasak anahtar → 400.
 *   - Kullanıcı değerleri coerce/trim/truncate EDİLMEZ; canonical create yalnız
 *     SECURITY DEFINER RPC üzerinden (createSchool). DB/RPC canonical validation'ın
 *     nihai kaynağıdır.
 *   - Ham DB hata metni istemciye DÖNMEZ; yalnız stabil kod + sabit mesaj.
 */

const ALLOWED_BODY_KEYS = [
  "tradition_id",
  "slug",
  "name_tr",
  "native_name",
  "native_language_tag",
  "native_script_code",
  "reason",
] as const;

const REASON_MAX_LEN = 2000;

function invalidBody(): Response {
  return NextResponse.json(
    { ok: false, error: "Geçersiz istek gövdesi.", code: "YEBS_INVALID_REQUEST_BODY" },
    { status: 400 },
  );
}

// Opsiyonel string|null alan okuma: missing/undefined/null → null; string →
// orijinal (coercion YOK); başka tip → geçersiz.
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

function mapCreateError(code: CreateSchoolErrorCode): Response {
  switch (code) {
    case "YEBS_REASON_INVALID":
    case "YEBS_INVALID_SCHOOL_INPUT":
      return NextResponse.json(
        { ok: false, error: "Geçersiz ekol verisi.", code },
        { status: 400 },
      );
    case "YEBS_PARENT_TRADITION_NOT_FOUND":
      return NextResponse.json(
        { ok: false, error: "Ekolün bağlanacağı gelenek bulunamadı.", code },
        { status: 404 },
      );
    case "YEBS_SCHOOL_DUPLICATE":
      return NextResponse.json(
        { ok: false, error: "Bu gelenekte bu slug ile ekol zaten var.", code },
        { status: 409 },
      );
    case "YEBS_ADMIN_NOT_FOUND":
    case "YEBS_ADMIN_NOT_ACTIVE":
      // Admin, guard sonrası DB'de pasifleşmiş/silinmiş olabilir (race). Var/yok
      // ayrımı istemciye SIZMAZ — tek sabit 403.
      return NextResponse.json(
        { ok: false, error: "Admin yetkisi doğrulanamadı.", code: "YEBS_ADMIN_FORBIDDEN" },
        { status: 403 },
      );
    case "YEBS_REQUEST_ID_REQUIRED":
    case "YEBS_OPERATION_ID_REQUIRED":
    case "YEBS_TRADITION_ID_REQUIRED":
    case "YEBS_SCHOOL_CREATE_FAILED":
    default:
      return NextResponse.json(
        { ok: false, error: "Ekol oluşturulamadı.", code: "YEBS_SCHOOL_CREATE_FAILED" },
        { status: 500 },
      );
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  // --- Body parse (malformed → 400) ---
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidBody();
  }

  // --- Plain-object kontrolü (null/array/string/number/boolean → 400) ---
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return invalidBody();
  }
  const obj = body as Record<string, unknown>;

  // --- Exact allowed-key kontrolü (unknown/yasak own-enumerable anahtar → 400) ---
  const allowed = new Set<string>(ALLOWED_BODY_KEYS);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) return invalidBody();
  }

  // --- tradition_id: zorunlu, strict UUID (biçim geçersiz → 400 stabil kod) ---
  const traditionId = obj.tradition_id;
  if (typeof traditionId !== "string") return invalidBody();
  if (!UUID_RE.test(traditionId)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz tradition_id değeri.", code: "YEBS_INVALID_TRADITION_ID" },
      { status: 400 },
    );
  }

  // --- Zorunlu string alanlar: tip + trim-boş kontrolü (coercion YOK) ---
  for (const key of ["slug", "name_tr"] as const) {
    const v = obj[key];
    if (typeof v !== "string" || v.trim() === "") return invalidBody();
  }

  // --- Opsiyonel native alanları (string | null) ---
  const nativeName = readOptionalString(obj, "native_name");
  const nativeLang = readOptionalString(obj, "native_language_tag");
  const nativeScript = readOptionalString(obj, "native_script_code");
  if (!nativeName.ok || !nativeLang.ok || !nativeScript.ok) return invalidBody();

  // --- reason (opsiyonel): string ise trim-boş değil ve <= 2000 (orijinal iletilir) ---
  const reasonRead = readOptionalString(obj, "reason");
  if (!reasonRead.ok) return invalidBody();
  if (
    reasonRead.value !== null &&
    (reasonRead.value.trim() === "" || reasonRead.value.length > REASON_MAX_LEN)
  ) {
    return invalidBody();
  }

  // Orijinal değerler (trim/coerce EDİLMEDEN) canonical RPC'ye iletilir.
  const input: CreateSchoolInput = {
    traditionId,
    slug: obj.slug as string,
    nameTr: obj.name_tr as string,
    nativeName: nativeName.value,
    nativeLanguageTag: nativeLang.value,
    nativeScriptCode: nativeScript.value,
    reason: reasonRead.value,
  };

  const result = await createSchool(db, adminId, input);

  if (!result.ok) {
    return mapCreateError(result.code);
  }

  return NextResponse.json({ ok: true, row: result.row }, { status: 201 });
}

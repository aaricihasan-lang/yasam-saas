import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { getSchoolById } from "@/lib/yebs/service/schools";
import {
  updateSchool,
  type UpdateSchoolPatch,
  type UpdateSchoolErrorCode,
} from "@/lib/yebs/service/schoolMutations";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/yebs/schools/[id]
 *
 * YEBS D2 (yebs_schools) SALT-OKUNUR admin detay ucu (API-A1R).
 *
 * Güvenlik:
 *   - verifyAdminRequest → başarısızsa guard.response.
 *   - Yalnız guard.db (service_role). tenant/kullanıcı sahiplik filtresi YOK;
 *     yebs_schools merkezî admin referans tablosudur.
 *   - Geçersiz UUID → 400; kayıt yok → 404; DB hatası → 500 (ham metin gizli).
 *   - SALT-OKUNUR: yalnız GET; POST/PATCH/PUT/DELETE YOK. Mutation/RPC YOK.
 *     Audit response'a dahil edilmez; tradition JOIN edilmez.
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
      {
        ok: false,
        error: "Geçersiz ekol kimliği.",
        code: "YEBS_INVALID_SCHOOL_ID",
      },
      { status: 400 },
    );
  }

  const result = await getSchoolById(db, id);

  if (!result.ok) {
    if (result.code === "YEBS_SCHOOL_NOT_FOUND") {
      return NextResponse.json(
        {
          ok: false,
          error: "Ekol kaydı bulunamadı.",
          code: result.code,
        },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "YEBS ekol kaydı alınamadı.",
        code: result.code,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, row: result.row });
}

/**
 * PATCH /api/admin/yebs/schools/[id]
 *
 * YEBS D2 (yebs_schools) audit'li admin UPDATE ucu (API-A1U).
 *
 * Güvenlik:
 *   - verifyAdminRequest → başarısızsa guard.response.
 *   - Actor YALNIZ guard.adminId'den; id URL'den; request/operation ID server-side.
 *   - Body yalnız 7 exact anahtar; tradition_id/status/actor/id/timestamp/request/
 *     operation/audit alanları KABUL EDİLMEZ. Fazla anahtar → 400.
 *   - reason ZORUNLU; expected_updated_at ZORUNLU (strict RFC3339/ISO, tz'li).
 *   - Kullanıcı değerleri coerce/trim/truncate/normalize EDİLMEZ; canonical update
 *     yalnız SECURITY DEFINER RPC (updateSchool) üzerinden. DB/RPC nihai kaynak.
 *   - Ham DB hata metni istemciye DÖNMEZ; yalnız stabil kod + sabit mesaj.
 */

const REASON_MAX_LEN = 2000;

// Zorunlu timezone'lu tarih-zaman: YYYY-MM-DDTHH:mm:ss[.1-6 kesir](Z|±HH:mm).
// Biçim regex'i (yakalama gruplu): yıl/ay/gün/saat/dakika/saniye/kesir/tz.
const EXPECTED_UPDATED_AT_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

// STRICT takvim doğrulaması: Date.parse tek başına 31 Şubat/aşkın günleri
// normalize edebildiğinden yetmez. Ay/gün/artık-yıl/saat/dakika/saniye/offset
// bileşenleri ayrıca doğrulanır; böylece RPC'ye YALNIZ geçerli timestamptz metni
// ulaşır. Geçerli değer DEĞİŞTİRİLMEDEN aktarılır (normalize/trim/toISOString YOK).
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

  if (year === 0) return false; // 0000 reddedilir
  if (month < 1 || month > 12) return false;
  if (hour > 23) return false;
  if (minute > 59) return false;
  if (second > 59) return false;

  // Artık yıl: 4'e bölünen; 100'e bölünüp 400'e bölünmeyen HARİÇ.
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > daysInMonth[month - 1]) return false;

  // Timezone offset (Z değilse ±HH:mm): saat 00–23, dakika 00–59.
  if (tz !== "Z") {
    const offsetHour = Number(tz.slice(1, 3));
    const offsetMinute = Number(tz.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }

  // Nihai güvenlik: motor da ayrıştırabilmeli (finite).
  return Number.isFinite(Date.parse(value));
}

const PATCH_ALLOWED_KEYS = [
  "expected_updated_at",
  "reason",
  "slug",
  "name_tr",
  "native_name",
  "native_language_tag",
  "native_script_code",
] as const;

function invalidUpdateBody(): Response {
  return NextResponse.json(
    { ok: false, error: "Geçersiz istek gövdesi.", code: "YEBS_INVALID_REQUEST_BODY" },
    { status: 400 },
  );
}

function mapUpdateError(code: UpdateSchoolErrorCode): Response {
  switch (code) {
    case "YEBS_INVALID_PATCH":
    case "YEBS_INVALID_SCHOOL_INPUT":
    case "YEBS_REASON_INVALID":
      return NextResponse.json(
        { ok: false, error: "Geçersiz ekol verisi.", code },
        { status: 400 },
      );
    case "YEBS_SCHOOL_NOT_FOUND":
      return NextResponse.json(
        { ok: false, error: "Ekol kaydı bulunamadı.", code },
        { status: 404 },
      );
    case "YEBS_SCHOOL_DUPLICATE":
      return NextResponse.json(
        { ok: false, error: "Bu gelenekte bu slug ile ekol zaten var.", code },
        { status: 409 },
      );
    case "YEBS_SCHOOL_STALE_UPDATE":
      return NextResponse.json(
        {
          ok: false,
          error: "Ekol başka bir işlem tarafından güncellendi. Güncel kaydı yeniden yükleyin.",
          code,
        },
        { status: 409 },
      );
    case "YEBS_SCHOOL_STATUS_LOCKED":
      return NextResponse.json(
        { ok: false, error: "Yalnız taslak durumundaki ekoller düzenlenebilir.", code },
        { status: 409 },
      );
    case "YEBS_SCHOOL_NO_CHANGES":
      return NextResponse.json(
        { ok: false, error: "Ekolde kaydedilecek bir değişiklik bulunamadı.", code },
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
    case "YEBS_SCHOOL_ID_REQUIRED":
    case "YEBS_EXPECTED_UPDATED_AT_REQUIRED":
    case "YEBS_SCHOOL_UPDATE_FAILED":
    default:
      return NextResponse.json(
        { ok: false, error: "Ekol güncellenemedi.", code: "YEBS_SCHOOL_UPDATE_FAILED" },
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

  // --- URL id (GET ile aynı UUID sözleşmesi) ---
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { ok: false, error: "Geçersiz ekol kimliği.", code: "YEBS_INVALID_SCHOOL_ID" },
      { status: 400 },
    );
  }

  // --- Body parse (malformed → 400) ---
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidUpdateBody();
  }

  // --- Plain-object kontrolü (null/array/string/number/boolean → 400) ---
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return invalidUpdateBody();
  }
  const obj = body as Record<string, unknown>;

  // --- Exact allowed-key kontrolü (unknown/yasak own-enumerable anahtar → 400) ---
  const allowed = new Set<string>(PATCH_ALLOWED_KEYS);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) return invalidUpdateBody();
  }

  // --- reason ZORUNLU (string, trim-boş değil, <= 2000; orijinal iletilir) ---
  const reason = obj.reason;
  if (typeof reason !== "string" || reason.trim() === "" || reason.length > REASON_MAX_LEN) {
    return invalidUpdateBody();
  }

  // --- expected_updated_at ZORUNLU (strict tz'li format + gerçek takvim; orijinal) ---
  const expectedUpdatedAt = obj.expected_updated_at;
  if (typeof expectedUpdatedAt !== "string" || !isValidExpectedUpdatedAt(expectedUpdatedAt)) {
    return invalidUpdateBody();
  }

  // --- Canonical patch: yalnız PRESENT anahtarlar; coercion YOK; null korunur ---
  const patch: UpdateSchoolPatch = {};

  if ("slug" in obj) {
    const v = obj.slug;
    if (typeof v !== "string") return invalidUpdateBody();
    patch.slug = v;
  }
  if ("name_tr" in obj) {
    const v = obj.name_tr;
    if (typeof v !== "string") return invalidUpdateBody();
    patch.name_tr = v;
  }
  if ("native_name" in obj) {
    const v = obj.native_name;
    if (v !== null && typeof v !== "string") return invalidUpdateBody();
    patch.native_name = v;
  }
  if ("native_language_tag" in obj) {
    const v = obj.native_language_tag;
    if (v !== null && typeof v !== "string") return invalidUpdateBody();
    patch.native_language_tag = v;
  }
  if ("native_script_code" in obj) {
    const v = obj.native_script_code;
    if (v !== null && typeof v !== "string") return invalidUpdateBody();
    patch.native_script_code = v;
  }

  // --- En az bir canonical alan present olmalı ---
  if (Object.keys(patch).length === 0) {
    return invalidUpdateBody();
  }

  const result = await updateSchool(db, adminId, id, expectedUpdatedAt, patch, reason);

  if (!result.ok) {
    return mapUpdateError(result.code);
  }

  return NextResponse.json({ ok: true, row: result.row }, { status: 200 });
}

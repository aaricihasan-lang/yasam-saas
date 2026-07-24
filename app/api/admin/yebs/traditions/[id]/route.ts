import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { getTradition } from "@/lib/yebs/service/traditions";
import {
  updateTradition,
  type UpdateTraditionPatch,
  type UpdateTraditionErrorCode,
} from "@/lib/yebs/service/traditionMutations";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/yebs/traditions/[id]
 *
 * YEBS D1 (yebs_traditions) SALT-OKUNUR admin detay ucu (API-A0R).
 *
 * Güvenlik:
 *   - verifyAdminRequest → başarısızsa guard.response.
 *   - Yalnız guard.db (service_role). tenant/kullanıcı sahiplik filtresi YOK;
 *     yebs_traditions merkezî admin referans tablosudur.
 *   - Geçersiz UUID → 400; kayıt yok → 404; DB hatası → 500 (ham metin gizli).
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
        error: "Geçersiz gelenek kimliği.",
        code: "YEBS_INVALID_TRADITION_ID",
      },
      { status: 400 },
    );
  }

  const result = await getTradition(db, id);

  if (!result.ok) {
    if (result.code === "YEBS_TRADITION_NOT_FOUND") {
      return NextResponse.json(
        {
          ok: false,
          error: "Gelenek kaydı bulunamadı.",
          code: result.code,
        },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "YEBS gelenek kaydı alınamadı.",
        code: result.code,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, row: result.row });
}

/**
 * PATCH /api/admin/yebs/traditions/[id]
 *
 * YEBS D1 (yebs_traditions) audit'li admin UPDATE ucu (API-A0U).
 *
 * Güvenlik:
 *   - verifyAdminRequest → başarısızsa guard.response.
 *   - Actor YALNIZ guard.adminId'den; id URL'den; request/operation ID server-side.
 *   - Body yalnız 8 exact anahtar; status/actor/id/timestamp/request/operation/audit
 *     alanları KABUL EDİLMEZ. Fazla anahtar → 400.
 *   - reason ZORUNLU; expected_updated_at ZORUNLU (strict RFC3339/ISO, tz'li).
 *   - Kullanıcı değerleri coerce/trim/truncate/normalize EDİLMEZ; canonical update
 *     yalnız SECURITY DEFINER RPC (updateTradition) üzerinden. DB/RPC nihai kaynak.
 *   - Ham DB hata metni istemciye DÖNMEZ; yalnız stabil kod + sabit mesaj.
 */

const REASON_MAX_LEN = 2000;

// Zorunlu timezone'lu tarih-zaman: YYYY-MM-DDTHH:mm:ss[.1-6 kesir](Z|±HH:mm).
// Yalnız-tarih veya tz'siz değer reddedilir. Değer DEĞİŞTİRİLMEDEN service'e gider.
const EXPECTED_UPDATED_AT_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

const PATCH_ALLOWED_KEYS = [
  "expected_updated_at",
  "reason",
  "slug",
  "name_tr",
  "tradition_type",
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

function mapUpdateError(code: UpdateTraditionErrorCode): Response {
  switch (code) {
    case "YEBS_INVALID_PATCH":
    case "YEBS_INVALID_TRADITION_INPUT":
    case "YEBS_REASON_INVALID":
      return NextResponse.json(
        { ok: false, error: "Geçersiz gelenek verisi.", code },
        { status: 400 },
      );
    case "YEBS_TRADITION_NOT_FOUND":
      return NextResponse.json(
        { ok: false, error: "Gelenek kaydı bulunamadı.", code },
        { status: 404 },
      );
    case "YEBS_TRADITION_DUPLICATE":
      return NextResponse.json(
        { ok: false, error: "Bu slug ile gelenek zaten var.", code },
        { status: 409 },
      );
    case "YEBS_TRADITION_STALE_UPDATE":
      return NextResponse.json(
        {
          ok: false,
          error: "Gelenek başka bir işlem tarafından güncellendi. Güncel kaydı yeniden yükleyin.",
          code,
        },
        { status: 409 },
      );
    case "YEBS_TRADITION_STATUS_LOCKED":
      return NextResponse.json(
        { ok: false, error: "Yalnız taslak durumundaki gelenekler düzenlenebilir.", code },
        { status: 409 },
      );
    case "YEBS_TRADITION_NO_CHANGES":
      return NextResponse.json(
        { ok: false, error: "Gelenekte kaydedilecek bir değişiklik bulunamadı.", code },
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
    case "YEBS_EXPECTED_UPDATED_AT_REQUIRED":
    case "YEBS_TRADITION_UPDATE_FAILED":
    default:
      return NextResponse.json(
        { ok: false, error: "Gelenek güncellenemedi.", code: "YEBS_TRADITION_UPDATE_FAILED" },
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
      { ok: false, error: "Geçersiz gelenek kimliği.", code: "YEBS_INVALID_TRADITION_ID" },
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

  // --- expected_updated_at ZORUNLU (strict tz'li format + geçerli tarih; orijinal) ---
  const expectedUpdatedAt = obj.expected_updated_at;
  if (
    typeof expectedUpdatedAt !== "string" ||
    !EXPECTED_UPDATED_AT_RE.test(expectedUpdatedAt) ||
    Number.isNaN(Date.parse(expectedUpdatedAt))
  ) {
    return invalidUpdateBody();
  }

  // --- Canonical patch: yalnız PRESENT anahtarlar; coercion YOK; null korunur ---
  const patch: UpdateTraditionPatch = {};

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
  if ("tradition_type" in obj) {
    const v = obj.tradition_type;
    if (typeof v !== "string") return invalidUpdateBody();
    patch.tradition_type = v;
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

  const result = await updateTradition(db, adminId, id, expectedUpdatedAt, patch, reason);

  if (!result.ok) {
    return mapUpdateError(result.code);
  }

  return NextResponse.json({ ok: true, row: result.row }, { status: 200 });
}

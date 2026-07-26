import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  listSchools,
  YEBS_SCHOOL_STATUSES,
  type YebsSchoolStatus,
} from "@/lib/yebs/service/schools";

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

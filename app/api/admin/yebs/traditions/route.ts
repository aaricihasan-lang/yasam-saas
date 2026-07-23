import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  listTraditions,
  YEBS_TRADITION_STATUSES,
  type YebsTraditionStatus,
} from "@/lib/yebs/service/traditions";

export const runtime = "nodejs";

/**
 * GET /api/admin/yebs/traditions
 *
 * YEBS D1 (yebs_traditions) SALT-OKUNUR admin liste ucu (API-A0R).
 *
 * Güvenlik:
 *   - verifyAdminRequest → x-admin-id + x-session-token + DB doğrulaması
 *     (role=admin AND active=true). Başarısızsa guard.response döner.
 *   - Yalnız guard.db (service_role) kullanılır; istemci Supabase nesnesi YOK,
 *     service_role anahtarı doğrudan okunmaz. tenantId KABUL EDİLMEZ (merkezî
 *     referans tablosu, tenant-scoped değil).
 *   - Ham DB hata metni istemciye DÖNMEZ; servis katmanı server-side loglar.
 *
 * Query parametreleri:
 *   limit   varsayılan 50, [1..200]
 *   offset  varsayılan 0, >= 0
 *   status  yalnız draft | verified | approved | published
 *   q       trim + en fazla 100 karakter (filtre-özel karakterler arındırılır)
 * Geçersiz parametre → 400 (stabil YEBS kodu).
 */

const DEFAULT_LIMIT = 50;
const MIN_LIMIT = 1;
const MAX_LIMIT = 200;
const MAX_Q_LEN = 100;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const sp = req.nextUrl.searchParams;

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
  let status: YebsTraditionStatus | undefined;
  const rawStatus = sp.get("status");
  if (rawStatus !== null && rawStatus !== "") {
    if (!(YEBS_TRADITION_STATUSES as readonly string[]).includes(rawStatus)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Geçersiz status değeri.",
          code: "YEBS_INVALID_STATUS",
        },
        { status: 400 },
      );
    }
    status = rawStatus as YebsTraditionStatus;
  }

  // --- q (trim + 100 karakter + PostgREST filtre-özel karakterlerini arındır) ---
  let q: string | undefined;
  const rawQ = sp.get("q");
  if (rawQ !== null) {
    const cleaned = rawQ.trim().replace(/[,()*%]/g, "").slice(0, MAX_Q_LEN);
    if (cleaned) q = cleaned;
  }

  const result = await listTraditions(db, { limit, offset, status, q });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "YEBS gelenek kayıtları alınamadı.",
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

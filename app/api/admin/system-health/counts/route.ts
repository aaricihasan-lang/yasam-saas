import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { loadTenantCountSummary, probeTableAvailable } from "../_lib/tenantCounts";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/admin/system-health/counts — Sistem Sağlığı yalnız-SAYI metrikleri (AA-2 / ADM-1).
 *
 * Eskiden sistem-sağlığı sayfaları tarayıcı publishable client ile clients / personal_archives /
 * stones tablolarını okuyordu (anon kilidi sonrası kırık → metrikler 0). Artık sayım yalnız bu
 * service_role'lü admin route'unda yapılır.
 *
 * Sorgu:
 *   ?metric=clients|personal_archives|stones|appointments → { ok, total, tenants: {tenant_id: count}, nullTenantRows }
 *   ?probe=errors|backups                    → { ok, available }  (aday tablolardan biri var mı)
 *
 * Güvenlik:
 *   - verifyAdminRequest (x-admin-id + x-session-token binding, role=admin & active).
 *   - Tablo adı request'ten ALINMAZ; yalnız sabit allowlist anahtarı.
 *   - Yalnız sayı/tenant bazlı sayı döner; satır içeriği/PII YOK. Hata → generic mesaj.
 */
const METRIC_TABLES = {
  clients: "clients",
  personal_archives: "personal_archives",
  stones: "stones",
  // Admin Tenant Kontrol denetimi (eskiden tarayıcıdan anon okuma → 42501).
  appointments: "appointments",
} as const;

const PROBE_CANDIDATES = {
  errors: ["error_logs", "system_errors", "app_error_logs", "hata_kayitlari"],
  backups: ["backups", "system_backups", "yedeklemeler", "backup_runs"],
} as const;

const GENERIC_ERROR = "Metrikler alınamadı.";

function fail(status: number): NextResponse {
  return NextResponse.json({ ok: false, error: GENERIC_ERROR }, { status, headers: NO_STORE });
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const params = req.nextUrl.searchParams;
  const metric = params.get("metric");
  const probe = params.get("probe");

  if (metric && !probe) {
    if (!Object.prototype.hasOwnProperty.call(METRIC_TABLES, metric)) return fail(400);
    const table = METRIC_TABLES[metric as keyof typeof METRIC_TABLES];
    const result = await loadTenantCountSummary(db, table);
    if (!result.ok) return fail(500);
    return NextResponse.json(
      {
        ok: true,
        total: result.summary.total,
        tenants: result.summary.tenants,
        nullTenantRows: result.summary.nullTenantRows,
      },
      { headers: NO_STORE },
    );
  }

  if (probe && !metric) {
    if (!Object.prototype.hasOwnProperty.call(PROBE_CANDIDATES, probe)) return fail(400);
    const candidates = PROBE_CANDIDATES[probe as keyof typeof PROBE_CANDIDATES];
    let available = false;
    for (const table of candidates) {
      if (await probeTableAvailable(db, table)) {
        available = true;
        break;
      }
    }
    return NextResponse.json({ ok: true, available }, { headers: NO_STORE });
  }

  return fail(400);
}

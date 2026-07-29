/**
 * Yaşam Hafızası™ — Admin Reconciliation Dry-Run Route (BF-11D3).
 * ============================================================================
 *
 * Admin-only MANUEL dry-run tetikleyicisi. YALNIZ:
 *   - verifyAdminRequest (fail-closed; 401/403 guard'dan aynen döner)
 *   - pilot source (dogaltas:stones) — arbitrary table/source KABUL EDİLMEZ
 *   - yalnız dry-run (write/enqueue/apply YOK; read-only port'lar)
 *   - aggregate + cursor + sınırlı teknik anomali örnekleri (PII/içerik/DB-mesaj YOK)
 *   - cache kapalı (no-store)
 *
 * İNDEKSLEME/RECONCILE MANTIĞI burada TEKRAR EDİLMEZ (reconcileEntry çekirdeği).
 */

import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { resolveYhSourceConfig } from "@/lib/yasam-hafizasi/indexer/adminIndexRequest";
import { YH_OUTBOX_LEASE_SECONDS } from "@/lib/inngest/functions/yhOutboxWorker";
import {
  createReconcilePorts,
  runReconcileDryRun,
  ReconUnsupportedSourceError,
} from "@/lib/yasam-hafizasi/reconcile/reconcileEntry";
import type { ReadDbClient } from "@/lib/yasam-hafizasi/reconcile/indexScanAdapter";
import {
  RECON_DEFAULT_CAPS,
  RECON_PILOT_SOURCE_KEY,
} from "@/lib/yasam-hafizasi/reconcile/types";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1) Admin auth (fail-closed).
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  // 2) Opsiyonel body: yalnız bounded pageSize override (arbitrary source/table YOK).
  let pageSize = RECON_DEFAULT_CAPS.pageSize;
  try {
    const raw: unknown = await req.json().catch(() => null);
    if (raw !== null && typeof raw === "object") {
      const ps = (raw as { pageSize?: unknown }).pageSize;
      if (ps !== undefined) {
        if (!Number.isInteger(ps) || (ps as number) < 1 || (ps as number) > RECON_DEFAULT_CAPS.maxPageSize) {
          return NextResponse.json(
            { ok: false, error: { code: "invalid-page-size" } },
            { status: 400, headers: NO_STORE },
          );
        }
        pageSize = ps as number;
      }
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "invalid-json" } },
      { status: 400, headers: NO_STORE },
    );
  }

  // 3) Pilot config (fail-closed).
  const config = resolveYhSourceConfig(RECON_PILOT_SOURCE_KEY);
  if (config === null) {
    return NextResponse.json(
      { ok: false, error: { code: "config-missing" } },
      { status: 500, headers: NO_STORE },
    );
  }

  // 4) Read-only port'lar (service-role guard.db; write client verilmez).
  const db = guard.db as unknown as ReadDbClient;
  const ports = createReconcilePorts(db, config);

  try {
    const result = await runReconcileDryRun({
      config,
      source: ports.source,
      index: ports.index,
      indexLookup: ports.indexLookup,
      sourceExists: ports.sourceExists,
      outboxHealth: ports.outboxHealth,
      caps: { ...RECON_DEFAULT_CAPS, pageSize },
      nowMs: Date.now(),
      leaseSeconds: YH_OUTBOX_LEASE_SECONDS,
    });
    return NextResponse.json({ ok: true, result }, { status: 200, headers: NO_STORE });
  } catch (err) {
    if (err instanceof ReconUnsupportedSourceError) {
      return NextResponse.json(
        { ok: false, error: { code: "unsupported-source" } },
        { status: 400, headers: NO_STORE },
      );
    }
    // Ham hata/DB mesajı TAŞINMAZ.
    return NextResponse.json(
      { ok: false, error: { code: "reconcile-failed" } },
      { status: 500, headers: NO_STORE },
    );
  }
}

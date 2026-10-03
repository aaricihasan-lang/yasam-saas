/**
 * Yaşam Hafızası™ — Admin REPLAY Route (satış öncesi historical replay + drain).
 *
 * YALNIZ ANA YÖNETİCİ (owner). Her geçerli çağrı (salt-okunur ölçüm dahil) işlem ÇALIŞMADAN ÖNCE
 * admin_audit_log'a yazılır (fail-closed: audit yazılamazsa hiçbir şey çalışmaz).
 *
 * Index'e DOĞRUDAN yazılmaz: `enqueue` yalnız outbox'a replay olayı ekler (DB RPC
 * yh_outbox_replay_enqueue — sabit kaynak allowlist, gerçek kullanıcılı/aktif tenant, aktif kaynak);
 * `drain` mevcut worker zincirini (aktivasyon / PII / demo / satır kapısı / NULL-tenant reddi)
 * süre bütçesiyle çalıştırır ve kaldığı yeri `hasMore` ile bildirir.
 */

import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { requireMainAdmin } from "@/lib/admin/adminGuards";
import { writeAdminAudit } from "@/lib/admin/adminAudit";
import { runOutboxBatch } from "@/lib/yasam-hafizasi/outbox/eventProcessor";
import { createProfessionalOutboxBatchDeps } from "@/lib/yasam-hafizasi/outbox/professionalOutboxRuntime";
import { runOutboxDrain } from "@/lib/yasam-hafizasi/outbox/outboxDrain";
import { toCoverageRows, validateReplayRequest } from "@/lib/yasam-hafizasi/replay/replayRequest";

export const runtime = "nodejs";
export const maxDuration = 120;

const NO_STORE = { "Cache-Control": "no-store" } as const;
const DRAIN_TIME_BUDGET_MS = 80_000;
const DRAIN_CLAIM_BATCH = 25;

function fail(status: number, code: string): NextResponse {
  return NextResponse.json({ ok: false, error: { code } }, { status, headers: NO_STORE });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db, adminId } = guard;

  const main = await requireMainAdmin(db, adminId);
  if (!main.ok) return fail(403, "main-admin-required");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "invalid-json");
  }
  const parsed = validateReplayRequest(raw);
  if (!parsed.ok) return fail(400, parsed.code);
  const r = parsed.value;

  try {
    await writeAdminAudit(db, {
      actorAdminId: adminId,
      actorIsMainAdmin: true,
      action: "main_admin_critical_action",
      context: {
        operation: `yh_replay_${r.action}`,
        source_key: "sourceKey" in r ? r.sourceKey : null,
        tenant_id: "tenantId" in r ? r.tenantId : null,
        mode: r.action === "enqueue" ? r.mode : null,
        limit: r.action === "enqueue" ? r.limit : r.action === "drain" ? r.maxEvents : null,
        cursor_present: r.action === "enqueue" ? r.afterId !== null : false,
      },
    });
  } catch {
    return fail(503, "audit-unavailable");
  }

  if (r.action === "coverage") {
    const { data, error } = await db.rpc("yh_replay_coverage", { p_source_key: r.sourceKey });
    if (error) return fail(502, "coverage-failed");
    return NextResponse.json({ ok: true, sourceKey: r.sourceKey, rows: toCoverageRows(data) }, { headers: NO_STORE });
  }

  if (r.action === "enqueue") {
    const { data, error } = await db.rpc("yh_outbox_replay_enqueue", {
      p_source_key: r.sourceKey,
      p_tenant_id: r.tenantId,
      p_mode: r.mode,
      p_limit: r.limit,
      p_after_id: r.afterId,
    });
    // RPC reddi (tenant geçersiz / kaynak pasif) güvenli kodla döner; ham DB mesajı taşınmaz.
    if (error) return fail(409, "enqueue-rejected");
    const res = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
    return NextResponse.json(
      {
        ok: true,
        sourceKey: r.sourceKey,
        tenantId: r.tenantId,
        mode: r.mode,
        enqueued: typeof res.enqueued === "number" ? res.enqueued : 0,
        lastId: typeof res.last_id === "string" ? res.last_id : null,
        done: res.done === true,
      },
      { headers: NO_STORE },
    );
  }

  if (r.action === "drain") {
    const worker = `yh-replay-drain@${adminId.slice(0, 8)}-${Date.now()}`;
    const deps = createProfessionalOutboxBatchDeps(db, worker, DRAIN_CLAIM_BATCH);
    try {
      const result = await runOutboxDrain(
        (claimBatch) => runOutboxBatch({ ...deps, claimBatch }),
        { claimBatch: DRAIN_CLAIM_BATCH, maxEvents: r.maxEvents, timeBudgetMs: DRAIN_TIME_BUDGET_MS },
      );
      console.info("[yh-replay-drain]", { ...result });
      return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
    } catch {
      return fail(502, "drain-failed");
    }
  }

  // progress
  const { data, error } = await db.rpc("yh_outbox_progress", {
    p_source_key: r.sourceKey,
    p_tenant_id: r.tenantId,
  });
  if (error) return fail(502, "progress-failed");
  const rows = Array.isArray(data)
    ? data
        .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
        .map((x) => ({
          status: typeof x.status === "string" ? x.status : null,
          outcome: typeof x.last_outcome === "string" ? x.last_outcome : null,
          replay: x.replay === true,
          n: typeof x.n === "number" ? x.n : Number(x.n ?? 0),
        }))
    : [];
  return NextResponse.json({ ok: true, rows }, { headers: NO_STORE });
}

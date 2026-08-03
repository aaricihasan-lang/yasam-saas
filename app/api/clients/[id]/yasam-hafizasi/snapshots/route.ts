import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { getTenantFlags } from "@/lib/yasam-hafizasi/flags";
import {
  parseSnapshotCreate,
  parseSnapshotDelete,
  type SnapshotTargetKind,
} from "@/lib/yasam-hafizasi/client/snapshotSelection";
import {
  createSnapshotSelections,
  readSnapshotSelectionGroup,
  deleteSnapshotSelection,
  type SnapshotContext,
} from "@/lib/yasam-hafizasi/client/snapshotStore";

export const runtime = "nodejs";

/**
 * /api/clients/[id]/yasam-hafizasi/snapshots — BF-14 Paket 2 teslim seçimi deposu.
 *
 * POST   → seçim grubu oluştur / snapshot ekle (içerik SERVER-derived; §5).
 * GET     → ownership-doğrulanmış seçim grubunu oku.
 * DELETE  → teslim öncesi seçimden tek kaydı kaldır (append-only; UPDATE yok).
 *
 * Güvenlik: tenant YALNIZ session'dan; client_id YALNIZ URL'den; body'den tenant/client
 * KABUL EDİLMEZ. clientBelongsToTenant → başka tenant/client 404 (enumeration fail-closed).
 * yasam_hafizasi modül izni + yh_enabled flag; demo → write engelli.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(code: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, code }, { status });
}

async function clientBelongsToTenant(db: SupabaseClient, clientId: string, tenantId: string): Promise<boolean> {
  const { data } = await db
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return Boolean(data);
}

interface Gate {
  ctx: SnapshotContext;
  clientId: string;
}

/** Ortak kapı: auth + modül izni + client ownership + flag. write → demo engeli. */
async function gate(
  req: NextRequest,
  params: Promise<{ id: string }>,
  opts: { write: boolean },
): Promise<{ ok: true; gate: Gate } | { ok: false; response: NextResponse }> {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return { ok: false, response: guard.response };
  const { db, tenantId, is_demo_account, profile, userId } = guard;

  if (!hasModulePermissionForProfile(profile, "yasam_hafizasi")) {
    return { ok: false, response: fail("YH_MODULE_FORBIDDEN", 403) };
  }

  const { id: clientId } = await params;
  if (!UUID_RE.test(clientId)) return { ok: false, response: fail("YH_INVALID_CLIENT", 400) };
  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return { ok: false, response: fail("YH_CLIENT_NOT_FOUND", 404) };
  }

  if (opts.write && is_demo_account) {
    return { ok: false, response: fail("YH_DEMO_READONLY", 403) };
  }

  const flags = await getTenantFlags(tenantId, db);
  if (!flags.yh_enabled) {
    return { ok: false, response: fail("YH_NOT_ACTIVE", 403) };
  }

  const ctx: SnapshotContext = {
    db,
    tenantId,
    clientId,
    actorUserId: userId,
    allowShared: flags.yh_shared === true,
  };
  return { ok: true, gate: { ctx, clientId } };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const g = await gate(req, params, { write: true });
  if (!g.ok) return g.response;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return fail("YH_SNAP_INVALID_BODY", 400);
  }
  const parsed = parseSnapshotCreate(rawBody);
  if (!parsed.ok) return fail(parsed.code, 400);

  const result = await createSnapshotSelections(g.gate.ctx, parsed.value);
  if (!result.ok) return fail(result.code, result.status);

  return NextResponse.json({
    ok: true,
    selectionGroupId: result.selectionGroupId,
    targetKind: result.targetKind,
    targetRef: result.targetRef,
    total: result.total,
    added: result.added,
    skipped: result.skipped,
    items: result.items,
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const g = await gate(req, params, { write: false });
  if (!g.ok) return g.response;

  const url = new URL(req.url);
  const selectionGroupId = url.searchParams.get("selectionGroupId")?.trim() ?? "";
  const targetKindRaw = url.searchParams.get("targetKind")?.trim() ?? "";
  const targetRefRaw = url.searchParams.get("targetRef")?.trim() ?? "";

  if (!UUID_RE.test(selectionGroupId)) return fail("YH_SNAP_INVALID_GROUP", 400);
  if (targetKindRaw !== "report" && targetKindRaw !== "protocol" && targetKindRaw !== "guide") {
    return fail("YH_SNAP_INVALID_TARGET", 400);
  }
  const targetKind = targetKindRaw as SnapshotTargetKind;

  let targetRef: string | null = null;
  if (targetKind === "protocol" || targetKind === "guide") {
    if (!UUID_RE.test(targetRefRaw)) return fail("YH_SNAP_INVALID_TARGET_REF", 400);
    targetRef = targetRefRaw;
  }

  const res = await readSnapshotSelectionGroup(g.gate.ctx, { targetKind, targetRef }, selectionGroupId);
  if (!res.ok) {
    return res.notActive
      ? NextResponse.json({ ok: true, selectionGroupId, targetKind, targetRef, total: 0, items: [], disabled: true, reason: "not-active" })
      : fail("YH_SNAP_READ_FAILED", 500);
  }
  return NextResponse.json({
    ok: true,
    selectionGroupId,
    targetKind,
    targetRef,
    total: res.items.length,
    items: res.items,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const g = await gate(req, params, { write: true });
  if (!g.ok) return g.response;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return fail("YH_SNAP_INVALID_BODY", 400);
  }
  const parsed = parseSnapshotDelete(rawBody);
  if (!parsed.ok) return fail(parsed.code, 400);

  const res = await deleteSnapshotSelection(g.gate.ctx, parsed.value.selectionGroupId, parsed.value.snapshotId);
  if (!res.ok) return fail("YH_SNAP_DELETE_FAILED", res.notActive ? 409 : 500);

  return NextResponse.json({ ok: true, deleted: res.deleted });
}

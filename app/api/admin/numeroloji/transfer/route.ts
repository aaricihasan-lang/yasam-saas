import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { writeAdminAudit, AdminAuditError } from "@/lib/admin/adminAudit";
import { ADMIN_LIBRARY_TENANT_ID } from "@/lib/tenancy/syntheticTenants";

export const runtime = "nodejs";

/**
 * /api/admin/numeroloji/transfer — admin'in KENDİ kütüphanesinden (kendi tenant'ı)
 * bir uzmana numeroloji bilgi/taş kayıtlarının BAĞIMSIZ kopyalanması (veri paylaşımı).
 * Service-role okuma+yazma.
 *
 * NUM-002 SIKILAŞTIRMA:
 *   - Kaynak tenant SUNUCUDA adminin kendi kaydından çözülür; body'den GELMEZ →
 *     keyfi bir tenant'ı (başka uzmanın verisini) kaynak seçip okuyup kopyalamak
 *     İMKÂNSIZ (çapraz-tenant okuma kapandı).
 *   - Hedef yalnız AKTİF bir UZMAN olabilir ve tenant'ı kullanıcıyla eşleşmelidir;
 *     hedef admin kütüphane tenant'ı veya kaynak tenant olamaz.
 *   - Her sonuç admin_audit_log'a yazılır (library_transfer_completed/failed).
 *   - Ham Supabase/DB hata mesajı DIŞARI SIZMAZ (güvenli genel mesaj).
 *
 * NOT: Çok-modüllü kanonik akış /api/admin/veri-paylasimi/transfer'dir (idempotency
 * ledger + provenance). Bu tek-tablo uç aynı güvenlik modeline hizalanmıştır.
 *
 * POST { table, targetUserId, targetTenantId, filterIds? } → { ok, inserted }
 */

const ALLOWED = new Set(["numerology_knowledge_records", "numerology_stone_assignments"]);
const STRIP = new Set(["id", "created_at", "updated_at", "tenant_id"]);
const BATCH = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sonuç ne olursa olsun güvenli audit yazımı (AdminAuditError yutulur; diğer hatalar yükselir). */
async function auditTransfer(
  db: SupabaseClient,
  params: {
    adminId: string;
    targetUserId: string;
    sourceTenantId: string;
    targetTenantId: string;
    table: string;
    inserted: number;
    ok: boolean;
  },
): Promise<void> {
  try {
    await writeAdminAudit(db, {
      actorAdminId: params.adminId,
      action: params.ok ? "library_transfer_completed" : "library_transfer_failed",
      targetUserId: params.targetUserId,
      result: { table: params.table, inserted_count: params.inserted },
      context: { source_tenant_id: params.sourceTenantId, target_tenant_id: params.targetTenantId },
    });
  } catch (e) {
    if (!(e instanceof AdminAuditError)) throw e;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db, adminId } = guard;

  let body: { table?: unknown; targetUserId?: unknown; targetTenantId?: unknown; filterIds?: unknown };
  try { body = (await req.json()) as typeof body; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const table = String(body.table ?? "").trim();
  const targetUserId = String(body.targetUserId ?? "").trim();
  const targetTenantId = String(body.targetTenantId ?? "").trim();
  const filterIds = Array.isArray(body.filterIds)
    ? body.filterIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : undefined;

  if (!ALLOWED.has(table)) return NextResponse.json({ ok: false, error: "Geçersiz tablo." }, { status: 400 });
  if (!UUID_RE.test(targetUserId)) return NextResponse.json({ ok: false, error: "Geçersiz hedef kullanıcı." }, { status: 400 });
  if (!UUID_RE.test(targetTenantId)) return NextResponse.json({ ok: false, error: "Geçersiz hedef tenant." }, { status: 400 });

  // Kaynak tenant SUNUCUDA adminin kendi kaydından çözülür (body sourceTenantId'e GÜVENİLMEZ).
  const { data: adminRow } = await db.from("users").select("tenant_id").eq("id", adminId).maybeSingle();
  const sourceTenantId = String((adminRow as { tenant_id?: unknown } | null)?.tenant_id ?? "").trim();
  if (!UUID_RE.test(sourceTenantId)) {
    return NextResponse.json({ ok: false, error: "Admin kaynak tenant bulunamadı." }, { status: 400 });
  }

  // Hedef doğrulama: aktif UZMAN + tenant kullanıcıyla eşleşmeli.
  const { data: targetRow } = await db
    .from("users")
    .select("id, role, active, tenant_id")
    .eq("id", targetUserId)
    .maybeSingle();
  const target = targetRow as { role?: unknown; active?: unknown; tenant_id?: unknown } | null;
  if (!target) return NextResponse.json({ ok: false, error: "Hedef kullanıcı bulunamadı." }, { status: 404 });
  if (String(target.role ?? "") !== "expert") {
    return NextResponse.json({ ok: false, error: "Aktarım hedefi yalnız uzman olabilir." }, { status: 403 });
  }
  if (target.active !== true) return NextResponse.json({ ok: false, error: "Hedef hesap aktif değil." }, { status: 422 });
  if (String(target.tenant_id ?? "").trim() !== targetTenantId) {
    return NextResponse.json({ ok: false, error: "Hedef tenant kullanıcıyla eşleşmiyor." }, { status: 400 });
  }
  if (targetTenantId === sourceTenantId) {
    return NextResponse.json({ ok: false, error: "Kaynak ve hedef tenant aynı olamaz." }, { status: 400 });
  }
  if (targetTenantId === ADMIN_LIBRARY_TENANT_ID) {
    return NextResponse.json({ ok: false, error: "Hedef, admin kütüphane tenant'ı olamaz." }, { status: 400 });
  }

  // Kaynak: yalnız adminin kendi tenant'ı.
  let readQ = db.from(table).select("*").eq("tenant_id", sourceTenantId);
  if (filterIds?.length) readQ = readQ.in("id", filterIds);
  const { data: sourceRows, error: readErr } = await readQ;
  if (readErr) {
    await auditTransfer(db, { adminId, targetUserId, sourceTenantId, targetTenantId, table, inserted: 0, ok: false });
    return NextResponse.json({ ok: false, error: "Kaynak kayıtlar okunamadı." }, { status: 500 });
  }

  const rows = (sourceRows ?? []) as Record<string, unknown>[];
  if (rows.length === 0) {
    await auditTransfer(db, { adminId, targetUserId, sourceTenantId, targetTenantId, table, inserted: 0, ok: true });
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  const payloads = rows.map((row) => {
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) if (!STRIP.has(k)) copy[k] = v;
    copy.tenant_id = targetTenantId; // bağımsız kopya → hedef tenant
    return copy;
  });

  let inserted = 0;
  for (let off = 0; off < payloads.length; off += BATCH) {
    const batch = payloads.slice(off, off + BATCH);
    const { error } = await db.from(table).insert(batch);
    if (error) {
      await auditTransfer(db, { adminId, targetUserId, sourceTenantId, targetTenantId, table, inserted, ok: false });
      return NextResponse.json({ ok: false, error: "Aktarım yazılamadı.", inserted }, { status: 500 });
    }
    inserted += batch.length;
  }

  await auditTransfer(db, { adminId, targetUserId, sourceTenantId, targetTenantId, table, inserted, ok: true });
  return NextResponse.json({ ok: true, inserted });
}

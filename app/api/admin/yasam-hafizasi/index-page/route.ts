/**
 * Yaşam Hafızası™ — Admin İndeks-Sayfa Route (Sprint 2 / S2.11).
 *
 * TEK kaynak / TEK sayfa indeksleme tetikleyicisi (dry-run | write). İnce HTTP
 * sarmalayıcı: auth → json-parse → fail-closed demo check → handler (guard.db
 * enjekte) → NextResponse. İndeksleme mantığı S2.10 `indexSourcePage()`'te; burada
 * TEKRAR EDİLMEZ.
 *
 * DEĞİŞMEZ İNVARYANT: bir HTTP request'te tam olarak BİR `indexSourcePage()` çağrısı
 * (çok-sayfa döngü YOK). Demo kaynak-unit filtresi S2.10'da; bypass edilemez.
 *
 * AA-1 (satış öncesi hijyen): uzman tenant'ı (scopedTenantId / exactSourceId) için indeksleme
 * tetiklenebildiğinden route YALNIZ ANA YÖNETİCİYE açıktır (requireMainAdmin) ve geçerli her
 * çağrı (dry-run DAHİL) indeks çalışmadan ÖNCE admin_audit_log'a yazılır (fail-closed: audit
 * yazılamazsa indeks çalışmaz). Exact moddaki var/yok ayrıntısı yanıta çıkmaz (generic).
 */

import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { requireMainAdmin } from "@/lib/admin/adminGuards";
import { writeAdminAudit } from "@/lib/admin/adminAudit";
import {
  handleAdminIndexRequest,
  validateAdminIndexRequest,
  type AdminIndexHandlerDeps,
  type SafeAdminIndexAuditEvent,
  type ValidatedAdminIndexRequest,
} from "@/lib/yasam-hafizasi/indexer/adminIndexRequest";
import { indexSourcePage } from "@/lib/yasam-hafizasi/indexer/indexSourcePage";
import { createSupabaseArchiveEligibilityPort } from "@/lib/yasam-hafizasi/indexer/archiveEligibility";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IndexDbClient } from "@/lib/yasam-hafizasi/indexer/supabaseIndexAdapters";
import type { ValidatedTenantScope } from "@/lib/yasam-hafizasi/indexer/tenantScopeGate";
import {
  createSupabaseTenantScopeReader,
  validateScopedTenant,
} from "@/lib/yasam-hafizasi/indexer/supabaseTenantScopeAdapter";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1) Admin auth (fail-closed; 401/403 guard'dan aynen döner).
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db, adminId } = guard;

  // 1b) AA-1: yalnız ANA YÖNETİCİ (normal admin → 403; ayrıntı taşınmaz).
  const main = await requireMainAdmin(db, adminId);
  if (!main.ok) {
    return NextResponse.json(
      { ok: false, error: { code: "main-admin-required" } },
      { status: 403, headers: NO_STORE },
    );
  }

  // 2) JSON parse (ham parse hatası dışarı taşınmaz).
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: { code: "invalid-json" } }, { status: 400 });
  }

  // 2b) AA-1: geçerli istek → indeks ÇALIŞMADAN ÖNCE audit (dry-run dahil). Yalnız kimlik
  // metadata'sı (kaynak anahtarı, mod, tenant/kaynak id'leri) — içerik/cursor değeri YOK.
  // Geçersiz istek hiçbir şey çalıştırmaz → handler aynı doğrulamayla 4xx döner.
  // Mevcut CHECK allowlist'inde olan "main_admin_critical_action" kullanılır (migration gerekmez);
  // işlem türü context.operation ile ayrılır.
  const pre = validateAdminIndexRequest(raw);
  if (pre.ok) {
    try {
      await writeAdminAudit(db, {
        actorAdminId: adminId,
        actorIsMainAdmin: true,
        action: "main_admin_critical_action",
        context: {
          operation: "yh_index_admin_run",
          source_key: pre.value.sourceKey,
          mode: pre.value.mode,
          limit: pre.value.limit,
          cursor_present: pre.value.afterId !== null,
          scoped_tenant_id: pre.value.scopedTenantId,
          expected_tenant_id: pre.value.expectedTenantId,
          exact_source_id: pre.value.exactSourceId,
        },
      });
    } catch {
      // Fail-closed: audit yazılamazsa indeks tetiklenmez (ham hata taşınmaz).
      return NextResponse.json(
        { ok: false, error: { code: "audit-unavailable" } },
        { status: 503, headers: NO_STORE },
      );
    }
  }

  // 3) Enjekte deps — TEK service-role client (guard.db); yeni getServerDb YOK.
  const deps: AdminIndexHandlerDeps = {
    adminId,

    // Error-aware, FAIL-CLOSED demo kontrolü. (isDemoAccountId fail-open olduğu
    // için write-gate'te KULLANILMAZ; ham DB mesajı taşınmaz.)
    checkAdminDemoStatus: async (id) => {
      try {
        const { data, error } = await db
          .from("users")
          .select("is_demo_account")
          .eq("id", id)
          .maybeSingle();
        if (error || !data) return { ok: false, code: "demo-check-failed" };
        const value = (data as { is_demo_account?: unknown }).is_demo_account;
        if (value !== true && value !== false) return { ok: false, code: "demo-check-failed" };
        return { ok: true, isDemo: value === true };
      } catch {
        return { ok: false, code: "demo-check-failed" };
      }
    },

    // S2.10 çekirdeği; guard.db enjekte (demo kaynak-unit filtresi içeride korunur).
    runIndexSourcePage: (v: ValidatedAdminIndexRequest, scope?: ValidatedTenantScope) =>
      indexSourcePage({
        config: v.config,
        afterId: v.afterId,
        limit: v.limit,
        mode: v.mode,
        // BF-2B exact-write gate: doğrulanmış exact hedef (broad modda ikisi de null).
        exactSourceId: v.exactSourceId,
        expectedTenantId: v.expectedTenantId,
        // BF-4B tenant-scoped backfill: doğrulanmış tenant kanıtı (yalnız scoped modda).
        validatedTenantScope: scope,
        // BF-11E ROW-GATE: requiresRowEligibilityGate kaynakta (Kişisel Arşiv) zorunlu satır kapısı;
        // admin exact-index yolu da bypass edemez (gate yok → fail-closed).
        archiveEligibility: createSupabaseArchiveEligibilityPort(db as unknown as SupabaseClient),
        db: db as unknown as IndexDbClient,
      }),

    // BF-4B tenant-scoped kapısı: tenants/users (PII-dışı) okuyup kanıt üretir.
    validateScopedTenant: async (tenantId: string) =>
      validateScopedTenant(tenantId, createSupabaseTenantScopeReader(db as unknown as IndexDbClient)),

    // FAZ1 final hardening — kontrollü backfill kapısı (yalnız write): yh_source_activation
    // is_active && backfill_allowed. Satır yok → izin yok (403); okuma hatası → 503 (fail-closed).
    readSourceBackfillActivation: async (sourceKey: string) => {
      try {
        const { data, error } = await db
          .from("yh_source_activation")
          .select("is_active, backfill_allowed")
          .eq("source_key", sourceKey)
          .maybeSingle();
        if (error) return { ok: false };
        const row = (data ?? null) as { is_active?: unknown; backfill_allowed?: unknown } | null;
        return { ok: true, isActive: row?.is_active === true, backfillAllowed: row?.backfill_allowed === true };
      } catch {
        return { ok: false };
      }
    },

    // Best-effort GÜVENLİ server log (DB write YOK). Ham içerik/DB-mesaj/cursor
    // değeri taşınmaz; yalnız sabit güvenli metadata.
    writeAuditEvent: async (event: SafeAdminIndexAuditEvent) => {
      console.info("[yh-index-page]", JSON.stringify(event));
    },
  };

  // 4) Orkestrasyon → HTTP.
  const { status, body } = await handleAdminIndexRequest(raw, deps);
  return NextResponse.json(body, { status, headers: NO_STORE });
}

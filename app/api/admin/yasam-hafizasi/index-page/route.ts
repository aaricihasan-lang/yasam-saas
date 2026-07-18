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
 */

import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import {
  handleAdminIndexRequest,
  type AdminIndexHandlerDeps,
  type SafeAdminIndexAuditEvent,
  type ValidatedAdminIndexRequest,
} from "@/lib/yasam-hafizasi/indexer/adminIndexRequest";
import { indexSourcePage } from "@/lib/yasam-hafizasi/indexer/indexSourcePage";
import type { IndexDbClient } from "@/lib/yasam-hafizasi/indexer/supabaseIndexAdapters";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1) Admin auth (fail-closed; 401/403 guard'dan aynen döner).
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db, adminId } = guard;

  // 2) JSON parse (ham parse hatası dışarı taşınmaz).
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: { code: "invalid-json" } }, { status: 400 });
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
    runIndexSourcePage: (v: ValidatedAdminIndexRequest) =>
      indexSourcePage({
        config: v.config,
        afterId: v.afterId,
        limit: v.limit,
        mode: v.mode,
        db: db as unknown as IndexDbClient,
      }),

    // Best-effort GÜVENLİ server log (DB write YOK). Ham içerik/DB-mesaj/cursor
    // değeri taşınmaz; yalnız sabit güvenli metadata.
    writeAuditEvent: async (event: SafeAdminIndexAuditEvent) => {
      console.info("[yh-index-page]", JSON.stringify(event));
    },
  };

  // 4) Orkestrasyon → HTTP.
  const { status, body } = await handleAdminIndexRequest(raw, deps);
  return NextResponse.json(body, { status });
}

import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

/**
 * GET /api/admin/biyoenerji/sessions?tenantId=<uuid>&mode=count|list
 *
 * FAZ 1 güvenlik: Admin uzman-workspace görüntüleyicisi bioenergy_sessions'ı artık
 * tarayıcıdan publishable SELECT ile OKUMAZ. Okuma service-role server route'una taşındı.
 * (Workspace'in legacy 5 sekmesi kapsam DIŞIdır ve bu route'a dahil değildir.)
 *
 * Güvenlik:
 *   - verifyAdminRequest → x-admin-id + x-session-token binding + role=admin & active.
 *   - service_role guard.db; tenantId param uuid DOĞRULANIR ve sorguya .eq ile bağlanır.
 *   - Ham DB error.message DÖNMEZ; generic mesaj + server-side log.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const url = new URL(req.url);
  const tenantId = (url.searchParams.get("tenantId") ?? "").trim();
  if (!UUID_RE.test(tenantId)) {
    return NextResponse.json({ ok: false, error: "Geçersiz tenant." }, { status: 400 });
  }
  const mode = url.searchParams.get("mode") === "count" ? "count" : "list";

  if (mode === "count") {
    const { count, error } = await db
      .from("bioenergy_sessions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if (error) {
      console.error("[admin/biyoenerji/sessions] count failed:", error);
      return NextResponse.json({ ok: false, error: "Sayım alınamadı." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, count: count ?? 0 });
  }

  const { data, error } = await db
    .from("bioenergy_sessions")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[admin/biyoenerji/sessions] list failed:", error);
    return NextResponse.json({ ok: false, error: "Kayıtlar okunamadı." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

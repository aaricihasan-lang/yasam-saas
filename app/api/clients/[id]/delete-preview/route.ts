import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import { collectDeletePreview } from "@/lib/danisan/deletePreview";

export const runtime = "nodejs";

/**
 * GET /api/clients/[id]/delete-preview — danışan silinmeden ÖNCE birlikte silinecek
 * kayıtların sayımı (DY-A). Salt okunur.
 *
 * Güvenlik: cascade-delete ile AYNI guard (requireModuleAccess "clients") + tenant
 * sahipliği; tenant_id sunucudan. Yabancı/olmayan danışan → 403 (cascade-delete ile tutarlı).
 * Demo hesap: okuma serbest (yazma yok).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId } = guard;

  const { data: cli, error: cliErr } = await db
    .from("clients")
    .select("id, ad, soyad")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (cliErr) {
    return serverErrorResponse({ route: "clients/[id]/delete-preview", action: "ownership", tenantId, cause: cliErr });
  }
  if (!cli) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }

  const preview = await collectDeletePreview(db, tenantId, clientId);
  const c = cli as { id: string; ad?: string | null; soyad?: string | null };

  return NextResponse.json({
    ok: true,
    client: { id: c.id, name: `${c.ad ?? ""} ${c.soyad ?? ""}`.trim() },
    ...preview,
  });
}

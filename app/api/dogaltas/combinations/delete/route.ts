import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * POST /api/dogaltas/combinations/delete
 *
 * Kullanıcının kendi tenant'ındaki kombinasyonları issue bazlı siler
 * (tekli veya toplu).
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user binding.
 *   - tenant_id SUNUCUDAN (oturumdan) alınır; client'tan GELMEZ.
 *   - DELETE her zaman tenant_id = session tenant ile sınırlıdır → tenant dışı
 *     silme imkânsızdır.
 *   - Demo hesap: gerçek delete YAPILMAZ; başarılı gibi döner.
 *   - password / service_role / secret yanıta sızmaz.
 */

const MAX_ISSUES = 1000;

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;

  let body: { issues?: unknown };
  try {
    body = (await req.json()) as { issues?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const issues = Array.isArray(body.issues)
    ? Array.from(
        new Set(body.issues.map((i) => String(i).trim()).filter((i) => i.length > 0)),
      )
    : [];

  if (issues.length === 0) {
    return NextResponse.json({ ok: false, error: "Silinecek issue belirtilmedi." }, { status: 400 });
  }
  if (issues.length > MAX_ISSUES) {
    return NextResponse.json(
      { ok: false, error: `Tek istekte en fazla ${MAX_ISSUES} kombinasyon.` },
      { status: 400 },
    );
  }

  // Demo hesap: gerçek silme yapılmaz; başarılı gibi dönülür.
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, deleted: 0 });
  }

  const { error, count } = await db
    .from("combinations")
    .delete({ count: "exact" })
    .eq("tenant_id", tenantId) // SUNUCUDAN — tenant dışı silme engellenir
    .in("issue", issues);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}

import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * /api/refleksoloji/atlas — uzmanın refleksoloji atlası (P1-1, cihazlar arası senkron).
 *
 * Model: tenant başına TEK satır. `document` = organ→bölge haritası JSON belgesi,
 *   `organ_list` = organ adı listesi. İstemci her değişiklikte TAM belgeyi PUT eder
 *   (localStorage semantiğiyle birebir) → server upsert.
 *
 * Güvenlik:
 *   - requireModuleAccess binding; tenant_id SUNUCUDA (body'den değil).
 *   - RLS + service_role only. Demo hesap: Supabase'e yazılmaz.
 */

// ─── GET — tenant'ın atlas belgesi ────────────────────────────────────────────
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, document: null, organ_list: [] });
  }

  const { data, error } = await db
    .from("reflexology_atlas")
    .select("document, organ_list, updated_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    document: data?.document ?? null,
    organ_list: data?.organ_list ?? [],
    updated_at: data?.updated_at ?? null,
  });
}

// ─── PUT — tam belgeyi senkronla (upsert, tek satır) ──────────────────────────
export async function PUT(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true });
  }

  let body: { document?: unknown; organ_list?: unknown };
  try {
    body = (await req.json()) as { document?: unknown; organ_list?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const document =
    body.document && typeof body.document === "object" ? body.document : {};
  const organList = Array.isArray(body.organ_list)
    ? body.organ_list.filter((o): o is string => typeof o === "string")
    : [];

  const { error } = await db.from("reflexology_atlas").upsert(
    {
      tenant_id: tenantId,
      document,
      organ_list: organList,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

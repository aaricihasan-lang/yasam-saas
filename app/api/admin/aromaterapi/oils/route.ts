import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

/**
 * GET /api/admin/aromaterapi/oils?type=essential|carrier|maceration
 *
 * Admin "Veri Paylaşımı" ekranı için KANONİK (tenant_id IS NULL) yağ kütüphanesini
 * listeler — admin, hangi yağları uzmana bağımsız snapshot olarak vereceğini tek tek
 * seçebilsin. aromatherapy_oils RLS-kilitli (yalnız service_role); tarayıcı doğrudan
 * okuyamaz, bu yüzden okuma admin-guard'lı service-role route'undan geçer.
 *
 * Salt-okuma; hiçbir yazma yok. Yalnız id + name döner (seçim listesi).
 */

const VALID_TYPES = new Set(["essential", "carrier", "maceration"]);
const PAGE = 1000;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const type = (new URL(req.url).searchParams.get("type") ?? "").trim();
  if (!VALID_TYPES.has(type)) {
    return NextResponse.json({ ok: false, error: "Geçersiz yağ tipi." }, { status: 400 });
  }

  // Kanonik havuz windowing ile (1000 tavanından bağımsız tüm satırlar).
  const all: { id: string; name: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("aromatherapy_oils")
      .select("id, name")
      .is("tenant_id", null)
      .eq("oil_type", type)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const page = (data ?? []) as { id: string; name: string }[];
    all.push(...page);
    if (page.length < PAGE) break;
  }

  return NextResponse.json({ ok: true, rows: all });
}

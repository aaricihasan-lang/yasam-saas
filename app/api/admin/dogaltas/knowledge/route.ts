import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { ADMIN_LIBRARY_TENANT_ID } from "@/lib/tenancy/syntheticTenants";

export const runtime = "nodejs";

/**
 * GET /api/admin/dogaltas/knowledge
 *
 * Admin "Veri Paylaşımı" ekranı için Taş Bilgi Kütüphanesi (ADMIN_LIBRARY_TENANT_ID)
 * kayıtlarını listeler — admin hangi bilgi kayıtlarını uzmana bağımsız snapshot
 * olarak vereceğini tek tek seçebilsin. stone_knowledge_articles RLS-kilitli (yalnız
 * service_role); tarayıcı doğrudan okuyamaz, okuma admin-guard'lı route'undan geçer.
 *
 * Salt-okuma; yazma yok. Yalnız id + title döner (seçim listesi).
 */

const PAGE = 1000;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const all: { id: string; title: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("stone_knowledge_articles")
      .select("id, title")
      .eq("tenant_id", ADMIN_LIBRARY_TENANT_ID)
      .eq("is_active", true)
      .order("title", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const page = (data ?? []) as { id: string; title: string }[];
    all.push(...page);
    if (page.length < PAGE) break;
  }

  return NextResponse.json({ ok: true, rows: all });
}

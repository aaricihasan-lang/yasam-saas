import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner } from "@/lib/beslenme/ownerGuard";

export const runtime = "nodejs";

/**
 * Class A referans vocab (owner-only okuma): food groups + traditional frameworks.
 * UI dropdown'ları için. Tenant-siz global vocab (production'da CANLI).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const [groups, frameworks] = await Promise.all([
    db
      .from("nutrition_food_groups")
      .select("id, code, name_tr, name_en, parent_id, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    db
      .from("nutrition_traditional_frameworks")
      .select("id, code, name_tr, name_en, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  return NextResponse.json(
    { ok: true, foodGroups: groups.data ?? [], frameworks: frameworks.data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

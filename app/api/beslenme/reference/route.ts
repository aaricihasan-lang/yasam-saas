import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeOwner } from "@/lib/beslenme/ownerGuard";

export const runtime = "nodejs";

/**
 * Class A referans vocab (owner-only okuma): food groups + traditional frameworks + allergens.
 * UI dropdown'ları için. Tenant-siz global vocab (production'da CANLI).
 * allergens (FAZ 7): danışan beyan-alerji multi-select'i için — ADVISORY (otomatik eşleme YOK).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeOwner(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const [groups, frameworks, allergens] = await Promise.all([
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
    db
      .from("nutrition_allergens")
      .select("id, code, name_tr, name_en, is_major, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  return NextResponse.json(
    { ok: true, foodGroups: groups.data ?? [], frameworks: frameworks.data ?? [], allergens: allergens.data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

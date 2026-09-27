import { NextRequest, NextResponse } from "next/server";
import { requireBeslenmeModule } from "@/lib/beslenme/ownerGuard";

export const runtime = "nodejs";

/**
 * Class A referans vocab (food groups + traditional frameworks + allergens) — SALT OKUMA.
 * Tenant-siz GLOBAL vocab (tenant verisi DEĞİL). Bu GENİŞ referans ucu TAM Beslenme modülü
 * içindir (requireBeslenmeModule) — /beslenme/besinler besin-grubu/çerçeve seçicileri kullanır.
 * clients-only danışan sekmesi bunu KULLANMAZ; danışan alerjen vocab'ı ayrı /api/beslenme/
 * client-reference ucundan gelir. allergens burada: ADVISORY (otomatik eşleme YOK).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireBeslenmeModule(req);
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

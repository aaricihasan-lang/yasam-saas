import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * DAR danışan-referans vocab — SALT OKUMA (uzman erişimi AŞAMA 1).
 *
 * Danışan Beslenme sekmesindeki BEYAN-ALERJİ multi-select'i için YALNIZ
 * `nutrition_allergens` global vocab'ını döndürür. Geniş /api/beslenme/reference
 * (foodGroups + frameworks; owner/contributor politikası) uzmanlara AÇILMAZ ve
 * DEĞİŞMEZ.
 *
 * Kapı: requireModuleAccess(req, "clients") → Danışan Yolculuğu erişimi olan uzman +
 * owner/admin okur; erişimi olmayan 403; anon/bozuk token 401. Tenant-siz GLOBAL
 * advisory vocab (otomatik eşleme YOK). Mutation YOK. Cache-Control: no-store.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { data } = await guard.db
    .from("nutrition_allergens")
    .select("id, code, name_tr, name_en, is_major, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return NextResponse.json(
    { ok: true, allergens: data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

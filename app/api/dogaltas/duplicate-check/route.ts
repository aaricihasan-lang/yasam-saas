import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { normalizeDuplicateName } from "@/lib/dogaltas/duplicateName";

export const runtime = "nodejs";

/**
 * GET /api/dogaltas/duplicate-check?type=stone|mineral|knowledge|combination&name=...
 *
 * Modül-bazlı çift kayıt kontrolü (DT-P1-1). Her tip YALNIZ kendi tablosunda,
 * YALNIZ kullanıcının kendi tenant'ında kontrol edilir (çapraz-tip/çapraz-tenant YOK).
 * Türkçe-duyarlı normalize ile karşılaştırır. Kayıt ENGELLENMEZ — yalnız bilgi döner
 * (kullanıcı "Yine de Oluştur" diyebilmeli). Bilgi kütüphanesinde seed/paylaşımlı
 * kayıtlar HARİÇ (yalnız kendi tenant başlıkları) — karar raporda.
 */

const CONFIG: Record<string, { table: string; col: string; ownTenantOnly: boolean; activeOnly?: boolean }> = {
  stone: { table: "stones", col: "stone_name", ownTenantOnly: true },
  mineral: { table: "minerals", col: "name", ownTenantOnly: true },
  knowledge: { table: "stone_knowledge_articles", col: "title", ownTenantOnly: true, activeOnly: true },
  combination: { table: "combinations", col: "issue", ownTenantOnly: true },
};

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") ?? "";
  const name = sp.get("name") ?? "";

  const cfg = CONFIG[type];
  if (!cfg) {
    return NextResponse.json({ ok: false, error: "Geçersiz kayıt tipi." }, { status: 400 });
  }

  const target = normalizeDuplicateName(name);
  if (!target) return NextResponse.json({ ok: true, exists: false });

  // tenant_id daima oturumdan — çapraz-tenant kontrol imkânsız.
  let query = db.from(cfg.table).select(`id, ${cfg.col}`).eq("tenant_id", tenantId);
  if (cfg.activeOnly) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Dinamik select string tipini statik çözemediğinden güvenli cast.
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const match = rows.find((row) => normalizeDuplicateName(row[cfg.col]) === target);
  if (!match) return NextResponse.json({ ok: true, exists: false });

  return NextResponse.json({
    ok: true,
    exists: true,
    match: { id: String(match.id ?? ""), label: String(match[cfg.col] ?? "") },
  });
}

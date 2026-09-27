import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { DEFAULT_HACAMAT_RULES } from "@/lib/cosmic/hacamatDefaultRules";

export const runtime = "nodejs";

// KAJ-P1-03: hacamat_rules artık TENANT-scoped ve RLS ile doğuştan-kilitli
// (anon/authenticated doğrudan PostgREST erişimi YOK — bkz. 20270125000000 migration).
// Tüm erişim burada service-role (guard.db) ile, tenant SESSION'dan (guard.tenantId) türetilir;
// body'deki tenant/id bilgisine ASLA güvenilmez. Modül kapısı: cosmic_calendar (her aktif
// uzman için açık; anon/pending/rejected engellenir → verifyUserRequest binding'i).

const CATEGORIES = ["before", "after", "general"] as const;
type Category = (typeof CATEGORIES)[number];
const MAX_RULE_TEXT = 2000;          // tek kural metni üst sınırı
const MAX_RULES_PER_TENANT = 300;    // tenant başına kural adedi tavanı (kaynak-suistimali koruması)

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}

/** GET: yalnız çağıranın tenant'ına ait kurallar (auth zorunlu). */
export async function GET(req: NextRequest) {
  const guard = await requireModuleAccess(req, "cosmic_calendar");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  // B MODELİ: uzman bu bölümü İLK açtığında 12 varsayılan kuralın KENDİ tenant'ına ait fiziksel
  // kopyası oluşturulur. RPC idempotent + yarış-güvenli + TEK-SEFERLİK: sayfa 5 kez açılsa da /
  // eşzamanlı istek gelse de duplicate seed YOK; kullanıcı tümünü sildiyse yeniden seed YOK
  // (initialized işareti kalıcı — bkz. ensure_hacamat_rules_seeded). Demo hesap read-only →
  // seed edilmez. Seed hatası listeyi ENGELLEMEZ (degrade: mevcut/boş liste ile devam).
  if (!guard.is_demo_account) {
    const { error: seedErr } = await db.rpc("ensure_hacamat_rules_seeded", {
      p_tenant_id: tenantId,
      p_rules: [...DEFAULT_HACAMAT_RULES],
    });
    if (seedErr) console.error("hacamat rules seed hatası:", seedErr.message);
  }

  const { data, error } = await db
    .from("hacamat_rules")
    .select("id, category, rule_text, sort_order")
    .eq("tenant_id", tenantId)
    .order("category")
    .order("sort_order");

  if (error) return json({ ok: false, code: "LIST_FAILED", error: "Kurallar yüklenemedi." }, 500);
  return json({ ok: true, data: data ?? [] });
}

/** POST: kendi tenant'ına yeni kural. */
export async function POST(req: NextRequest) {
  const guard = await requireModuleAccess(req, "cosmic_calendar");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account)
    return json({ ok: false, code: "DEMO_READONLY", error: "Demo hesap kural ekleyemez." }, 403);
  const { db, tenantId } = guard;

  let body: unknown;
  try { body = await req.json(); }
  catch { return json({ ok: false, error: "Geçersiz istek." }, 400); }

  const b = (body ?? {}) as { category?: unknown; rule_text?: unknown; sort_order?: unknown };

  if (!isCategory(b.category))
    return json({ ok: false, error: "category yalnız 'before', 'after' veya 'general' olabilir." }, 400);

  if (typeof b.rule_text !== "string" || b.rule_text.trim() === "")
    return json({ ok: false, error: "rule_text zorunludur." }, 400);
  const rule_text = b.rule_text.trim();
  if (rule_text.length > MAX_RULE_TEXT)
    return json({ ok: false, error: `Kural metni en fazla ${MAX_RULE_TEXT} karakter olabilir.` }, 400);

  const sort_order = Number.isInteger(b.sort_order) ? (b.sort_order as number) : 0;

  // Tenant başına kural tavanı (abuse guard).
  const { count, error: countErr } = await db
    .from("hacamat_rules")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (countErr) return json({ ok: false, code: "CREATE_FAILED", error: "Eklenemedi." }, 500);
  if ((count ?? 0) >= MAX_RULES_PER_TENANT)
    return json({ ok: false, error: `En fazla ${MAX_RULES_PER_TENANT} kural eklenebilir.` }, 409);

  const { data, error } = await db
    .from("hacamat_rules")
    .insert({ tenant_id: tenantId, category: b.category, rule_text, sort_order })
    .select("id, category, rule_text, sort_order")
    .single();

  if (error) return json({ ok: false, code: "CREATE_FAILED", error: "Eklenemedi." }, 500);
  return json({ ok: true, data }, 201);
}

import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { getBioResource, pickWritableBioFields } from "@/lib/biyoenerji/resourceConfig";

export const runtime = "nodejs";

/**
 * POST /api/admin/biyoenerji/import
 *
 * FAZ 1 güvenlik: Admin "Toplu Veri" Biyoenerji import'u artık tarayıcıdan DOĞRUDAN
 * publishable insert YAPMAZ. Yazma tek service-role server route'una taşındı
 * (kanıtlı /api/admin/dogaltas/combinations/import modeli).
 *
 * Güvenlik:
 *   - verifyAdminRequest → x-admin-id + x-session-token binding + role=admin & active.
 *   - Yazma service_role guard.db ile (RLS/publishable yüzeyi kullanılmaz).
 *   - resource allowlist → yalnız 5 admin-import edilebilir Biyoenerji kaynağı.
 *   - Kolon whitelist → resourceConfig.write (tenant_id/id/created_at ASLA istemciden).
 *   - tenant_id SUNUCUDA adminin kendi users.tenant_id'sinden ZORLANIR; gövdedeki
 *     tenant_id GÜVENİLMEZ ve yok sayılır (kaynak = admin master kütüphane tenant'ı,
 *     resolveSourceAdminTenantId ile aynı semantik).
 *   - Ham DB error.message istemciye DÖNMEZ; generic mesaj + server-side log.
 */

/** Toplu-Veri'den import edilebilen Biyoenerji kaynakları (sessions HARİÇ — uzman üretir). */
const IMPORTABLE = new Set<string>([
  "symbols",
  "imaginations",
  "chakras",
  "energy-bodies",
  "subconscious-causes",
]);

const MAX_ROWS = 500; // tek istek üst sınırı (istemci batch boyutu ≤ 250)
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db, adminId } = guard;

  let body: { resource?: unknown; rows?: unknown };
  try {
    body = (await req.json()) as { resource?: unknown; rows?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const resource = String(body.resource ?? "").trim();
  const cfg = IMPORTABLE.has(resource) ? getBioResource(resource) : null;
  if (!cfg) {
    return NextResponse.json({ ok: false, error: "Geçersiz kaynak." }, { status: 400 });
  }

  const rows = Array.isArray(body.rows) ? (body.rows as unknown[]) : [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: "rows boş." }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { ok: false, error: `Tek istekte en fazla ${MAX_ROWS} satır gönderin.` },
      { status: 400 },
    );
  }

  // tenant SUNUCUDA çözülür — adminin kendi tenant'ı (= admin master kütüphanesi).
  const { data: adminRow, error: adminErr } = await db
    .from("users")
    .select("tenant_id")
    .eq("id", adminId)
    .maybeSingle();
  if (adminErr) {
    console.error("[biyoenerji/import] admin tenant lookup failed:", adminErr);
    return NextResponse.json({ ok: false, error: "Aktarım tamamlanamadı." }, { status: 500 });
  }
  const tenantId = String((adminRow as { tenant_id?: unknown } | null)?.tenant_id ?? "").trim();
  if (!UUID_RE.test(tenantId)) {
    return NextResponse.json({ ok: false, error: "Admin kaynak tenant bulunamadı." }, { status: 400 });
  }

  // Kolon whitelist + server-forced tenant. İstemci tenant_id/id/created_at yok sayılır.
  const clean: Record<string, unknown>[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ ok: false, error: "Geçersiz satır." }, { status: 400 });
    }
    const fields = pickWritableBioFields(cfg, raw as Record<string, unknown>);
    clean.push({ ...fields, tenant_id: tenantId });
  }

  const { error } = await db.from(cfg.table).insert(clean);
  if (error) {
    console.error(`[biyoenerji/import] insert failed (${cfg.table}):`, error);
    return NextResponse.json({ ok: false, error: "Kayıtlar eklenemedi." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inserted: clean.length });
}

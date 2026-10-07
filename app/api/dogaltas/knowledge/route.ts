import { NextRequest, NextResponse } from "next/server";
import { BULK_DELETE_LIMIT_ERROR, exceedsBulkDeleteLimit } from "@/lib/api/bulkDeleteLimits";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import { fetchAllRows } from "@/lib/dogaltas/fetchAllRows";
import { validateStringArrayField } from "@/lib/dogaltas/validation";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * /api/dogaltas/knowledge — stone_knowledge_articles güvenli server kapısı.
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id daima oturumdan; body/query'den GÜVENİLMEZ.
 *   - GET: YALNIZ bu tenant'ın kendi kayıtları. Paylaşımlı/kanonik admin kütüphanesi
 *     (ADMIN_LIBRARY_TENANT_ID) artık uzman GET'ine UNION EDİLMEZ. Admin bir bilgi
 *     kaydını vermek isterse P4 transfer ile bağımsız snapshot kopya üretir
 *     (origin_type='admin_transfer'); kopya uzmanın kendi tenant kaydı olur.
 *   - Yazma (POST/PATCH/DELETE) yalnız bu tenant'ın kayıtlarına dokunur.
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 *
 * Not: stone_knowledge_categories REFERANS/GLOBAL vocabulary tablodur (tenant_id
 *      yok, sabit kontrollü liste); bu kapıda kilitlenmez, client okumaya devam eder.
 */

const SELECT =
  "id, tenant_id, title, content, category, sub_category, tags, related_stones, related_minerals, source, source_section, keyword, notes, is_active, origin_type";

// Client'tan kabul EDİLMEYECEK alanlar (tenant override + id güvenliği).
const PROTECTED = new Set(["tenant_id", "id", "created_at", "updated_at"]);

// P2-04: Yeni makalede istemciden kabul edilen alanlar (ALLOWLIST). Provenance /
// sistem alanları (origin_type, origin_label, origin_source_id, origin_transfer_batch_id,
// transferred_at, is_active …) istemciden ASLA alınmaz → uzman kendi içeriğini
// "Admin Kütüphanesi" aktarımı gibi işaretleyemez; admin istatistikleri ve aktarım
// geri-alma anahtarları kirletilemez. Provenance yalnız admin aktarım route'unda yazılır.
const POST_TEXT_FIELDS = ["sub_category", "source", "source_section", "keyword", "notes"] as const;
const POST_ARRAY_FIELDS: ReadonlyArray<[string, string]> = [
  ["tags", "Etiketler"],
  ["related_stones", "İlgili taşlar"],
  ["related_minerals", "İlgili mineraller"],
];

function sanitize(body: Record<string, unknown>, allowed?: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (PROTECTED.has(k)) continue;
    if (allowed && !allowed.has(k)) continue;
    out[k] = v;
  }
  return out;
}

// ─── GET /api/dogaltas/knowledge ───────────────────────────────────────────────
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  // YALNIZ bu tenant'ın kendi kayıtları — paylaşımlı admin kütüphanesi UNION edilmez.
  // P2-07: kütüphane "tümü" listesi 1000-satır tavanına takılmadan sayfalı okunur.
  const res = await fetchAllRows<Record<string, unknown>>((from, to) =>
    db
      .from("stone_knowledge_articles")
      .select(SELECT)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("title", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  if (!res.ok) return serverErrorResponse({ route: "dogaltas/knowledge", action: "GET", tenantId, cause: res.error });
  return NextResponse.json({ ok: true, articles: res.rows });
}

// ─── POST /api/dogaltas/knowledge (yeni makale) ────────────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ ok: false, error: "Başlık zorunludur." }, { status: 400 });
  const category = String(body.category ?? "").trim();
  if (!category) return NextResponse.json({ ok: false, error: "Kategori seçimi zorunludur." }, { status: 400 });
  const content = String(body.content ?? "").trim();
  if (!content) return NextResponse.json({ ok: false, error: "İçerik zorunludur." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const payload: Record<string, unknown> = {
    tenant_id: tenantId,
    title,
    category,
    content,
    is_active: true,
  };
  for (const key of POST_TEXT_FIELDS) {
    if (!(key in body) || body[key] == null) continue;
    if (typeof body[key] !== "string") {
      return NextResponse.json({ ok: false, error: "Geçersiz alan değeri." }, { status: 422 });
    }
    payload[key] = String(body[key]).trim();
  }
  for (const [key, label] of POST_ARRAY_FIELDS) {
    if (!(key in body) || body[key] == null) continue;
    const check = validateStringArrayField(label, body[key]);
    if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: 422 });
    payload[key] = body[key];
  }

  // Usage360: yalnız yeni satır id'si geri okunur (idempotency); yanıt gövdesi değişmez.
  const { data: inserted, error } = await db.from("stone_knowledge_articles").insert(payload).select("id");
  if (error) return serverErrorResponse({ route: "dogaltas/knowledge", action: "POST", tenantId, cause: error, usage: { guard, req, module: "stones", failedAction: "record_created", subEntity: "knowledge" } });
  const newId = (inserted as { id: string }[] | null)?.[0]?.id ?? null;
  await trackUsage(guard, req, { module: "stones", action: "record_created", subEntity: "knowledge", resourceId: newId });
  return NextResponse.json({ ok: true });
}

// ─── PATCH /api/dogaltas/knowledge ─────────────────────────────────────────────
// Tek kayıt: body.id + alanlar.   Toplu: body.ids[] + alanlar.
export async function PATCH(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const singleId = typeof body.id === "string" ? body.id.trim() : "";
  const bulkIds = Array.isArray(body.ids)
    ? body.ids.map((v) => String(v)).filter(Boolean)
    : [];

  if (!singleId && bulkIds.length === 0) {
    return NextResponse.json({ ok: false, error: "id veya ids zorunludur." }, { status: 400 });
  }

  // Yalnızca güncellenebilir alanlar (id/ids/tenant_id dışında).
  const ALLOWED = new Set(["title", "category", "sub_category", "content"]);
  const fields = sanitize(body, ALLOWED);
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  }
  // P2-06 (aynı sınıf): zorunlu alanlar güncellemede boş/yalnız-boşluk olamaz (POST ile aynı kural).
  const REQUIRED: Record<string, string> = { title: "Başlık zorunludur.", category: "Kategori seçimi zorunludur.", content: "İçerik zorunludur." };
  for (const [key, msg] of Object.entries(REQUIRED)) {
    if (!(key in fields)) continue;
    if (typeof fields[key] !== "string" || !String(fields[key]).trim()) {
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    fields[key] = String(fields[key]).trim();
  }
  if ("sub_category" in fields && fields.sub_category != null && typeof fields.sub_category !== "string") {
    return NextResponse.json({ ok: false, error: "Geçersiz alan değeri." }, { status: 422 });
  }

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, rows: [] });

  let q = db.from("stone_knowledge_articles").update(fields).eq("tenant_id", tenantId);
  q = singleId ? q.eq("id", singleId) : q.in("id", bulkIds);

  const { data, error } = await q.select("id, title, content, category, sub_category");
  if (error) return serverErrorResponse({ route: "dogaltas/knowledge", action: "PATCH", tenantId, cause: error, usage: { guard, req, module: "stones", failedAction: "record_updated", subEntity: "knowledge" } });

  if (singleId && (!data || data.length === 0)) {
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  const updatedIds = (data ?? []).map((r) => (r as { id: string }).id);
  if (updatedIds.length > 0) {
    // Usage360: tekli/toplu güncelleme → TEK olay (+ itemCount).
    await trackUsage(guard, req, { module: "stones", action: "record_updated", subEntity: "knowledge", resourceId: [...updatedIds].sort().join(","), itemCount: updatedIds.length });
  }
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

// ─── DELETE /api/dogaltas/knowledge ────────────────────────────────────────────
// Tek kayıt: ?id=...   Toplu: body.ids[] (veya ?id virgülle).
export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  const fromQuery = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  let ids: string[] = fromQuery ? [fromQuery] : [];
  if (ids.length === 0) {
    try {
      const b = (await req.json()) as { ids?: unknown; id?: unknown };
      if (Array.isArray(b.ids)) ids = b.ids.map((v) => String(v)).filter(Boolean);
      else if (typeof b.id === "string" && b.id.trim()) ids = [b.id.trim()];
    } catch { /* gövde yoksa query'e güven */ }
  }
  if (ids.length === 0) return NextResponse.json({ ok: false, error: "id veya ids zorunludur." }, { status: 400 });
  if (exceedsBulkDeleteLimit(ids)) return NextResponse.json({ ok: false, error: BULK_DELETE_LIMIT_ERROR }, { status: 400 });
  // Biçim guard'ı: geçersiz (non-UUID) id Postgres 22P02 → 500 yerine temiz 400.
  if (!ids.every((v) => UUID_RE.test(v))) {
    return NextResponse.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });
  }

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, rows: [] });

  const { data, error } = await db
    .from("stone_knowledge_articles").delete()
    .eq("tenant_id", tenantId)
    .in("id", ids)
    .select("id");

  if (error) return serverErrorResponse({ route: "dogaltas/knowledge", action: "DELETE", tenantId, cause: error, usage: { guard, req, module: "stones", failedAction: "record_deleted", subEntity: "knowledge" } });
  const deletedIds = (data ?? []).map((r) => (r as { id: string }).id);
  if (deletedIds.length > 0) {
    // Usage360: tekli/toplu silme → TEK olay + itemCount (hiçbiri silinmediyse olay yok).
    await trackUsage(guard, req, { module: "stones", action: "record_deleted", subEntity: "knowledge", resourceId: [...deletedIds].sort().join(","), itemCount: deletedIds.length });
  }
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

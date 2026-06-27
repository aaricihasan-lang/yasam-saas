import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { ADMIN_LIBRARY_TENANT_ID } from "@/lib/auth/sessionTenant";

export const runtime = "nodejs";

/**
 * /api/dogaltas/knowledge — stone_knowledge_articles güvenli server kapısı.
 *
 * Güvenlik:
 *   - verifyUserRequest → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id daima oturumdan; body/query'den GÜVENİLMEZ.
 *   - GET: paylaşımlı kütüphane (ADMIN_LIBRARY_TENANT_ID) + bu tenant'ın kendi
 *     ekleri okunur (mevcut client davranışı birebir korunur).
 *   - Yazma işlemleri (POST/PATCH/DELETE) yalnız bu tenant'ın kayıtlarına dokunur;
 *     paylaşımlı kütüphane kayıtları (.eq("tenant_id", tenantId) ile) atlanır.
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 *
 * Not: stone_knowledge_categories REFERANS/GLOBAL tablodur, bu kapıda
 *      kilitlenmez; client tarafında okunmaya devam eder.
 */

const SELECT =
  "id, tenant_id, title, content, category, sub_category, tags, related_stones, related_minerals, source, source_section, keyword, notes, is_active";

// Client'tan kabul EDİLMEYECEK alanlar (tenant override + id güvenliği).
const PROTECTED = new Set(["tenant_id", "id", "created_at", "updated_at"]);

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
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  // Paylaşımlı kütüphane + kullanıcının kendi ekleri (client davranışıyla birebir).
  const tenantIds: string[] = [ADMIN_LIBRARY_TENANT_ID];
  if (tenantId && tenantId !== ADMIN_LIBRARY_TENANT_ID) tenantIds.push(tenantId);

  const { data, error } = await db
    .from("stone_knowledge_articles")
    .select(SELECT)
    .in("tenant_id", tenantIds)
    .eq("is_active", true)
    .order("title", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, articles: data ?? [] });
}

// ─── POST /api/dogaltas/knowledge (yeni makale) ────────────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
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

  const payload = {
    ...sanitize(body),
    tenant_id: tenantId,
    title,
    category,
    content,
    is_active: true,
  };

  const { error } = await db.from("stone_knowledge_articles").insert(payload);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// ─── PATCH /api/dogaltas/knowledge ─────────────────────────────────────────────
// Tek kayıt: body.id + alanlar.   Toplu: body.ids[] + alanlar.
export async function PATCH(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
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

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, rows: [] });

  let q = db.from("stone_knowledge_articles").update(fields).eq("tenant_id", tenantId);
  q = singleId ? q.eq("id", singleId) : q.in("id", bulkIds);

  const { data, error } = await q.select("id, title, content, category, sub_category");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  if (singleId && (!data || data.length === 0)) {
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

// ─── DELETE /api/dogaltas/knowledge ────────────────────────────────────────────
// Tek kayıt: ?id=...   Toplu: body.ids[] (veya ?id virgülle).
export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
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

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, rows: [] });

  const { data, error } = await db
    .from("stone_knowledge_articles").delete()
    .eq("tenant_id", tenantId)
    .in("id", ids)
    .select("id");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

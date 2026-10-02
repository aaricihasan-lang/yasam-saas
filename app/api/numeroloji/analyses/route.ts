import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { readAllPaged } from "@/lib/db/readAllPaged";
import { NUMEROLOJI_METHODOLOGY_VERSION, verifyMotorMatchesInputs } from "@/lib/numeroloji/methodology";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** NUM-F09: liste özeti — kartlar çekirdek değerleri ad/soyad/doğum tarihinden üretir. */
const SUMMARY_COLUMNS = "id, name, surname, birth_date, created_at";

export const runtime = "nodejs";

/**
 * /api/numeroloji/analyses — numerology_records tablosunun güvenli sunucu kapısı.
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id SUNUCUDA oturum kaydından alınır; body/query'den GÜVENİLMEZ.
 *   - Tüm sorgu/yazma .eq("tenant_id", tenantId) ile bağlanır (çapraz-tenant engellenir).
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 *
 * Bu route SADECE kendi tenant'ını okutur/yazar. Başka/tüm tenant'ları okuyan
 * admin yüzeyleri için /api/admin/numeroloji/tenant-metrics kullanılır.
 */

// NUM-009: Client'tan YALNIZ bu iş alanları kabul edilir (ALLOWLIST). tenant_id/id/
// created_at/is_demo_seed gibi sistem alanları enjekte edilemez → veri bütünlüğü +
// tenant güvenliği. tenant_id her zaman SUNUCUDA session'dan set edilir.
const ALLOWED_FIELDS = new Set(["name", "surname", "birth_date", "analysis_data"]);

function pickAllowed(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (ALLOWED_FIELDS.has(k)) out[k] = v;
  return out;
}

// NUM-009: analysis_data INPUT-INTEGRITY guard — SERVER-SIDE motor RECOMPUTE DEĞİL
// (motor LOCKED, sunucuda ikinci motor YOK). Yalnız şekil/sürüm/boyut kontrolü:
// nesne olmalı, beklenen version=1, motor nesnesi bulunmalı, aşırı payload reddedilir.
const MAX_ANALYSIS_BYTES = 256 * 1024; // normal analiz ~5–20KB; geniş güvenli tavan

type ShapeCheck = { ok: true } | { ok: false; error: string };

function validateAnalysisData(v: unknown, required: boolean): ShapeCheck {
  if (v === undefined) {
    return required ? { ok: false, error: "analysis_data zorunludur." } : { ok: true };
  }
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    return { ok: false, error: "analysis_data nesnesi geçersiz." };
  }
  const o = v as Record<string, unknown>;
  if (o.version !== 1) return { ok: false, error: "Desteklenmeyen analiz sürümü." };
  if (o.motor === null || typeof o.motor !== "object" || Array.isArray(o.motor)) {
    return { ok: false, error: "analysis_data.motor geçersiz." };
  }
  let serialized: string;
  try { serialized = JSON.stringify(v); }
  catch { return { ok: false, error: "analysis_data serileştirilemedi." }; }
  if (serialized.length > MAX_ANALYSIS_BYTES) {
    return { ok: false, error: "analysis_data boyut sınırını aştı." };
  }
  return { ok: true };
}

// ─── GET /api/numeroloji/analyses ──────────────────────────────────────────────
// ?count=1 → yalnızca sayım döner ({ ok, count }).
// ?recent=N → son N kayıt (full_name, created_at) döner.
// Aksi halde tüm satırlar listelenir.
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  // Tekil kayıt (detay sayfası)
  const idParam = req.nextUrl.searchParams.get("id")?.trim();
  if (idParam) {
    if (!UUID_RE.test(idParam)) return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
    const { data, error } = await db
      .from("numerology_records")
      .select("*")
      .eq("id", idParam)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: "İşlem tamamlanamadı." }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
    return NextResponse.json({ ok: true, row: data });
  }

  const wantCount = req.nextUrl.searchParams.get("count") === "1";
  if (wantCount) {
    const { count, error } = await db
      .from("numerology_records")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if (error) return NextResponse.json({ ok: false, error: "İşlem tamamlanamadı." }, { status: 500 });
    return NextResponse.json({ ok: true, count: count ?? 0 });
  }

  const recentRaw = req.nextUrl.searchParams.get("recent");
  if (recentRaw != null) {
    const limit = Math.min(Math.max(Number.parseInt(recentRaw, 10) || 0, 1), 50);
    const { data, error } = await db
      .from("numerology_records")
      .select("name, surname, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ ok: false, error: "İşlem tamamlanamadı." }, { status: 500 });
    return NextResponse.json({ ok: true, rows: data ?? [] });
  }

  // NUM-F09: PostgREST max-rows (1000) sınırında SESSİZ KESİLME yok — sayfalı tam okuma;
  // eksik okuma hata olarak döner. ?fields=summary → analysis_data taşınmaz (hafif liste).
  const summaryOnly = req.nextUrl.searchParams.get("fields") === "summary";
  const { rows, error } = await readAllPaged((from, to) =>
    db
      .from("numerology_records")
      .select(summaryOnly ? SUMMARY_COLUMNS : "*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to),
  );

  if (error) return NextResponse.json({ ok: false, error: "Kayıtlar eksiksiz okunamadı. Lütfen tekrar deneyin." }, { status: 500 });
  return NextResponse.json({ ok: true, rows });
}

// ─── POST /api/numeroloji/analyses — yeni analiz kaydı ──────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  // NUM-009: oluşturmada analysis_data ZORUNLU + şekil doğrulaması.
  const shape = validateAnalysisData(body.analysis_data, true);
  if (!shape.ok) return NextResponse.json({ ok: false, error: shape.error }, { status: 400 });

  // NUM-F01 (sunucu): motor sonucu, gönderilen ad/soyad/doğum tarihinden GÜNCEL motorla
  // üretilenle birebir olmalı. Aksi halde (bilgiler değişmiş ama yeniden hesaplanmamış ya da
  // tarayıcıda eski motor sürümü) kayıt REDDEDİLİR — yanlış kişiye ait sayılar kaydedilemez.
  const ad = body.analysis_data as Record<string, unknown>;
  const check = verifyMotorMatchesInputs(String(body.name ?? ""), String(body.surname ?? ""), String(body.birth_date ?? ""), ad.motor);
  if (!check.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: check.reason === "mismatch" ? "STALE_CALCULATION" : "INVALID_INPUT",
        error:
          check.reason === "mismatch"
            ? "Kaydedilen sonuç girilen ad, soyad ve doğum tarihiyle uyuşmuyor. Sayfayı yenileyip yeniden HESAPLA'ya basın."
            : "Ad, soyad ve doğum tarihi zorunludur.",
      },
      { status: check.reason === "mismatch" ? 409 : 400 },
    );
  }
  // NUM-F02: metodoloji sürümü SUNUCUDA damgalanır (istemci değeri yok sayılır).
  const stamped = { ...ad, calc: { methodology: NUMEROLOJI_METHODOLOGY_VERSION, stampedAt: new Date().toISOString() } };

  const payload = { ...pickAllowed(body), analysis_data: stamped, tenant_id: tenantId };
  const { data, error } = await db
    .from("numerology_records")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "analysis_run", subEntity: "analysis", errorClass: "server" });
    return NextResponse.json({ ok: false, error: "İşlem tamamlanamadı." }, { status: 500 });
  }
  const newId = (data as { id: string }).id;
  // İP-2C: başarılı analiz oluşturma → usage event (server-resolved tenant/user; idempotent; throw etmez).
  await trackUsage(guard, req, {
    module: "numerology",
    action: "analysis_run",
    subEntity: "analysis",
    resourceId: newId,
    legacyEventType: "analysis_created",
  });
  return NextResponse.json({ ok: true, id: newId });
}

// ─── PATCH /api/numeroloji/analyses — kayıt güncelle (body.id) ──────────────────
export async function PATCH(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id zorunludur." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  // NUM-F01/F02: kayıt sonrası ad/soyad/doğum tarihi ve hesap sonucu (motor) DEĞİŞTİRİLEMEZ —
  // aksi halde kayıt başka kişinin sayılarını taşıyabilir. Güncellenebilen tek alan görsel
  // rapor ayarlarıdır (analysis_data.gorsel); sunucu kayıtlı analysis_data'ya YALNIZ onu birleştirir.
  if ("name" in body || "surname" in body || "birth_date" in body) {
    return NextResponse.json(
      { ok: false, error: "Ad, soyad ve doğum tarihi kayıttan sonra değiştirilemez; yeni analiz oluşturun." },
      { status: 400 },
    );
  }
  const shape = validateAnalysisData(body.analysis_data, true);
  if (!shape.ok) return NextResponse.json({ ok: false, error: shape.error }, { status: 400 });
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Analiz kaydı bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  const gorselIn = (body.analysis_data as Record<string, unknown>).gorsel;
  if (gorselIn !== undefined && (gorselIn === null || typeof gorselIn !== "object" || Array.isArray(gorselIn))) {
    return NextResponse.json({ ok: false, error: "Görsel ayarları geçersiz." }, { status: 400 });
  }

  const { data: existing, error: readErr } = await db
    .from("numerology_records")
    .select("analysis_data")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: "İşlem tamamlanamadı." }, { status: 500 });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Analiz kaydı bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  const current = (existing as { analysis_data: unknown }).analysis_data;
  const base = current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>) : {};
  const merged = gorselIn === undefined ? base : { ...base, gorsel: gorselIn };

  const { data, error } = await db
    .from("numerology_records")
    .update({ analysis_data: merged })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id");

  if (error) {
    await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "record_updated", subEntity: "analysis", errorClass: "server" });
    return NextResponse.json({ ok: false, error: "İşlem tamamlanamadı." }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Analiz kaydı bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  await trackUsage(guard, req, { module: "numerology", action: "record_updated", subEntity: "analysis", resourceId: id });
  return NextResponse.json({ ok: true, id });
}

// ─── DELETE /api/numeroloji/analyses — kayıt sil (?id veya body.id) ─────────────
export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "numerology");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  const fromQuery = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  let ids: string[] = fromQuery ? [fromQuery] : [];
  if (ids.length === 0) {
    try {
      const b = (await req.json()) as { id?: unknown; ids?: unknown };
      if (Array.isArray(b.ids)) {
        ids = b.ids.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 1000);
      } else if (b.id != null) {
        const single = String(b.id).trim();
        if (single) ids = [single];
      }
    } catch { /* gövde yoksa query'e güven */ }
  }
  if (ids.length === 0) return NextResponse.json({ ok: false, error: "id veya ids zorunludur." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });

  const { data, error } = await db
    .from("numerology_records")
    .delete()
    .eq("tenant_id", tenantId)
    .in("id", ids)
    .select("id");

  if (error) {
    await trackUsage(guard, req, { module: "numerology", action: "action_failed", failedAction: "record_deleted", subEntity: "analysis", errorClass: "server" });
    return NextResponse.json({ ok: false, error: "İşlem tamamlanamadı." }, { status: 500 });
  }
  const deleted = data?.length ?? 0;
  if (deleted === 0) {
    return NextResponse.json({ ok: false, error: "Analiz kaydı bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  const deletedIds = (data ?? []).map((r) => (r as { id: string }).id);
  // Toplu silme → TEK olay + itemCount.
  await trackUsage(guard, req, {
    module: "numerology",
    action: "record_deleted",
    subEntity: "analysis",
    resourceId: [...deletedIds].sort().join(","),
    itemCount: deleted,
  });
  return NextResponse.json({ ok: true, deleted, ids: deletedIds });
}
